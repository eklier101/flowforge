package models

import "time"

type ExternalCalendar struct {
	ID               int64   `db:"id" json:"id"`
	UserID           int64   `db:"user_id" json:"-"`
	Name             string  `db:"name" json:"name"`
	URL              string  `db:"url" json:"url"`
	IsActive         bool    `db:"is_active" json:"is_active"`
	Provider         string  `db:"provider" json:"provider"`
	GoogleAccountID  *int64  `db:"google_account_id" json:"google_account_id"`
	GoogleCalendarID *string `db:"google_calendar_id" json:"google_calendar_id"`
	Color            *string `db:"color" json:"color"`
}

type GoogleAccount struct {
	ID           int64      `db:"id" json:"id"`
	UserID       int64      `db:"user_id" json:"-"`
	Email        string     `db:"email" json:"email"`
	RefreshToken string     `db:"refresh_token" json:"-"`
	AccessToken  *string    `db:"access_token" json:"-"`
	TokenExpiry  *time.Time `db:"token_expiry" json:"-"`
	LastSyncedAt *time.Time `db:"last_synced_at" json:"last_synced_at"`
}

type WorkingHours struct {
	ID        int64  `db:"id" json:"id"`
	UserID    int64  `db:"user_id" json:"-"`
	DayOfWeek int    `db:"day_of_week" json:"day_of_week"`
	StartTime string `db:"start_time" json:"start_time"`
	EndTime   string `db:"end_time" json:"end_time"`
}

type SchedulingPreset struct {
	ID        int64  `db:"id" json:"id"`
	UserID    int64  `db:"user_id" json:"-"`
	Name      string `db:"name" json:"name"`
	IsDefault bool   `db:"is_default" json:"is_default"`
}

type SchedulingInterval struct {
	ID        int64  `db:"id" json:"id"`
	PresetID  int64  `db:"preset_id" json:"preset_id"`
	DayOfWeek int    `db:"day_of_week" json:"day_of_week"`
	StartTime string `db:"start_time" json:"start_time"`
	EndTime   string `db:"end_time" json:"end_time"`
}

type SchedulingOverride struct {
	ID        int64   `db:"id" json:"id"`
	PresetID  int64   `db:"preset_id" json:"preset_id"`
	Date      string  `db:"date" json:"date"`
	IsOff     bool    `db:"is_off" json:"is_off"`
	StartTime *string `db:"start_time" json:"start_time"`
	EndTime   *string `db:"end_time" json:"end_time"`
}

type TaskList struct {
	ID                  int64  `db:"id" json:"id"`
	UserID              int64  `db:"user_id" json:"-"`
	Name                string `db:"name" json:"name"`
	Color               string `db:"color" json:"color"`
	DefaultHours        string `db:"default_hours" json:"default_hours"`
	SyncTasksCalendarID *int64 `db:"sync_tasks_calendar_id" json:"sync_tasks_calendar_id"`
	IsDefault           bool   `db:"is_default" json:"is_default"`
	TaskCount           int    `db:"-" json:"task_count"`
}

type Task struct {
	ID                   int64      `db:"id" json:"id"`
	UserID               int64      `db:"user_id" json:"-"`
	Title                string     `db:"title" json:"title"`
	DurationMinutes      int        `db:"duration_minutes" json:"duration_minutes"`
	DueDate              time.Time  `db:"due_date" json:"due_date"`
	Priority             int        `db:"priority" json:"priority"`
	AllowSplitting       bool       `db:"allow_splitting" json:"allow_splitting"`
	MinSplitMinutes      int        `db:"min_split_minutes" json:"min_split_minutes"`
	BufferBeforeMinutes  int        `db:"buffer_before_minutes" json:"buffer_before_minutes"`
	BufferMinutes        int        `db:"buffer_minutes" json:"buffer_minutes"`
	IsCompleted          bool       `db:"is_completed" json:"is_completed"`
	ListID               *int64     `db:"list_id" json:"list_id"`
	Notes                string     `db:"notes" json:"notes"`
	Color                *string    `db:"color" json:"color"`
	Recurrence           string     `db:"recurrence" json:"recurrence"`
	StartAfter           *time.Time `db:"start_after" json:"start_after"`
	DependsOnTaskID      *int64     `db:"depends_on_task_id" json:"depends_on_task_id"`
	AutoIgnore           bool       `db:"auto_ignore" json:"auto_ignore"`
	WorkloadDistribution *string    `db:"workload_distribution" json:"workload_distribution"`
	SchedulingPresetID   *int64     `db:"scheduling_preset_id" json:"scheduling_preset_id"`
	ListName             *string    `db:"list_name" json:"list_name"`
	ListColor            *string    `db:"list_color" json:"list_color"`
}

type ScheduledBlock struct {
	ID        int64     `db:"id" json:"id"`
	TaskID    int64     `db:"task_id" json:"task_id"`
	StartTime time.Time `db:"start_time" json:"start_time"`
	EndTime   time.Time `db:"end_time" json:"end_time"`
	Title     *string   `db:"-" json:"title"`
}

type CalendarEvent struct {
	ID         int64     `db:"id" json:"id"`
	UserID     int64     `db:"user_id" json:"-"`
	Title      string    `db:"title" json:"title"`
	StartTime  time.Time `db:"start_time" json:"start_time"`
	EndTime    time.Time `db:"end_time" json:"end_time"`
	Notes      string    `db:"notes" json:"notes"`
	Location   string    `db:"location" json:"location"`
	Color      *string   `db:"color" json:"color"`
	IsBusy     bool      `db:"is_busy" json:"is_busy"`
	Recurrence string    `db:"recurrence" json:"recurrence"`
	CalendarID *int64    `db:"calendar_id" json:"calendar_id"`
}

type AppSettings struct {
	ID                         int64  `db:"id" json:"id"`
	UserID                     int64  `db:"user_id" json:"-"`
	Timezone                   string `db:"timezone" json:"timezone"`
	UserName                   string `db:"user_name" json:"user_name"`
	UserEmail                  string `db:"user_email" json:"user_email"`
	BufferDays                 int    `db:"buffer_days" json:"buffer_days"`
	AutoSchedulingCutoff       string `db:"auto_scheduling_cutoff" json:"auto_scheduling_cutoff"`
	WorkloadDistribution       string `db:"workload_distribution" json:"workload_distribution"`
	AutoRecalculate            bool   `db:"auto_recalculate" json:"auto_recalculate"`
	LockStartedBlocks          bool   `db:"lock_started_blocks" json:"lock_started_blocks"`
	StartWeekOn                int    `db:"start_week_on" json:"start_week_on"`
	DateFormat                 string `db:"date_format" json:"date_format"`
	Use24HourTime              bool   `db:"use_24_hour_time" json:"use_24_hour_time"`
	ShowCompletedTasks         bool   `db:"show_completed_tasks" json:"show_completed_tasks"`
	TimezoneDefaultType        string `db:"timezone_default_type" json:"timezone_default_type"`
	DetectTimezoneChanges      bool   `db:"detect_timezone_changes" json:"detect_timezone_changes"`
	PushNotifications          bool   `db:"push_notifications" json:"push_notifications"`
	SyncTasksCalendarID        *int64 `db:"sync_tasks_calendar_id" json:"sync_tasks_calendar_id"`
	DefaultMoreOptionsExpanded bool   `db:"default_more_options_expanded" json:"default_more_options_expanded"`
	DefaultTaskDuration        int    `db:"default_task_duration" json:"default_task_duration"`
	DefaultTaskSplittable      bool   `db:"default_task_splittable" json:"default_task_splittable"`
	DefaultTaskMinSplit        int    `db:"default_task_min_split" json:"default_task_min_split"`
	DefaultTaskBufferBefore    int    `db:"default_task_buffer_before" json:"default_task_buffer_before"`
	DefaultTaskBufferAfter     int    `db:"default_task_buffer_after" json:"default_task_buffer_after"`
	DefaultTaskListID          *int64 `db:"default_task_list_id" json:"default_task_list_id"`
	DefaultEventCalendarID     *int64 `db:"default_event_calendar_id" json:"default_event_calendar_id"`
}

type TimelineItem struct {
	Kind            string    `json:"kind"`
	Start           time.Time `json:"start"`
	End             time.Time `json:"end"`
	Title           string    `json:"title"`
	TaskID          *int64    `json:"task_id"`
	EventID         *int64    `json:"event_id"`
	CalendarSummary *string   `json:"calendar_summary"`
	Color           *string   `json:"color"`
	ListName        *string   `json:"list_name"`
	IsCompleted     bool      `json:"is_completed"`
	CalendarID      *int64    `json:"calendar_id"`
	Provider        *string   `json:"provider"`
	IsGoogleSynced  bool      `json:"is_google_synced"`
}

type DeadlineTaskAlert struct {
	TaskID int64  `json:"task_id"`
	Status string `json:"status"`
	Label  string `json:"label"`
	Title  string `json:"title,omitempty"`
}

type DeadlineAlertsResponse struct {
	Count int                 `json:"count"`
	Tasks []DeadlineTaskAlert `json:"tasks"`
}

type TimelineResponse struct {
	Date       string         `json:"date"`
	Timezone   string         `json:"timezone"`
	Items      []TimelineItem `json:"items"`
	RangeStart *string        `json:"range_start"`
	RangeEnd   *string        `json:"range_end"`
}

type DayInterval struct {
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

type DateOverride struct {
	ID        *int64  `json:"id"`
	Date      string  `json:"date"`
	IsOff     bool    `json:"is_off"`
	StartTime *string `json:"start_time"`
	EndTime   *string `json:"end_time"`
}

type SchedulingPresetRead struct {
	ID        int64                 `json:"id"`
	Name      string                `json:"name"`
	IsDefault bool                  `json:"is_default"`
	Days      map[int][]DayInterval `json:"days"`
	Overrides []DateOverride        `json:"overrides"`
}

type GoogleAccountRead struct {
	ID            int64   `json:"id"`
	Email         string  `json:"email"`
	LastSyncedAt  *string `json:"last_synced_at"`
	CalendarCount int     `json:"calendar_count"`
}

type User struct {
	ID                 int64     `db:"id" json:"id"`
	Username           string    `db:"username" json:"username"`
	Email              string    `db:"email" json:"email"`
	PasswordHash       string    `db:"password_hash" json:"-"`
	IsAdmin            bool      `db:"is_admin" json:"is_admin"`
	MustChangePassword bool      `db:"must_change_password" json:"must_change_password"`
	CreatedAt          time.Time `db:"created_at" json:"created_at"`
}

type Session struct {
	TokenHash string    `db:"token_hash" json:"-"`
	UserID    int64     `db:"user_id" json:"user_id"`
	ExpiresAt time.Time `db:"expires_at" json:"expires_at"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type AuthUser struct {
	ID                 int64  `json:"id"`
	Username           string `json:"username"`
	Email              string `json:"email"`
	IsAdmin            bool   `json:"is_admin"`
	MustChangePassword bool   `json:"must_change_password"`
}
