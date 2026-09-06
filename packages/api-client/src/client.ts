import axios, { type AxiosInstance } from "axios";

import type {
  AppInfo,
  AuthStatus,
  AuthTokenResponse,
  AuthUser,
  Calendar,
  CalendarEvent,
  DeadlineAlertsResponse,
  GoogleCalendarItem,
  GoogleStatus,
  ScheduledBlock,
  SchedulingPreset,
  Settings,
  Task,
  TaskCreate,
  TaskList,
  TaskUpdate,
  TimelineResponse,
  WorkingHours,
  WorkingHoursPayload,
  DayInterval,
  DateOverride,
} from "./types";

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(
  getBaseURL: () => string | Promise<string>,
  getToken?: () => string | null | Promise<string | null>,
) {
  const client: AxiosInstance = axios.create({
    timeout: 20000,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.request.use(async (config) => {
    config.baseURL = await getBaseURL();
    if (getToken) {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const detail = error?.response?.data?.detail;
      let message = error instanceof Error ? error.message : "Request failed.";
      if (typeof detail === "string") message = detail;
      else if (Array.isArray(detail)) {
        message = detail.map((item: { msg?: string }) => item?.msg).filter(Boolean).join(" ");
      }
      return Promise.reject(new Error(message || "Request failed."));
    },
  );

  return {
    getAuthStatus: async () => (await client.get<AuthStatus>("/api/auth/status")).data,
    login: async (payload: { username: string; password: string }) =>
      (await client.post<AuthTokenResponse>("/api/auth/login", payload)).data,
    bootstrap: async (payload: { username: string; password: string; email?: string }) =>
      (await client.post<AuthTokenResponse>("/api/auth/bootstrap", payload)).data,
    me: async () => (await client.get<AuthUser>("/api/auth/me")).data,
    logout: async () => {
      await client.post("/api/auth/logout");
    },
    changePassword: async (payload: { current_password: string; new_password: string }) =>
      (await client.post<AuthTokenResponse>("/api/auth/change-password", payload)).data,
    listUsers: async () => (await client.get<AuthUser[]>("/api/admin/users")).data,
    createUser: async (payload: { username: string; email?: string; password?: string; is_admin?: boolean }) =>
      (await client.post<{ user: AuthUser; temporary_password?: string }>("/api/admin/users", payload)).data,
    updateUser: async (id: number, payload: { is_admin?: boolean; email?: string }) =>
      (await client.patch<AuthUser>(`/api/admin/users/${id}`, payload)).data,
    deleteUser: async (id: number) => {
      await client.delete(`/api/admin/users/${id}`);
    },
    resetUserPassword: async (id: number, payload?: { password?: string }) =>
      (await client.post<{ temporary_password: string }>(`/api/admin/users/${id}/reset-password`, payload ?? {})).data,

    getSettings: async () => (await client.get<Settings>("/api/settings")).data,
    updateSettings: async (payload: Partial<Settings>) => (await client.put<Settings>("/api/settings", payload)).data,
    getGoogleCalendars: async (accountId: number) =>
      (await client.get<GoogleCalendarItem[]>(`/api/google/accounts/${accountId}/calendars`)).data,
    linkGoogleCalendar: async (accountId: number, payload: { calendar_id: string; name: string; color?: string | null }) =>
      (await client.post<Calendar>(`/api/google/accounts/${accountId}/calendars`, payload)).data,
    updateCalendar: async (id: number, payload: { is_active?: boolean; name?: string; color?: string | null }) =>
      (await client.put<Calendar>(`/api/calendars/${id}`, payload)).data,
    triggerSyncTasks: async () => { await client.post("/api/google/sync-tasks"); },
    listCalendars: async () => (await client.get<Calendar[]>("/api/calendars")).data,
    createCalendar: async (payload: { name: string; url?: string; provider?: string; color?: string | null; is_active?: boolean }) =>
      (await client.post<Calendar>("/api/calendars", payload)).data,
    deleteCalendar: async (id: number) => { await client.delete(`/api/calendars/${id}`); },
    listSchedulingPresets: async () => (await client.get<SchedulingPreset[]>("/api/scheduling-hours")).data,
    createSchedulingPreset: async (payload: { name: string; is_default?: boolean; days?: Record<number, DayInterval[]>; overrides?: DateOverride[] }) =>
      (await client.post<SchedulingPreset>("/api/scheduling-hours", payload)).data,
    updateSchedulingPreset: async (id: number, payload: { name?: string; is_default?: boolean; days?: Record<number, DayInterval[]>; overrides?: DateOverride[] }) =>
      (await client.put<SchedulingPreset>(`/api/scheduling-hours/${id}`, payload)).data,
    deleteSchedulingPreset: async (id: number) => { await client.delete(`/api/scheduling-hours/${id}`); },
    listWorkingHours: async () => (await client.get<WorkingHours[]>("/api/working-hours")).data,
    replaceWorkingHours: async (payload: WorkingHoursPayload[]) => (await client.post<WorkingHours[]>("/api/working-hours", payload)).data,
    listTaskLists: async () => (await client.get<TaskList[]>("/api/lists")).data,
    createTaskList: async (payload: { name: string; color?: string; default_hours?: string; sync_tasks_calendar_id?: number | null; is_default?: boolean }) =>
      (await client.post<TaskList>("/api/lists", payload)).data,
    updateTaskList: async (id: number, payload: { name?: string; color?: string; default_hours?: string; sync_tasks_calendar_id?: number | null; is_default?: boolean }) =>
      (await client.put<TaskList>(`/api/lists/${id}`, payload)).data,
    deleteTaskList: async (id: number) => { await client.delete(`/api/lists/${id}`); },
    listTasks: async (completed?: boolean, listId?: number) =>
      (await client.get<Task[]>("/api/tasks", { params: { ...(completed === undefined ? {} : { completed }), ...(listId === undefined ? {} : { list_id: listId }) } })).data,
    createTask: async (payload: TaskCreate) => (await client.post<Task>("/api/tasks", payload)).data,
    createTasksBulk: async (payload: TaskCreate[]) => (await client.post<Task[]>("/api/tasks/bulk", payload)).data,
    bulkUpdateTasks: async (payload: { task_ids: number[]; update?: Record<string, unknown>; delete?: boolean }) =>
      (await client.post<{ updated?: number; deleted?: number }>("/api/tasks/bulk-update", payload)).data,
    updateTask: async (id: number, payload: TaskUpdate) => (await client.put<Task>(`/api/tasks/${id}`, payload)).data,
    deleteTask: async (id: number) => { await client.delete(`/api/tasks/${id}`); },
    getTask: async (id: number) => (await client.get<Task>(`/api/tasks/${id}`)).data,
    getSchedule: async (date: string, days = 1) => (await client.get<TimelineResponse>("/api/schedule", { params: { date, days } })).data,
    runAutoSchedule: async (forceRefresh = false) =>
      (await client.post<ScheduledBlock[]>("/api/schedule/auto", null, { params: forceRefresh ? { force_refresh: true } : {} })).data,
    createEvent: async (payload: { title: string; start_time: string; end_time: string; notes?: string; location?: string; color?: string | null; is_busy?: boolean; recurrence?: string; calendar_id?: number | null }) =>
      (await client.post<CalendarEvent>("/api/events", payload)).data,
    updateEvent: async (id: number, payload: Partial<CalendarEvent>) => (await client.put<CalendarEvent>(`/api/events/${id}`, payload)).data,
    deleteEvent: async (id: number) => { await client.delete(`/api/events/${id}`); },
    getEvent: async (id: number) => (await client.get<CalendarEvent>(`/api/events/${id}`)).data,
    getAppInfo: async () => (await client.get<AppInfo>("/api/app")).data,
    getGoogleStatus: async () => (await client.get<GoogleStatus>("/api/google/status")).data,
    disconnectGoogleAccount: async (id: number) => { await client.delete(`/api/google/accounts/${id}`); },
    /** Browser redirects cannot send Authorization; pass accessToken so the server can validate via query. */
    googleAuthStartUrl: (serverUrl: string, accessToken?: string | null) => {
      const base = `${serverUrl.replace(/\/$/, "")}/api/google/auth/start`;
      if (!accessToken) return base;
      return `${base}?access_token=${encodeURIComponent(accessToken)}`;
    },
    getScheduledTaskIds: async () => (await client.get<number[]>("/api/schedule/scheduled-task-ids")).data,
    getDeadlineAlerts: async () => (await client.get<DeadlineAlertsResponse>("/api/schedule/deadline-alerts")).data,
    resetAccount: async () => { await client.post("/api/account/reset"); },
    notifyHabits: async (source?: string) => {
      await client.post("/api/habits/notify", source ? { source } : {});
    },
  };
}
