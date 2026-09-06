import { useEffect, useRef, useState } from "react";

import type { TaskList } from "@flowforge/api-client";

import { api } from "../../../api";
import { useAppContext } from "../../../context/AppContext";
import { CAL_COLORS } from "../../../lib/constants";
import { Icon } from "../../icons/IconSprite";

type Props = {
  list: TaskList | null;
  open: boolean;
  onClose: () => void;
};

export function EditListModal({ list, open, onClose }: Props) {
  const {
    lists,
    calendars,
    schedulingPresets,
    loadLists,
    syncAfterMutation,
    toast,
  } = useAppContext();

  const [name, setName] = useState("");
  const [color, setColor] = useState("#5cc98d");
  const [defaultHours, setDefaultHours] = useState("personal hours");
  const [syncCalId, setSyncCalId] = useState("");
  const [error, setError] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setColorOpen(false);
    if (list) {
      setName(list.name);
      setColor(list.color || "#5cc98d");
      setDefaultHours(list.default_hours || "personal hours");
      setSyncCalId(list.sync_tasks_calendar_id ? String(list.sync_tasks_calendar_id) : "");
    } else {
      setName("");
      setColor(CAL_COLORS[lists.length % CAL_COLORS.length] || "#5cc98d");
      setDefaultHours(schedulingPresets[0]?.name || "personal hours");
      setSyncCalId("");
    }
  }, [open, list, lists.length, schedulingPresets]);

  useEffect(() => {
    if (!colorOpen) return;
    function onDocClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.parentElement?.contains(e.target as Node)) {
        setColorOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [colorOpen]);

  if (!open) return null;

  const activeCals = calendars.filter((c) => c.is_active);
  const canDelete = list && lists.length > 1;

  async function save() {
    if (!name.trim()) {
      setError("Please enter a list name.");
      return;
    }
    setError("");
    const syncId = syncCalId ? Number(syncCalId) : null;
    try {
      if (list) {
        await api.updateTaskList(list.id, {
          name: name.trim(),
          color,
          default_hours: defaultHours,
          sync_tasks_calendar_id: syncId,
        });
        toast("List updated", "ok");
      } else {
        await api.createTaskList({
          name: name.trim(),
          color,
          default_hours: defaultHours,
          sync_tasks_calendar_id: syncId,
        });
        toast("List created", "ok");
      }
      onClose();
      await loadLists();
      await syncAfterMutation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save list");
    }
  }

  async function deleteList() {
    if (!list) return;
    if (!confirm(`Are you sure you want to delete "${list.name}"? Tasks in this list will move to your default list.`)) return;
    try {
      await api.deleteTaskList(list.id);
      onClose();
      await loadLists();
      await syncAfterMutation();
      toast("List deleted", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete list");
    }
  }

  return (
    <div
      className="backdrop open"
      id="list-edit-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card" style={{ width: "min(440px, 100%)" }}>
        <div className="card-head" style={{ alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
          <button className="icon-btn" type="button" id="list-edit-close" title="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn-accent" type="button" id="list-edit-save" style={{ padding: "6px 16px" }} onClick={() => void save()}>
            Save
          </button>
        </div>

        <div className="stack" style={{ gap: 16, marginTop: 14 }}>
          <div className="list-title-field" style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "2px solid var(--accent)", paddingBottom: 6 }}>
            <div className="color-picker-trigger" id="list-color-trigger" style={{ position: "relative", cursor: "pointer" }}>
              <div
                className="color-dropdown-pill"
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 12, background: "var(--elev)", border: "1px solid var(--line)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setColorOpen((v) => !v);
                }}
              >
                <span id="list-color-preview" className="color-dot" style={{ width: 14, height: 14, borderRadius: "50%", background: color }} />
                <Icon name="chev-down" style={{ width: 10, height: 10, color: "var(--muted)" }} />
              </div>
              {colorOpen && (
                <div
                  ref={popoverRef}
                  id="list-color-popover"
                  className="color-popover"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 6,
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 6,
                    zIndex: 100,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                  }}
                >
                  {CAL_COLORS.map((c) => (
                    <div
                      key={c}
                      className={`color-chip-btn ${c === color ? "selected" : ""}`}
                      data-pick-color={c}
                      style={{ background: c }}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setColor(c);
                        setColorOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <input
              id="list-name-input"
              placeholder="List name"
              style={{ flex: 1, border: 0, background: "transparent", fontSize: 17, fontWeight: 600, color: "var(--text)", outline: "none" }}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="list-setting-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line-soft)", padding: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Default hours</span>
              <Icon name="help" style={{ width: 14, height: 14, color: "var(--muted)" }} title="The working hours used by default when auto-scheduling tasks in this list" />
            </div>
            <select
              id="list-default-hours-select"
              className="clean-select"
              style={{ maxWidth: 200, textAlign: "right", color: "var(--muted)", fontSize: 14 }}
              value={defaultHours}
              onChange={(e) => setDefaultHours(e.target.value)}
            >
              {schedulingPresets.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="list-setting-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line-soft)", padding: "8px 0" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Task color</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>List color</span>
          </div>

          <div className="list-setting-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line-soft)", padding: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Sync tasks to</span>
              <Icon name="help" style={{ width: 14, height: 14, color: "var(--muted)" }} title="Automatically export scheduled tasks in this list to a Google Calendar" />
            </div>
            <select
              id="list-sync-select"
              className="clean-select"
              style={{ maxWidth: 200, textAlign: "right", color: "var(--muted)", fontSize: 14 }}
              value={syncCalId}
              onChange={(e) => setSyncCalId(e.target.value)}
            >
              <option value="">None</option>
              {activeCals.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.provider === "google" ? `Google: ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="form-error" id="list-edit-error">{error}</p>}

          {canDelete && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }} id="list-delete-wrap">
              <button
                type="button"
                id="list-delete-btn"
                className="btn-quiet"
                style={{ color: "#ff6b6b", border: "1px solid rgba(255, 107, 107, 0.3)", padding: "8px 20px", borderRadius: 8, fontSize: 13.5, fontWeight: 500 }}
                onClick={() => void deleteList()}
              >
                Delete this list
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
