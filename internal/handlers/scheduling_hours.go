package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountSchedulingHours(r chi.Router) {
	r.Route("/api/scheduling-hours", func(r chi.Router) {
		r.Get("/", s.listPresets)
		r.Post("/", s.createPreset)
		r.Get("/{presetID}", s.getPreset)
		r.Put("/{presetID}", s.updatePreset)
		r.Delete("/{presetID}", s.deletePreset)
	})
}

func (s *Server) loadPreset(id, userID int64) models.SchedulingPresetRead {
	var preset models.SchedulingPreset
	_ = s.DB.Get(&preset, `SELECT * FROM scheduling_presets WHERE id = ? AND user_id = ?`, id, userID)
	var intervals []models.SchedulingInterval
	_ = s.DB.Select(&intervals, `SELECT * FROM scheduling_intervals WHERE preset_id = ? ORDER BY day_of_week, start_time`, id)
	var overrides []models.SchedulingOverride
	_ = s.DB.Select(&overrides, `SELECT * FROM scheduling_overrides WHERE preset_id = ? ORDER BY date`, id)

	days := make(map[int][]models.DayInterval)
	for d := 0; d < 7; d++ {
		days[d] = []models.DayInterval{}
	}
	for _, inter := range intervals {
		days[inter.DayOfWeek] = append(days[inter.DayOfWeek], models.DayInterval{StartTime: inter.StartTime, EndTime: inter.EndTime})
	}
	ovs := make([]models.DateOverride, 0, len(overrides))
	for _, o := range overrides {
		oid := o.ID
		ovs = append(ovs, models.DateOverride{ID: &oid, Date: o.Date, IsOff: o.IsOff, StartTime: o.StartTime, EndTime: o.EndTime})
	}
	return models.SchedulingPresetRead{ID: preset.ID, Name: preset.Name, IsDefault: preset.IsDefault, Days: days, Overrides: ovs}
}

func (s *Server) listPresets(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var presets []models.SchedulingPreset
	_ = s.DB.Select(&presets, `SELECT * FROM scheduling_presets WHERE user_id = ? ORDER BY is_default DESC, id ASC`, userID)
	out := make([]models.SchedulingPresetRead, 0, len(presets))
	for _, p := range presets {
		out = append(out, s.loadPreset(p.ID, userID))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) getPreset(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	var count int
	_ = s.DB.Get(&count, `SELECT COUNT(*) FROM scheduling_presets WHERE id = ? AND user_id = ?`, id, userID)
	if count == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Preset not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s.loadPreset(id, userID))
}

type presetCreatePayload struct {
	Name      string                          `json:"name"`
	IsDefault bool                            `json:"is_default"`
	Days      map[string][]models.DayInterval `json:"days"`
	Overrides []models.DateOverride           `json:"overrides"`
}

func (s *Server) createPreset(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p presetCreatePayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if p.IsDefault {
		_, _ = s.DB.Exec(`UPDATE scheduling_presets SET is_default = 0 WHERE user_id = ?`, userID)
	}
	res, err := s.DB.Exec(`INSERT INTO scheduling_presets (user_id, name, is_default) VALUES (?, ?, ?)`, userID, p.Name, p.IsDefault)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	s.savePresetIntervals(id, p.Days, p.Overrides)
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	httpx.WriteJSON(w, http.StatusCreated, s.loadPreset(id, userID))
}

func (s *Server) updatePreset(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	var p presetCreatePayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if p.IsDefault {
		_, _ = s.DB.Exec(`UPDATE scheduling_presets SET is_default = 0 WHERE user_id = ? AND id != ?`, userID, id)
	}
	_, _ = s.DB.Exec(`UPDATE scheduling_presets SET name = ?, is_default = ? WHERE id = ? AND user_id = ?`, p.Name, p.IsDefault, id, userID)
	if p.Days != nil {
		_, _ = s.DB.Exec(`DELETE FROM scheduling_intervals WHERE preset_id = ?`, id)
		_, _ = s.DB.Exec(`DELETE FROM scheduling_overrides WHERE preset_id = ?`, id)
		s.savePresetIntervals(id, p.Days, p.Overrides)
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	httpx.WriteJSON(w, http.StatusOK, s.loadPreset(id, userID))
}

func (s *Server) savePresetIntervals(presetID int64, days map[string][]models.DayInterval, overrides []models.DateOverride) {
	for dayStr, intervals := range days {
		day, _ := strconv.Atoi(dayStr)
		for _, inter := range intervals {
			_, _ = s.DB.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?,?,?,?)`,
				presetID, day, inter.StartTime, inter.EndTime)
		}
	}
	for _, ov := range overrides {
		_, _ = s.DB.Exec(`INSERT INTO scheduling_overrides (preset_id, date, is_off, start_time, end_time) VALUES (?,?,?,?,?)`,
			presetID, ov.Date, ov.IsOff, ov.StartTime, ov.EndTime)
	}
}

func (s *Server) deletePreset(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	var total int
	_ = s.DB.Get(&total, `SELECT COUNT(*) FROM scheduling_presets WHERE user_id = ?`, userID)
	if total <= 1 {
		httpx.WriteError(w, http.StatusBadRequest, "Cannot delete the only scheduling preset")
		return
	}
	var isDefault bool
	_ = s.DB.Get(&isDefault, `SELECT is_default FROM scheduling_presets WHERE id = ? AND user_id = ?`, id, userID)
	if isDefault {
		var fallback int64
		_ = s.DB.Get(&fallback, `SELECT id FROM scheduling_presets WHERE user_id = ? AND id != ? LIMIT 1`, userID, id)
		_, _ = s.DB.Exec(`UPDATE scheduling_presets SET is_default = 1 WHERE id = ? AND user_id = ?`, fallback, userID)
	}
	res, _ := s.DB.Exec(`DELETE FROM scheduling_presets WHERE id = ? AND user_id = ?`, id, userID)
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Preset not found")
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	w.WriteHeader(http.StatusNoContent)
}

var _ = json.RawMessage{}
