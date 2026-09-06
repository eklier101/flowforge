package google

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/flowforge/scheduler/internal/busy"
	"github.com/flowforge/scheduler/internal/config"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/jmoiron/sqlx"
)

const (
	authURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	tokenURL    = "https://oauth2.googleapis.com/token"
	calendarAPI = "https://www.googleapis.com/calendar/v3"
	scope       = "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
	stateTTL    = 600
)

type authStateEntry struct {
	created float64
	userID  int64
}

type Service struct {
	cfg    config.Config
	mu     sync.Mutex
	states map[string]authStateEntry
	client *http.Client
}

func NewService(cfg config.Config) *Service {
	return &Service{
		cfg:    cfg,
		states: make(map[string]authStateEntry),
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

func (s *Service) Configured() bool {
	return s.cfg.GoogleConfigured()
}

func (s *Service) RedirectURI(baseURL string) string {
	return strings.TrimRight(baseURL, "/") + "/api/google/auth/callback"
}

func (s *Service) cleanupStates() {
	now := float64(time.Now().Unix())
	for k, entry := range s.states {
		if now-entry.created > stateTTL {
			delete(s.states, k)
		}
	}
}

func (s *Service) CreateAuthState(userID int64) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupStates()
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	s.states[state] = authStateEntry{created: float64(time.Now().Unix()), userID: userID}
	return state
}

func (s *Service) ValidateAuthState(state string) (bool, int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupStates()
	entry, ok := s.states[state]
	delete(s.states, state)
	if !ok || float64(time.Now().Unix())-entry.created > stateTTL {
		return false, 0
	}
	return true, entry.userID
}

// CreateLinkFormToken issues a short-lived token so the OAuth calendar picker
// HTML form can POST without a Bearer header (browser redirect has no session cookie).
func (s *Service) CreateLinkFormToken(userID int64) string {
	return s.CreateAuthState(userID)
}

// ConsumeLinkFormToken validates and consumes a one-time calendar-link form token.
func (s *Service) ConsumeLinkFormToken(token string) (bool, int64) {
	return s.ValidateAuthState(token)
}

func (s *Service) BuildAuthURL(baseURL, state string) string {
	params := url.Values{}
	params.Set("client_id", s.cfg.GoogleID)
	params.Set("redirect_uri", s.RedirectURI(baseURL))
	params.Set("response_type", "code")
	params.Set("scope", scope)
	params.Set("access_type", "offline")
	params.Set("prompt", "select_account consent")
	params.Set("state", state)
	return authURL + "?" + params.Encode()
}

func (s *Service) tokenRequest(payload map[string]string) (map[string]any, error) {
	data := url.Values{}
	data.Set("client_id", s.cfg.GoogleID)
	data.Set("client_secret", s.cfg.GoogleSecret)
	for k, v := range payload {
		data.Set(k, v)
	}
	resp, err := s.client.PostForm(tokenURL, data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("token request failed: %s", string(body))
	}
	var out map[string]any
	return out, json.Unmarshal(body, &out)
}

func (s *Service) ExchangeCode(baseURL, code string) (map[string]any, error) {
	return s.tokenRequest(map[string]string{
		"code":         code,
		"grant_type":   "authorization_code",
		"redirect_uri": s.RedirectURI(baseURL),
	})
}

func (s *Service) apiGet(accessToken, path string, params url.Values) (map[string]any, error) {
	u := calendarAPI + path
	if len(params) > 0 {
		u += "?" + params.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("google api error: %s", string(body))
	}
	var out map[string]any
	return out, json.Unmarshal(body, &out)
}

func (s *Service) ensureAccessToken(db *sqlx.DB, accountID int64) (string, error) {
	var acc models.GoogleAccount
	if err := db.Get(&acc, `SELECT * FROM google_accounts WHERE id = ?`, accountID); err != nil {
		return "", err
	}
	if acc.AccessToken != nil && acc.TokenExpiry != nil {
		if acc.TokenExpiry.After(time.Now().UTC().Add(60 * time.Second)) {
			return *acc.AccessToken, nil
		}
	}
	payload, err := s.tokenRequest(map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": acc.RefreshToken,
	})
	if err != nil {
		return "", err
	}
	accessToken, _ := payload["access_token"].(string)
	expiresIn := 3600.0
	if v, ok := payload["expires_in"].(float64); ok {
		expiresIn = v
	}
	expiry := time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)
	_, err = db.Exec(`UPDATE google_accounts SET access_token = ?, token_expiry = ? WHERE id = ?`, accessToken, expiry, accountID)
	return accessToken, err
}

func (s *Service) RefreshAccessToken(db *sqlx.DB, accountID int64) (string, error) {
	return s.ensureAccessToken(db, accountID)
}

func (s *Service) FetchUserEmail(accessToken string) string {
	req, _ := http.NewRequest(http.MethodGet, "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := s.client.Do(req)
	if err == nil && resp.StatusCode < 400 {
		defer resp.Body.Close()
		var data map[string]any
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			if email, ok := data["email"].(string); ok && email != "" {
				return email
			}
		}
	}
	return "google-account"
}

func (s *Service) StoreGoogleAccount(db *sqlx.DB, userID int64, tokenPayload map[string]any) (*models.GoogleAccount, error) {
	accessToken, _ := tokenPayload["access_token"].(string)
	refreshToken, _ := tokenPayload["refresh_token"].(string)
	if refreshToken == "" {
		return nil, fmt.Errorf("Google did not return a refresh token. Remove FlowForge from your Google account and try again.")
	}
	email := s.FetchUserEmail(accessToken)
	expiresIn := 3600.0
	if v, ok := tokenPayload["expires_in"].(float64); ok {
		expiresIn = v
	}
	expiry := time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)

	var acc models.GoogleAccount
	err := db.Get(&acc, `SELECT * FROM google_accounts WHERE user_id = ? AND email = ?`, userID, email)
	if err != nil {
		res, e := db.Exec(`INSERT INTO google_accounts (user_id, email, refresh_token, access_token, token_expiry) VALUES (?, ?, ?, ?, ?)`,
			userID, email, refreshToken, accessToken, expiry)
		if e != nil {
			return nil, e
		}
		id, _ := res.LastInsertId()
		acc = models.GoogleAccount{ID: id, UserID: userID, Email: email, RefreshToken: refreshToken, AccessToken: &accessToken, TokenExpiry: &expiry}
		return &acc, nil
	}
	_, err = db.Exec(`UPDATE google_accounts SET refresh_token = ?, access_token = ?, token_expiry = ? WHERE id = ? AND user_id = ?`,
		refreshToken, accessToken, expiry, acc.ID, userID)
	acc.RefreshToken = refreshToken
	acc.AccessToken = &accessToken
	acc.TokenExpiry = &expiry
	return &acc, err
}

type CalendarItem struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Color         *string `json:"color"`
	Linked        bool    `json:"linked"`
	IsActive      bool    `json:"is_active"`
	CalendarRowID *int64  `json:"calendar_row_id"`
	Primary       bool    `json:"primary"`
}

func (s *Service) ListGoogleCalendars(db *sqlx.DB, accountID int64) ([]CalendarItem, error) {
	token, err := s.ensureAccessToken(db, accountID)
	if err != nil {
		return nil, err
	}
	payload, err := s.apiGet(token, "/users/me/calendarList", url.Values{"showHidden": {"false"}})
	if err != nil {
		return nil, err
	}
	items, _ := payload["items"].([]any)

	type linkedRow struct {
		ID               int64   `db:"id"`
		GoogleCalendarID string  `db:"google_calendar_id"`
		Color            *string `db:"color"`
		IsActive         bool    `db:"is_active"`
	}
	var linked []linkedRow
	_ = db.Select(&linked, `SELECT id, google_calendar_id, color, is_active FROM external_calendars WHERE google_account_id = ? AND provider = 'google'`, accountID)
	linkedMap := make(map[string]linkedRow)
	for _, r := range linked {
		linkedMap[r.GoogleCalendarID] = r
	}

	var out []CalendarItem
	for _, raw := range items {
		item, _ := raw.(map[string]any)
		calID, _ := item["id"].(string)
		if calID == "" {
			continue
		}
		name, _ := item["summary"].(string)
		if name == "" {
			name = calID
		}
		var color *string
		if bg, ok := item["backgroundColor"].(string); ok {
			color = &bg
		}
		row, linkedOK := linkedMap[calID]
		ci := CalendarItem{ID: calID, Name: name, Color: color, Linked: linkedOK, Primary: item["primary"] == true}
		if linkedOK {
			ci.IsActive = row.IsActive
			ci.CalendarRowID = &row.ID
			if row.Color != nil {
				ci.Color = row.Color
			}
		}
		out = append(out, ci)
	}
	return out, nil
}

func (s *Service) LinkGoogleCalendar(db *sqlx.DB, userID, accountID int64, calendarID, name string, color *string) (*models.ExternalCalendar, error) {
	var owned int
	if err := db.Get(&owned, `SELECT COUNT(*) FROM google_accounts WHERE id = ? AND user_id = ?`, accountID, userID); err != nil || owned == 0 {
		return nil, fmt.Errorf("google account not found")
	}
	var existing models.ExternalCalendar
	err := db.Get(&existing, `SELECT * FROM external_calendars WHERE user_id = ? AND provider = 'google' AND google_account_id = ? AND google_calendar_id = ?`,
		userID, accountID, calendarID)
	if err == nil {
		_, _ = db.Exec(`UPDATE external_calendars SET name = ?, is_active = 1, color = COALESCE(?, color) WHERE id = ? AND user_id = ?`, name, color, existing.ID, userID)
		_ = db.Get(&existing, `SELECT * FROM external_calendars WHERE id = ? AND user_id = ?`, existing.ID, userID)
		return &existing, nil
	}
	urlStr := fmt.Sprintf("google://%d/%s", accountID, calendarID)
	res, err := db.Exec(`INSERT INTO external_calendars (user_id, name, url, is_active, provider, google_account_id, google_calendar_id, color) VALUES (?, ?, ?, 1, 'google', ?, ?, ?)`,
		userID, name, urlStr, accountID, calendarID, color)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	var row models.ExternalCalendar
	_ = db.Get(&row, `SELECT * FROM external_calendars WHERE id = ? AND user_id = ?`, id, userID)
	return &row, nil
}

func (s *Service) BusyIntervalsWithToken(accessToken, calendarID string, start, end time.Time, loc *time.Location) ([]busy.Interval, error) {
	params := url.Values{}
	params.Set("timeMin", start.UTC().Format(time.RFC3339))
	params.Set("timeMax", end.UTC().Format(time.RFC3339))
	params.Set("singleEvents", "true")
	params.Set("orderBy", "startTime")
	params.Set("maxResults", "2500")
	enc := url.PathEscape(calendarID)
	payload, err := s.apiGet(accessToken, "/calendars/"+enc+"/events", params)
	if err != nil {
		return nil, err
	}
	if loc == nil {
		loc, _ = time.LoadLocation("America/New_York")
	}
	var intervals []busy.Interval
	for _, raw := range toSlice(payload["items"]) {
		item, _ := raw.(map[string]any)
		if item["status"] == "cancelled" {
			continue
		}
		summary, _ := item["summary"].(string)
		desc, _ := item["description"].(string)
		if strings.Contains(summary, "[FlowForge]") || strings.Contains(desc, "flowforge_block_id:") {
			continue
		}
		startRaw, _ := item["start"].(map[string]any)
		endRaw, _ := item["end"].(map[string]any)
		var eventStart, eventEnd time.Time
		if dt, ok := startRaw["dateTime"].(string); ok {
			if et, ok2 := endRaw["dateTime"].(string); ok2 {
				eventStart, _ = time.Parse(time.RFC3339, strings.Replace(dt, "Z", "+00:00", 1))
				eventEnd, _ = time.Parse(time.RFC3339, strings.Replace(et, "Z", "+00:00", 1))
			}
		} else if ds, ok := startRaw["date"].(string); ok {
			if de, ok2 := endRaw["date"].(string); ok2 {
				dStart, _ := time.Parse("2006-01-02", ds)
				dEnd, _ := time.Parse("2006-01-02", de)
				eventStart = time.Date(dStart.Year(), dStart.Month(), dStart.Day(), 0, 0, 0, 0, loc)
				eventEnd = time.Date(dEnd.Year(), dEnd.Month(), dEnd.Day(), 0, 0, 0, 0, loc)
			}
		}
		if eventEnd.IsZero() || !eventEnd.After(eventStart) {
			continue
		}
		title := summary
		if title == "" {
			title = "Busy"
		}
		intervals = append(intervals, busy.Interval{Start: eventStart.UTC(), End: eventEnd.UTC(), Summary: title})
	}
	return intervals, nil
}

func toSlice(v any) []any {
	if s, ok := v.([]any); ok {
		return s
	}
	return nil
}

func (s *Service) SyncTasksToGoogleCalendar(db *sqlx.DB, userID, accountID int64, calendarID string, listIDs []int64) (int, error) {
	token, err := s.ensureAccessToken(db, accountID)
	if err != nil {
		return 0, err
	}

	query := `
		SELECT sb.id, sb.start_time, sb.end_time, t.title
		FROM scheduled_blocks sb
		JOIN tasks t ON sb.task_id = t.id
		WHERE t.user_id = ? AND t.is_completed = 0`
	args := []any{userID}
	if listIDs != nil {
		placeholders := make([]string, len(listIDs))
		for i, id := range listIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		query += " AND t.list_id IN (" + strings.Join(placeholders, ",") + ")"
	}

	type blockRow struct {
		ID        int64     `db:"id"`
		StartTime time.Time `db:"start_time"`
		EndTime   time.Time `db:"end_time"`
		Title     string    `db:"title"`
	}
	var blocks []blockRow
	if err := db.Select(&blocks, query, args...); err != nil {
		return 0, err
	}

	enc := url.PathEscape(calendarID)
	existing := make(map[int64]string)
	searchParams := url.Values{"q": {"[FlowForge]"}, "maxResults": {"250"}, "singleEvents": {"true"}}
	searchPayload, _ := s.apiGet(token, "/calendars/"+enc+"/events", searchParams)
	for _, raw := range toSlice(searchPayload["items"]) {
		item, _ := raw.(map[string]any)
		desc, _ := item["description"].(string)
		eventID, _ := item["id"].(string)
		if strings.Contains(desc, "flowforge_block_id:") {
			parts := strings.Split(desc, "flowforge_block_id:")
			if len(parts) > 1 {
				var bID int64
				fmt.Sscanf(strings.Fields(parts[1])[0], "%d", &bID)
				if bID > 0 {
					existing[bID] = eventID
				}
			}
		}
	}

	currentIDs := make(map[int64]bool)
	for _, b := range blocks {
		currentIDs[b.ID] = true
	}
	for bID, gEventID := range existing {
		if !currentIDs[bID] {
			req, _ := http.NewRequest(http.MethodDelete, calendarAPI+"/calendars/"+enc+"/events/"+url.PathEscape(gEventID), nil)
			req.Header.Set("Authorization", "Bearer "+token)
			_, _ = s.client.Do(req)
		}
	}

	synced := 0
	for _, block := range blocks {
		title := block.Title + " [FlowForge]"
		startISO := block.StartTime.UTC().Format("2006-01-02T15:04:05Z")
		endISO := block.EndTime.UTC().Format("2006-01-02T15:04:05Z")
		body := map[string]any{
			"summary":     title,
			"description": fmt.Sprintf("Auto-scheduled by FlowForge.\nflowforge_block_id:%d", block.ID),
			"start":       map[string]string{"dateTime": startISO},
			"end":         map[string]string{"dateTime": endISO},
		}
		bodyJSON, _ := json.Marshal(body)
		var req *http.Request
		if gEventID, ok := existing[block.ID]; ok {
			req, _ = http.NewRequest(http.MethodPut, calendarAPI+"/calendars/"+enc+"/events/"+url.PathEscape(gEventID), strings.NewReader(string(bodyJSON)))
		} else {
			req, _ = http.NewRequest(http.MethodPost, calendarAPI+"/calendars/"+enc+"/events", strings.NewReader(string(bodyJSON)))
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := s.client.Do(req)
		if err == nil && resp.StatusCode < 400 {
			synced++
			resp.Body.Close()
		}
	}
	return synced, nil
}
