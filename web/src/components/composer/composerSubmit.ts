import type { ApiClient } from "@flowforge/api-client";
import { localValueToUtcISO, todayKey } from "../../lib/dates";

import type { ComposerState } from "./composerState";

function toUtc(date: string, time: string, timezone: string): string {
  return localValueToUtcISO(`${date}T${time}`, timezone);
}

function taskExtras(state: ComposerState) {
  return {
    depends_on_task_id: state.dependencyTaskId,
    auto_ignore: state.autoIgnore,
    workload_distribution: state.workloadDistribution || null,
  };
}

export async function submitComposer(
  state: ComposerState,
  api: ApiClient,
  timezone: string,
): Promise<"task-created" | "task-updated" | "event-created" | "event-updated"> {
  const title = state.title.trim();
  if (!title) throw new Error("Give it a title.");

  const today = todayKey(timezone);

  if (state.kind === "task") {
    if (state.editingId && state.editingKind === "task") {
      let startAfterIso: string | null = null;
      let dueIso: string | null = null;
      let durMins = state.durationMinutes || 60;
      const allowSplitting = state.autoSchedule ? state.splittable : false;

      if (state.autoSchedule) {
        const due = state.dueDate || today;
        const dueTime = state.dueTime || "23:59";
        dueIso = toUtc(due, dueTime, timezone);
        startAfterIso =
          state.startAfter !== "now" && state.startAfterDate
            ? toUtc(state.startAfterDate, state.startAfterTime || "00:00", timezone)
            : null;
      } else {
        const startDate = state.fixedStartDate || today;
        const endDate = state.fixedEndDate || startDate;
        const startTime = state.fixedStartTime || "15:00";
        const endTime = state.fixedEndTime || "16:00";
        startAfterIso = toUtc(startDate, startTime, timezone);
        const endIso = toUtc(endDate, endTime, timezone);
        const startDt = new Date(startAfterIso);
        const endDt = new Date(endIso);
        durMins = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / 60000));
        dueIso = state.dueDate
          ? toUtc(state.dueDate, state.dueTime || "23:59", timezone)
          : endIso;
      }

      await api.updateTask(state.editingId, {
        title,
        duration_minutes: durMins,
        due_date: dueIso!,
        priority: state.priority || 3,
        allow_splitting: allowSplitting,
        min_split_minutes: allowSplitting ? 10 : durMins,
        buffer_before_minutes: state.bufferBefore || 0,
        buffer_minutes: state.bufferAfter || 0,
        is_completed: state.isCompleted,
        list_id: state.listId,
        notes: state.notes,
        color: state.color || null,
        recurrence: state.repeat || "none",
        start_after: startAfterIso,
        ...taskExtras(state),
      });
      return "task-updated";
    }

    if (state.autoSchedule) {
      const due = state.dueDate || today;
      const dueTime = state.dueTime || "23:59";
      const startAfterIso =
        state.startAfter !== "now" && state.startAfterDate
          ? toUtc(state.startAfterDate, state.startAfterTime || "00:00", timezone)
          : null;
      const allowSplitting = state.splittable;

      await api.createTask({
        title,
        duration_minutes: state.durationMinutes || 60,
        due_date: toUtc(due, dueTime, timezone),
        priority: state.priority || 3,
        allow_splitting: allowSplitting,
        min_split_minutes: allowSplitting ? 10 : state.durationMinutes || 60,
        buffer_before_minutes: state.bufferBefore || 0,
        buffer_minutes: state.bufferAfter || 0,
        is_completed: false,
        list_id: state.listId,
        notes: state.notes,
        color: state.color || null,
        recurrence: state.repeat || "none",
        start_after: startAfterIso,
        ...taskExtras(state),
      });
    } else {
      const startDate = state.fixedStartDate || today;
      const endDate = state.fixedEndDate || startDate;
      const startTime = state.fixedStartTime || "15:00";
      const endTime = state.fixedEndTime || "16:00";
      const startIso = toUtc(startDate, startTime, timezone);
      const endIso = toUtc(endDate, endTime, timezone);

      if (endIso <= startIso) {
        throw new Error("End time must be after the start time.");
      }

      const startDt = new Date(startIso);
      const endDt = new Date(endIso);
      const durMins = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / 60000));
      const dueIso = state.dueDate
        ? toUtc(state.dueDate, state.dueTime || "23:59", timezone)
        : endIso;

      await api.createTask({
        title,
        duration_minutes: durMins,
        due_date: dueIso,
        priority: state.priority || 3,
        allow_splitting: false,
        min_split_minutes: durMins,
        buffer_before_minutes: state.bufferBefore || 0,
        buffer_minutes: state.bufferAfter || 0,
        is_completed: false,
        list_id: state.listId,
        notes: state.notes,
        color: state.color || null,
        recurrence: state.repeat || "none",
        start_after: startIso,
        ...taskExtras(state),
      });
    }
    return "task-created";
  }

  const isAllDay = state.isAllDay;
  const startDate = state.eventStartDate || today;
  const endDate = state.eventEndDate || startDate;
  const startTime = isAllDay ? "00:00" : state.eventStartTime || "09:00";
  const endTime = isAllDay ? "23:59" : state.eventEndTime || "10:00";
  const startIso = toUtc(startDate, startTime, timezone);
  const endIso = toUtc(endDate, endTime, timezone);

  if (endIso <= startIso) {
    throw new Error("End time must be after the start time.");
  }

  const payload = {
    title,
    start_time: startIso,
    end_time: endIso,
    notes: state.eventNotes,
    location: state.eventLocation,
    calendar_id: state.eventCalendarId,
    color: state.eventColor || null,
    is_busy: state.isBusy !== false,
    recurrence: state.eventRepeat || "none",
  };

  if (state.editingId && state.editingKind === "event") {
    await api.updateEvent(state.editingId, payload);
    return "event-updated";
  }

  await api.createEvent(payload);
  return "event-created";
}

export async function deleteComposerItem(
  state: ComposerState,
  api: ApiClient,
): Promise<"task" | "event"> {
  if (!state.editingId) throw new Error("Nothing to delete.");
  if (state.editingKind === "task") {
    await api.deleteTask(state.editingId);
    return "task";
  }
  await api.deleteEvent(state.editingId);
  return "event";
}
