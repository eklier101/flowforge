package recalc

import (
	"github.com/flowforge/scheduler/internal/google"
	"github.com/flowforge/scheduler/internal/ical"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/flowforge/scheduler/internal/scheduler"
	"github.com/jmoiron/sqlx"
)

type Service struct {
	DB     *sqlx.DB
	ICal   *ical.Service
	Google *google.Service
}

func (s *Service) RecalculateAndSync(userID int64, forceClearCache bool) ([]models.ScheduledBlock, error) {
	var autoRecalc bool
	_ = s.DB.Get(&autoRecalc, `SELECT auto_recalculate FROM app_settings WHERE user_id = ?`, userID)
	if !autoRecalc {
		var blocks []models.ScheduledBlock
		_ = s.DB.Select(&blocks, `
			SELECT sb.* FROM scheduled_blocks sb
			JOIN tasks t ON sb.task_id = t.id
			WHERE t.user_id = ?
			ORDER BY sb.start_time`, userID)
		if blocks == nil {
			blocks = []models.ScheduledBlock{}
		}
		return blocks, nil
	}

	if forceClearCache {
		s.ICal.ClearCache()
	}
	blocks, err := scheduler.RunAutoSchedule(s.DB, s.ICal, userID)
	if err != nil {
		return nil, err
	}
	go s.bgSyncAllTasks(userID)
	return blocks, nil
}

func (s *Service) bgSyncAllTasks(userID int64) {
	targets := make(map[int64][]int64)

	var syncCalID *int64
	_ = s.DB.Get(&syncCalID, `SELECT sync_tasks_calendar_id FROM app_settings WHERE user_id = ?`, userID)
	if syncCalID != nil {
		targets[*syncCalID] = nil
	}

	type tlRow struct {
		ID                  int64 `db:"id"`
		SyncTasksCalendarID int64 `db:"sync_tasks_calendar_id"`
	}
	var lists []tlRow
	_ = s.DB.Select(&lists, `SELECT id, sync_tasks_calendar_id FROM task_lists WHERE user_id = ? AND sync_tasks_calendar_id IS NOT NULL`, userID)
	for _, tl := range lists {
		if _, ok := targets[tl.SyncTasksCalendarID]; !ok {
			targets[tl.SyncTasksCalendarID] = []int64{}
		}
		if targets[tl.SyncTasksCalendarID] != nil {
			targets[tl.SyncTasksCalendarID] = append(targets[tl.SyncTasksCalendarID], tl.ID)
		}
	}

	for calID, listIDs := range targets {
		var cal struct {
			Provider         string  `db:"provider"`
			GoogleAccountID  *int64  `db:"google_account_id"`
			GoogleCalendarID *string `db:"google_calendar_id"`
		}
		if err := s.DB.Get(&cal, `SELECT provider, google_account_id, google_calendar_id FROM external_calendars WHERE id = ? AND user_id = ?`, calID, userID); err != nil {
			continue
		}
		if cal.Provider == "google" && cal.GoogleAccountID != nil && cal.GoogleCalendarID != nil {
			_, _ = s.Google.SyncTasksToGoogleCalendar(s.DB, userID, *cal.GoogleAccountID, *cal.GoogleCalendarID, listIDs)
		}
	}
}
