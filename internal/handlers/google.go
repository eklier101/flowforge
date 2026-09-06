package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/flowforge/scheduler/internal/publicurl"
	"github.com/go-chi/chi/v5"
)

var errAuthRequired = errors.New("authentication required")

// mountGoogleProtected mounts Google routes that require auth.
// Auth start is public (browser redirect) and validates Bearer or ?access_token=.
func (s *Server) mountGoogleProtected(r chi.Router) {
	r.Route("/api/google", func(r chi.Router) {
		r.Get("/status", s.googleStatus)
		r.Get("/accounts", s.listGoogleAccounts)
		r.Delete("/accounts/{accountID}", s.disconnectGoogleAccount)
		r.Get("/accounts/{accountID}/calendars", s.googleAccountCalendars)
		r.Post("/accounts/{accountID}/calendars", s.addGoogleCalendar)
		r.Post("/sync-tasks", s.syncTasksNow)
	})
}

// resolveGoogleAuthUserID accepts Bearer Authorization or access_token query
// (needed because window.location redirects cannot send Authorization headers).
func (s *Server) resolveGoogleAuthUserID(r *http.Request) (int64, error) {
	token := bearerToken(r)
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("access_token"))
	}
	if token == "" {
		return 0, errAuthRequired
	}
	userID, _, _, _, _, err := auth.LookupSession(s.DB, token)
	if err != nil {
		return 0, err
	}
	return userID, nil
}

func (s *Server) googleStatus(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var accounts []models.GoogleAccount
	_ = s.DB.Select(&accounts, `SELECT id, email, last_synced_at FROM google_accounts WHERE user_id = ? ORDER BY id`, userID)
	type acc struct {
		ID            int64   `json:"id"`
		Email         string  `json:"email"`
		LastSyncedAt  *string `json:"last_synced_at"`
		CalendarCount int     `json:"calendar_count"`
	}
	out := make([]acc, 0, len(accounts))
	for _, a := range accounts {
		var cnt int
		_ = s.DB.Get(&cnt, `SELECT COUNT(*) FROM external_calendars WHERE user_id = ? AND google_account_id = ? AND provider = 'google'`, userID, a.ID)
		var ls *string
		if a.LastSyncedAt != nil {
			s := a.LastSyncedAt.Format("2006-01-02T15:04:05Z07:00")
			ls = &s
		}
		out = append(out, acc{ID: a.ID, Email: a.Email, LastSyncedAt: ls, CalendarCount: cnt})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"configured": s.Google.Configured(), "accounts": out})
}

func (s *Server) googleAuthStart(w http.ResponseWriter, r *http.Request) {
	userID, err := s.resolveGoogleAuthUserID(r)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if !s.Google.Configured() {
		httpx.WriteError(w, http.StatusServiceUnavailable, "Google Calendar is not configured on this server.")
		return
	}
	base := publicurl.Resolve(r, s.Cfg.PublicURL)
	state := s.Google.CreateAuthState(userID)
	http.Redirect(w, r, s.Google.BuildAuthURL(base, state), http.StatusFound)
}

func (s *Server) googleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if errMsg := r.URL.Query().Get("error"); errMsg != "" {
		http.Error(w, "<html><body><h1>Google sign-in failed</h1><p>"+errMsg+"</p></body></html>", http.StatusBadRequest)
		return
	}
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	ok, userID := s.Google.ValidateAuthState(state)
	if code == "" || state == "" || !ok || userID == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid OAuth state")
		return
	}
	base := publicurl.Resolve(r, s.Cfg.PublicURL)
	tokenPayload, err := s.Google.ExchangeCode(base, code)
	if err != nil {
		http.Error(w, "<html><body><h1>Google connection failed</h1><p>"+err.Error()+"</p></body></html>", http.StatusInternalServerError)
		return
	}
	account, err := s.Google.StoreGoogleAccount(s.DB, userID, tokenPayload)
	if err != nil {
		http.Error(w, "<html><body><h1>Google connection failed</h1><p>"+err.Error()+"</p></body></html>", http.StatusInternalServerError)
		return
	}
	calendars, _ := s.Google.ListGoogleCalendars(s.DB, account.ID)
	var options strings.Builder
	for _, item := range calendars {
		checked := ""
		if item.Linked {
			checked = "checked"
		}
		color := ""
		if item.Color != nil {
			color = *item.Color
		}
		val := item.ID + "|" + item.Name + "|" + color
		options.WriteString(fmt.Sprintf(`<li><label><input type="checkbox" name="cal" value="%s" %s/> %s</label></li>`, val, checked, item.Name))
	}
	formToken := s.Google.CreateLinkFormToken(userID)
	body := fmt.Sprintf(`<html><body style="font-family:sans-serif;padding:24px;max-width:640px">
	<h1>Connected %s</h1>
	<p>Select calendars to block busy time in FlowForge.</p>
	<form method="post" action="/api/google/accounts/%d/link">
	<input type="hidden" name="form_token" value="%s"/>
	<ul style="line-height:2">%s</ul>
	<button type="submit" style="padding:10px 16px">Save calendars</button>
	</form>
	<p><a href="/">Back to FlowForge</a></p>
	</body></html>`, account.Email, account.ID, formToken, options.String())
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(body))
}

func (s *Server) linkCalendarsForm(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	ok, userID := s.Google.ConsumeLinkFormToken(r.Form.Get("form_token"))
	if !ok || userID == 0 {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid or expired form token")
		return
	}
	accountID, _ := strconv.ParseInt(chi.URLParam(r, "accountID"), 10, 64)
	var owned int
	_ = s.DB.Get(&owned, `SELECT COUNT(*) FROM google_accounts WHERE id = ? AND user_id = ?`, accountID, userID)
	if owned == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Google account not found")
		return
	}
	selected := r.Form["cal"]
	for _, raw := range selected {
		parts := strings.SplitN(raw, "|", 3)
		if len(parts) < 2 {
			continue
		}
		var color *string
		if len(parts) > 2 && parts[2] != "" {
			color = &parts[2]
		}
		_, _ = s.Google.LinkGoogleCalendar(s.DB, userID, accountID, parts[0], parts[1], color)
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *Server) listGoogleAccounts(w http.ResponseWriter, r *http.Request) {
	s.googleStatus(w, r)
}

func (s *Server) disconnectGoogleAccount(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "accountID"), 10, 64)
	res, _ := s.DB.Exec(`DELETE FROM google_accounts WHERE id = ? AND user_id = ?`, id, userID)
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Google account not found")
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) googleAccountCalendars(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "accountID"), 10, 64)
	var count int
	_ = s.DB.Get(&count, `SELECT COUNT(*) FROM google_accounts WHERE id = ? AND user_id = ?`, id, userID)
	if count == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Google account not found")
		return
	}
	cals, err := s.Google.ListGoogleCalendars(s.DB, id)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cals)
}

type googleCalendarLinkPayload struct {
	CalendarID string  `json:"calendar_id"`
	Name       string  `json:"name"`
	Color      *string `json:"color"`
}

func (s *Server) addGoogleCalendar(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	accountID, _ := strconv.ParseInt(chi.URLParam(r, "accountID"), 10, 64)
	var p googleCalendarLinkPayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	var count int
	_ = s.DB.Get(&count, `SELECT COUNT(*) FROM google_accounts WHERE id = ? AND user_id = ?`, accountID, userID)
	if count == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Google account not found")
		return
	}
	row, err := s.Google.LinkGoogleCalendar(s.DB, userID, accountID, p.CalendarID, strings.TrimSpace(p.Name), p.Color)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id": row.ID, "name": row.Name, "provider": row.Provider,
		"google_calendar_id": row.GoogleCalendarID, "is_active": row.IsActive,
	})
}

func (s *Server) syncTasksNow(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var syncCalID *int64
	_ = s.DB.Get(&syncCalID, `SELECT sync_tasks_calendar_id FROM app_settings WHERE user_id = ?`, userID)
	if syncCalID == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "skipped", "message": "No sync calendar configured"})
		return
	}
	var cal struct {
		Name             string  `db:"name"`
		Provider         string  `db:"provider"`
		GoogleAccountID  *int64  `db:"google_account_id"`
		GoogleCalendarID *string `db:"google_calendar_id"`
	}
	if err := s.DB.Get(&cal, `SELECT name, provider, google_account_id, google_calendar_id FROM external_calendars WHERE id = ? AND user_id = ?`, *syncCalID, userID); err != nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "skipped", "message": "Target calendar is not a Google Calendar"})
		return
	}
	if cal.Provider != "google" || cal.GoogleAccountID == nil || cal.GoogleCalendarID == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "skipped", "message": "Target calendar is not a Google Calendar"})
		return
	}
	count, err := s.Google.SyncTasksToGoogleCalendar(s.DB, userID, *cal.GoogleAccountID, *cal.GoogleCalendarID, nil)
	if err != nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "synced_count": count, "calendar": cal.Name})
}

var _ = io.Discard
