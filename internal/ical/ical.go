package ical

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/apognu/gocal"
	"github.com/flowforge/scheduler/internal/busy"
	"github.com/flowforge/scheduler/internal/google"
	"github.com/jmoiron/sqlx"
)

const cacheTTL = 120.0

type Service struct {
	mu    sync.RWMutex
	cache map[string]cacheEntry
	goog  *google.Service
}

type cacheEntry struct {
	ts    float64
	items []busy.Interval
}

func NewService(goog *google.Service) *Service {
	return &Service{
		cache: make(map[string]cacheEntry),
		goog:  goog,
	}
}

func (s *Service) ClearCache() {
	s.mu.Lock()
	s.cache = make(map[string]cacheEntry)
	s.mu.Unlock()
}

func (s *Service) GetBusyIntervals(db *sqlx.DB, userID int64, start, end time.Time, loc *time.Location) ([]busy.Interval, error) {
	start = start.UTC()
	end = end.UTC()

	type calRow struct {
		ID               int64   `db:"id"`
		Provider         string  `db:"provider"`
		URL              string  `db:"url"`
		Name             string  `db:"name"`
		GoogleAccountID  *int64  `db:"google_account_id"`
		GoogleCalendarID *string `db:"google_calendar_id"`
	}
	var calendars []calRow
	if err := db.Select(&calendars, `SELECT id, provider, url, name, google_account_id, google_calendar_id FROM external_calendars WHERE user_id = ? AND is_active = 1`, userID); err != nil {
		return nil, err
	}
	if len(calendars) == 0 {
		return nil, nil
	}

	type result struct {
		items []busy.Interval
		err   error
	}
	ch := make(chan result, len(calendars))
	sem := make(chan struct{}, 8)

	for _, cal := range calendars {
		cal := cal
		go func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			items, err := s.fetchCalendarBusy(db, cal.ID, cal.Provider, cal.URL, cal.Name, cal.GoogleAccountID, cal.GoogleCalendarID, start, end, loc)
			ch <- result{items, err}
		}()
	}

	var all []busy.Interval
	for range calendars {
		r := <-ch
		if r.err == nil {
			all = append(all, r.items...)
		}
	}
	return all, nil
}

func tagIntervals(intervals []busy.Interval, calID int64, provider string) []busy.Interval {
	if len(intervals) == 0 {
		return intervals
	}
	out := make([]busy.Interval, len(intervals))
	for i, iv := range intervals {
		iv.CalendarID = calID
		iv.Provider = provider
		out[i] = iv
	}
	return out
}

func (s *Service) fetchCalendarBusy(db *sqlx.DB, calID int64, provider, url, name string, googleAccountID *int64, googleCalID *string, start, end time.Time, loc *time.Location) ([]busy.Interval, error) {
	key := cacheKey(calID, start, end)
	now := float64(time.Now().UnixNano()) / 1e9

	s.mu.RLock()
	if cached, ok := s.cache[key]; ok && (now-cached.ts) < cacheTTL {
		s.mu.RUnlock()
		return cached.items, nil
	}
	s.mu.RUnlock()

	var parsed []busy.Interval
	var err error

	if provider == "google" && googleAccountID != nil && googleCalID != nil && s.goog != nil {
		token, e := s.goog.RefreshAccessToken(db, *googleAccountID)
		if e == nil {
			parsed, err = s.goog.BusyIntervalsWithToken(token, *googleCalID, start, end, loc)
		}
	} else if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		parsed, err = fetchICalBusy(url, start, end, loc)
	}

	if err != nil {
		return nil, err
	}

	parsed = tagIntervals(parsed, calID, provider)

	s.mu.Lock()
	s.cache[key] = cacheEntry{ts: now, items: parsed}
	s.mu.Unlock()
	return parsed, nil
}

func cacheKey(calID int64, start, end time.Time) string {
	return fmt.Sprintf("%d|%s|%s", calID, start.Format(time.RFC3339), end.Format(time.RFC3339))
}

func fetchICalBusy(url string, start, end time.Time, loc *time.Location) ([]busy.Interval, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "FlowForge/3.0 (self-hosted scheduler)")
	req.Header.Set("Accept", "text/calendar, text/plain, */*")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, nil
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	startInLoc := start.In(loc)
	endInLoc := end.In(loc)
	c := gocal.NewParser(bytes.NewReader(body))
	c.Start = &startInLoc
	c.End = &endInLoc
	c.Parse()

	var intervals []busy.Interval
	for _, ev := range c.Events {
		if ev.Start == nil || ev.End == nil || !ev.End.After(*ev.Start) {
			continue
		}
		es, ee := ev.Start.In(loc).UTC(), ev.End.In(loc).UTC()
		cs := es
		if start.After(cs) {
			cs = start
		}
		ce := ee
		if end.Before(ce) {
			ce = end
		}
		if !ce.After(cs) {
			continue
		}
		summary := ev.Summary
		if summary == "" {
			summary = "Busy"
		}
		intervals = append(intervals, busy.Interval{Start: cs, End: ce, Summary: summary})
	}
	return intervals, nil
}
