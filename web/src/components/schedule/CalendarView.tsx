import { useCallback, useEffect, useRef, useState } from "react";

import type { TimelineItem } from "@flowforge/api-client";

import { api } from "../../api";
import { useAppContext } from "../../context/AppContext";
import { buildChips, isTaskCompleted, type ChipData } from "../../lib/chips";
import { notifyHabitsComplete } from "../../lib/habitsNotify";
import { HOUR_H, DOW, MONTHS } from "../../lib/constants";
import { isoDate, localValueToUtcISO, nowMinutes, todayKey } from "../../lib/dates";
import { escapeHtml, formatDatePill, formatDurationLabel, hhmmTo12, hourLabel, pad, rangeLabel } from "../../lib/format";
import { Icon } from "../icons/IconSprite";

type CalendarViewProps = {
  days: Date[];
  dayKeys: string[];
  scrolled: boolean;
  setScrolled: (v: boolean) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  onScheduleChange: () => Promise<void>;
};

function matchesQuery(item: TimelineItem, query: string): boolean {
  if (!query) return true;
  return item.title.toLowerCase().includes(query);
}

export function CalendarView({
  days,
  dayKeys,
  scrolled,
  setScrolled,
  isDragging,
  setIsDragging,
  onScheduleChange,
}: CalendarViewProps) {
  const {
    items,
    tasks,
    timezone,
    prefs,
    query,
    openEditTask,
    openEditEvent,
    openComposer,
    syncAfterMutation,
    toast,
  } = useAppContext();

  const bodyRef = useRef<HTMLDivElement>(null);
  const today = todayKey(timezone);
  const [, setNowTick] = useState(0);

  const syncScrollbarWidth = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const width = body.offsetWidth - body.clientWidth;
    document.documentElement.style.setProperty("--scroll-w", `${width}px`);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--days", String(days.length));
  }, [days.length]);

  useEffect(() => {
    syncScrollbarWidth();
    window.addEventListener("resize", syncScrollbarWidth);
    return () => window.removeEventListener("resize", syncScrollbarWidth);
  }, [syncScrollbarWidth, days, items]);

  useEffect(() => {
    if (!dayKeys.includes(today)) return;
    const timer = window.setInterval(() => setNowTick((n) => n + 1), 60000);
    return () => window.clearInterval(timer);
  }, [dayKeys, today]);

  useEffect(() => {
    if (scrolled) return;
    const body = bodyRef.current;
    if (!body) return;
    setScrolled(true);
    const target = dayKeys.includes(today) ? Math.max(0, nowMinutes(timezone) / 60 - 1.5) : 7;
    requestAnimationFrame(() => {
      body.scrollTop = target * HOUR_H;
    });
  }, [scrolled, setScrolled, dayKeys, today, timezone]);

  const { timed, allDay } = buildChips(dayKeys, items, timezone);
  const months = [...new Set(days.map((d) => MONTHS[d.getMonth()]))];

  const toggleComplete = useCallback(async (taskId: number) => {
    const task = tasks.find((t) => t.id === taskId);
    const isComp = task ? !task.is_completed : true;
    try {
      await api.updateTask(taskId, { is_completed: isComp });
      if (isComp) notifyHabitsComplete("flowforge");
      await syncAfterMutation();
      toast(isComp ? "Task completed" : "Task uncompleted", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }, [tasks, syncAfterMutation, toast]);

  const handleChipClick = useCallback((index: number) => {
    if (isDragging) return;
    const item = items[index];
    if (!item) return;
    if (item.kind === "task") {
      const taskId = item.task_id;
      if (!taskId) return;
      let task = tasks.find((t) => t.id === taskId);
      if (!task) {
        task = {
          id: taskId,
          title: item.title,
          duration_minutes: 60,
          priority: 3,
          due_date: item.start,
          allow_splitting: true,
          min_split_minutes: 10,
          buffer_minutes: 0,
          is_completed: false,
        };
      }
      openEditTask(task);
      return;
    }
    // Events and external busy blocks (Google/iCal) open the event editor.
    // Busy items without a FlowForge event_id are read-only in the composer.
    if (item.kind === "event" || item.kind === "busy") {
      void openEditEvent(item);
    }
  }, [isDragging, items, tasks, openEditTask, openEditEvent]);

  const handleCellClick = useCallback((dateKey: string, hour: number) => {
    if (isDragging) return;
    openComposer("event", dateKey, hour);
  }, [isDragging, openComposer]);

  const handlePointerDown = useCallback((e: React.PointerEvent, chip: ChipData) => {
    if (e.button !== 0) return;
    const item = chip.item;
    if (item.kind === "busy") return;

    e.preventDefault();
    const chipEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try { chipEl.setPointerCapture(pointerId); } catch { /* ignore */ }

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let targetDate: string | null = null;
    let snappedMinutes: number | null = null;
    let ghostEl: HTMLDivElement | null = null;
    let indicatorEl: HTMLDivElement | null = null;

    const taskObj = item.kind === "task"
      ? (item.task_id ? tasks.find((t) => t.id === item.task_id) : tasks.find((t) => t.title.trim().toLowerCase() === item.title.trim().toLowerCase()))
      : null;
    const durationMinutes = taskObj
      ? (taskObj.duration_minutes || 60)
      : Math.max(15, Math.round((new Date(item.end).getTime() - new Date(item.start).getTime()) / 60000));
    const durationPx = (durationMinutes / 60) * HOUR_H;
    const itemColor = item.color || (item.kind === "task" ? "#5cc98d" : "#60a5fa");

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 4) return;
        dragging = true;
        setIsDragging(true);
        chipEl.classList.add("dragging");
        document.body.style.cursor = "grabbing";
        ghostEl = document.createElement("div");
        ghostEl.className = `schedule-drag-ghost ${item.kind}`;
        ghostEl.style.borderLeftColor = itemColor;
        ghostEl.innerHTML = `<div class="ghost-title">${escapeHtml(item.title)}</div><div class="ghost-badge">${formatDurationLabel(durationMinutes)}</div>`;
        document.body.appendChild(ghostEl);
        indicatorEl = document.createElement("div");
        indicatorEl.className = `schedule-drop-indicator ${item.kind}`;
        indicatorEl.style.height = `${Math.max(18, durationPx - 2)}px`;
      }
      if (ghostEl) {
        ghostEl.style.left = `${moveEvent.clientX + 14}px`;
        ghostEl.style.top = `${moveEvent.clientY + 14}px`;
      }
      const calBody = bodyRef.current;
      if (calBody) {
        const rect = calBody.getBoundingClientRect();
        if (moveEvent.clientY < rect.top + 35) calBody.scrollTop -= 14;
        else if (moveEvent.clientY > rect.bottom - 35) calBody.scrollTop += 14;
      }
      const cols = document.querySelectorAll<HTMLElement>(".day-col");
      let hoveredCol: HTMLElement | null = null;
      for (const col of cols) {
        const rect = col.getBoundingClientRect();
        if (moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right) hoveredCol = col;
        col.classList.remove("drag-over");
      }
      if (hoveredCol && indicatorEl) {
        hoveredCol.classList.add("drag-over");
        const colRect = hoveredCol.getBoundingClientRect();
        targetDate = hoveredCol.dataset.date ?? null;
        const relativeY = moveEvent.clientY - colRect.top;
        const rawMins = (relativeY / HOUR_H) * 60;
        snappedMinutes = Math.max(0, Math.min(24 * 60 - durationMinutes, Math.round(rawMins / 15) * 15));
        indicatorEl.style.top = `${(snappedMinutes / 60) * HOUR_H}px`;
        if (indicatorEl.parentNode !== hoveredCol) hoveredCol.appendChild(indicatorEl);
      } else {
        targetDate = null;
        snappedMinutes = null;
        indicatorEl?.parentNode?.removeChild(indicatorEl);
      }
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      try { chipEl.releasePointerCapture(pointerId); } catch { /* ignore */ }
      document.body.style.cursor = "";
      ghostEl?.parentNode?.removeChild(ghostEl);
      indicatorEl?.parentNode?.removeChild(indicatorEl);
      chipEl.classList.remove("dragging");
      document.querySelectorAll(".day-col").forEach((c) => c.classList.remove("drag-over"));

      if (dragging) {
        setTimeout(() => setIsDragging(false), 160);
        if (targetDate && snappedMinutes !== null) {
          const startMins = snappedMinutes;
          const endMins = startMins + durationMinutes;
          const startHhMm = `${pad(Math.floor(startMins / 60))}:${pad(startMins % 60)}`;
          const endHhMm = `${pad(Math.floor(endMins / 60))}:${pad(endMins % 60)}`;
          const newStartIso = localValueToUtcISO(`${targetDate}T${startHhMm}`, timezone);
          const newEndIso = localValueToUtcISO(`${targetDate}T${endHhMm}`, timezone);
          const conflicts = items.filter((other) => {
            if (other.kind !== "busy") return false;
            const oStart = new Date(other.start).getTime();
            const oEnd = new Date(other.end).getTime();
            const nStart = new Date(newStartIso).getTime();
            const nEnd = new Date(newEndIso).getTime();
            return nStart < oEnd && nEnd > oStart;
          });
          if (conflicts.length > 0) {
            const proceed = confirm(`This overlaps ${conflicts.length} busy block(s). Schedule anyway?`);
            if (!proceed) return;
          }
          try {
            if (item.kind === "task") {
              const taskId = item.task_id || taskObj?.id;
              if (!taskId) return;
              const prevDue = taskObj?.due_date;
              let newDueIso = prevDue;
              if (prevDue) {
                if (new Date(prevDue) < new Date(newEndIso)) newDueIso = newEndIso;
              } else newDueIso = newEndIso;
              await api.updateTask(taskId, {
                start_after: newStartIso,
                allow_splitting: false,
                min_split_minutes: durationMinutes,
                due_date: newDueIso,
              });
              await onScheduleChange();
              toast(`Task set to ${formatDatePill(targetDate, timezone)} at ${hhmmTo12(startHhMm)}`, "ok");
            } else if (item.kind === "event" && item.event_id) {
              await api.updateEvent(item.event_id, { start_time: newStartIso, end_time: newEndIso });
              await onScheduleChange();
              toast(`Event moved to ${formatDatePill(targetDate, timezone)} at ${hhmmTo12(startHhMm)}`, "ok");
            }
          } catch (err) {
            toast(err instanceof Error ? err.message : "Move failed", "error");
          }
        }
      } else {
        setIsDragging(false);
        handleChipClick(chip.index);
      }
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }, [tasks, timezone, setIsDragging, handleChipClick, onScheduleChange, toast]);

  function renderChip(chip: ChipData) {
    const { item } = chip;
    const lanes = chip.lanes || 1;
    const lane = chip.lane || 0;
    const width = 100 / lanes;
    const taskColor = item.color || "#5cc98d";
    const isTask = item.kind === "task";
    const completed = isTaskCompleted(item, tasks);
    const dim = matchesQuery(item, query) ? "" : " dim";

    return (
      <article
        key={`${chip.index}-${lane}`}
        className={`chip ${item.kind}${dim}${completed ? " completed" : ""}`}
        data-item={chip.index}
        style={{
          top: chip.top,
          height: chip.height,
          left: `calc(${lane * width}% + 2px)`,
          width: `calc(${width}% - 4px)`,
          borderLeft: isTask ? `3.5px solid ${taskColor}` : undefined,
          borderLeftColor: !isTask && item.color ? item.color : undefined,
          background: isTask
            ? completed
              ? "rgba(30, 35, 42, 0.7)"
              : `linear-gradient(135deg, ${taskColor}24 0%, rgba(26, 32, 44, 0.95) 100%)`
            : undefined,
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-task-complete]")) return;
          handlePointerDown(e, chip);
        }}
      >
        <div className="ct">
          {isTask && item.task_id && (
            <button
              type="button"
              className={`chip-check-btn${completed ? " checked" : ""}`}
              data-task-complete={item.task_id}
              title={completed ? "Mark incomplete" : "Mark complete"}
              style={{ borderColor: taskColor, background: completed ? taskColor : undefined }}
              onClick={(e) => { e.stopPropagation(); void toggleComplete(item.task_id!); }}
            >
              <Icon name="check" style={{ width: 9, height: 9, color: completed ? "#fff" : taskColor }} />
            </button>
          )}
          <span className={`ct-text${completed ? " line-through" : ""}`}>{item.title}</span>
        </div>
        {(chip.height ?? 0) > 28 && chip.startMinutes !== undefined && chip.endMinutes !== undefined && (
          <div className={`cm${completed ? " line-through" : ""}`}>
            {rangeLabel(chip.startMinutes, chip.endMinutes, prefs)}
          </div>
        )}
      </article>
    );
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <section className="cal" id="view-schedule">
      <div className="cal-head" id="cal-head">
        <div className="grid-row" id="head-days">
          <div className="month-cell">{months.slice(0, 2).join("–")}</div>
          {days.map((day, index) => (
            <div key={dayKeys[index]} className={`day-head${dayKeys[index] === today ? " today" : ""}`}>
              <span className="dow">{DOW[day.getDay()]}</span>
              <span className="dom">{day.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="grid-row" id="head-allday">
          <div className="allday-gutter" />
          {dayKeys.map((key) => (
            <div key={key} className="allday-cell">
              {(allDay.get(key) || []).map((chip) => {
                const item = chip.item;
                const isTask = item.kind === "task";
                const completed = isTaskCompleted(item, tasks);
                const taskColor = item.color || "#5cc98d";
                return (
                  <article
                    key={chip.index}
                    className={`chip allday${matchesQuery(item, query) ? "" : " dim"}${completed ? " completed" : ""}`}
                    data-item={chip.index}
                    onClick={() => handleChipClick(chip.index)}
                  >
                    <div className="ct">
                      {isTask && item.task_id && (
                        <button
                          type="button"
                          className={`chip-check-btn${completed ? " checked" : ""}`}
                          data-task-complete={item.task_id}
                          onClick={(e) => { e.stopPropagation(); void toggleComplete(item.task_id!); }}
                          style={{ borderColor: taskColor, background: completed ? taskColor : undefined }}
                        >
                          <Icon name="check" style={{ width: 8, height: 8, color: completed ? "#fff" : taskColor }} />
                        </button>
                      )}
                      <span className={`ct-text${completed ? " line-through" : ""}`}>{item.title}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="cal-body" id="cal-body" ref={bodyRef}>
        <div className="grid-row" id="body-grid">
          <div className="hour-gutter">
            {hours.map((hour) => (
              <div key={hour} className="hour-label"><span>{hourLabel(hour, prefs.hour24)}</span></div>
            ))}
          </div>
          {dayKeys.map((key) => (
            <div key={key} className={`day-col${key === today ? " is-today" : ""}`} data-date={key}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="hour-cell"
                  data-date={key}
                  data-hour={hour}
                  onClick={() => handleCellClick(key, hour)}
                />
              ))}
              {(timed.get(key) || []).map((chip) => renderChip(chip))}
              {key === today && (
                <div className="nowline" style={{ top: (nowMinutes(timezone) / 60) * HOUR_H }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
