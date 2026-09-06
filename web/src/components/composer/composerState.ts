import type { Settings, SchedulingPreset, Task, TaskList, Calendar, TimelineItem } from "@flowforge/api-client";

import { isAllDay } from "../../lib/chips";
import { addDays, isoDate, parseDateKey, toLocalParts, todayKey } from "../../lib/dates";
import { pad } from "../../lib/format";

export type ComposerKind = "task" | "event";

export type ComposerState = {
  editingId: number | null;
  editingKind: ComposerKind | null;
  kind: ComposerKind;
  title: string;
  isCompleted: boolean;
  workloadDistribution: string;
  autoIgnore: boolean;
  listId: number | null;
  listName: string;
  listColor: string;
  autoSchedule: boolean;
  splittable: boolean;
  moreExpanded: boolean;
  durationMinutes: number;
  schedulingHours: string;
  dueDate: string;
  dueTime: string;
  startAfter: "now" | "custom";
  startAfterDate: string;
  startAfterTime: string;
  fixedStartDate: string;
  fixedStartTime: string;
  fixedEndDate: string;
  fixedEndTime: string;
  priority: number;
  repeat: string;
  bufferBefore: number;
  bufferAfter: number;
  color: string;
  notes: string;
  dependencyTaskId: number | null;
  dependencyTaskTitle: string;
  isAllDay: boolean;
  eventStartDate: string;
  eventStartTime: string;
  eventEndDate: string;
  eventEndTime: string;
  isBusy: boolean;
  eventLocation: string;
  eventNotes: string;
  eventCalendarId: number | null;
  eventCalendarName: string;
  eventCalendarColor: string;
  eventColor: string;
  eventRepeat: string;
  eventBufferBefore: number;
  eventBufferAfter: number;
  /** External Google/iCal busy block — view only; not a FlowForge calendar_events row. */
  externalReadOnly: boolean;
};

export function createDefaultComposerState(): ComposerState {
  return {
    editingId: null,
    editingKind: null,
    kind: "task",
    title: "",
    isCompleted: false,
    workloadDistribution: "Close to deadline",
    autoIgnore: false,
    listId: null,
    listName: "Personal",
    listColor: "#5cc98d",
    autoSchedule: true,
    splittable: true,
    moreExpanded: false,
    durationMinutes: 60,
    schedulingHours: "personal hours",
    dueDate: "",
    dueTime: "23:59",
    startAfter: "now",
    startAfterDate: "",
    startAfterTime: "00:00",
    fixedStartDate: "",
    fixedStartTime: "15:00",
    fixedEndDate: "",
    fixedEndTime: "16:00",
    priority: 3,
    repeat: "none",
    bufferBefore: 0,
    bufferAfter: 0,
    color: "",
    notes: "",
    dependencyTaskId: null,
    dependencyTaskTitle: "None",
    isAllDay: false,
    eventStartDate: "",
    eventStartTime: "16:00",
    eventEndDate: "",
    eventEndTime: "17:00",
    isBusy: true,
    eventLocation: "",
    eventNotes: "",
    eventCalendarId: null,
    eventCalendarName: "Personal",
    eventCalendarColor: "#5cc98d",
    eventColor: "",
    eventRepeat: "none",
    eventBufferBefore: 0,
    eventBufferAfter: 0,
    externalReadOnly: false,
  };
}

function resolveDefaultList(
  lists: TaskList[],
  settings: Settings | null,
  preferredListId?: number | null,
): TaskList | null {
  if (preferredListId != null) {
    const match = lists.find((l) => l.id === preferredListId);
    if (match) return match;
  }
  if (settings?.default_task_list_id) {
    const match = lists.find((l) => l.id === settings.default_task_list_id);
    if (match) return match;
  }
  return lists[0] ?? null;
}

function resolveDefaultCalendar(calendars: Calendar[], settings: Settings | null): Calendar | null {
  if (settings?.default_event_calendar_id) {
    const match = calendars.find((c) => c.id === settings.default_event_calendar_id);
    if (match) return match;
  }
  return calendars[0] ?? null;
}

export function buildOpenComposerState(
  kind: ComposerKind,
  dateKey: string | undefined,
  hour: number | undefined,
  lists: TaskList[],
  calendars: Calendar[],
  schedulingPresets: SchedulingPreset[],
  settings: Settings | null,
  preferredListId?: number | null,
): ComposerState {
  const key = dateKey || todayKey(settings?.timezone || "America/New_York");
  const startHour = Number.isFinite(hour) ? hour! : 16;
  const nextHour = (startHour + 1) % 24;
  const base = createDefaultComposerState();

  const list = resolveDefaultList(lists, settings, preferredListId);
  const cal = resolveDefaultCalendar(calendars, settings);

  return {
    ...base,
    kind: kind || "task",
    durationMinutes: settings?.default_task_duration || 60,
    splittable: settings?.default_task_splittable !== false,
    moreExpanded: settings?.default_more_options_expanded !== false,
    workloadDistribution: settings?.workload_distribution || "Close to deadline",
    schedulingHours: schedulingPresets[0]?.name || "personal hours",
    dueDate: key,
    fixedStartDate: key,
    fixedStartTime: `${pad(startHour)}:00`,
    fixedEndDate: key,
    fixedEndTime: `${pad(nextHour)}:00`,
    bufferBefore: settings?.default_task_buffer_before || 0,
    bufferAfter: settings?.default_task_buffer_after || 0,
    eventStartDate: key,
    eventStartTime: `${pad(startHour)}:00`,
    eventEndDate: key,
    eventEndTime: `${pad(nextHour)}:00`,
    listId: list?.id ?? null,
    listName: list?.name ?? "Personal",
    listColor: list?.color || "#5cc98d",
    eventCalendarId: cal?.id ?? null,
    eventCalendarName: cal?.name ?? "Personal",
    eventCalendarColor: cal?.color || "#5cc98d",
  };
}

export function buildEditTaskState(
  task: Task,
  lists: TaskList[],
  schedulingPresets: SchedulingPreset[],
  timezone: string,
): ComposerState {
  const base = createDefaultComposerState();
  const listObj = lists.find((l) => l.id === task.list_id);

  let dueDate = todayKey(timezone);
  let dueTime = "23:59";
  if (task.due_date) {
    const dueParts = toLocalParts(task.due_date, timezone);
    dueDate = dueParts.date;
    dueTime = `${pad(Math.floor(dueParts.minutes / 60))}:${pad(dueParts.minutes % 60)}`;
  }

  let startAfter: "now" | "custom" = "now";
  let startAfterDate = "";
  let startAfterTime = "00:00";
  let fixedStartDate = todayKey(timezone);
  let fixedStartTime = "15:00";
  let fixedEndDate = todayKey(timezone);
  let fixedEndTime = "16:00";

  if (task.start_after) {
    const saParts = toLocalParts(task.start_after, timezone);
    startAfter = "custom";
    startAfterDate = saParts.date;
    startAfterTime = `${pad(Math.floor(saParts.minutes / 60))}:${pad(saParts.minutes % 60)}`;
    if (task.allow_splitting === false) {
      fixedStartDate = saParts.date;
      fixedStartTime = `${pad(Math.floor(saParts.minutes / 60))}:${pad(saParts.minutes % 60)}`;
      const dur = task.duration_minutes || 60;
      const endMinutes = saParts.minutes + dur;
      const endDayShift = Math.floor(endMinutes / (24 * 60));
      const endMinInDay = endMinutes % (24 * 60);
      const endDt = addDays(parseDateKey(saParts.date), endDayShift);
      fixedEndDate = isoDate(endDt);
      fixedEndTime = `${pad(Math.floor(endMinInDay / 60))}:${pad(endMinInDay % 60)}`;
    }
  }

  const isFixed = task.allow_splitting === false && !!task.start_after;

  return {
    ...base,
    editingId: task.id,
    editingKind: "task",
    kind: "task",
    title: task.title || "",
    isCompleted: !!task.is_completed,
    autoSchedule: !isFixed,
    splittable: isFixed ? false : task.allow_splitting !== false,
    workloadDistribution: task.workload_distribution || "Close to deadline",
    autoIgnore: !!task.auto_ignore,
    dependencyTaskId: task.depends_on_task_id ?? null,
    durationMinutes: task.duration_minutes || 60,
    priority: task.priority || 3,
    repeat: task.recurrence || "none",
    bufferBefore: task.buffer_before_minutes || 0,
    bufferAfter: task.buffer_minutes || 0,
    color: task.color || "",
    notes: task.notes || "",
    listId: task.list_id ?? null,
    listName: listObj?.name ?? "Personal",
    listColor: listObj?.color || "#5cc98d",
    schedulingHours: listObj?.default_hours || schedulingPresets[0]?.name || "personal hours",
    dueDate,
    dueTime,
    startAfter,
    startAfterDate,
    startAfterTime,
    fixedStartDate,
    fixedStartTime,
    fixedEndDate,
    fixedEndTime,
  };
}

export function buildEditEventState(item: TimelineItem, timezone: string): ComposerState {
  const base = createDefaultComposerState();
  const startParts = toLocalParts(item.start, timezone);
  const endParts = toLocalParts(item.end, timezone);
  const hasLocalEvent = item.kind === "event" && item.event_id != null;
  const externalReadOnly = item.kind === "busy" || !hasLocalEvent;

  return {
    ...base,
    editingId: item.event_id ?? null,
    editingKind: "event",
    kind: "event",
    title: item.title || "",
    eventStartDate: startParts.date,
    eventStartTime: `${pad(Math.floor(startParts.minutes / 60))}:${pad(startParts.minutes % 60)}`,
    eventEndDate: endParts.date,
    eventEndTime: `${pad(Math.floor(endParts.minutes / 60))}:${pad(endParts.minutes % 60)}`,
    isAllDay: isAllDay(item, timezone),
    eventColor: item.color || "",
    eventCalendarId: item.calendar_id ?? null,
    eventCalendarName: item.calendar_summary || "External",
    externalReadOnly,
  };
}
