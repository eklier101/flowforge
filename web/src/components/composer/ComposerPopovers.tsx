import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Calendar, SchedulingPreset, Task, TaskList } from "@flowforge/api-client";

import { CAL_COLORS } from "../../lib/constants";
import { Icon } from "../icons/IconSprite";
import type { ComposerKind, ComposerState } from "./composerState";
import { positionPopover } from "./positionPopover";

export type PopoverKind =
  | "workload"
  | "more"
  | "list"
  | "priority"
  | "repeat"
  | "customRepeat"
  | "startAfter"
  | "buffer"
  | "calendar"
  | "color"
  | "duration"
  | "hours"
  | "dependency";

type ComposerPopoversProps = {
  active: PopoverKind | null;
  activeKind: ComposerKind;
  state: ComposerState;
  setState: React.Dispatch<React.SetStateAction<ComposerState>>;
  lists: TaskList[];
  calendars: Calendar[];
  schedulingPresets: SchedulingPreset[];
  tasks: Task[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onDuplicate: () => void;
  onSeeInTodo: () => void;
  startAfterDraft: { choice: "now" | "custom"; date: string; time: string };
  setStartAfterDraft: React.Dispatch<React.SetStateAction<{ choice: "now" | "custom"; date: string; time: string }>>;
  onStartAfterDone: () => void;
  customRepeatDraft: { interval: number; unit: string; days: number[]; endType: string };
  setCustomRepeatDraft: React.Dispatch<React.SetStateAction<{ interval: number; unit: string; days: number[]; endType: string }>>;
  onCustomRepeatDone: () => void;
  onPickDate: (anchor: HTMLElement, current: string, onSelect: (d: string) => void) => void;
  onPickTime: (anchor: HTMLElement, current: string, title: string, onSelect: (t: string) => void) => void;
  onOpenCustomRepeat: (anchor: HTMLElement) => void;
};

function PopoverShell({
  id,
  className,
  style,
  anchorEl,
  active,
  children,
}: {
  id: string;
  className: string;
  style?: React.CSSProperties;
  anchorEl: HTMLElement | null;
  active: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!active || !ref.current) return;
    positionPopover(ref.current, anchorEl);
  }, [active, anchorEl]);
  if (!active) return null;
  return (
    <div id={id} className={className} style={style} ref={ref}>
      {children}
    </div>
  );
}

export function ComposerPopovers({
  active,
  activeKind,
  state,
  setState,
  lists,
  calendars,
  schedulingPresets,
  tasks,
  anchorEl,
  onClose,
  onDelete,
  onConvert,
  onDuplicate,
  onSeeInTodo,
  startAfterDraft,
  setStartAfterDraft,
  onStartAfterDone,
  customRepeatDraft,
  setCustomRepeatDraft,
  onCustomRepeatDone,
  onPickDate,
  onPickTime,
  onOpenCustomRepeat,
}: ComposerPopoversProps) {
  const [listFilter, setListFilter] = useState("");
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (active !== "more" || !moreMenuRef.current || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = 210;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    moreMenuRef.current.style.position = "fixed";
    moreMenuRef.current.style.left = `${left}px`;
    moreMenuRef.current.style.top = `${rect.bottom + 6}px`;
    moreMenuRef.current.hidden = false;
  }, [active, anchorEl]);

  useEffect(() => {
    if (active === "list") setListFilter("");
  }, [active]);

  const repeatValue = activeKind === "event" ? state.eventRepeat : state.repeat;
  const bufferBefore = activeKind === "event" ? state.eventBufferBefore : state.bufferBefore;
  const bufferAfter = activeKind === "event" ? state.eventBufferAfter : state.bufferAfter;

  const presets =
    schedulingPresets.length > 0
      ? schedulingPresets
      : [{ id: 0, name: "personal hours", is_default: true, days: {}, overrides: [] }];

  return (
    <>
      <PopoverShell
        id="composer-workload-popover"
        className="composer-popover"
        style={{ width: 210, zIndex: 95 }}
        anchorEl={anchorEl}
        active={active === "workload"}
      >
        <div className="composer-popover-list">
          {[
            { val: "Close to deadline", label: "Close to deadline" },
            { val: "Balanced", label: "Spread out / Balanced" },
            { val: "Front-load", label: "Front-load / ASAP" },
          ].map((item) => (
            <div
              key={item.val}
              className="composer-popover-item"
              data-workload-val={item.val}
              onClick={() => {
                setState((s) => ({ ...s, workloadDistribution: item.val }));
                onClose();
              }}
            >
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </PopoverShell>

      {active === "more" && (
        <div id="composer-more-menu" className="action-dropdown" ref={moreMenuRef} style={{ width: 210, zIndex: 95 }}>
          <button type="button" className="action-item" id="menu-see-in-todo" onClick={onSeeInTodo}>
            <Icon name="list-bullet" style={{ width: 15, height: 15 }} />
            <span>See in to-do list</span>
          </button>
          <button type="button" className="action-item" id="menu-duplicate-item" onClick={onDuplicate}>
            <Icon name="copy" style={{ width: 15, height: 15 }} />
            <span>Duplicate</span>
          </button>
          <div className="action-item-row" id="menu-auto-ignore-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13.5, color: "var(--text)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="calendar-x" style={{ width: 15, height: 15, color: "var(--muted)" }} />
              <span>Auto-ignore</span>
            </div>
            <button
              className="switch switch-sm"
              id="composer-auto-ignore-switch"
              type="button"
              role="switch"
              aria-checked={state.autoIgnore ? "true" : "false"}
              style={{ width: 32, height: 18 }}
              onClick={() => setState((s) => ({ ...s, autoIgnore: !s.autoIgnore }))}
            />
          </div>
          <button type="button" className="action-item" id="menu-convert-item" onClick={onConvert}>
            <Icon name="swap" style={{ width: 15, height: 15 }} />
            <span id="menu-convert-label">{activeKind === "task" ? "Convert to event" : "Convert to task"}</span>
          </button>
          <button type="button" className="action-item danger" id="menu-delete-composer-item" onClick={onDelete}>
            <Icon name="trash" style={{ width: 15, height: 15 }} />
            <span>Delete</span>
          </button>
        </div>
      )}

      <PopoverShell id="composer-list-popover" className="composer-popover" anchorEl={anchorEl} active={active === "list"}>
        <div className="composer-list-search-wrap">
          <Icon name="search" style={{ width: 14, height: 14, color: "var(--muted)" }} />
          <input
            id="composer-list-search-input"
            placeholder="Search lists"
            className="composer-list-search-input"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
          />
        </div>
        <div className="composer-popover-list" id="composer-list-options">
          <div
            className={`composer-popover-item ${state.listId === null ? "selected" : ""}`}
            data-list-id="inbox"
            onClick={() => {
              setState((s) => ({ ...s, listId: null, listName: "Inbox", listColor: "#5cc98d" }));
              onClose();
            }}
          >
            <Icon name="inbox" style={{ width: 15, height: 15, color: "var(--muted)" }} />
            <span>Inbox</span>
          </div>
          {lists
            .filter((l) => !listFilter.trim() || l.name.toLowerCase().includes(listFilter.trim().toLowerCase()))
            .map((l) => (
              <div
                key={l.id}
                className={`composer-popover-item ${state.listId === l.id ? "selected" : ""}`}
                data-list-id={l.id}
                onClick={() => {
                  setState((s) => ({ ...s, listId: l.id, listName: l.name, listColor: l.color || "#5cc98d" }));
                  onClose();
                }}
              >
                <span className="dot" style={{ background: l.color || "#5cc98d" }} />
                <span>{l.name}</span>
              </div>
            ))}
        </div>
      </PopoverShell>

      <PopoverShell id="composer-priority-popover" className="composer-popover" anchorEl={anchorEl} active={active === "priority"}>
        <div className="composer-popover-list">
          {[
            { val: 1, color: "#ef4444", label: "Do ASAP" },
            { val: 2, color: "#eab308", label: "High" },
            { val: 3, color: "#9ca3af", label: "Normal" },
            { val: 4, color: "#60a5fa", label: "Low" },
          ].map((p) => (
            <div
              key={p.val}
              className="composer-popover-item"
              data-prio-val={p.val}
              onClick={() => {
                setState((s) => ({ ...s, priority: p.val }));
                onClose();
              }}
            >
              <Icon name="flag" style={{ width: 16, height: 16, color: p.color }} />
              <span style={{ color: p.color, fontWeight: 500 }}>{p.label}</span>
            </div>
          ))}
        </div>
      </PopoverShell>

      <PopoverShell id="composer-repeat-popover" className="composer-popover" anchorEl={anchorEl} active={active === "repeat"}>
        <div className="composer-popover-list">
          {[
            ["none", "Does not repeat"],
            ["daily", "Daily"],
            ["weekly", "Weekly"],
            ["weekdays", "Every weekday (M-F)"],
            ["monthly", "Monthly"],
            ["yearly", "Yearly"],
          ].map(([val, label]) => (
            <div
              key={val}
              className="composer-popover-item"
              data-repeat-val={val}
              onClick={() => {
                if (activeKind === "event") setState((s) => ({ ...s, eventRepeat: val }));
                else setState((s) => ({ ...s, repeat: val }));
                onClose();
              }}
            >
              {label}
            </div>
          ))}
          <div
            className="composer-popover-item"
            data-repeat-val="custom"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4, paddingTop: 8, color: "#5b9bff" }}
            onClick={(e) => {
              if (repeatValue.startsWith("custom:")) {
                const parts = repeatValue.split(":");
                setCustomRepeatDraft({
                  interval: Number(parts[1]) || 1,
                  unit: parts[2] || "week",
                  days: parts[3] ? parts[3].split(",").map(Number) : [0],
                  endType: parts[4] || "never",
                });
              }
              onOpenCustomRepeat(e.currentTarget);
            }}
          >
            Custom...
          </div>
        </div>
      </PopoverShell>

      <PopoverShell
        id="composer-custom-repeat-popover"
        className="composer-popover"
        style={{ width: 280, padding: 14 }}
        anchorEl={anchorEl}
        active={active === "customRepeat"}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button className="icon-btn" id="custom-repeat-back-btn" type="button" title="Back" style={{ width: 26, height: 26 }} onClick={onClose}>
            <Icon name="chev-left" style={{ width: 15, height: 15 }} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#ffffff" }}>Custom repeat</span>
          <button type="button" className="text-blue-link" id="custom-repeat-done-btn" style={{ fontSize: 14, fontWeight: 600 }} onClick={onCustomRepeatDone}>
            Done
          </button>
        </div>
        <div style={{ fontSize: 13.5, color: "#e5e7eb", marginBottom: 8, fontWeight: 500 }}>Repeats every...</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <input
            id="custom-repeat-interval"
            type="number"
            min={1}
            max={99}
            value={customRepeatDraft.interval}
            className="custom-repeat-num-input"
            onChange={(e) => setCustomRepeatDraft((d) => ({ ...d, interval: Math.max(1, Number(e.target.value) || 1) }))}
          />
          <select
            id="custom-repeat-unit"
            className="clean-select"
            style={{ background: "#333333", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 24px 6px 10px", color: "#ffffff", fontSize: 13.5 }}
            value={customRepeatDraft.unit}
            onChange={(e) => setCustomRepeatDraft((d) => ({ ...d, unit: e.target.value }))}
          >
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
            <option value="year">year</option>
          </select>
        </div>
        {customRepeatDraft.unit === "week" && (
          <div id="custom-repeat-days-section">
            <div style={{ fontSize: 13.5, color: "#e5e7eb", marginBottom: 8, fontWeight: 500 }}>On...</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }} id="custom-repeat-days-row">
              {["S", "M", "T", "W", "T", "F", "S"].map((label, day) => (
                <button
                  key={day}
                  type="button"
                  className={`repeat-day-btn ${customRepeatDraft.days.includes(day) ? "on" : ""}`}
                  data-day={day}
                  onClick={() => {
                    setCustomRepeatDraft((d) => {
                      const days = [...d.days];
                      const idx = days.indexOf(day);
                      if (idx >= 0) {
                        if (days.length > 1) days.splice(idx, 1);
                      } else {
                        days.push(day);
                        days.sort((a, b) => a - b);
                      }
                      return { ...d, days };
                    });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5, color: "#e5e7eb", fontWeight: 500 }}>End repeat</span>
          <select
            id="custom-repeat-end-type"
            className="clean-select"
            style={{ color: "#5b9bff", fontWeight: 500, fontSize: 13.5 }}
            value={customRepeatDraft.endType}
            onChange={(e) => setCustomRepeatDraft((d) => ({ ...d, endType: e.target.value }))}
          >
            <option value="never">Never</option>
            <option value="after_occurrences">After 10 times</option>
            <option value="on_date">On date</option>
          </select>
        </div>
      </PopoverShell>

      <PopoverShell
        id="composer-start-after-popover"
        className="composer-popover"
        style={{ width: 290, padding: 14 }}
        anchorEl={anchorEl}
        active={active === "startAfter"}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button className="icon-btn" id="start-after-back-btn" type="button" title="Done" style={{ width: 26, height: 26 }} onClick={onClose}>
            <Icon name="chev-left" style={{ width: 15, height: 15 }} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#ffffff" }}>Start time</span>
          <button type="button" className="text-blue-link" id="start-after-done-btn" style={{ fontSize: 14, fontWeight: 600 }} onClick={onStartAfterDone}>
            Done
          </button>
        </div>
        <div style={{ fontSize: 13.5, color: "#9ca3af", marginBottom: 12 }}>This task can be started...</div>
        <label className="start-after-radio-row">
          <input
            type="radio"
            name="start-after-choice"
            value="now"
            id="start-after-radio-now"
            checked={startAfterDraft.choice === "now"}
            className="custom-radio"
            onChange={() => setStartAfterDraft((d) => ({ ...d, choice: "now" }))}
          />
          <span style={{ fontSize: 14, color: "#e5e7eb", fontWeight: 500 }}>Now</span>
        </label>
        <label className="start-after-radio-row" style={{ marginTop: 10, alignItems: "flex-start" }}>
          <input
            type="radio"
            name="start-after-choice"
            value="custom"
            id="start-after-radio-custom"
            checked={startAfterDraft.choice === "custom"}
            className="custom-radio"
            style={{ marginTop: 3 }}
            onChange={() => setStartAfterDraft((d) => ({ ...d, choice: "custom" }))}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, color: "#e5e7eb", fontWeight: 500 }}>On</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className="text-blue-link"
                id="start-after-date-btn"
                onClick={(e) => onPickDate(e.currentTarget, startAfterDraft.date, (d) => setStartAfterDraft((x) => ({ ...x, choice: "custom", date: d })))}
              >
                {startAfterDraft.date}
              </button>
              <span style={{ color: "#9ca3af", fontSize: 13 }}>at</span>
              <button
                type="button"
                className="text-blue-link"
                id="start-after-time-btn"
                onClick={(e) => onPickTime(e.currentTarget, startAfterDraft.time, "Start time", (t) => setStartAfterDraft((x) => ({ ...x, choice: "custom", time: t })))}
              >
                {startAfterDraft.time}
              </button>
            </div>
          </div>
        </label>
      </PopoverShell>

      <PopoverShell id="composer-buffer-popover" className="composer-popover" style={{ width: 260, padding: 12 }} anchorEl={anchorEl} active={active === "buffer"}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Buffer before</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }} id="composer-buf-before-chips">
          {[0, 5, 10, 15, 30].map((val) => (
            <button
              key={val}
              type="button"
              className={`chip-btn ${bufferBefore === val ? "on" : ""}`}
              data-buf-before={val}
              onClick={() => {
                if (activeKind === "event") setState((s) => ({ ...s, eventBufferBefore: val }));
                else setState((s) => ({ ...s, bufferBefore: val }));
              }}
            >
              {val === 0 ? "None" : `${val}m`}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Buffer after</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} id="composer-buf-after-chips">
          {[0, 5, 10, 15, 30].map((val) => (
            <button
              key={val}
              type="button"
              className={`chip-btn ${bufferAfter === val ? "on" : ""}`}
              data-buf-after={val}
              onClick={() => {
                if (activeKind === "event") setState((s) => ({ ...s, eventBufferAfter: val }));
                else setState((s) => ({ ...s, bufferAfter: val }));
              }}
            >
              {val === 0 ? "None" : `${val}m`}
            </button>
          ))}
        </div>
      </PopoverShell>

      <PopoverShell id="composer-calendar-popover" className="composer-popover" anchorEl={anchorEl} active={active === "calendar"}>
        <div className="composer-popover-list" id="composer-cal-options">
          {calendars.map((c) => (
            <div
              key={c.id}
              className={`composer-popover-item ${state.eventCalendarId === c.id ? "selected" : ""}`}
              data-cal-id={c.id}
              onClick={() => {
                setState((s) => ({
                  ...s,
                  eventCalendarId: c.id,
                  eventCalendarName: c.name,
                  eventCalendarColor: c.color || "#5cc98d",
                }));
                onClose();
              }}
            >
              <span className="dot" style={{ background: c.color || "#5cc98d" }} />
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      </PopoverShell>

      <PopoverShell id="composer-color-popover" className="composer-popover" style={{ padding: 10, width: 230 }} anchorEl={anchorEl} active={active === "color"}>
        <div
          className="composer-popover-item"
          data-color-val=""
          style={{ marginBottom: 8 }}
          onClick={() => {
            if (activeKind === "event") setState((s) => ({ ...s, eventColor: "" }));
            else setState((s) => ({ ...s, color: "" }));
            onClose();
          }}
        >
          <span className="dot" style={{ background: "#5cc98d" }} />
          <span id="composer-color-default-text">{activeKind === "event" ? "Default" : "List color"}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, fontWeight: 500 }}>CUSTOM COLOR</div>
        <div className="color-palette-grid" id="composer-color-grid">
          {CAL_COLORS.map((c) => (
            <div
              key={c}
              className="color-palette-item"
              style={{ background: c }}
              data-palette-color={c}
              onClick={() => {
                if (activeKind === "event") setState((s) => ({ ...s, eventColor: c }));
                else setState((s) => ({ ...s, color: c }));
                onClose();
              }}
            />
          ))}
        </div>
      </PopoverShell>

      <PopoverShell id="composer-duration-popover" className="composer-popover" anchorEl={anchorEl} active={active === "duration"}>
        <div className="composer-popover-list">
          {[15, 30, 45, 60, 90, 120, 180, 240].map((val) => (
            <div
              key={val}
              className="composer-popover-item"
              data-dur-val={val}
              onClick={() => {
                setState((s) => ({ ...s, durationMinutes: val }));
                onClose();
              }}
            >
              {val < 60 ? `${val} min` : val % 60 === 0 ? `${val / 60} hr` : `${(val / 60).toFixed(1)} hr`}
            </div>
          ))}
        </div>
      </PopoverShell>

      <PopoverShell id="composer-hours-popover" className="composer-popover" style={{ width: 220 }} anchorEl={anchorEl} active={active === "hours"}>
        <div className="composer-popover-list" id="composer-hours-options">
          {presets.map((p) => (
            <div
              key={p.id ?? p.name}
              className={`composer-popover-item ${(state.schedulingHours || "personal hours").toLowerCase() === p.name.toLowerCase() ? "selected" : ""}`}
              data-hours-val={p.name}
              onClick={() => {
                setState((s) => ({ ...s, schedulingHours: p.name }));
                onClose();
              }}
            >
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </PopoverShell>

      <PopoverShell
        id="composer-dependency-popover"
        className="composer-popover"
        style={{ width: 280, maxHeight: 260 }}
        anchorEl={anchorEl}
        active={active === "dependency"}
      >
        <div className="composer-popover-list" id="composer-dep-options">
          <div
            className={`composer-popover-item ${state.dependencyTaskId === null ? "selected" : ""}`}
            data-dep-id=""
            onClick={() => {
              setState((s) => ({ ...s, dependencyTaskId: null, dependencyTaskTitle: "None" }));
              onClose();
            }}
          >
            <span>None</span>
          </div>
          {tasks
            .filter((t) => !t.is_completed)
            .slice(0, 15)
            .map((t) => (
              <div
                key={t.id}
                className={`composer-popover-item ${state.dependencyTaskId === t.id ? "selected" : ""}`}
                data-dep-id={t.id}
                onClick={() => {
                  setState((s) => ({ ...s, dependencyTaskId: t.id, dependencyTaskTitle: t.title }));
                  onClose();
                }}
              >
                <span className="dot" style={{ background: t.list_color || "#5cc98d" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              </div>
            ))}
        </div>
      </PopoverShell>
    </>
  );
}

export function formatPriorityButton(priority: number): { text: string; color: string } {
  switch (Number(priority)) {
    case 1: return { text: "Do ASAP", color: "#ef4444" };
    case 2: return { text: "High", color: "#eab308" };
    case 4: return { text: "Low", color: "#60a5fa" };
    default: return { text: "Normal", color: "#9ca3af" };
  }
}
