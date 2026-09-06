export type Calendar = {
  id: number;
  name: string;
  url: string;
  is_active: boolean;
  provider?: string;
  google_account_id?: number | null;
  google_calendar_id?: string | null;
  color?: string | null;
};

export type AppInfo = {
  name: string;
  version: string;
  version_code: number;
  apk_available: boolean;
  apk_url: string | null;
  apk_download_url: string | null;
  apk_size: number;
  apk_filename: string | null;
  public_url: string;
};

export type GoogleAccount = {
  id: number;
  email: string;
  last_synced_at: string | null;
  calendar_count: number;
};

export type GoogleStatus = {
  configured: boolean;
  accounts: GoogleAccount[];
};

export type WorkingHours = {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type WorkingHoursPayload = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type DayInterval = {
  start_time: string;
  end_time: string;
};

export type DateOverride = {
  id?: number;
  date: string;
  is_off: boolean;
  start_time?: string | null;
  end_time?: string | null;
};

export type SchedulingPreset = {
  id: number;
  name: string;
  is_default: boolean;
  days: Record<number, DayInterval[]>;
  overrides: DateOverride[];
};

export type TaskList = {
  id: number;
  name: string;
  color: string;
  default_hours: string;
  sync_tasks_calendar_id?: number | null;
  is_default: boolean;
  task_count: number;
};

export type Task = {
  id: number;
  title: string;
  duration_minutes: number;
  due_date: string;
  priority: number;
  allow_splitting: boolean;
  min_split_minutes: number;
  buffer_before_minutes?: number;
  buffer_minutes: number;
  is_completed: boolean;
  list_id?: number | null;
  list_name?: string | null;
  list_color?: string | null;
  notes?: string;
  color?: string | null;
  recurrence?: string;
  start_after?: string | null;
  depends_on_task_id?: number | null;
  auto_ignore?: boolean;
  workload_distribution?: string | null;
  scheduling_preset_id?: number | null;
};

export type TaskCreate = {
  title: string;
  duration_minutes: number;
  due_date: string;
  priority: number;
  allow_splitting: boolean;
  min_split_minutes: number;
  buffer_before_minutes?: number;
  buffer_minutes: number;
  is_completed?: boolean;
  list_id?: number | null;
  notes?: string;
  color?: string | null;
  recurrence?: string;
  start_after?: string | null;
  depends_on_task_id?: number | null;
  auto_ignore?: boolean;
  workload_distribution?: string | null;
  scheduling_preset_id?: number | null;
};

export type TaskUpdate = Partial<TaskCreate> & { is_completed?: boolean };

export type ScheduledBlock = {
  id: number;
  task_id: number;
  start_time: string;
  end_time: string;
  title?: string | null;
};

export type TimelineItem = {
  kind: "busy" | "task" | "event";
  start: string;
  end: string;
  title: string;
  task_id?: number | null;
  event_id?: number | null;
  calendar_summary?: string | null;
  color?: string | null;
  list_name?: string | null;
  is_completed?: boolean;
  calendar_id?: number | null;
  provider?: string | null;
  is_google_synced?: boolean;
};

export type DeadlineTaskAlert = {
  task_id: number;
  status: "on_track" | "close" | "will_miss" | string;
  label: string;
  title?: string;
};

export type DeadlineAlertsResponse = {
  count: number;
  tasks: DeadlineTaskAlert[];
};

export type TimelineResponse = {
  date: string;
  timezone: string;
  items: TimelineItem[];
  range_start?: string | null;
  range_end?: string | null;
};

export type CalendarEvent = {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
  notes: string;
  location?: string;
  color?: string | null;
  is_busy?: boolean;
  recurrence?: string;
  calendar_id?: number | null;
};

export type GoogleCalendarItem = {
  id: string;
  name: string;
  color?: string | null;
  linked: boolean;
  is_active: boolean;
  calendar_row_id?: number | null;
  primary?: boolean;
};

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  must_change_password: boolean;
};

export type AuthTokenResponse = {
  token: string;
  expires_at: string;
  user: AuthUser;
};

export type AuthStatus = {
  needs_bootstrap: boolean;
  user_count: number;
};

export type Settings = {
  timezone: string;
  user_name?: string;
  user_email?: string;
  buffer_days?: number;
  auto_scheduling_cutoff?: string;
  workload_distribution?: string;
  auto_recalculate?: boolean;
  lock_started_blocks?: boolean;
  start_week_on?: number;
  date_format?: string;
  use_24_hour_time?: boolean;
  show_completed_tasks?: boolean;
  timezone_default_type?: string;
  detect_timezone_changes?: boolean;
  push_notifications?: boolean;
  sync_tasks_calendar_id?: number | null;
  default_more_options_expanded?: boolean;
  default_task_duration?: number;
  default_task_splittable?: boolean;
  default_task_min_split?: number;
  default_task_buffer_before?: number;
  default_task_buffer_after?: number;
  default_task_list_id?: number | null;
  default_event_calendar_id?: number | null;
};
