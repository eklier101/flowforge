package handlers

import (
	"net/http"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/flowforge/scheduler/internal/scheduler"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountSettings(r chi.Router) {
	r.Get("/api/settings", s.getSettings)
	r.Put("/api/settings", s.updateSettings)
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var settings models.AppSettings
	err := s.DB.Get(&settings, `SELECT * FROM app_settings WHERE user_id = ?`, userID)
	if err != nil {
		httpx.WriteJSON(w, http.StatusOK, models.AppSettings{Timezone: scheduler.DefaultTimezone})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settings)
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p models.AppSettings
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	var count int
	_ = s.DB.Get(&count, `SELECT COUNT(*) FROM app_settings WHERE user_id = ?`, userID)
	if count == 0 {
		_, _ = s.DB.Exec(`INSERT INTO app_settings (user_id, timezone) VALUES (?, ?)`, userID, p.Timezone)
	}
	_, err := s.DB.Exec(`UPDATE app_settings SET
		timezone=COALESCE(NULLIF(?,''), timezone),
		user_name=?, user_email=?, buffer_days=?, auto_scheduling_cutoff=?, workload_distribution=?,
		auto_recalculate=?, lock_started_blocks=?, start_week_on=?, date_format=?, use_24_hour_time=?,
		show_completed_tasks=?, timezone_default_type=?, detect_timezone_changes=?, push_notifications=?,
		sync_tasks_calendar_id=?, default_more_options_expanded=?, default_task_duration=?,
		default_task_splittable=?, default_task_min_split=?, default_task_buffer_before=?,
		default_task_buffer_after=?, default_task_list_id=?, default_event_calendar_id=?
		WHERE user_id = ?`,
		p.Timezone, p.UserName, p.UserEmail, p.BufferDays, p.AutoSchedulingCutoff, p.WorkloadDistribution,
		p.AutoRecalculate, p.LockStartedBlocks, p.StartWeekOn, p.DateFormat, p.Use24HourTime,
		p.ShowCompletedTasks, p.TimezoneDefaultType, p.DetectTimezoneChanges, p.PushNotifications,
		p.SyncTasksCalendarID, p.DefaultMoreOptionsExpanded, p.DefaultTaskDuration,
		p.DefaultTaskSplittable, p.DefaultTaskMinSplit, p.DefaultTaskBufferBefore,
		p.DefaultTaskBufferAfter, p.DefaultTaskListID, p.DefaultEventCalendarID, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	s.getSettings(w, r)
}
