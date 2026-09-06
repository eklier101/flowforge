import { useCallback, useEffect, useRef, useState } from "react";

import type { DateOverride, DayInterval, SchedulingPreset } from "@flowforge/api-client";

import { api } from "../../../api";
import { useAppContext } from "../../../context/AppContext";
import { ALL_15MIN_TIMES, SUNDAY_DAYS } from "../../../lib/constants";
import { hhmmTo12 } from "../../../lib/format";
import { Icon } from "../../icons/IconSprite";

type Props = {
  preset: SchedulingPreset | null;
  open: boolean;
  onClose: () => void;
};

type DaysDraft = Record<number, DayInterval[]>;

function emptyDays(): DaysDraft {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function TimePickerPopover({
  anchor,
  currentTime,
  title,
  onSelect,
  onClose,
}: {
  anchor: HTMLElement | null;
  currentTime: string;
  title: string;
  onSelect: (time: string) => void;
  onClose: () => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sel = wheelRef.current?.querySelector(".time-picker-option.selected");
    if (sel) {
      window.setTimeout(() => sel.scrollIntoView({ block: "center", behavior: "auto" }), 20);
    }
  }, [currentTime]);

  useEffect(() => {
    if (!anchor) return;
    const pop = document.getElementById("time-picker-popover");
    if (!pop) return;
    const rect = anchor.getBoundingClientRect();
    pop.style.left = `${rect.left}px`;
    pop.style.top = `${rect.bottom + 4}px`;
  }, [anchor]);

  return (
    <div id="time-picker-popover" className="time-picker-popover">
      <div className="time-picker-head">
        <span id="time-picker-title">{title}: <strong>{hhmmTo12(currentTime)}</strong></span>
        <button type="button" className="time-picker-done" id="time-picker-done-btn" onClick={onClose}>done</button>
      </div>
      <div className="time-picker-wheel" id="time-picker-wheel" ref={wheelRef}>
        {ALL_15MIN_TIMES.map((t) => (
          <div
            key={t}
            className={`time-picker-option ${t === currentTime ? "selected" : ""}`}
            data-pick-time={t}
            role="button"
            tabIndex={0}
            onClick={() => {
              onSelect(t);
              onClose();
            }}
          >
            {hhmmTo12(t)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HoursEditModal({ preset, open, onClose }: Props) {
  const { schedulingPresets, loadSchedulingPresets, syncAfterMutation, toast } = useAppContext();

  const [name, setName] = useState("");
  const [days, setDays] = useState<DaysDraft>(emptyDays());
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [error, setError] = useState("");
  const [timePicker, setTimePicker] = useState<{
    anchor: HTMLElement;
    current: string;
    title: string;
    onSelect: (t: string) => void;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setTimePicker(null);
    if (preset) {
      setName(preset.name);
      const draft = emptyDays();
      for (let d = 0; d < 7; d++) {
        draft[d] = (preset.days[d] || []).map((inter) => ({ ...inter }));
      }
      setDays(draft);
      setOverrides((preset.overrides || []).map((ov) => ({ ...ov })));
    } else {
      setName("");
      const draft = emptyDays();
      for (let d = 1; d <= 5; d++) {
        draft[d] = [{ start_time: "08:00", end_time: "22:00" }];
      }
      setDays(draft);
      setOverrides([]);
    }
  }, [open, preset]);

  const closeTimePicker = useCallback(() => setTimePicker(null), []);

  if (!open) return null;

  const canDelete = preset && !preset.is_default && schedulingPresets.length > 1;

  function openPicker(
    anchor: HTMLElement,
    current: string,
    title: string,
    onSelect: (t: string) => void,
  ) {
    anchor.classList.add("active");
    setTimePicker({ anchor, current, title, onSelect });
  }

  function addDayInterval(day: number) {
    setDays((prev) => ({
      ...prev,
      [day]: [...(prev[day] || []), { start_time: "08:00", end_time: "22:00" }],
    }));
  }

  function copyDayIntervals(day: number) {
    const source = days[day] || [];
    const next = emptyDays();
    for (let d = 0; d < 7; d++) {
      next[d] = d === day ? source.map((i) => ({ ...i })) : source.map((i) => ({ ...i }));
    }
    setDays(next);
    toast(`Copied ${SUNDAY_DAYS[day]}'s hours to all days`, "ok");
  }

  async function save() {
    if (!name.trim()) {
      setError("Please enter a preset name.");
      return;
    }
    setError("");
    try {
      const payload = { name: name.trim(), days, overrides };
      if (preset) {
        await api.updateSchedulingPreset(preset.id, payload);
        toast("Scheduling hours updated", "ok");
      } else {
        await api.createSchedulingPreset(payload);
        toast("Scheduling hours created", "ok");
      }
      onClose();
      await loadSchedulingPresets();
      await syncAfterMutation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function deletePreset() {
    if (!preset) return;
    if (!confirm(`Are you sure you want to delete "${preset.name}"?`)) return;
    try {
      await api.deleteSchedulingPreset(preset.id);
      onClose();
      await loadSchedulingPresets();
      await syncAfterMutation();
      toast("Scheduling hours deleted", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <>
      <div
        className="backdrop open"
        id="hours-edit-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="card hours-modal-card" style={{ width: "min(500px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div className="card-head" style={{ alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 12, flexShrink: 0 }}>
            <button className="icon-btn" type="button" id="hours-edit-close" title="Close" onClick={onClose}>
              <Icon name="x" />
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            <button className="btn-accent" type="button" id="hours-edit-save" style={{ padding: "6px 18px" }} onClick={() => void save()}>
              Save
            </button>
          </div>

          <div className="hours-modal-scroll" style={{ overflowY: "auto", padding: "8px 4px 16px", flex: 1 }}>
            <input
              id="hours-preset-name-input"
              placeholder="personal hours"
              style={{ width: "100%", border: 0, borderBottom: "2px solid var(--accent)", background: "transparent", fontSize: 18, fontWeight: 600, color: "var(--text)", outline: "none", padding: "4px 0 8px" }}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="hint" style={{ margin: "10px 0 16px", fontSize: 13 }}>Tasks will be auto-scheduled during these hours:</p>

            <div id="hours-days-container" className="stack" style={{ gap: 16 }}>
              {SUNDAY_DAYS.map((dayName, dayIdx) => {
                const intervals = days[dayIdx] || [];
                return (
                  <div key={dayIdx} className="day-schedule-card">
                    <div className="day-schedule-header">
                      <span className="day-schedule-title">{dayName}</span>
                      <div className="day-schedule-actions">
                        <button type="button" className="day-action-btn" title="Add hours" onClick={() => addDayInterval(dayIdx)}>
                          <Icon name="plus" style={{ width: 14, height: 14 }} />
                        </button>
                        <button type="button" className="day-action-btn" title="Copy to other days" onClick={() => copyDayIntervals(dayIdx)}>
                          <Icon name="copy" style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </div>
                    <div className="day-intervals-list">
                      {intervals.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: "var(--faint)", padding: "2px 0" }}>Off</div>
                      ) : (
                        intervals.map((inter, i) => (
                          <div key={i} className="day-interval-row">
                            <button
                              type="button"
                              className={`time-pill-btn ${timePicker?.anchor?.dataset?.timeDay === String(dayIdx) && timePicker?.anchor?.dataset?.timeField === "start_time" ? "active" : ""}`}
                              data-time-day={dayIdx}
                              data-time-idx={i}
                              data-time-field="start_time"
                              onClick={(e) =>
                                openPicker(
                                  e.currentTarget,
                                  inter.start_time,
                                  "Start time",
                                  (t) => setDays((prev) => {
                                    const copy = { ...prev };
                                    copy[dayIdx] = [...copy[dayIdx]];
                                    copy[dayIdx][i] = { ...copy[dayIdx][i], start_time: t };
                                    return copy;
                                  }),
                                )
                              }
                            >
                              {hhmmTo12(inter.start_time)}
                            </button>
                            <span className="time-interval-sep">-</span>
                            <button
                              type="button"
                              className="time-pill-btn"
                              data-time-day={dayIdx}
                              data-time-idx={i}
                              data-time-field="end_time"
                              onClick={(e) =>
                                openPicker(
                                  e.currentTarget,
                                  inter.end_time,
                                  "End time",
                                  (t) => setDays((prev) => {
                                    const copy = { ...prev };
                                    copy[dayIdx] = [...copy[dayIdx]];
                                    copy[dayIdx][i] = { ...copy[dayIdx][i], end_time: t };
                                    return copy;
                                  }),
                                )
                              }
                            >
                              {hhmmTo12(inter.end_time)}
                            </button>
                            <button
                              type="button"
                              className="interval-trash-btn"
                              title="Remove interval"
                              onClick={() =>
                                setDays((prev) => {
                                  const copy = { ...prev };
                                  copy[dayIdx] = [...copy[dayIdx]];
                                  copy[dayIdx].splice(i, 1);
                                  return copy;
                                })
                              }
                            >
                              <Icon name="trash" style={{ width: 14, height: 14 }} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="section-divider" style={{ margin: "20px 0 16px" }} />

            <div className="overrides-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 14 }}>Date overrides</strong>
                  <Icon name="help" style={{ width: 14, height: 14, color: "var(--muted)" }} title="Override regular scheduling hours on specific dates" />
                </div>
                <button
                  type="button"
                  className="btn-quiet"
                  id="btn-add-override"
                  style={{ fontSize: 12.5, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}
                  onClick={() =>
                    setOverrides((prev) => [
                      ...prev,
                      { date: new Date().toISOString().slice(0, 10), is_off: false, start_time: "09:00", end_time: "17:00" },
                    ])
                  }
                >
                  <Icon name="plus" style={{ width: 12, height: 12 }} />
                  Add a date override
                </button>
              </div>
              <div id="hours-overrides-list" className="stack" style={{ gap: 8 }}>
                {overrides.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--faint)" }}>No date overrides yet</div>
                ) : (
                  overrides.map((ov, idx) => (
                    <div key={idx} className="override-row-item">
                      <input
                        type="date"
                        value={ov.date}
                        style={{ background: "transparent", border: 0, color: "var(--text)", fontSize: 13, outline: "none" }}
                        onChange={(e) =>
                          setOverrides((prev) => {
                            const copy = [...prev];
                            copy[idx] = { ...copy[idx], date: e.target.value };
                            return copy;
                          })
                        }
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={ov.is_off}
                          onChange={(e) =>
                            setOverrides((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], is_off: e.target.checked };
                              return copy;
                            })
                          }
                        />
                        All day off
                      </label>
                      {!ov.is_off && (
                        <>
                          <button
                            type="button"
                            className="time-pill-btn"
                            style={{ padding: "4px 8px", minWidth: 70, fontSize: 12 }}
                            onClick={(e) =>
                              openPicker(
                                e.currentTarget,
                                ov.start_time || "09:00",
                                "Start time",
                                (t) =>
                                  setOverrides((prev) => {
                                    const copy = [...prev];
                                    copy[idx] = { ...copy[idx], start_time: t };
                                    return copy;
                                  }),
                              )
                            }
                          >
                            {hhmmTo12(ov.start_time || "09:00")}
                          </button>
                          <span className="time-interval-sep">-</span>
                          <button
                            type="button"
                            className="time-pill-btn"
                            style={{ padding: "4px 8px", minWidth: 70, fontSize: 12 }}
                            onClick={(e) =>
                              openPicker(
                                e.currentTarget,
                                ov.end_time || "17:00",
                                "End time",
                                (t) =>
                                  setOverrides((prev) => {
                                    const copy = [...prev];
                                    copy[idx] = { ...copy[idx], end_time: t };
                                    return copy;
                                  }),
                              )
                            }
                          >
                            {hhmmTo12(ov.end_time || "17:00")}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="interval-trash-btn"
                        title="Remove override"
                        style={{ marginLeft: "auto" }}
                        onClick={() => setOverrides((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Icon name="trash" style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {error && <p className="form-error" id="hours-edit-error" style={{ marginTop: 12 }}>{error}</p>}

            <div className="section-divider" style={{ margin: "20px 0 16px" }} />

            {canDelete && (
              <div id="hours-delete-container" style={{ textAlign: "center", marginBottom: 12 }}>
                <button
                  type="button"
                  id="hours-delete-btn"
                  style={{ background: "transparent", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#ef4444", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                  onClick={() => void deletePreset()}
                >
                  Delete these scheduling hours
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {timePicker && (
        <TimePickerPopover
          anchor={timePicker.anchor}
          currentTime={timePicker.current}
          title={timePicker.title}
          onSelect={timePicker.onSelect}
          onClose={() => {
            timePicker.anchor.classList.remove("active");
            closeTimePicker();
          }}
        />
      )}
    </>
  );
}
