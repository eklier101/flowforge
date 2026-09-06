package scheduler

import (
	"fmt"
	"strings"

	"github.com/flowforge/scheduler/internal/models"
	"github.com/jmoiron/sqlx"
)

func insertScheduledBlocks(db *sqlx.DB, blocks []models.ScheduledBlock) ([]models.ScheduledBlock, error) {
	if len(blocks) == 0 {
		return []models.ScheduledBlock{}, nil
	}

	const chunkSize = 200
	out := make([]models.ScheduledBlock, 0, len(blocks))

	for i := 0; i < len(blocks); i += chunkSize {
		end := i + chunkSize
		if end > len(blocks) {
			end = len(blocks)
		}
		chunk := blocks[i:end]

		var b strings.Builder
		b.WriteString(`INSERT INTO scheduled_blocks (task_id, start_time, end_time) VALUES `)
		args := make([]any, 0, len(chunk)*3)
		for j, bl := range chunk {
			if j > 0 {
				b.WriteByte(',')
			}
			b.WriteString(`(?,?,?)`)
			args = append(args, bl.TaskID, bl.StartTime.UTC(), bl.EndTime.UTC())
		}

		res, err := db.Exec(b.String(), args...)
		if err != nil {
			return nil, fmt.Errorf("batch insert scheduled_blocks: %w", err)
		}
		lastID, _ := res.LastInsertId()
		firstID := lastID - int64(len(chunk)) + 1
		for j, bl := range chunk {
			id := firstID + int64(j)
			out = append(out, models.ScheduledBlock{
				ID: id, TaskID: bl.TaskID, StartTime: bl.StartTime, EndTime: bl.EndTime,
			})
		}
	}
	return out, nil
}

// Engine names for FLOWFORGE_SCHEDULER_ENGINE.
const (
	EngineGo   = "go"
	EngineRust = "rust"
)

func EngineFromEnv() string {
	v := strings.ToLower(strings.TrimSpace(getenv("FLOWFORGE_SCHEDULER_ENGINE", EngineGo)))
	if v == EngineRust {
		return EngineRust
	}
	return EngineGo
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(lookupEnv(key)); v != "" {
		return v
	}
	return fallback
}
