package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/flowforge/scheduler/internal/scheduler"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountSchedule(r chi.Router) {
	r.Get("/api/schedule/scheduled-task-ids", s.scheduledTaskIDs)
	r.Get("/api/schedule/deadline-alerts", s.deadlineAlerts)
	r.Post("/api/schedule/auto", s.autoSchedule)
	r.Get("/api/schedule", s.getSchedule)
	r.Get("/api/export.ics", s.exportICS)
}

func (s *Server) scheduledTaskIDs(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	ids := []int64{}
	_ = s.DB.Select(&ids, `
		SELECT DISTINCT sb.task_id FROM scheduled_blocks sb
		JOIN tasks t ON sb.task_id = t.id
		WHERE t.user_id = ?`, userID)
	httpx.WriteJSON(w, http.StatusOK, ids)
}

func (s *Server) deadlineAlerts(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	result, err := scheduler.ComputeDeadlineAlerts(s.DB, userID, time.Now())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (s *Server) autoSchedule(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	force := r.URL.Query().Get("force_refresh") == "true"
	blocks, err := s.Recalc.RecalculateAndSync(userID, force)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	titles := make(map[int64]string)
	var tasks []struct {
		ID    int64  `db:"id"`
		Title string `db:"title"`
	}
	_ = s.DB.Select(&tasks, `SELECT id, title FROM tasks WHERE user_id = ?`, userID)
	for _, t := range tasks {
		titles[t.ID] = t.Title
	}
	out := make([]models.ScheduledBlock, 0, len(blocks))
	for _, b := range blocks {
		title := titles[b.TaskID]
		b.Title = &title
		out = append(out, b)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) getSchedule(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	loc := scheduler.GetZone(s.DB, userID)
	dateStr := r.URL.Query().Get("date")
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days < 1 {
		days = 1
	}
	if days > 14 {
		days = 14
	}

	var day time.Time
	if dateStr == "" {
		day = time.Now().In(loc)
	} else {
		t, err := time.ParseInLocation("2006-01-02", dateStr, loc)
		if err != nil {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "date must be YYYY-MM-DD")
			return
		}
		day = t
	}
	endDay := day.AddDate(0, 0, days-1)
	startUTC := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc).UTC()
	endUTC := time.Date(endDay.Year(), endDay.Month(), endDay.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1).UTC()

	items, err := s.collectTimelineItems(userID, loc, startUTC, endUTC)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rs := day.Format("2006-01-02")
	re := endDay.Format("2006-01-02")
	httpx.WriteJSON(w, http.StatusOK, models.TimelineResponse{
		Date:       rs,
		Timezone:   loc.String(),
		Items:      items,
		RangeStart: &rs,
		RangeEnd:   &re,
	})
}

func (s *Server) collectTimelineItems(userID int64, loc *time.Location, startUTC, endUTC time.Time) ([]models.TimelineItem, error) {
	var items []models.TimelineItem

	busy, err := s.ICal.GetBusyIntervals(s.DB, userID, startUTC, endUTC, loc)
	if err != nil {
		return nil, err
	}
	for _, b := range busy {
		summary := b.Summary
		calID := b.CalendarID
		provider := b.Provider
		items = append(items, models.TimelineItem{
			Kind: "busy", Start: b.Start, End: b.End, Title: b.Summary, CalendarSummary: &summary,
			CalendarID: &calID, Provider: &provider, IsGoogleSynced: provider == "google",
		})
	}

	type eventRow struct {
		ID         int64     `db:"id"`
		Title      string    `db:"title"`
		StartTime  time.Time `db:"start_time"`
		EndTime    time.Time `db:"end_time"`
		Color      *string   `db:"color"`
		CalColor   *string   `db:"cal_color"`
		IsActive   bool      `db:"is_active"`
		CalendarID *int64    `db:"calendar_id"`
		Provider   *string   `db:"provider"`
	}
	var events []eventRow
	_ = s.DB.Select(&events, `
		SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.color, ec.color as cal_color,
			COALESCE(ec.is_active, 1) as is_active, ce.calendar_id, ec.provider
		FROM calendar_events ce LEFT JOIN external_calendars ec ON ce.calendar_id = ec.id
		WHERE ce.user_id = ? AND ce.start_time < ? AND ce.end_time > ? ORDER BY ce.start_time`, userID, endUTC, startUTC)
	for _, ev := range events {
		if !ev.IsActive {
			continue
		}
		color := ev.Color
		if color == nil {
			color = ev.CalColor
		}
		eid := ev.ID
		isGoogleSynced := ev.Provider != nil && *ev.Provider == "google"
		items = append(items, models.TimelineItem{
			Kind: "event", Start: ev.StartTime, End: ev.EndTime, Title: ev.Title, EventID: &eid, Color: color,
			CalendarID: ev.CalendarID, Provider: ev.Provider, IsGoogleSynced: isGoogleSynced,
		})
	}

	type blockRow struct {
		TaskID       int64     `db:"task_id"`
		StartTime    time.Time `db:"start_time"`
		EndTime      time.Time `db:"end_time"`
		Title        string    `db:"title"`
		Color        *string   `db:"color"`
		ListColor    *string   `db:"list_color"`
		ListName     *string   `db:"list_name"`
		IsCompleted  bool      `db:"is_completed"`
		CalendarID   *int64    `db:"calendar_id"`
		SyncProvider *string   `db:"sync_provider"`
	}
	var blocks []blockRow
	_ = s.DB.Select(&blocks, `
		SELECT sb.task_id, sb.start_time, sb.end_time, t.title, t.color, tl.color as list_color, tl.name as list_name,
			t.is_completed, tl.sync_tasks_calendar_id as calendar_id, ec.provider as sync_provider
		FROM scheduled_blocks sb
		JOIN tasks t ON sb.task_id = t.id
		LEFT JOIN task_lists tl ON t.list_id = tl.id
		LEFT JOIN external_calendars ec ON tl.sync_tasks_calendar_id = ec.id
		WHERE t.user_id = ? AND sb.start_time < ? AND sb.end_time > ? ORDER BY sb.start_time`, userID, endUTC, startUTC)
	for _, b := range blocks {
		color := b.Color
		if color == nil {
			color = b.ListColor
		}
		tid := b.TaskID
		isGoogleSynced := b.SyncProvider != nil && *b.SyncProvider == "google"
		items = append(items, models.TimelineItem{
			Kind: "task", Start: b.StartTime, End: b.EndTime, Title: b.Title, TaskID: &tid,
			Color: color, ListName: b.ListName, IsCompleted: b.IsCompleted,
			CalendarID: b.CalendarID, Provider: b.SyncProvider, IsGoogleSynced: isGoogleSynced,
		})
	}

	if items == nil {
		items = []models.TimelineItem{}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Start.Equal(items[j].Start) {
			if items[i].End.Equal(items[j].End) {
				if items[i].Kind == items[j].Kind {
					return items[i].Title < items[j].Title
				}
				return items[i].Kind < items[j].Kind
			}
			return items[i].End.Before(items[j].End)
		}
		return items[i].Start.Before(items[j].Start)
	})
	return items, nil
}

func (s *Server) exportICS(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var sb strings.Builder
	sb.WriteString("BEGIN:VCALENDAR\r\n")
	sb.WriteString("PRODID:-//FlowForge//FlowForge Scheduler//EN\r\n")
	sb.WriteString("VERSION:2.0\r\n")
	sb.WriteString("CALSCALE:GREGORIAN\r\n")
	sb.WriteString("X-WR-CALNAME:FlowForge Schedule\r\n")
	stamp := time.Now().UTC().Format("20060102T150405Z")

	type blockRow struct {
		ID        int64     `db:"id"`
		Title     string    `db:"title"`
		StartTime time.Time `db:"start_time"`
		EndTime   time.Time `db:"end_time"`
	}
	var blocks []blockRow
	_ = s.DB.Select(&blocks, `
		SELECT sb.id, t.title, sb.start_time, sb.end_time
		FROM scheduled_blocks sb JOIN tasks t ON sb.task_id = t.id
		WHERE t.user_id = ? AND t.is_completed = 0 ORDER BY sb.start_time`, userID)
	for _, b := range blocks {
		sb.WriteString("BEGIN:VEVENT\r\n")
		sb.WriteString(fmt.Sprintf("UID:flowforge-block-%d@flowforge.local\r\n", b.ID))
		sb.WriteString(fmt.Sprintf("SUMMARY:%s\r\n", b.Title))
		sb.WriteString(fmt.Sprintf("DTSTART:%s\r\n", b.StartTime.UTC().Format("20060102T150405Z")))
		sb.WriteString(fmt.Sprintf("DTEND:%s\r\n", b.EndTime.UTC().Format("20060102T150405Z")))
		sb.WriteString(fmt.Sprintf("DTSTAMP:%s\r\n", stamp))
		sb.WriteString("END:VEVENT\r\n")
	}

	var events []models.CalendarEvent
	_ = s.DB.Select(&events, `SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_time`, userID)
	for _, ev := range events {
		sb.WriteString("BEGIN:VEVENT\r\n")
		sb.WriteString(fmt.Sprintf("UID:flowforge-event-%d@flowforge.local\r\n", ev.ID))
		sb.WriteString(fmt.Sprintf("SUMMARY:%s\r\n", ev.Title))
		sb.WriteString(fmt.Sprintf("DTSTART:%s\r\n", ev.StartTime.UTC().Format("20060102T150405Z")))
		sb.WriteString(fmt.Sprintf("DTEND:%s\r\n", ev.EndTime.UTC().Format("20060102T150405Z")))
		sb.WriteString(fmt.Sprintf("DTSTAMP:%s\r\n", stamp))
		if ev.Notes != "" {
			sb.WriteString(fmt.Sprintf("DESCRIPTION:%s\r\n", ev.Notes))
		}
		sb.WriteString("END:VEVENT\r\n")
	}
	sb.WriteString("END:VCALENDAR\r\n")

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=flowforge.ics")
	w.Write([]byte(sb.String()))
}
