package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountEvents(r chi.Router) {
	r.Route("/api/events", func(r chi.Router) {
		r.Get("/", s.listEvents)
		r.Post("/", s.createEvent)
		r.Get("/{eventID}", s.getEvent)
		r.Put("/{eventID}", s.updateEvent)
		r.Delete("/{eventID}", s.deleteEvent)
	})
}

func (s *Server) listEvents(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var events []models.CalendarEvent
	_ = s.DB.Select(&events, `SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_time ASC`, userID)
	httpx.WriteJSON(w, http.StatusOK, events)
}

func (s *Server) getEvent(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	var ev models.CalendarEvent
	if err := s.DB.Get(&ev, `SELECT * FROM calendar_events WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Event not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ev)
}

type eventPayload struct {
	Title      string  `json:"title"`
	StartTime  string  `json:"start_time"`
	EndTime    string  `json:"end_time"`
	Notes      string  `json:"notes"`
	Location   string  `json:"location"`
	Color      *string `json:"color"`
	IsBusy     bool    `json:"is_busy"`
	Recurrence string  `json:"recurrence"`
	CalendarID *int64  `json:"calendar_id"`
}

func (s *Server) createEvent(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p eventPayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	start, err1 := httpx.ParseTime(p.StartTime)
	end, err2 := httpx.ParseTime(p.EndTime)
	if err1 != nil || err2 != nil || !end.After(start) {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "invalid start/end time")
		return
	}
	res, err := s.DB.Exec(`INSERT INTO calendar_events (user_id, title, start_time, end_time, notes, location, color, is_busy, recurrence, calendar_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
		userID, strings.TrimSpace(p.Title), start, end, strings.TrimSpace(p.Notes), strings.TrimSpace(p.Location), p.Color, p.IsBusy, p.Recurrence, p.CalendarID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	var ev models.CalendarEvent
	_ = s.DB.Get(&ev, `SELECT * FROM calendar_events WHERE id = ? AND user_id = ?`, id, userID)
	httpx.WriteJSON(w, http.StatusCreated, ev)
}

func (s *Server) updateEvent(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	var existing models.CalendarEvent
	if err := s.DB.Get(&existing, `SELECT * FROM calendar_events WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Event not found")
		return
	}
	var raw map[string]json.RawMessage
	if err := httpx.DecodeJSON(r, &raw); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	title := existing.Title
	start := existing.StartTime
	end := existing.EndTime
	notes := existing.Notes
	location := existing.Location
	color := existing.Color
	isBusy := existing.IsBusy
	recurrence := existing.Recurrence
	calendarID := existing.CalendarID

	if v, ok := raw["title"]; ok {
		_ = json.Unmarshal(v, &title)
		title = strings.TrimSpace(title)
	}
	if v, ok := raw["start_time"]; ok {
		var s string
		if json.Unmarshal(v, &s) == nil {
			if t, err := httpx.ParseTime(s); err == nil {
				start = t
			}
		}
	}
	if v, ok := raw["end_time"]; ok {
		var s string
		if json.Unmarshal(v, &s) == nil {
			if t, err := httpx.ParseTime(s); err == nil {
				end = t
			}
		}
	}
	if v, ok := raw["notes"]; ok {
		_ = json.Unmarshal(v, &notes)
	}
	if v, ok := raw["location"]; ok {
		_ = json.Unmarshal(v, &location)
	}
	if v, ok := raw["color"]; ok {
		_ = json.Unmarshal(v, &color)
	}
	if v, ok := raw["is_busy"]; ok {
		_ = json.Unmarshal(v, &isBusy)
	}
	if v, ok := raw["recurrence"]; ok {
		_ = json.Unmarshal(v, &recurrence)
	}
	if v, ok := raw["calendar_id"]; ok {
		_ = json.Unmarshal(v, &calendarID)
	}

	if !end.After(start) {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "invalid start/end time")
		return
	}
	_, err := s.DB.Exec(`UPDATE calendar_events SET title=?, start_time=?, end_time=?, notes=?, location=?, color=?, is_busy=?, recurrence=?, calendar_id=? WHERE id=? AND user_id=?`,
		title, start, end, notes, location, color, isBusy, recurrence, calendarID, id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	var ev models.CalendarEvent
	_ = s.DB.Get(&ev, `SELECT * FROM calendar_events WHERE id = ? AND user_id = ?`, id, userID)
	httpx.WriteJSON(w, http.StatusOK, ev)
}

func (s *Server) deleteEvent(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	res, _ := s.DB.Exec(`DELETE FROM calendar_events WHERE id = ? AND user_id = ?`, id, userID)
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Event not found")
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	w.WriteHeader(http.StatusNoContent)
}

// silence unused import
var _ = time.Time{}
