package scheduler

import (
	"time"

	"github.com/flowforge/scheduler/internal/models"
	"github.com/jmoiron/sqlx"
)

func ComputeDeadlineAlerts(db *sqlx.DB, userID int64, now time.Time) (models.DeadlineAlertsResponse, error) {
	loc := GetZone(db, userID)
	now = now.In(loc)

	var bufferDays int
	_ = db.Get(&bufferDays, `SELECT buffer_days FROM app_settings WHERE user_id = ?`, userID)
	if bufferDays < 0 {
		bufferDays = 0
	}

	type taskRow struct {
		ID      int64     `db:"id"`
		Title   string    `db:"title"`
		DueDate time.Time `db:"due_date"`
	}
	var tasks []taskRow
	if err := db.Select(&tasks, `SELECT id, title, due_date FROM tasks WHERE user_id = ? AND is_completed = 0`, userID); err != nil {
		return models.DeadlineAlertsResponse{}, err
	}

	type blockRow struct {
		TaskID  int64     `db:"task_id"`
		EndTime time.Time `db:"end_time"`
	}
	var blocks []blockRow
	_ = db.Select(&blocks, `
		SELECT sb.task_id, sb.end_time
		FROM scheduled_blocks sb
		JOIN tasks t ON sb.task_id = t.id
		WHERE t.user_id = ?
		ORDER BY sb.end_time`, userID)

	lastEnd := make(map[int64]time.Time)
	for _, b := range blocks {
		if prev, ok := lastEnd[b.TaskID]; !ok || b.EndTime.After(prev) {
			lastEnd[b.TaskID] = b.EndTime
		}
	}

	var alerts []models.DeadlineTaskAlert
	count := 0

	for _, t := range tasks {
		due := t.DueDate.In(loc)
		bufferStart := due.AddDate(0, 0, -bufferDays)

		status := "on_track"
		label := "On track"

		lastBlockEnd, hasBlocks := lastEnd[t.ID]
		switch {
		case now.After(due):
			status = "overdue"
			label = "Past deadline"
		case !hasBlocks && !now.Before(bufferStart):
			status = "will_miss"
			label = "Will miss deadline"
		case hasBlocks && lastBlockEnd.After(due):
			status = "will_miss"
			label = "Will miss deadline"
		case hasBlocks && !lastBlockEnd.Before(bufferStart):
			status = "close"
			label = "Close to deadline"
		}

		if status == "on_track" {
			continue
		}

		// Count drives the topbar warning badge, which must only appear when a
		// deadline has genuinely passed. Projected risk ("will_miss", "close")
		// still ships in Tasks so the composer pill can show it, but it does
		// not light up the badge.
		if status == "overdue" {
			count++
		}

		alerts = append(alerts, models.DeadlineTaskAlert{
			TaskID: t.ID,
			Status: status,
			Label:  label,
			Title:  t.Title,
		})
	}

	if alerts == nil {
		alerts = []models.DeadlineTaskAlert{}
	}
	return models.DeadlineAlertsResponse{Count: count, Tasks: alerts}, nil
}
