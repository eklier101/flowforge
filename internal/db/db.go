package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

func Open(dataDir string) (*sqlx.DB, error) {
	dbPath := filepath.Join(dataDir, "flowforge.db")
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=cache_size(-64000)&_pragma=temp_store(MEMORY)", dbPath)
	db, err := sqlx.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

func Init(db *sqlx.DB, defaultTZ string) error {
	if err := createTables(db); err != nil {
		return err
	}
	if err := migrateColumns(db); err != nil {
		return err
	}
	if err := migrateUsers(db); err != nil {
		return err
	}
	return seed(db, defaultTZ)
}

func createTables(db *sqlx.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS google_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			email VARCHAR(320) NOT NULL,
			refresh_token TEXT NOT NULL,
			access_token TEXT,
			token_expiry DATETIME,
			last_synced_at DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS external_calendars (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			name VARCHAR(255) NOT NULL,
			url TEXT NOT NULL DEFAULT '',
			is_active BOOLEAN NOT NULL DEFAULT 1,
			provider VARCHAR(32) NOT NULL DEFAULT 'ical',
			google_account_id INTEGER REFERENCES google_accounts(id) ON DELETE CASCADE,
			google_calendar_id VARCHAR(512),
			color VARCHAR(32)
		)`,
		`CREATE TABLE IF NOT EXISTS working_hours (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			day_of_week INTEGER NOT NULL,
			start_time VARCHAR(5) NOT NULL,
			end_time VARCHAR(5) NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS scheduling_presets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			name VARCHAR(255) NOT NULL,
			is_default BOOLEAN NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS scheduling_intervals (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			preset_id INTEGER NOT NULL REFERENCES scheduling_presets(id) ON DELETE CASCADE,
			day_of_week INTEGER NOT NULL,
			start_time VARCHAR(5) NOT NULL,
			end_time VARCHAR(5) NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS scheduling_overrides (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			preset_id INTEGER NOT NULL REFERENCES scheduling_presets(id) ON DELETE CASCADE,
			date VARCHAR(10) NOT NULL,
			is_off BOOLEAN NOT NULL DEFAULT 0,
			start_time VARCHAR(5),
			end_time VARCHAR(5)
		)`,
		`CREATE TABLE IF NOT EXISTS task_lists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			name VARCHAR(255) NOT NULL,
			color VARCHAR(32) NOT NULL DEFAULT '#5cc98d',
			default_hours VARCHAR(64) NOT NULL DEFAULT 'personal hours',
			sync_tasks_calendar_id INTEGER REFERENCES external_calendars(id) ON DELETE SET NULL,
			is_default BOOLEAN NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			title VARCHAR(512) NOT NULL,
			duration_minutes INTEGER NOT NULL,
			due_date DATETIME NOT NULL,
			priority INTEGER NOT NULL DEFAULT 3,
			allow_splitting BOOLEAN NOT NULL DEFAULT 1,
			min_split_minutes INTEGER NOT NULL DEFAULT 10,
			buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
			buffer_minutes INTEGER NOT NULL DEFAULT 0,
			is_completed BOOLEAN NOT NULL DEFAULT 0,
			list_id INTEGER REFERENCES task_lists(id) ON DELETE SET NULL,
			notes TEXT NOT NULL DEFAULT '',
			color VARCHAR(32),
			recurrence VARCHAR(128) NOT NULL DEFAULT 'none',
			start_after DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_blocks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			start_time DATETIME NOT NULL,
			end_time DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS calendar_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			title VARCHAR(512) NOT NULL,
			start_time DATETIME NOT NULL,
			end_time DATETIME NOT NULL,
			notes TEXT NOT NULL DEFAULT '',
			location VARCHAR(256) NOT NULL DEFAULT '',
			color VARCHAR(32),
			is_busy BOOLEAN NOT NULL DEFAULT 1,
			recurrence VARCHAR(128) NOT NULL DEFAULT 'none',
			calendar_id INTEGER REFERENCES external_calendars(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS app_settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL UNIQUE,
			timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
			user_name VARCHAR(128) NOT NULL DEFAULT 'user',
			user_email VARCHAR(256) NOT NULL DEFAULT 'user@example.com',
			buffer_days INTEGER NOT NULL DEFAULT 1,
			auto_scheduling_cutoff VARCHAR(32) NOT NULL DEFAULT '2 weeks',
			workload_distribution VARCHAR(32) NOT NULL DEFAULT 'Balanced',
			auto_recalculate BOOLEAN NOT NULL DEFAULT 1,
			lock_started_blocks BOOLEAN NOT NULL DEFAULT 0,
			start_week_on INTEGER NOT NULL DEFAULT 0,
			date_format VARCHAR(32) NOT NULL DEFAULT 'MM/DD/YYYY',
			use_24_hour_time BOOLEAN NOT NULL DEFAULT 0,
			show_completed_tasks BOOLEAN NOT NULL DEFAULT 1,
			timezone_default_type VARCHAR(32) NOT NULL DEFAULT 'Floating',
			detect_timezone_changes BOOLEAN NOT NULL DEFAULT 1,
			push_notifications BOOLEAN NOT NULL DEFAULT 0,
			sync_tasks_calendar_id INTEGER REFERENCES external_calendars(id) ON DELETE SET NULL,
			default_more_options_expanded BOOLEAN NOT NULL DEFAULT 1,
			default_task_duration INTEGER NOT NULL DEFAULT 60,
			default_task_splittable BOOLEAN NOT NULL DEFAULT 1,
			default_task_min_split INTEGER NOT NULL DEFAULT 10,
			default_task_buffer_before INTEGER NOT NULL DEFAULT 0,
			default_task_buffer_after INTEGER NOT NULL DEFAULT 0,
			default_task_list_id INTEGER REFERENCES task_lists(id) ON DELETE SET NULL,
			default_event_calendar_id INTEGER REFERENCES external_calendars(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username VARCHAR(128) NOT NULL UNIQUE,
			email VARCHAR(256) NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			is_admin BOOLEAN NOT NULL DEFAULT 0,
			must_change_password BOOLEAN NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token_hash VARCHAR(64) PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS ix_tasks_is_completed ON tasks(is_completed)`,
		`CREATE INDEX IF NOT EXISTS ix_tasks_due_date ON tasks(due_date)`,
		`CREATE INDEX IF NOT EXISTS ix_scheduled_blocks_task_id ON scheduled_blocks(task_id)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return err
		}
	}
	return nil
}

func columnExists(db *sqlx.DB, table, column string) (bool, error) {
	rows, err := db.Queryx(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, nil
}

func addColumnIfMissing(db *sqlx.DB, table, column, ddl string) error {
	exists, err := columnExists(db, table, column)
	if err != nil || exists {
		return err
	}
	_, err = db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", table, ddl))
	return err
}

func indexExists(db *sqlx.DB, name string) (bool, error) {
	var n int
	err := db.Get(&n, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, name)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func migrateColumns(db *sqlx.DB) error {
	migrations := []struct{ table, column, ddl string }{
		{"task_lists", "default_hours", "default_hours VARCHAR(64) NOT NULL DEFAULT 'personal hours'"},
		{"task_lists", "sync_tasks_calendar_id", "sync_tasks_calendar_id INTEGER"},
		{"task_lists", "is_default", "is_default BOOLEAN NOT NULL DEFAULT 0"},
		{"tasks", "list_id", "list_id INTEGER"},
		{"tasks", "buffer_before_minutes", "buffer_before_minutes INTEGER NOT NULL DEFAULT 0"},
		{"tasks", "notes", "notes TEXT NOT NULL DEFAULT ''"},
		{"tasks", "color", "color VARCHAR(32)"},
		{"tasks", "recurrence", "recurrence VARCHAR(128) NOT NULL DEFAULT 'none'"},
		{"tasks", "start_after", "start_after DATETIME"},
		{"tasks", "depends_on_task_id", "depends_on_task_id INTEGER"},
		{"tasks", "auto_ignore", "auto_ignore BOOLEAN NOT NULL DEFAULT 0"},
		{"tasks", "workload_distribution", "workload_distribution VARCHAR(32)"},
		{"tasks", "scheduling_preset_id", "scheduling_preset_id INTEGER"},
		{"calendar_events", "notes", "notes TEXT NOT NULL DEFAULT ''"},
		{"calendar_events", "location", "location VARCHAR(256) NOT NULL DEFAULT ''"},
		{"calendar_events", "color", "color VARCHAR(32)"},
		{"calendar_events", "is_busy", "is_busy BOOLEAN NOT NULL DEFAULT 1"},
		{"calendar_events", "recurrence", "recurrence VARCHAR(128) NOT NULL DEFAULT 'none'"},
		{"calendar_events", "calendar_id", "calendar_id INTEGER"},
		{"external_calendars", "provider", "provider VARCHAR(32) NOT NULL DEFAULT 'ical'"},
		{"external_calendars", "google_account_id", "google_account_id INTEGER"},
		{"external_calendars", "google_calendar_id", "google_calendar_id VARCHAR(512)"},
		{"external_calendars", "color", "color VARCHAR(32)"},
	}
	for _, m := range migrations {
		if err := addColumnIfMissing(db, m.table, m.column, m.ddl); err != nil {
			return err
		}
	}
	settingsCols := []struct{ column, ddl string }{
		{"user_name", "user_name VARCHAR(128) NOT NULL DEFAULT 'user'"},
		{"user_email", "user_email VARCHAR(256) NOT NULL DEFAULT 'user@example.com'"},
		{"buffer_days", "buffer_days INTEGER NOT NULL DEFAULT 1"},
		{"auto_scheduling_cutoff", "auto_scheduling_cutoff VARCHAR(32) NOT NULL DEFAULT '2 weeks'"},
		{"workload_distribution", "workload_distribution VARCHAR(32) NOT NULL DEFAULT 'Balanced'"},
		{"auto_recalculate", "auto_recalculate BOOLEAN NOT NULL DEFAULT 1"},
		{"lock_started_blocks", "lock_started_blocks BOOLEAN NOT NULL DEFAULT 0"},
		{"start_week_on", "start_week_on INTEGER NOT NULL DEFAULT 0"},
		{"date_format", "date_format VARCHAR(32) NOT NULL DEFAULT 'MM/DD/YYYY'"},
		{"use_24_hour_time", "use_24_hour_time BOOLEAN NOT NULL DEFAULT 0"},
		{"show_completed_tasks", "show_completed_tasks BOOLEAN NOT NULL DEFAULT 1"},
		{"timezone_default_type", "timezone_default_type VARCHAR(32) NOT NULL DEFAULT 'Floating'"},
		{"detect_timezone_changes", "detect_timezone_changes BOOLEAN NOT NULL DEFAULT 1"},
		{"push_notifications", "push_notifications BOOLEAN NOT NULL DEFAULT 0"},
		{"sync_tasks_calendar_id", "sync_tasks_calendar_id INTEGER"},
		{"default_more_options_expanded", "default_more_options_expanded BOOLEAN NOT NULL DEFAULT 1"},
		{"default_task_duration", "default_task_duration INTEGER NOT NULL DEFAULT 60"},
		{"default_task_splittable", "default_task_splittable BOOLEAN NOT NULL DEFAULT 1"},
		{"default_task_min_split", "default_task_min_split INTEGER NOT NULL DEFAULT 10"},
		{"default_task_buffer_before", "default_task_buffer_before INTEGER NOT NULL DEFAULT 0"},
		{"default_task_buffer_after", "default_task_buffer_after INTEGER NOT NULL DEFAULT 0"},
		{"default_task_list_id", "default_task_list_id INTEGER"},
		{"default_event_calendar_id", "default_event_calendar_id INTEGER"},
	}
	for _, m := range settingsCols {
		if err := addColumnIfMissing(db, "app_settings", m.column, m.ddl); err != nil {
			return err
		}
	}
	return nil
}

func migrateUsers(db *sqlx.DB) error {
	// a. Ensure users/sessions exist (also in createTables for fresh installs).
	for _, s := range []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username VARCHAR(128) NOT NULL UNIQUE,
			email VARCHAR(256) NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			is_admin BOOLEAN NOT NULL DEFAULT 0,
			must_change_password BOOLEAN NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token_hash VARCHAR(64) PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL
		)`,
	} {
		if _, err := db.Exec(s); err != nil {
			return err
		}
	}

	// b. Add user_id columns on existing tables.
	userCols := []string{
		"google_accounts",
		"external_calendars",
		"working_hours",
		"scheduling_presets",
		"task_lists",
		"tasks",
		"calendar_events",
		"app_settings",
	}
	for _, table := range userCols {
		if err := addColumnIfMissing(db, table, "user_id", "user_id INTEGER NOT NULL DEFAULT 0"); err != nil {
			return err
		}
	}

	// c. Recreate working_hours if per-user unique index is missing.
	if err := recreateWorkingHoursTable(db); err != nil {
		return err
	}

	// d–e. Indexes for per-user access.
	indexStmts := []string{
		`CREATE UNIQUE INDEX IF NOT EXISTS ix_app_settings_user ON app_settings(user_id)`,
		`CREATE INDEX IF NOT EXISTS ix_tasks_user ON tasks(user_id)`,
		`CREATE INDEX IF NOT EXISTS ix_task_lists_user ON task_lists(user_id)`,
		`CREATE INDEX IF NOT EXISTS ix_calendar_events_user ON calendar_events(user_id)`,
		`CREATE INDEX IF NOT EXISTS ix_external_calendars_user ON external_calendars(user_id)`,
		`CREATE INDEX IF NOT EXISTS ix_google_accounts_user ON google_accounts(user_id)`,
		`CREATE INDEX IF NOT EXISTS ix_scheduling_presets_user ON scheduling_presets(user_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ix_working_hours_user_day ON working_hours(user_id, day_of_week)`,
	}
	for _, s := range indexStmts {
		if _, err := db.Exec(s); err != nil {
			return err
		}
	}

	// f. Seed first admin when users table is empty.
	// Pre-auth installs had no passworded accounts — only app_settings.user_name /
	// user_email and shared data. Prefer FLOWFORGE_ADMIN_* env; otherwise, if legacy
	// data exists, create an admin from those settings so the UI shows Login (not
	// bootstrap) and existing tasks/calendars stay owned by that admin.
	var userCount int
	if err := db.Get(&userCount, `SELECT COUNT(*) FROM users`); err != nil {
		return err
	}
	if userCount == 0 {
		if err := seedFirstAdminFromLegacyOrEnv(db); err != nil {
			return err
		}
		return nil
	}

	// g. Assign remaining orphans to first admin.
	if err := claimOrphansToFirstAdmin(db); err != nil {
		return err
	}
	return nil
}

func sanitizeUsername(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '_' || r == '.':
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return "admin"
	}
	if len(out) > 64 {
		out = out[:64]
	}
	return out
}

func hasLegacyTenantData(db *sqlx.DB) bool {
	checks := []string{
		`SELECT COUNT(*) FROM tasks`,
		`SELECT COUNT(*) FROM calendar_events`,
		`SELECT COUNT(*) FROM task_lists`,
		`SELECT COUNT(*) FROM external_calendars`,
		`SELECT COUNT(*) FROM google_accounts`,
		`SELECT COUNT(*) FROM app_settings`,
	}
	for _, q := range checks {
		var n int
		if err := db.Get(&n, q); err == nil && n > 0 {
			return true
		}
	}
	return false
}

func seedFirstAdminFromLegacyOrEnv(db *sqlx.DB) error {
	adminUser := strings.TrimSpace(os.Getenv("FLOWFORGE_ADMIN_USER"))
	adminPass := os.Getenv("FLOWFORGE_ADMIN_PASSWORD")

	var legacyName, legacyEmail string
	_ = db.Get(&legacyName, `SELECT user_name FROM app_settings ORDER BY id LIMIT 1`)
	_ = db.Get(&legacyEmail, `SELECT user_email FROM app_settings ORDER BY id LIMIT 1`)
	legacyName = strings.TrimSpace(legacyName)
	legacyEmail = strings.TrimSpace(legacyEmail)

	legacy := hasLegacyTenantData(db)
	if adminUser == "" && legacyName != "" && !strings.EqualFold(legacyName, "user") {
		adminUser = sanitizeUsername(legacyName)
	}
	if adminUser == "" && legacy {
		adminUser = "admin"
	}

	mustChange := false
	if adminPass == "" && legacy {
		raw := make([]byte, 12)
		if _, err := rand.Read(raw); err != nil {
			return fmt.Errorf("generate admin password: %w", err)
		}
		adminPass = hex.EncodeToString(raw)
		mustChange = true
	}

	// Fresh empty install with no env credentials → leave bootstrap UI.
	if adminUser == "" || adminPass == "" {
		return nil
	}

	email := legacyEmail
	if email == "" || strings.EqualFold(email, "user@example.com") {
		email = adminUser + "@localhost"
	}

	hash, err := auth.HashPassword(adminPass)
	if err != nil {
		return err
	}
	res, err := db.Exec(`
		INSERT INTO users (username, email, password_hash, is_admin, must_change_password, created_at)
		VALUES (?, ?, ?, 1, ?, ?)`,
		adminUser, email, hash, mustChange, time.Now().UTC())
	if err != nil {
		return err
	}
	adminID, err := res.LastInsertId()
	if err != nil {
		return err
	}
	if err := claimOrphanData(db, adminID); err != nil {
		return err
	}

	if mustChange {
		log.Printf("flowforge: created admin %q from existing data; temporary password: %s (change after login)", adminUser, adminPass)
	} else {
		log.Printf("flowforge: created admin %q from FLOWFORGE_ADMIN_* / legacy settings", adminUser)
	}
	return nil
}

func recreateWorkingHoursTable(db *sqlx.DB) error {
	exists, err := indexExists(db, "ix_working_hours_user_day")
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	tx, err := db.Beginx()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.Exec(`
		CREATE TABLE working_hours_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL DEFAULT 0,
			day_of_week INTEGER NOT NULL,
			start_time VARCHAR(5) NOT NULL,
			end_time VARCHAR(5) NOT NULL
		)`)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`
		INSERT INTO working_hours_new (id, user_id, day_of_week, start_time, end_time)
		SELECT id, user_id, day_of_week, start_time, end_time FROM working_hours`)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(`DROP TABLE working_hours`); err != nil {
		return err
	}
	if _, err = tx.Exec(`ALTER TABLE working_hours_new RENAME TO working_hours`); err != nil {
		return err
	}
	if _, err = tx.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS ix_working_hours_user_day ON working_hours(user_id, day_of_week)`); err != nil {
		return err
	}
	return tx.Commit()
}

// ClaimOrphanData assigns rows with user_id=0/NULL to userID (used after first-admin bootstrap).
func ClaimOrphanData(db *sqlx.DB, userID int64) error {
	return claimOrphanData(db, userID)
}

func claimOrphanData(db *sqlx.DB, userID int64) error {
	tables := []string{
		"google_accounts",
		"external_calendars",
		"working_hours",
		"scheduling_presets",
		"task_lists",
		"tasks",
		"calendar_events",
	}
	for _, table := range tables {
		q := fmt.Sprintf(`UPDATE %s SET user_id = ? WHERE user_id = 0 OR user_id IS NULL`, table)
		if _, err := db.Exec(q, userID); err != nil {
			return err
		}
	}
	_, err := db.Exec(`UPDATE app_settings SET user_id = ? WHERE id = 1 OR user_id = 0 OR user_id IS NULL`, userID)
	return err
}

func claimOrphansToFirstAdmin(db *sqlx.DB) error {
	var orphanCount int
	tables := []string{
		"google_accounts",
		"external_calendars",
		"working_hours",
		"scheduling_presets",
		"task_lists",
		"tasks",
		"calendar_events",
		"app_settings",
	}
	for _, table := range tables {
		var n int
		q := fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE user_id = 0 OR user_id IS NULL`, table)
		if err := db.Get(&n, q); err != nil {
			return err
		}
		orphanCount += n
	}
	if orphanCount == 0 {
		return nil
	}
	var adminID int64
	err := db.Get(&adminID, `SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1`)
	if err != nil {
		return nil // no admin yet; leave orphans
	}
	return claimOrphanData(db, adminID)
}

func seed(db *sqlx.DB, defaultTZ string) error {
	if defaultTZ == "" {
		defaultTZ = os.Getenv("FLOWFORGE_TZ")
	}
	if defaultTZ == "" {
		defaultTZ = "America/New_York"
	}

	var userCount int
	if err := db.Get(&userCount, `SELECT COUNT(*) FROM users`); err != nil {
		return err
	}
	// Fresh multi-user install with no users yet: leave empty until bootstrap.
	if userCount == 0 {
		return nil
	}

	type userRow struct {
		ID       int64  `db:"id"`
		Username string `db:"username"`
		Email    string `db:"email"`
	}
	var users []userRow
	if err := db.Select(&users, `SELECT id, username, email FROM users ORDER BY id`); err != nil {
		return err
	}
	for _, u := range users {
		if err := EnsureUserData(db, u.ID, defaultTZ, u.Username, u.Email); err != nil {
			return err
		}
	}
	return nil
}

// EnsureUserData creates per-user settings, default list, internal calendar,
// scheduling presets, and working hours when missing. Safe to call repeatedly.
func EnsureUserData(db *sqlx.DB, userID int64, defaultTZ, username, email string) error {
	if defaultTZ == "" {
		defaultTZ = "America/New_York"
	}
	if username == "" {
		username = "user"
	}
	if email == "" {
		email = "user@example.com"
	}

	var count int
	_ = db.Get(&count, `SELECT COUNT(*) FROM app_settings WHERE user_id = ?`, userID)
	if count == 0 {
		_, err := db.Exec(`INSERT INTO app_settings (user_id, timezone, user_name, user_email) VALUES (?, ?, ?, ?)`,
			userID, defaultTZ, username, email)
		if err != nil {
			return err
		}
	}

	_ = db.Get(&count, `SELECT COUNT(*) FROM working_hours WHERE user_id = ?`, userID)
	if count == 0 {
		for day := 0; day < 5; day++ {
			_, _ = db.Exec(`INSERT INTO working_hours (user_id, day_of_week, start_time, end_time) VALUES (?, ?, '09:00', '17:00')`, userID, day)
		}
	}

	_ = db.Get(&count, `SELECT COUNT(*) FROM scheduling_presets WHERE user_id = ?`, userID)
	if count == 0 {
		res, err := db.Exec(`INSERT INTO scheduling_presets (user_id, name, is_default) VALUES (?, 'personal hours', 1)`, userID)
		if err != nil {
			return err
		}
		personalID, _ := res.LastInsertId()
		for _, d := range []int{0, 6} {
			_, _ = db.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?, ?, '20:00', '21:45')`, personalID, d)
		}
		for _, d := range []int{1, 2, 3, 4, 5} {
			_, _ = db.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?, ?, '08:00', '22:00')`, personalID, d)
		}
		res, _ = db.Exec(`INSERT INTO scheduling_presets (user_id, name, is_default) VALUES (?, 'work hours', 0)`, userID)
		workID, _ := res.LastInsertId()
		for _, d := range []int{1, 2, 3, 4, 5} {
			_, _ = db.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?, ?, '09:00', '17:00')`, workID, d)
		}
		res, _ = db.Exec(`INSERT INTO scheduling_presets (user_id, name, is_default) VALUES (?, 'mornings', 0)`, userID)
		mornID, _ := res.LastInsertId()
		for d := 0; d < 7; d++ {
			_, _ = db.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?, ?, '07:00', '12:00')`, mornID, d)
		}
		res, _ = db.Exec(`INSERT INTO scheduling_presets (user_id, name, is_default) VALUES (?, 'evenings', 0)`, userID)
		eveID, _ := res.LastInsertId()
		for d := 0; d < 7; d++ {
			_, _ = db.Exec(`INSERT INTO scheduling_intervals (preset_id, day_of_week, start_time, end_time) VALUES (?, ?, '17:00', '22:00')`, eveID, d)
		}
	}

	var defaultListID int64
	err := db.Get(&defaultListID, `SELECT id FROM task_lists WHERE user_id = ? AND is_default = 1 LIMIT 1`, userID)
	if err != nil {
		err = db.Get(&defaultListID, `SELECT id FROM task_lists WHERE user_id = ? LIMIT 1`, userID)
	}
	if err != nil {
		res, e := db.Exec(`INSERT INTO task_lists (user_id, name, color, default_hours, is_default) VALUES (?, 'Personal', '#5cc98d', 'personal hours', 1)`, userID)
		if e != nil {
			return e
		}
		defaultListID, _ = res.LastInsertId()
	}
	_, _ = db.Exec(`UPDATE tasks SET list_id = ? WHERE user_id = ? AND list_id IS NULL`, defaultListID, userID)

	_ = db.Get(&count, `SELECT COUNT(*) FROM external_calendars WHERE user_id = ? AND provider = 'internal'`, userID)
	if count == 0 {
		_, _ = db.Exec(`INSERT INTO external_calendars (user_id, name, url, is_active, provider, color) VALUES (?, 'Personal', 'internal://personal', 1, 'internal', '#5cc98d')`, userID)
	}

	return ensureSyncedLists(db, userID)
}

func ensureSyncedLists(db *sqlx.DB, userID int64) error {
	var cals []struct {
		ID    int64   `db:"id"`
		Name  string  `db:"name"`
		Color *string `db:"color"`
	}
	if err := db.Select(&cals, `SELECT id, name, color FROM external_calendars WHERE user_id = ? AND provider = 'internal'`, userID); err != nil {
		return err
	}
	for _, cal := range cals {
		var tlID int64
		err := db.Get(&tlID, `SELECT id FROM task_lists WHERE user_id = ? AND sync_tasks_calendar_id = ?`, userID, cal.ID)
		if err != nil {
			_ = db.Get(&tlID, `SELECT id FROM task_lists WHERE user_id = ? AND LOWER(name) = LOWER(?)`, userID, cal.Name)
		}
		color := "#5cc98d"
		if cal.Color != nil {
			color = *cal.Color
		}
		if tlID > 0 {
			_, _ = db.Exec(`UPDATE task_lists SET sync_tasks_calendar_id = ?, color = ? WHERE id = ? AND user_id = ?`, cal.ID, color, tlID, userID)
		} else {
			_, _ = db.Exec(`INSERT INTO task_lists (user_id, name, color, default_hours, sync_tasks_calendar_id, is_default) VALUES (?, ?, ?, 'personal hours', ?, 0)`, userID, cal.Name, color, cal.ID)
		}
	}
	return nil
}

func EnsureSyncedListForCalendar(db *sqlx.DB, userID int64, calID int64, name string, provider string, color *string) error {
	if provider != "internal" {
		return nil
	}
	var tlID int64
	err := db.Get(&tlID, `SELECT id FROM task_lists WHERE user_id = ? AND sync_tasks_calendar_id = ?`, userID, calID)
	if err != nil {
		_ = db.Get(&tlID, `SELECT id FROM task_lists WHERE user_id = ? AND LOWER(name) = LOWER(?)`, userID, name)
	}
	c := "#5cc98d"
	if color != nil {
		c = *color
	}
	if tlID > 0 {
		_, err = db.Exec(`UPDATE task_lists SET sync_tasks_calendar_id = ?, color = ? WHERE id = ? AND user_id = ?`, calID, c, tlID, userID)
		return err
	}
	_, err = db.Exec(`INSERT INTO task_lists (user_id, name, color, default_hours, sync_tasks_calendar_id, is_default) VALUES (?, ?, ?, 'personal hours', ?, 0)`, userID, name, c, calID)
	return err
}
