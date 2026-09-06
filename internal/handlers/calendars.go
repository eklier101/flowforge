package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/db"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountCalendars(r chi.Router) {
	r.Get("/api/calendars", s.listCalendars)
	r.Post("/api/calendars", s.createCalendar)
	r.Put("/api/calendars/{calendarID}", s.updateCalendar)
	r.Delete("/api/calendars/{calendarID}", s.deleteCalendar)
	r.Get("/api/working-hours", s.listWorkingHours)
	r.Post("/api/working-hours", s.replaceWorkingHours)
}

func (s *Server) listCalendars(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var cals []models.ExternalCalendar
	_ = s.DB.Select(&cals, `SELECT * FROM external_calendars WHERE user_id = ? ORDER BY id ASC`, userID)
	if cals == nil {
		cals = []models.ExternalCalendar{}
	}
	httpx.WriteJSON(w, http.StatusOK, cals)
}

type calendarCreatePayload struct {
	Name     string  `json:"name"`
	URL      string  `json:"url"`
	IsActive bool    `json:"is_active"`
	Provider string  `json:"provider"`
	Color    *string `json:"color"`
}

func (s *Server) createCalendar(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p calendarCreatePayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if p.Provider == "ical" && !strings.HasPrefix(strings.ToLower(p.URL), "http://") && !strings.HasPrefix(strings.ToLower(p.URL), "https://") {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "iCal URL must start with http:// or https://")
		return
	}
	urlStr := p.URL
	if p.Provider != "ical" {
		urlStr = "internal://" + strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
	}
	res, err := s.DB.Exec(`INSERT INTO external_calendars (user_id, name, url, is_active, provider, color) VALUES (?,?,?,?,?,?)`,
		userID, strings.TrimSpace(p.Name), urlStr, p.IsActive, p.Provider, p.Color)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	_ = db.EnsureSyncedListForCalendar(s.DB, userID, id, p.Name, p.Provider, p.Color)
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	var cal models.ExternalCalendar
	_ = s.DB.Get(&cal, `SELECT * FROM external_calendars WHERE id = ? AND user_id = ?`, id, userID)
	httpx.WriteJSON(w, http.StatusCreated, cal)
}

func (s *Server) updateCalendar(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "calendarID"), 10, 64)
	var p struct {
		Name     *string `json:"name"`
		IsActive *bool   `json:"is_active"`
		Color    *string `json:"color"`
	}
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if p.Name != nil {
		_, _ = s.DB.Exec(`UPDATE external_calendars SET name = ? WHERE id = ? AND user_id = ?`, *p.Name, id, userID)
	}
	if p.IsActive != nil {
		_, _ = s.DB.Exec(`UPDATE external_calendars SET is_active = ? WHERE id = ? AND user_id = ?`, *p.IsActive, id, userID)
	}
	if p.Color != nil {
		_, _ = s.DB.Exec(`UPDATE external_calendars SET color = ? WHERE id = ? AND user_id = ?`, *p.Color, id, userID)
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	var cal models.ExternalCalendar
	_ = s.DB.Get(&cal, `SELECT * FROM external_calendars WHERE id = ? AND user_id = ?`, id, userID)
	httpx.WriteJSON(w, http.StatusOK, cal)
}

func (s *Server) deleteCalendar(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "calendarID"), 10, 64)
	res, _ := s.DB.Exec(`DELETE FROM external_calendars WHERE id = ? AND user_id = ?`, id, userID)
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Calendar not found")
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listWorkingHours(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var rows []models.WorkingHours
	_ = s.DB.Select(&rows, `SELECT * FROM working_hours WHERE user_id = ? ORDER BY day_of_week ASC`, userID)
	httpx.WriteJSON(w, http.StatusOK, rows)
}

func (s *Server) replaceWorkingHours(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var items []models.WorkingHours
	if err := httpx.DecodeJSON(r, &items); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	seen := make(map[int]bool)
	for _, item := range items {
		if seen[item.DayOfWeek] {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "Duplicate day_of_week")
			return
		}
		if item.StartTime >= item.EndTime {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "start_time must be before end_time")
			return
		}
		seen[item.DayOfWeek] = true
	}
	_, _ = s.DB.Exec(`DELETE FROM working_hours WHERE user_id = ?`, userID)
	for _, item := range items {
		_, _ = s.DB.Exec(`INSERT INTO working_hours (user_id, day_of_week, start_time, end_time) VALUES (?,?,?,?)`, userID, item.DayOfWeek, item.StartTime, item.EndTime)
	}
	var presetID int64
	_ = s.DB.Get(&presetID, `SELECT id FROM scheduling_presets WHERE user_id = ? AND is_default = 1 LIMIT 1`, userID)
	if presetID == 0 {
		_ = s.DB.Get(&presetID, `SELECT id FROM scheduling_presets WHERE user_id = ? LIMIT 1`, userID)
	}
	if presetID > 0 {
		_, _ = s.DB.Exec(`DELETE FROM scheduling_intervals WHERE preset_id = ?`, presetID)
		for _, item := range items {
			_, _ = s.DB.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?,?,?,?)`, presetID, item.DayOfWeek, item.StartTime, item.EndTime)
		}
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	s.listWorkingHours(w, r)
}
