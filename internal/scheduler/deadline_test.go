package scheduler

import (
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

const testUserID int64 = 1

// newDeadlineTestDB builds the minimal schema ComputeDeadlineAlerts touches.
func newDeadlineTestDB(t *testing.T, bufferDays int) *sqlx.DB {
	t.Helper()

	db, err := sqlx.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory sqlite: %v", err)
	}
	t.Cleanup(func() {
		if cerr := db.Close(); cerr != nil {
			t.Errorf("close db: %v", cerr)
		}
	})

	stmts := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY)`,
		`CREATE TABLE app_settings (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, timezone VARCHAR(64) NOT NULL DEFAULT 'UTC', buffer_days INTEGER NOT NULL DEFAULT 1)`,
		`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title VARCHAR(512) NOT NULL, due_date DATETIME NOT NULL, is_completed BOOLEAN NOT NULL DEFAULT 0)`,
		`CREATE TABLE scheduled_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, start_time DATETIME NOT NULL, end_time DATETIME NOT NULL)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("exec %q: %v", s, err)
		}
	}
	if _, err := db.Exec(`INSERT INTO users (id) VALUES (?)`, testUserID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO app_settings (id, user_id, timezone, buffer_days) VALUES (1, ?, 'UTC', ?)`, testUserID, bufferDays); err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	return db
}

func addTask(t *testing.T, db *sqlx.DB, title string, due time.Time) int64 {
	t.Helper()
	res, err := db.Exec(`INSERT INTO tasks (user_id, title, due_date, is_completed) VALUES (?, ?, ?, 0)`, testUserID, title, due)
	if err != nil {
		t.Fatalf("insert task %q: %v", title, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("last insert id: %v", err)
	}
	return id
}

func addBlock(t *testing.T, db *sqlx.DB, taskID int64, start, end time.Time) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO scheduled_blocks (task_id, start_time, end_time) VALUES (?, ?, ?)`, taskID, start, end); err != nil {
		t.Fatalf("insert block: %v", err)
	}
}

// The topbar warning badge is driven by Count, and the user only wants it lit
// when a deadline has genuinely passed — not for projected risk.
func TestComputeDeadlineAlertsCountsOnlyOverdue(t *testing.T) {
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	db := newDeadlineTestDB(t, 1)

	// Past deadline, still open -> overdue, counted.
	overdueID := addTask(t, db, "overdue", now.Add(-48*time.Hour))

	// Unscheduled and inside the buffer window -> will_miss, not counted.
	willMissID := addTask(t, db, "will miss", now.Add(12*time.Hour))

	// Scheduled to land inside the buffer window -> close, not counted.
	closeID := addTask(t, db, "close", now.Add(72*time.Hour))
	addBlock(t, db, closeID, now.Add(48*time.Hour), now.Add(49*time.Hour))

	// Comfortably scheduled -> on_track, omitted entirely.
	okID := addTask(t, db, "fine", now.Add(30*24*time.Hour))
	addBlock(t, db, okID, now.Add(time.Hour), now.Add(2*time.Hour))

	got, err := ComputeDeadlineAlerts(db, testUserID, now)
	if err != nil {
		t.Fatalf("ComputeDeadlineAlerts: %v", err)
	}

	if got.Count != 1 {
		t.Errorf("Count = %d, want 1 (only the overdue task)", got.Count)
	}

	byID := make(map[int64]string, len(got.Tasks))
	for _, a := range got.Tasks {
		byID[a.TaskID] = a.Status
	}

	if byID[overdueID] != "overdue" {
		t.Errorf("overdue task status = %q, want %q", byID[overdueID], "overdue")
	}
	if byID[willMissID] != "will_miss" {
		t.Errorf("unscheduled task status = %q, want %q", byID[willMissID], "will_miss")
	}
	if byID[closeID] != "close" {
		t.Errorf("close task status = %q, want %q", byID[closeID], "close")
	}
	if status, ok := byID[okID]; ok {
		t.Errorf("on-track task should be omitted, got status %q", status)
	}
}

func TestComputeDeadlineAlertsZeroWhenNothingPastDeadline(t *testing.T) {
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	db := newDeadlineTestDB(t, 1)

	id := addTask(t, db, "not yet due", now.Add(6*time.Hour))
	addBlock(t, db, id, now.Add(time.Hour), now.Add(2*time.Hour))

	got, err := ComputeDeadlineAlerts(db, testUserID, now)
	if err != nil {
		t.Fatalf("ComputeDeadlineAlerts: %v", err)
	}
	if got.Count != 0 {
		t.Errorf("Count = %d, want 0 so the badge stays hidden", got.Count)
	}
}

func TestComputeDeadlineAlertsIgnoresCompletedTasks(t *testing.T) {
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	db := newDeadlineTestDB(t, 1)

	if _, err := db.Exec(`INSERT INTO tasks (user_id, title, due_date, is_completed) VALUES (?, 'done', ?, 1)`, testUserID, now.Add(-72*time.Hour)); err != nil {
		t.Fatalf("insert completed task: %v", err)
	}

	got, err := ComputeDeadlineAlerts(db, testUserID, now)
	if err != nil {
		t.Fatalf("ComputeDeadlineAlerts: %v", err)
	}
	if got.Count != 0 {
		t.Errorf("Count = %d, want 0 for a completed overdue task", got.Count)
	}
	if len(got.Tasks) != 0 {
		t.Errorf("Tasks = %v, want empty", got.Tasks)
	}
}
