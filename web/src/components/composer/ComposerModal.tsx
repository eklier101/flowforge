import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api";
import { useAppContext } from "../../context/AppContext";
import { localValueToUtcISO, todayKey } from "../../lib/dates";
import {
  formatDatePill,
  formatDurationLabel,
  formatRepeatLabel,
  hhmmTo12,
} from "../../lib/format";
import { Icon } from "../icons/IconSprite";
import { DeadlineStatusPill } from "./DeadlineStatusPill";
import { ComposerPopovers, formatPriorityButton, type PopoverKind } from "./ComposerPopovers";
import { DatePickerPopover } from "./DatePickerPopover";
import { deleteComposerItem, submitComposer } from "./composerSubmit";
import { TimePickerPopover } from "./TimePickerPopover";

function Switch({ id, on, onClick, className = "switch" }: { id?: string; on: boolean; onClick: () => void; className?: string }) {
  return (
    <button className={className} id={id} type="button" role="switch" aria-checked={on ? "true" : "false"} onClick={onClick} />
  );
}

type PickerState = {
  kind: "date" | "time";
  anchor: HTMLElement;
  value: string;
  title?: string;
  onSelect: (value: string) => void;
} | null;

export function ComposerModal({ onPopoverChange }: { onPopoverChange?: (open: boolean) => void }) {
  const {
    composerOpen,
    composerState,
    setComposerState,
    closeComposer,
    navigateToView,
    syncAfterMutation,
    toast,
    lists,
    calendars,
    schedulingPresets,
    timezone,
    tasks,
  } = useAppContext();

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activePopover, setActivePopover] = useState<PopoverKind | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [startAfterDraft, setStartAfterDraft] = useState({ choice: "now" as "now" | "custom", date: "", time: "00:00" });
  const [customRepeatDraft, setCustomRepeatDraft] = useState({ interval: 1, unit: "week", days: [0], endType: "never" });
  const [googleSyncToast, setGoogleSyncToast] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const state = composerState;
  const kind = state.kind;
  const prioInfo = formatPriorityButton(state.priority);

  const openPopover = useCallback((pop: PopoverKind, anchor: HTMLElement) => {
    setActivePopover((current) => (current === pop ? null : pop));
    setPopoverAnchor(anchor);
    setPicker(null);
  }, []);

  const closePopovers = useCallback(() => {
    setActivePopover(null);
    setPopoverAnchor(null);
    setPicker(null);
  }, []);

  const openDatePicker = useCallback((anchor: HTMLElement, current: string, onSelect: (d: string) => void) => {
    setPicker({ kind: "date", anchor, value: current, onSelect });
    setActivePopover(null);
  }, []);

  const openTimePicker = useCallback((anchor: HTMLElement, current: string, title: string, onSelect: (t: string) => void) => {
    setPicker({ kind: "time", anchor, value: current, title, onSelect });
    setActivePopover(null);
  }, []);

  useEffect(() => {
    onPopoverChange?.(!!activePopover || !!picker);
  }, [activePopover, picker, onPopoverChange]);

  useEffect(() => {
    const onClosePopovers = () => closePopovers();
    window.addEventListener("flowforge:close-popovers", onClosePopovers);
    return () => window.removeEventListener("flowforge:close-popovers", onClosePopovers);
  }, [closePopovers]);

  useEffect(() => {
    if (!composerOpen || kind !== "event") return;
    if (state.externalReadOnly) {
      setGoogleSyncToast(true);
      return;
    }
    if (!state.eventCalendarId) return;
    const cal = calendars.find((c) => c.id === state.eventCalendarId);
    if (cal?.provider === "google") setGoogleSyncToast(true);
  }, [composerOpen, kind, state.eventCalendarId, state.externalReadOnly, calendars]);

  useEffect(() => {
    if (!composerOpen) return;
    setSaving(false);
    setError("");
    setGoogleSyncToast(false);
    const timer = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [composerOpen, state.editingId]);

  useEffect(() => {
    if (!composerOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest(".composer-popover") &&
        !target.closest(".calendar-picker-popover") &&
        !target.closest(".time-picker-popover") &&
        !target.closest("#composer-more-menu") &&
        !target.closest("#composer-more-btn") &&
        !target.closest("#composer-workload-btn") &&
        !target.closest(".composer-clickable-val") &&
        !target.closest(".text-blue-link") &&
        !target.closest(".text-link-simple")
      ) {
        closePopovers();
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [composerOpen, closePopovers]);

  const setKind = (next: "task" | "event") => {
    if (state.externalReadOnly) return;
    setComposerState((s) => ({ ...s, kind: next }));
  };

  const startAfterLabel =
    state.startAfter === "now"
      ? "now"
      : `On ${formatDatePill(state.startAfterDate || todayKey(timezone), timezone)} at ${hhmmTo12(state.startAfterTime || "00:00")}`;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (state.externalReadOnly) {
      setError("This Google Calendar event is read-only. Changes are not saved or copied to Google Calendar.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await submitComposer(state, api, timezone);
      closeComposer();
      if (result === "task-updated") {
        await syncAfterMutation();
        toast("Task updated and rescheduled", "ok");
      } else if (result === "task-created") {
        await syncAfterMutation();
        toast("Task added and scheduled", "ok");
      } else if (result === "event-updated") {
        await syncAfterMutation();
        toast("Event updated", "ok");
      } else {
        await syncAfterMutation();
        toast("Event added", "ok");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!state.editingId) {
      closeComposer();
      return;
    }
    const itemType = state.editingKind === "task" ? "task" : "event";
    if (!confirm(`Delete this ${itemType}?`)) return;
    try {
      const deleted = await deleteComposerItem(state, api);
      closeComposer();
      await syncAfterMutation();
      toast(deleted === "task" ? "Task deleted" : "Event deleted", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  };

  const handleDuplicate = async () => {
    closePopovers();
    const baseTitle = state.title.trim() || "Untitled";
    try {
      if (state.kind === "task") {
        const due = state.dueDate || todayKey(timezone);
        const dueTime = state.dueTime || "23:59";
        const startAfterIso =
          state.startAfter !== "now" && state.startAfterDate
            ? localValueToUtcISO(`${state.startAfterDate}T${state.startAfterTime || "00:00"}`, timezone)
            : null;
        await api.createTask({
          title: `${baseTitle} (Copy)`,
          duration_minutes: state.durationMinutes || 60,
          due_date: localValueToUtcISO(`${due}T${dueTime}`, timezone),
          priority: state.priority || 3,
          allow_splitting: state.autoSchedule ? state.splittable : false,
          min_split_minutes: 10,
          buffer_before_minutes: state.bufferBefore || 0,
          buffer_minutes: state.bufferAfter || 0,
          is_completed: false,
          list_id: state.listId,
          notes: state.notes,
          color: state.color || null,
          recurrence: state.repeat || "none",
          start_after: startAfterIso,
        });
        closeComposer();
        await syncAfterMutation();
        toast("Task duplicated and scheduled", "ok");
      } else {
        const startDate = state.eventStartDate || todayKey(timezone);
        const endDate = state.eventEndDate || startDate;
        const startTime = state.isAllDay ? "00:00" : state.eventStartTime || "09:00";
        const endTime = state.isAllDay ? "23:59" : state.eventEndTime || "10:00";
        await api.createEvent({
          title: `${baseTitle} (Copy)`,
          start_time: localValueToUtcISO(`${startDate}T${startTime}`, timezone),
          end_time: localValueToUtcISO(`${endDate}T${endTime}`, timezone),
          notes: state.eventNotes,
          location: state.eventLocation,
          calendar_id: state.eventCalendarId,
          color: state.eventColor || null,
          is_busy: state.isBusy !== false,
          recurrence: state.eventRepeat || "none",
        });
        closeComposer();
        await syncAfterMutation();
        toast("Event duplicated", "ok");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Duplicate failed", "error");
    }
  };

  const toggleComplete = async () => {
    const next = !state.isCompleted;
    setComposerState((s) => ({ ...s, isCompleted: next }));
    if (state.editingId && state.editingKind === "task") {
      try {
        await api.updateTask(state.editingId, { is_completed: next });
        await syncAfterMutation();
        toast(next ? "Marked complete" : "Marked incomplete", "ok");
      } catch (err) {
        setComposerState((s) => ({ ...s, isCompleted: !next }));
        toast(err instanceof Error ? err.message : "Update failed", "error");
      }
    }
  };

  const openStartAfter = (anchor: HTMLElement) => {
    setStartAfterDraft({
      choice: state.startAfter === "now" ? "now" : "custom",
      date: state.startAfterDate || todayKey(timezone),
      time: state.startAfterTime || "00:00",
    });
    openPopover("startAfter", anchor);
  };

  if (!composerOpen) return null;

  return (
    <>
      <div
        className={`backdrop open`}
        id="composer"
        onClick={(e) => {
          if ((e.target as HTMLElement).id === "composer") closeComposer();
        }}
      >
        <form className="card composer-card" id="composer-form" autoComplete="off" onSubmit={(e) => void handleSubmit(e)}>
          <div className="composer-card-head">
            <button className="icon-btn" type="button" id="composer-close" title="Close" onClick={closeComposer}>
              <Icon name="x" />
            </button>

            {kind === "task" && (
              <DeadlineStatusPill
                taskId={state.editingId}
                dueDate={state.dueDate}
                durationMinutes={state.durationMinutes}
                autoSchedule={state.autoSchedule}
                workloadDistribution={state.workloadDistribution}
                preview={!state.editingId}
                onClick={(anchor) => openPopover("workload", anchor)}
              />
            )}

            <span className="spacer" style={{ flex: 1 }} />

            {!state.externalReadOnly && (
              <button
                className="icon-btn"
                type="button"
                id="composer-more-btn"
                title="More options"
                style={{ marginRight: 6 }}
                onClick={(e) => {
                  e.stopPropagation();
                  openPopover("more", e.currentTarget);
                }}
              >
                <Icon name="dots" style={{ width: 18, height: 18 }} />
              </button>
            )}

            {state.externalReadOnly ? (
              <button className="composer-add-btn" type="button" id="composer-submit" onClick={closeComposer}>
                Close
              </button>
            ) : (
              <button className="composer-add-btn" type="submit" id="composer-submit" disabled={saving}>
                {state.editingId ? "Save" : "Add"}
              </button>
            )}
          </div>

          <div className="composer-title-wrap">
            <button
              type="button"
              className={`composer-check-circle ${state.isCompleted ? "checked on" : ""}`}
              id="composer-task-check"
              title="Mark as completed"
              hidden={kind !== "task"}
              onClick={() => void toggleComplete()}
            >
              <Icon name="check" style={{ width: 13, height: 13 }} />
            </button>
            <input
              ref={titleRef}
              className={`composer-title-input ${state.isCompleted && kind === "task" ? "completed" : ""}`}
              id="item-title"
              maxLength={512}
              placeholder="Title"
              required
              readOnly={state.externalReadOnly}
              value={state.title}
              onChange={(e) => setComposerState((s) => ({ ...s, title: e.target.value }))}
            />
          </div>

          <div className="composer-seg-wrap" hidden={state.externalReadOnly}>
            <div className="composer-seg">
              <button type="button" className={`composer-seg-btn ${kind === "event" ? "on" : ""}`} data-kind="event" onClick={() => setKind("event")}>
                Event
              </button>
              <button type="button" className={`composer-seg-btn ${kind === "task" ? "on" : ""}`} data-kind="task" onClick={() => setKind("task")}>
                Task
              </button>
            </div>
          </div>

          <div id="task-fields" className="composer-fields" hidden={kind !== "task"}>
            <div className="composer-row" id="composer-task-list-row">
              <div className="composer-row-left">
                <Icon name="list-bullet" className="i composer-icon" />
                <span className="composer-row-label" id="composer-list-label" style={{ fontSize: 15, fontWeight: 500 }}>
                  {state.listName || "Personal"}
                </span>
              </div>
              <div
                className="composer-row-right composer-clickable-val"
                id="composer-list-btn"
                onClick={(e) => openPopover("list", e.currentTarget)}
              >
                <span className="dot" id="composer-list-dot" style={{ background: state.listColor || "#5cc98d" }} />
                <Icon name="chev-down" className="i composer-chev" />
              </div>
              <select id="task-list-select" hidden />
            </div>

            <div className="composer-row" style={{ borderBottom: 0, paddingBottom: 4 }}>
              <div className="composer-row-left">
                <Icon name="sparkles" className="i composer-icon" style={{ color: "#60a5fa" }} />
                <div>
                  <div className="composer-row-label">Auto-schedule</div>
                  <div className="composer-row-sub">FlowForge will find the best time</div>
                </div>
              </div>
              <div className="composer-row-right">
                <Switch
                  id="task-auto-schedule"
                  on={state.autoSchedule}
                  onClick={() => setComposerState((s) => ({ ...s, autoSchedule: !s.autoSchedule }))}
                />
              </div>
            </div>

            <div className="composer-row" style={{ borderBottom: 0, paddingBottom: 4 }} hidden={!state.autoSchedule}>
              <div className="composer-row-left">
                <Icon name="split" className="i composer-icon" />
                <div>
                  <div className="composer-row-label">Splittable</div>
                  <div className="composer-row-sub">Allow task to be split across time slots</div>
                </div>
              </div>
              <div className="composer-row-right">
                <Switch
                  id="task-splittable"
                  on={state.splittable}
                  onClick={() => setComposerState((s) => ({ ...s, splittable: !s.splittable }))}
                />
              </div>
            </div>

            <div id="task-auto-on-fields" className="composer-sentence-block" hidden={!state.autoSchedule}>
              <div className="composer-sentence-row">
                <Icon name="clock" className="i composer-icon" />
                <span>I need</span>
                <button type="button" className="text-blue-link" id="task-duration-btn" onClick={(e) => openPopover("duration", e.currentTarget)}>
                  {formatDurationLabel(state.durationMinutes)}
                </button>
              </div>
              <div className="composer-sentence-sub">
                <span>during</span>
                <button type="button" className="text-blue-link" id="task-hours-btn" onClick={(e) => openPopover("hours", e.currentTarget)}>
                  {state.schedulingHours || "personal hours"}
                </button>
              </div>
              <div className="composer-sentence-sub">
                <svg className="i" id="task-priority-icon" style={{ width: 14, height: 14, color: prioInfo.color }}>
                  <use href="#ic-flag" />
                </svg>
                <button type="button" className="text-link-simple" id="task-priority-btn" onClick={(e) => openPopover("priority", e.currentTarget)}>
                  {prioInfo.text} priority
                </button>
              </div>
              <div className="composer-sentence-sub" style={{ marginBottom: 8 }}>
                <span>Due by</span>
                <button
                  type="button"
                  className="text-blue-link"
                  id="task-due-date-btn"
                  onClick={(e) => openDatePicker(e.currentTarget, state.dueDate || todayKey(timezone), (d) => setComposerState((s) => ({ ...s, dueDate: d })))}
                >
                  {formatDatePill(state.dueDate, timezone)}
                </button>
                <input id="task-due" type="date" value={state.dueDate} readOnly style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} />
                <button
                  type="button"
                  className="text-blue-link"
                  id="task-due-time-btn"
                  onClick={(e) => openTimePicker(e.currentTarget, state.dueTime || "23:59", "Due time", (t) => setComposerState((s) => ({ ...s, dueTime: t })))}
                >
                  {hhmmTo12(state.dueTime || "23:59")}
                </button>
              </div>
              <div className="composer-sentence-divider" />
              <div
                className="composer-sentence-row"
                style={{ justifyContent: "space-between", cursor: "pointer" }}
                id="task-start-after-row"
                onClick={(e) => openStartAfter(e.currentTarget)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#9ca3af" }}>Can be started</span>
                  <button
                    type="button"
                    className="text-blue-link"
                    id="task-start-after-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openStartAfter(e.currentTarget);
                    }}
                  >
                    {startAfterLabel}
                  </button>
                </div>
                <Icon name="chev-right" className="i composer-chev" />
              </div>
            </div>

            <div id="task-auto-off-fields" className="composer-sentence-block" hidden={state.autoSchedule}>
              <div className="composer-sentence-row">
                <Icon name="clock" className="i composer-icon" />
                <span>Start</span>
                <button
                  type="button"
                  className="text-blue-link"
                  id="task-fixed-start-date-btn"
                  onClick={(e) => openDatePicker(e.currentTarget, state.fixedStartDate || todayKey(timezone), (d) => setComposerState((s) => ({ ...s, fixedStartDate: d })))}
                >
                  {formatDatePill(state.fixedStartDate, timezone)}
                </button>
                <button
                  type="button"
                  className="text-blue-link"
                  id="task-fixed-start-time-btn"
                  onClick={(e) => openTimePicker(e.currentTarget, state.fixedStartTime, "Task start", (t) => setComposerState((s) => ({ ...s, fixedStartTime: t })))}
                >
                  {hhmmTo12(state.fixedStartTime)}
                </button>
              </div>
              <div className="composer-sentence-sub">
                <span>End</span>
                <button
                  type="button"
                  className="text-blue-link"
                  id="task-fixed-end-date-btn"
                  onClick={(e) => openDatePicker(e.currentTarget, state.fixedEndDate || todayKey(timezone), (d) => setComposerState((s) => ({ ...s, fixedEndDate: d })))}
                >
                  {formatDatePill(state.fixedEndDate, timezone)}
                </button>
                <button
                  type="button"
                  className="text-blue-link"
                  id="task-fixed-end-time-btn"
                  onClick={(e) => openTimePicker(e.currentTarget, state.fixedEndTime, "Task end", (t) => setComposerState((s) => ({ ...s, fixedEndTime: t })))}
                >
                  {hhmmTo12(state.fixedEndTime)}
                </button>
              </div>
              <div className="composer-sentence-sub" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <span id="task-fixed-due-wrap" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {state.dueDate ? (
                    <>
                      <span style={{ color: "#9ca3af", fontSize: 14 }}>Due by</span>
                      <button
                        type="button"
                        className="text-blue-link"
                        id="task-fixed-due-date-btn"
                        onClick={(e) => openDatePicker(e.currentTarget, state.dueDate, (d) => setComposerState((s) => ({ ...s, dueDate: d })))}
                      >
                        {formatDatePill(state.dueDate, timezone)}
                      </button>
                      <button
                        type="button"
                        className="text-blue-link"
                        id="task-fixed-due-time-btn"
                        onClick={(e) => openTimePicker(e.currentTarget, state.dueTime || "23:59", "Due time", (t) => setComposerState((s) => ({ ...s, dueTime: t })))}
                      >
                        {hhmmTo12(state.dueTime || "23:59")}
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        id="task-fixed-clear-due-btn"
                        style={{ color: "#ef4444", fontSize: 12, marginLeft: 4 }}
                        title="Remove due date"
                        onClick={() => setComposerState((s) => ({ ...s, dueDate: "" }))}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-link-simple"
                        id="task-fixed-add-due-btn"
                        style={{ color: "var(--muted)" }}
                        onClick={(e) => openDatePicker(e.currentTarget, todayKey(timezone), (d) => setComposerState((s) => ({ ...s, dueDate: d })))}
                      >
                        Add due date
                      </button>
                      <svg className="i" style={{ width: 13, height: 13, color: "var(--muted)" }} aria-label="When this task must be finished by">
                        <title>When this task must be finished by</title>
                        <use href="#ic-help" />
                      </svg>
                    </>
                  )}
                </span>
              </div>
              <div className="composer-sentence-sub" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <svg className="i" id="task-fixed-priority-icon" style={{ width: 14, height: 14, color: prioInfo.color }}>
                  <use href="#ic-flag" />
                </svg>
                <button type="button" className="text-link-simple" id="task-fixed-priority-btn" onClick={(e) => openPopover("priority", e.currentTarget)}>
                  {prioInfo.text} priority
                </button>
                <svg className="i" style={{ width: 13, height: 13, color: "var(--muted)" }} aria-label="Higher priority tasks are scheduled first">
                  <title>Higher priority tasks are scheduled first</title>
                  <use href="#ic-help" />
                </svg>
              </div>
            </div>

            <div className="composer-sentence-divider" />

            <div className="composer-row" id="composer-task-repeat-row">
              <div className="composer-row-left">
                <Icon name="repeat" className="i composer-icon" />
                <span className="composer-row-label" id="task-repeat-label">{formatRepeatLabel(state.repeat)}</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="task-repeat-btn" onClick={(e) => openPopover("repeat", e.currentTarget)}>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row" id="composer-task-buffer-row" hidden={!state.moreExpanded}>
              <div className="composer-row-left">
                <Icon name="car" className="i composer-icon" />
                <span className="composer-row-label">Add buffer/travel time</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="task-buffer-btn" onClick={(e) => openPopover("buffer", e.currentTarget)}>
                <span id="task-buffer-label" style={{ fontSize: 13, color: "var(--muted)" }}>
                  {!state.bufferBefore && !state.bufferAfter ? "None" : `${state.bufferBefore}m / ${state.bufferAfter}m`}
                </span>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row" id="composer-task-dep-row" hidden={!state.moreExpanded}>
              <div className="composer-row-left">
                <Icon name="nodes" className="i composer-icon" />
                <span className="composer-row-label">Add task dependency</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="task-dependency-btn" onClick={(e) => openPopover("dependency", e.currentTarget)}>
                <span id="task-dependency-label" style={{ fontSize: 13, color: "var(--muted)" }}>
                  {state.dependencyTaskTitle || "None"}
                </span>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row" id="composer-task-color-row">
              <div className="composer-row-left">
                <Icon name="paint" className="i composer-icon" />
                <span className="composer-row-label">Color</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="task-color-btn" onClick={(e) => openPopover("color", e.currentTarget)}>
                <span className="dot" id="task-color-dot" style={{ background: state.color || state.listColor || "#5cc98d" }} />
                <span id="task-color-label">{state.color ? "Custom" : "List color"}</span>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row-notes">
              <Icon name="notes" className="i composer-icon" style={{ marginTop: 4 }} />
              <textarea
                id="task-notes"
                className="composer-notes-input"
                placeholder="Add notes"
                rows={2}
                value={state.notes}
                onChange={(e) => setComposerState((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
          </div>

          <div
            id="event-fields"
            className="composer-fields"
            hidden={kind !== "event"}
            style={state.externalReadOnly ? { pointerEvents: "none", opacity: 0.92 } : undefined}
          >
            <div className="composer-row">
              <div className="composer-row-left">
                <Icon name="clock" className="i composer-icon" />
                <span className="composer-row-label">All day</span>
              </div>
              <div className="composer-row-right">
                <Switch id="event-all-day" on={state.isAllDay} onClick={() => setComposerState((s) => ({ ...s, isAllDay: !s.isAllDay }))} />
              </div>
            </div>

            <div className="composer-row">
              <div className="composer-row-left">
                <span className="composer-row-label" style={{ paddingLeft: 28 }}>Start</span>
              </div>
              <div className="composer-row-right" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="text-blue-link"
                  id="event-start-date-btn"
                  onClick={(e) => openDatePicker(e.currentTarget, state.eventStartDate || todayKey(timezone), (d) => setComposerState((s) => ({ ...s, eventStartDate: d })))}
                >
                  {formatDatePill(state.eventStartDate, timezone)}
                </button>
                <input id="event-start-date" type="date" value={state.eventStartDate} readOnly style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} />
                <button
                  type="button"
                  className="text-blue-link"
                  id="event-start-time-btn"
                  hidden={state.isAllDay}
                  onClick={(e) => openTimePicker(e.currentTarget, state.eventStartTime, "Event start", (t) => setComposerState((s) => ({ ...s, eventStartTime: t })))}
                >
                  {hhmmTo12(state.eventStartTime)}
                </button>
              </div>
            </div>

            <div className="composer-row">
              <div className="composer-row-left">
                <span className="composer-row-label" style={{ paddingLeft: 28 }}>End</span>
              </div>
              <div className="composer-row-right" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="text-blue-link"
                  id="event-end-date-btn"
                  onClick={(e) => openDatePicker(e.currentTarget, state.eventEndDate || todayKey(timezone), (d) => setComposerState((s) => ({ ...s, eventEndDate: d })))}
                >
                  {formatDatePill(state.eventEndDate, timezone)}
                </button>
                <input id="event-end-date" type="date" value={state.eventEndDate} readOnly style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} />
                <button
                  type="button"
                  className="text-blue-link"
                  id="event-end-time-btn"
                  hidden={state.isAllDay}
                  onClick={(e) => openTimePicker(e.currentTarget, state.eventEndTime, "Event end", (t) => setComposerState((s) => ({ ...s, eventEndTime: t })))}
                >
                  {hhmmTo12(state.eventEndTime)}
                </button>
              </div>
            </div>

            <div className="composer-row">
              <div className="composer-row-left">
                <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 28 }}>
                  <span className="composer-row-label">Busy</span>
                  <svg className="i" style={{ width: 13, height: 13, color: "var(--muted)" }} aria-label="Blocks time from being scheduled with tasks">
                    <title>Blocks time from being scheduled with tasks</title>
                    <use href="#ic-help" />
                  </svg>
                </div>
              </div>
              <div className="composer-row-right">
                <Switch id="event-busy" on={state.isBusy} onClick={() => setComposerState((s) => ({ ...s, isBusy: !s.isBusy }))} />
              </div>
            </div>

            <div className="composer-row" id="composer-event-repeat-row">
              <div className="composer-row-left">
                <Icon name="repeat" className="i composer-icon" />
                <span className="composer-row-label" id="event-repeat-label">{formatRepeatLabel(state.eventRepeat)}</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="event-repeat-btn" onClick={(e) => openPopover("repeat", e.currentTarget)}>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row" id="composer-event-buffer-row">
              <div className="composer-row-left">
                <Icon name="car" className="i composer-icon" />
                <span className="composer-row-label">Add buffer/travel time</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="event-buffer-btn" onClick={(e) => openPopover("buffer", e.currentTarget)}>
                <span id="event-buffer-label" style={{ fontSize: 13, color: "var(--muted)" }}>
                  {!state.eventBufferBefore && !state.eventBufferAfter ? "None" : `${state.eventBufferBefore}m / ${state.eventBufferAfter}m`}
                </span>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row">
              <div className="composer-row-left" style={{ flex: 1 }}>
                <Icon name="pin" className="i composer-icon" />
                <input
                  id="event-location"
                  className="composer-inline-input"
                  placeholder="Add location"
                  value={state.eventLocation}
                  onChange={(e) => setComposerState((s) => ({ ...s, eventLocation: e.target.value }))}
                />
              </div>
            </div>

            <div className="composer-row" id="composer-event-cal-row">
              <div className="composer-row-left">
                <Icon name="calendar" className="i composer-icon" />
                <span className="composer-row-label">Calendar</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="event-cal-btn" onClick={(e) => openPopover("calendar", e.currentTarget)}>
                <span className="dot" id="event-cal-dot" style={{ background: state.eventCalendarColor || "#5cc98d" }} />
                <span id="event-cal-label">{state.eventCalendarName || "Personal"}</span>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row" id="composer-event-color-row">
              <div className="composer-row-left">
                <span className="composer-row-label" style={{ paddingLeft: 28 }}>Color</span>
              </div>
              <div className="composer-row-right composer-clickable-val" id="event-color-btn" onClick={(e) => openPopover("color", e.currentTarget)}>
                <span className="dot" id="event-color-dot" style={{ background: state.eventColor || state.eventCalendarColor || "#5cc98d" }} />
                <span id="event-color-label">{state.eventColor ? "Custom" : "Default"}</span>
                <Icon name="chev-down" className="i composer-chev" />
              </div>
            </div>

            <div className="composer-row-notes">
              <Icon name="notes" className="i composer-icon" style={{ marginTop: 4 }} />
              <textarea
                id="event-notes"
                className="composer-notes-input"
                placeholder="Add notes"
                rows={2}
                value={state.eventNotes}
                onChange={(e) => setComposerState((s) => ({ ...s, eventNotes: e.target.value }))}
              />
            </div>
          </div>

          <p className="form-error" id="composer-error" hidden={!error}>
            {error}
          </p>
          {(state.externalReadOnly || googleSyncToast) && (
            <div className="google-sync-toast">
              <span>
                {state.externalReadOnly
                  ? "This event comes from Google Calendar. Viewing only — edits here are not saved or applied to Google Calendar. Only events created in FlowForge can be edited."
                  : "Changes to this item won't be synced to Google Calendar"}
              </span>
              {!state.externalReadOnly && (
                <button type="button" className="btn-accent" onClick={() => setGoogleSyncToast(false)}>
                  OK
                </button>
              )}
            </div>
          )}
        </form>
      </div>

      <ComposerPopovers
        active={activePopover}
        activeKind={kind}
        state={state}
        setState={setComposerState}
        lists={lists}
        calendars={calendars}
        schedulingPresets={schedulingPresets}
        tasks={tasks}
        anchorEl={popoverAnchor}
        onClose={closePopovers}
        onDelete={() => void handleDelete()}
        onConvert={() => setKind(kind === "task" ? "event" : "task")}
        onDuplicate={() => void handleDuplicate()}
        onSeeInTodo={() => {
          closePopovers();
          const listId = state.listId;
          closeComposer();
          void navigateToView(listId ? `list-${listId}` : "all");
        }}
        startAfterDraft={startAfterDraft}
        setStartAfterDraft={setStartAfterDraft}
        onStartAfterDone={() => {
          if (startAfterDraft.choice === "now") {
            setComposerState((s) => ({ ...s, startAfter: "now", startAfterDate: "", startAfterTime: "00:00" }));
          } else {
            setComposerState((s) => ({
              ...s,
              startAfter: "custom",
              startAfterDate: startAfterDraft.date || todayKey(timezone),
              startAfterTime: startAfterDraft.time || "00:00",
            }));
          }
          closePopovers();
        }}
        customRepeatDraft={customRepeatDraft}
        setCustomRepeatDraft={setCustomRepeatDraft}
        onCustomRepeatDone={() => {
          const daysStr = customRepeatDraft.unit === "week" ? customRepeatDraft.days.join(",") : "";
          const customVal = `custom:${customRepeatDraft.interval || 1}:${customRepeatDraft.unit || "week"}:${daysStr}:${customRepeatDraft.endType || "never"}`;
          if (kind === "event") setComposerState((s) => ({ ...s, eventRepeat: customVal }));
          else setComposerState((s) => ({ ...s, repeat: customVal }));
          closePopovers();
        }}
        onPickDate={openDatePicker}
        onPickTime={openTimePicker}
        onOpenCustomRepeat={(anchor) => openPopover("customRepeat", anchor)}
      />

      {picker?.kind === "date" && (
        <DatePickerPopover
          open
          anchorEl={picker.anchor}
          value={picker.value}
          timeZone={timezone}
          onSelect={picker.onSelect}
          onClose={() => setPicker(null)}
        />
      )}
      {picker?.kind === "time" && (
        <TimePickerPopover
          open
          anchorEl={picker.anchor}
          value={picker.value}
          title={picker.title}
          onSelect={picker.onSelect}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
