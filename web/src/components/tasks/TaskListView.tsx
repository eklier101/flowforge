import { useMemo, useRef, useState } from "react";

import { api } from "../../api";
import { useAppContext } from "../../context/AppContext";
import { isAllDay } from "../../lib/chips";
import { parseDateKey, toLocalParts, todayKey } from "../../lib/dates";
import { formatDurationLabel, hhmmTo12, pad, rangeLabel } from "../../lib/format";
import { notifyHabitsComplete } from "../../lib/habitsNotify";
import { Icon } from "../icons/IconSprite";
import { ListActionMenu } from "../lists/ListActionMenu";

export function TaskListView() {
  const {
    view,
    tasks,
    scheduled,
    lists,
    items,
    prefs,
    query,
    setQuery,
    setSearchOpen,
    searchOpen,
    openEditTask,
    openComposer,
    syncAfterMutation,
    toast,
    timezone,
    calendars,
  } = useAppContext();

  const [listMenuId, setListMenuId] = useState<number | null>(null);
  const [listMenuAnchor, setListMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const listMenuBtnRef = useRef<HTMLButtonElement>(null);

  const config = useMemo(() => {
    if (view === "inbox") {
      return {
        title: "Inbox",
        sub: "Tasks that have not landed on the calendar yet. Hit Recalculate to place them.",
        rows: tasks.filter((t) => !t.is_completed && !scheduled.has(t.id)),
        showActions: false,
      };
    }
    if (view === "completed") {
      return {
        title: "Completed",
        sub: "Everything you have checked off.",
        rows: tasks.filter((t) => t.is_completed),
        showActions: false,
      };
    }
    if (view.startsWith("list-")) {
      const listId = Number(view.replace("list-", ""));
      const listObj = lists.find((l) => l.id === listId);
      return {
        title: listObj?.name || "List",
        sub: `Tasks in ${listObj?.name || "list"}.`,
        rows: tasks.filter((t) => t.list_id === listId && (prefs.showCompleted || !t.is_completed)),
        showActions: true,
        listId,
      };
    }
    if (view.startsWith("calendar-")) {
      const calId = Number(view.replace("calendar-", ""));
      const calObj = calendars.find((c) => c.id === calId);
      return {
        title: calObj?.name || "Calendar",
        sub: `Events from ${calObj?.name || "calendar"}.`,
        rows: [] as typeof tasks,
        calendarId: calId,
        showActions: false,
        isCalendar: true,
      };
    }
    return {
      title: "All tasks",
      sub: "Open tasks, sorted by due date then priority.",
      rows: tasks.filter((t) => prefs.showCompleted || !t.is_completed),
      showActions: false,
    };
  }, [view, tasks, scheduled, lists, prefs.showCompleted, calendars]);

  const filteredRows = config.rows.filter((t) => !query || t.title.toLowerCase().includes(query));
  const todayStr = todayKey(timezone);
  const nowDt = new Date();

  async function toggleComplete(taskId: number) {
    const task = tasks.find((t) => t.id === taskId);
    const completing = task ? !task.is_completed : true;
    const prevCompleted = task?.is_completed ?? false;
    try {
      await api.updateTask(taskId, { is_completed: completing });
      if (completing) notifyHabitsComplete("flowforge");
      await syncAfterMutation();
      toast(completing ? "Task completed" : "Task uncompleted", "ok", {
        label: "Undo",
        onClick: () => {
          void api.updateTask(taskId, { is_completed: prevCompleted }).then(() => syncAfterMutation());
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function deleteTask(taskId: number) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      await api.deleteTask(taskId);
      await syncAfterMutation();
      toast("Task deleted", "ok", {
        label: "Undo",
        onClick: () => {
          void api.createTask({
            title: task.title,
            duration_minutes: task.duration_minutes,
            due_date: task.due_date,
            priority: task.priority,
            allow_splitting: task.allow_splitting,
            min_split_minutes: task.min_split_minutes,
            buffer_before_minutes: task.buffer_before_minutes,
            buffer_minutes: task.buffer_minutes,
            is_completed: task.is_completed,
            list_id: task.list_id,
            notes: task.notes,
            color: task.color,
            recurrence: task.recurrence,
            start_after: task.start_after,
          }).then(() => syncAfterMutation());
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  if ("isCalendar" in config && config.isCalendar) {
    const calId = config.calendarId;
    const calItems = items.filter((item) => {
      if (item.calendar_id != null && item.calendar_id !== calId) return false;
      if (item.kind === "busy" || item.kind === "event") {
        return !query || item.title.toLowerCase().includes(query);
      }
      return false;
    });
    return (
      <section className="list-view" id="view-list">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>{config.title}</h1>
        </div>
        <p className="sub" style={{ marginTop: -16 }}>{config.sub}</p>
        <div className="rows">
          {!calItems.length ? (
            <p className="empty-state">This calendar is empty or has no upcoming events.</p>
          ) : (
            calItems.map((item, idx) => {
              const start = toLocalParts(item.start, timezone);
              const end = toLocalParts(item.end, timezone);
              const day = parseDateKey(start.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
              const timeStr = isAllDay(item, timezone) ? "All day" : rangeLabel(start.minutes, end.date === start.date ? end.minutes : 24 * 60, prefs);
              return (
                <div key={idx} className="row">
                  <div className="cdot" style={{ background: "var(--accent)", width: 8, height: 8, borderRadius: "50%", margin: "0 4px" }} />
                  <div className="body">
                    <div className="rt">{item.title}</div>
                    <div className="rm">{day} · {timeStr}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="list-view" id="view-list">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 id="list-title" style={{ margin: 0 }}>{config.title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="icon-btn" type="button" title="Add task" style={{ width: 28, height: 28 }} onClick={() => openComposer("task", undefined, undefined, "listId" in config ? config.listId : null)}>
            <Icon name="plus" style={{ width: 16, height: 16 }} />
          </button>
          {config.showActions && (
            <>
              <button
                className="icon-btn"
                id="list-search-btn"
                type="button"
                title="Search"
                style={{ width: 28, height: 28 }}
                onClick={() => {
                  if (searchOpen) {
                    setQuery("");
                    setSearchOpen(false);
                  } else {
                    setSearchOpen(true);
                  }
                }}
              >
                <Icon name="search" style={{ width: 16, height: 16 }} />
              </button>
              <button
                className="icon-btn"
                id="list-menu-btn"
                type="button"
                title="List options"
                style={{ width: 28, height: 28 }}
                ref={listMenuBtnRef}
                onClick={() => {
                  if ("listId" in config && config.listId) {
                    setListMenuId(config.listId);
                    setListMenuAnchor(listMenuBtnRef.current);
                  }
                }}
              >
                <Icon name="dots" style={{ width: 16, height: 16 }} />
              </button>
            </>
          )}
        </div>
      </div>
      <p className="sub" id="list-sub" style={{ marginTop: -16 }}>{config.sub}</p>
      {selectedIds.size > 0 && (
        <div className="bulk-actions-bar">
          <span>{selectedIds.size} selected</span>
          <button type="button" className="link-btn" onClick={() => void api.bulkUpdateTasks({ task_ids: [...selectedIds], update: { is_completed: true } }).then(() => { setSelectedIds(new Set()); return syncAfterMutation(); })}>
            Complete
          </button>
          <button type="button" className="link-btn danger" onClick={() => {
            if (!confirm(`Delete ${selectedIds.size} task(s)?`)) return;
            void api.bulkUpdateTasks({ task_ids: [...selectedIds], delete: true }).then(() => { setSelectedIds(new Set()); return syncAfterMutation(); });
          }}>
            Delete
          </button>
          <button type="button" className="link-btn" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}
      <div className="rows" id="task-rows">
        {!filteredRows.length ? (
          <p className="empty-state">This list is empty.</p>
        ) : (
          filteredRows.map((task) => {
            const listColor = task.list_color || "#5cc98d";
            let dueBadge: React.ReactNode = null;
            if (task.due_date) {
              const dueParts = toLocalParts(task.due_date, timezone);
              const dStr = dueParts.date;
              const isPast = new Date(task.due_date).getTime() < nowDt.getTime();
              const isToday = dStr === todayStr;
              const dueFormatted = new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const dueTimeStr = hhmmTo12(`${pad(Math.floor(dueParts.minutes / 60))}:${pad(dueParts.minutes % 60)}`);
              let cls = "task-tag due-future";
              let label = `Due ${dueFormatted}`;
              if (!task.is_completed) {
                if (isPast) { cls = "task-tag due-overdue"; label = `Overdue (${dueFormatted})`; }
                else if (isToday) { cls = "task-tag due-today"; label = `Due today · ${dueTimeStr}`; }
              }
              dueBadge = <span className={cls}><Icon name="clock" style={{ width: 11, height: 11 }} />{label}</span>;
            }
            const isSched = scheduled.has(task.id);
            return (
              <div
                key={task.id}
                className={`row${task.is_completed ? " done" : ""}${selectedIds.has(task.id) ? " selected" : ""}`}
                data-task-id={task.id}
                title="Click to edit task"
                onClick={() => openEditTask(task)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && openEditTask(task)}
              >
                <input
                  type="checkbox"
                  className="bulk-check"
                  checked={selectedIds.has(task.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(task.id);
                      else next.delete(task.id);
                      return next;
                    });
                  }}
                />
                <button
                  className={`tick${task.is_completed ? " on" : ""}`}
                  type="button"
                  title="Toggle complete"
                  onClick={(e) => { e.stopPropagation(); void toggleComplete(task.id); }}
                >
                  <Icon name="check" style={{ width: 13, height: 13 }} />
                </button>
                <div className="body">
                  <div className="rt">
                    <span>{task.title}</span>
                    {task.list_name && !view.startsWith("list-") && (
                      <span className="task-tag" style={{ background: `${listColor}22`, color: listColor, border: `1px solid ${listColor}44` }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: listColor, display: "inline-block" }} />
                        {task.list_name}
                      </span>
                    )}
                  </div>
                  <div className="rm">
                    {dueBadge}
                    {task.priority === 1 && <span className="task-tag prio-asap"><Icon name="flag" style={{ width: 11, height: 11 }} />Do ASAP</span>}
                    {task.priority === 2 && <span className="task-tag prio-high"><Icon name="flag" style={{ width: 11, height: 11 }} />High</span>}
                    <span className="task-tag" style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)" }}>{formatDurationLabel(task.duration_minutes)}</span>
                    {isSched && !task.is_completed && (
                      <span className="task-tag scheduled"><Icon name="sparkles" style={{ width: 11, height: 11 }} />Scheduled</span>
                    )}
                  </div>
                </div>
                <button className="link-btn" type="button" title="Delete task" onClick={(e) => { e.stopPropagation(); void deleteTask(task.id); }}>Delete</button>
              </div>
            );
          })
        )}
      </div>
      <ListActionMenu
        listId={listMenuId}
        anchorEl={listMenuAnchor}
        onClose={() => {
          setListMenuId(null);
          setListMenuAnchor(null);
        }}
      />
    </section>
  );
}
