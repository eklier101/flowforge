import { useEffect, useMemo, useState } from "react";

import type { AuthUser, SchedulingPreset, Settings, TaskList } from "@flowforge/api-client";
import {
  AUTO_CUTOFF_OPTIONS,
  BUFFER_DAYS_OPTIONS,
  BUFFER_MINUTES_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DEFAULT_DURATION_OPTIONS,
  MIN_SPLIT_OPTIONS,
  WORKLOAD_OPTIONS,
} from "@flowforge/api-client";

import { api, setAuthToken } from "../../api";
import { HelpTooltip } from "../ui/HelpTooltip";
import { CustomSelect } from "../ui/CustomSelect";
import { useAppContext, type SettingsPane } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { CAL_COLORS, TIMEZONES } from "../../lib/constants";
import { Icon } from "../icons/IconSprite";
import { AddAccountModal } from "./modals/AddAccountModal";
import { EditListModal } from "./modals/EditListModal";
import { HoursEditModal } from "./modals/HoursEditModal";

const BASE_NAV_ITEMS: { pane: SettingsPane; icon: string; label: string }[] = [
  { pane: "general", icon: "gear", label: "General" },
  { pane: "account", icon: "user", label: "Account" },
  { pane: "calendars", icon: "calendar", label: "Calendars" },
  { pane: "integrations", icon: "puzzle", label: "Integrations" },
  { pane: "lists", icon: "list", label: "Lists" },
  { pane: "events-tasks", icon: "calendar-plus", label: "Events and tasks" },
  { pane: "hours", icon: "clock", label: "Scheduling hours" },
  { pane: "appearance", icon: "paint", label: "Appearance" },
  { pane: "app", icon: "download", label: "Android app" },
];

function Switch({
  id,
  checked,
  disabled,
  onToggle,
  style,
}: {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      className="switch"
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      style={style}
      onClick={onToggle}
    />
  );
}

function HelpIcon({ title }: { title: string }) {
  return <HelpTooltip text={title} />;
}

export function SettingsModal() {
  const ctx = useAppContext();
  const { user } = useAuth();
  const {
    settingsOpen,
    closeSettings,
    settingsPane,
    setSettingsPane,
    settings,
    updateSettings,
    lists,
    calendars,
    schedulingPresets,
    googleStatus,
    googleAccountCalendars,
    appInfo,
    toast,
    syncAfterMutation,
    loadCalendars,
    loadGoogleData,
    openAddAccountModal,
    applyTheme,
    themeChoice,
    editingList,
    closeEditListModal,
    openEditListModal,
  } = ctx;
  const [editingPreset, setEditingPreset] = useState<SchedulingPreset | null | undefined>(undefined);

  const navItems = useMemo(() => {
    if (!user.is_admin) return BASE_NAV_ITEMS;
    const items = [...BASE_NAV_ITEMS];
    const accountIdx = items.findIndex((n) => n.pane === "account");
    items.splice(accountIdx + 1, 0, { pane: "users", icon: "user", label: "Users" });
    return items;
  }, [user.is_admin]);

  const paneTitle = navItems.find((n) => n.pane === settingsPane)?.label ?? "Settings";
  const s: Settings = settings || { timezone: "America/New_York" };

  const internalCals = calendars.filter((c) => c.provider === "internal");
  const icalFeeds = calendars.filter(
    (c) => c.provider !== "google" && c.provider !== "internal" && c.url.startsWith("http"),
  );
  const activeCals = calendars.filter((c) => c.is_active);

  const syncTaskOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    googleAccountCalendars.forEach((row) => {
      const accountLabel =
        row.email === "google-account" && row.calendars.length && row.calendars[0].id.includes("@")
          ? row.calendars[0].id
          : row.email;
      row.calendars.forEach((cal) => {
        if (cal.linked && cal.is_active && cal.calendar_row_id) {
          opts.push({
            value: String(cal.calendar_row_id),
            label: `${accountLabel} → ${cal.name}`,
          });
        }
      });
    });
    return opts;
  }, [googleAccountCalendars]);

  async function saveGeneral(payload: Partial<Settings>) {
    try {
      await updateSettings(payload);
      await syncAfterMutation();
      toast("Setting saved", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function saveEventDefault(payload: Partial<Settings>) {
    try {
      await updateSettings(payload);
      await syncAfterMutation();
      toast("Default updated", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function onSyncTasksChange(val: string) {
    const calendarId = val ? Number(val) : null;
    try {
      await updateSettings({ sync_tasks_calendar_id: calendarId });
      if (calendarId) {
        await api.triggerSyncTasks();
        toast("Task sync calendar updated and synced!", "ok");
      } else {
        toast("Task sync disabled", "ok");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  if (!settingsOpen) {
    return (
      <>
        <SettingsSubModals
          editingPreset={editingPreset}
          setEditingPreset={setEditingPreset}
        />
      </>
    );
  }

  const chosenListId = s.default_task_list_id || (lists[0]?.id ?? null);
  const chosenList = lists.find((l) => l.id === Number(chosenListId));
  const chosenCalId = s.default_event_calendar_id || (activeCals[0]?.id ?? null);
  const chosenCal = activeCals.find((c) => c.id === Number(chosenCalId));

  return (
    <>
      <div
        className="backdrop open"
        id="settings"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeSettings();
        }}
      >
        <div className="settings">
          <div className="settings-nav">
            <h2>Settings</h2>
            {navItems.map((item) => (
              <button
                key={item.pane}
                className={`nav-item ${settingsPane === item.pane ? "active" : ""}`}
                type="button"
                data-pane={item.pane}
                onClick={() => setSettingsPane(item.pane)}
              >
                <Icon name={item.icon} /> {item.label}
              </button>
            ))}
          </div>

          <div className="settings-pane">
            <div className="pane-head">
              <h3 id="pane-title">{paneTitle}</h3>
              <button className="icon-btn" type="button" id="settings-close" title="Close" onClick={closeSettings}>
                <Icon name="x" />
              </button>
            </div>

            {settingsPane === "general" && (
              <div data-pane-body="general">
                <div className="field">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Buffer days</span>
                    <HelpIcon title="How many days before a deadline tasks should ideally be scheduled" />
                  </div>
                  <select
                    id="pref-buffer-days"
                    className="clean-select"
                    value={String(s.buffer_days !== undefined ? s.buffer_days : 1)}
                    onChange={(e) => void saveGeneral({ buffer_days: Number(e.target.value) })}
                  >
                    {BUFFER_DAYS_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <div className="field">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Auto-scheduling cutoff</span>
                    <HelpIcon title="How far in advance the auto-scheduler will place tasks" />
                  </div>
                  <select
                    id="pref-scheduling-cutoff"
                    className="clean-select"
                    value={s.auto_scheduling_cutoff || "2 weeks"}
                    onChange={(e) => void saveGeneral({ auto_scheduling_cutoff: e.target.value })}
                  >
                    {AUTO_CUTOFF_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="field">
                  <span>Workload distribution</span>
                  <select
                    id="pref-workload-distribution"
                    className="clean-select"
                    value={s.workload_distribution || "Balanced"}
                    onChange={(e) => void saveGeneral({ workload_distribution: e.target.value })}
                  >
                    {WORKLOAD_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="field">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Auto-recalculate</span>
                    <HelpIcon title="Automatically recalculate your schedule when events or tasks change" />
                  </div>
                  <Switch
                    id="pref-auto-recalc"
                    checked={s.auto_recalculate !== false}
                    onToggle={() => void saveGeneral({ auto_recalculate: s.auto_recalculate === false })}
                  />
                </div>

                <div className="field">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Lock started time blocks</span>
                    <HelpIcon title="Prevent recalculation from moving blocks that have already started" />
                  </div>
                  <Switch
                    id="pref-lock-started"
                    checked={Boolean(s.lock_started_blocks)}
                    onToggle={() => void saveGeneral({ lock_started_blocks: !s.lock_started_blocks })}
                  />
                </div>

                <div className="section-divider" style={{ margin: "16px 0" }} />

                <div className="field">
                  <span>Start week on</span>
                  <select
                    id="week-start"
                    className="clean-select"
                    value={String(s.start_week_on !== undefined ? s.start_week_on : 0)}
                    onChange={(e) => void saveGeneral({ start_week_on: Number(e.target.value) })}
                  >
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="6">Saturday</option>
                  </select>
                </div>

                <div className="field">
                  <span>Date format</span>
                  <select
                    id="pref-date-format"
                    className="clean-select"
                    value={s.date_format || "MM/DD/YYYY"}
                    onChange={(e) => void saveGeneral({ date_format: e.target.value })}
                  >
                    {DATE_FORMAT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="field">
                  <span>Use 24-hour time</span>
                  <Switch
                    id="pref-hour24"
                    checked={Boolean(s.use_24_hour_time)}
                    onToggle={() => void saveGeneral({ use_24_hour_time: !s.use_24_hour_time })}
                  />
                </div>

                <div className="field">
                  <span>Show completed tasks</span>
                  <Switch
                    id="pref-completed"
                    checked={s.show_completed_tasks !== false}
                    onToggle={() => void saveGeneral({ show_completed_tasks: s.show_completed_tasks === false })}
                  />
                </div>

                <div className="section-divider" style={{ margin: "16px 0" }} />

                <div className="field">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Time zone default</span>
                    <HelpIcon title="How timezone is handled for new tasks and events" />
                  </div>
                  <select
                    id="pref-tz-default-type"
                    className="clean-select"
                    value={s.timezone_default_type || "Floating"}
                    onChange={(e) => void saveGeneral({ timezone_default_type: e.target.value })}
                  >
                    <option value="Floating">Floating</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                </div>

                <div className="field">
                  <span>Time zone</span>
                  <select
                    id="timezone-select"
                    className="clean-select"
                    style={{ maxWidth: 200 }}
                    value={s.timezone || "America/New_York"}
                    onChange={(e) => void saveGeneral({ timezone: e.target.value })}
                  >
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>

                <div className="field">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Detect time zone changes</span>
                    <HelpIcon title="Automatically prompt to change timezone when traveling" />
                  </div>
                  <Switch
                    id="pref-detect-tz"
                    checked={s.detect_timezone_changes !== false}
                    onToggle={() => void saveGeneral({ detect_timezone_changes: s.detect_timezone_changes === false })}
                  />
                </div>

                <div className="section-divider" style={{ margin: "16px 0" }} />

                <div className="field" style={{ borderBottom: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "var(--muted)" }}>Task & event notifications</span>
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>Local reminders in this browser while FlowForge is open</span>
                  </div>
                  <Switch
                    id="pref-push-notif"
                    checked={Boolean(s.push_notifications)}
                    onToggle={() => void saveGeneral({ push_notifications: !s.push_notifications })}
                  />
                </div>
              </div>
            )}

            {settingsPane === "account" && (
              <div data-pane-body="account">
                <AccountPane
                  settings={s}
                  googleStatus={googleStatus}
                  updateSettings={updateSettings}
                  toast={toast}
                  closeSettings={closeSettings}
                  openAddAccountModal={openAddAccountModal}
                  loadGoogleData={loadGoogleData}
                />
              </div>
            )}

            {settingsPane === "users" && user.is_admin && (
              <div data-pane-body="users">
                <UsersPane toast={toast} />
              </div>
            )}

            {settingsPane === "calendars" && (
              <div data-pane-body="calendars">
                <div className="sync-tasks-card">
                  <div className="sync-header">
                    <strong>Sync tasks</strong>
                    <span className="free-badge">Included</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0 10px" }}>
                    Automatically export and sync your scheduled FlowForge task blocks into your Google Calendar.
                  </p>
                  <div className="field" style={{ border: 0, padding: 0 }}>
                    <span>Sync scheduled tasks to:</span>
                    <select
                      id="sync-tasks-select"
                      style={{ maxWidth: 260 }}
                      value={s.sync_tasks_calendar_id ? String(s.sync_tasks_calendar_id) : ""}
                      onChange={(e) => void onSyncTasksChange(e.target.value)}
                    >
                      <option value="">Don&apos;t sync tasks</option>
                      {syncTaskOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="section-divider" />

                <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>Calendars</h4>

                <div className="account-block" id="internal-calendars-block">
                  <div className="account-header">
                    <span className="avatar" style={{ width: 18, height: 18, fontSize: 10 }}>F</span>
                    <span className="account-email">FlowForge</span>
                  </div>
                  <div className="stack" id="internal-calendars-list" style={{ gap: 2 }}>
                    {internalCals.length === 0 ? (
                      <div className="cal-item-row">
                        <span className="cal-item-title" style={{ color: "var(--muted)" }}>No internal calendars yet</span>
                      </div>
                    ) : (
                      internalCals.map((cal) => (
                        <CalInternalRow key={cal.id} cal={cal} canDelete={internalCals.length > 1} onMutate={async () => {
                          await loadCalendars();
                          await loadGoogleData();
                          await syncAfterMutation();
                        }} toast={toast} />
                      ))
                    )}
                  </div>
                </div>

                <div className="stack" id="google-accounts-container">
                  {googleAccountCalendars.map((row) => {
                    const account = googleStatus?.accounts.find((a) => a.id === row.accountId);
                    const accountLabel =
                      row.email === "google-account" && row.calendars.length && row.calendars[0].id.includes("@")
                        ? row.calendars[0].id
                        : row.email;
                    const syncTime = account?.last_synced_at
                      ? `Last synced ${new Date(account.last_synced_at).toLocaleString()}`
                      : "Not synced yet";
                    return (
                      <div key={row.accountId} className="account-block">
                        <div className="account-header">
                          <Icon name="calendar" style={{ width: 16, height: 16, color: "var(--accent)" }} />
                          <span className="account-email">{accountLabel}</span>
                          <button
                            className="link-btn"
                            type="button"
                            onClick={() =>
                              void (async () => {
                                await api.disconnectGoogleAccount(row.accountId);
                                await loadGoogleData();
                                await loadCalendars();
                                await syncAfterMutation();
                                toast("Google account disconnected", "ok");
                              })()
                            }
                          >
                            Disconnect
                          </button>
                        </div>
                        <div className="stack" style={{ gap: 2 }}>
                          {row.calendars.length === 0 ? (
                            <p className="hint">No calendars found</p>
                          ) : (
                            row.calendars.map((cal) => (
                              <GoogleCalRow
                                key={cal.id}
                                accountId={row.accountId}
                                cal={cal}
                                onMutate={async () => {
                                  await loadGoogleData();
                                  await loadCalendars();
                                  await syncAfterMutation();
                                  toast("Calendar updated", "ok");
                                }}
                              />
                            ))
                          )}
                        </div>
                        <div className="sync-meta">{syncTime}</div>
                      </div>
                    );
                  })}
                </div>

                {icalFeeds.length > 0 && (
                  <div className="account-block" id="ical-calendars-block">
                    <div className="account-header">
                      <Icon name="calendar" style={{ width: 16, height: 16, color: "var(--muted)" }} />
                      <span className="account-email">iCal Feeds</span>
                    </div>
                    <div className="stack" id="calendar-rows" style={{ gap: 2 }}>
                      {icalFeeds.map((cal, index) => (
                        <IcalRow key={cal.id} cal={cal} color={CAL_COLORS[index % CAL_COLORS.length]} onMutate={async () => {
                          await loadCalendars();
                          await syncAfterMutation();
                          toast("iCal feed removed", "ok");
                        }} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="card-actions" style={{ justifyContent: "flex-start", marginTop: 14 }}>
                  <button className="btn-accent" type="button" id="open-add-account-modal" onClick={openAddAccountModal}>
                    <Icon name="plus" style={{ width: 14, height: 14 }} />
                    Add account
                  </button>
                </div>
              </div>
            )}

            {settingsPane === "integrations" && (
              <div data-pane-body="integrations">
                <div className="account-block">
                  <div className="account-header">
                    <Icon name="calendar" style={{ width: 16, height: 16, color: "var(--accent)" }} />
                    <span className="account-email">Google Calendar</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0 10px" }}>Two-way sync and busy-time blocking with Google Calendar.</p>
                  <div id="integrations-google-status">
                    {!googleStatus?.configured ? (
                      <p className="hint" style={{ color: "var(--muted)" }}>Google Calendar integration is not configured on this server.</p>
                    ) : (
                      <p className="hint" style={{ color: "var(--task-dot)" }}>
                        Configured · {googleStatus.accounts.length} account{googleStatus.accounts.length === 1 ? "" : "s"} connected.
                      </p>
                    )}
                  </div>
                </div>
                <div className="account-block" style={{ marginTop: 10 }}>
                  <div className="account-header">
                    <span className="avatar" style={{ width: 18, height: 18, fontSize: 10, background: "#ef4444" }}>F</span>
                    <span className="account-email">Forge Workout Sync</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0 8px" }}>Sync scheduled workout plans and completed workouts from your Forge workout tracker.</p>
                  <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface)", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line-soft)" }}>
                    <strong>Webhook Endpoint:</strong> <code style={{ color: "var(--accent)", userSelect: "all" }}>POST /api/tasks/forge-sync</code>
                    <p style={{ margin: "4px 0 0", fontSize: 11 }}>Send JSON: <code>{`{"title": "Leg Day", "duration_minutes": 60, "event_type": "workout_plan"}`}</code></p>
                  </div>
                </div>
                <div className="account-block" style={{ marginTop: 10 }}>
                  <div className="account-header">
                    <span className="avatar" style={{ width: 18, height: 18, fontSize: 10 }}>H</span>
                    <span className="account-email">Habits App Integration</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0" }}>Completing tasks in FlowForge can automatically mark habits complete in your linked habits app.</p>
                </div>
              </div>
            )}

            {settingsPane === "lists" && (
              <div data-pane-body="lists">
                <div id="lists-container" className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {lists.length === 0 ? (
                    <p className="hint">No lists created yet.</p>
                  ) : (
                    lists.map((list) => (
                      <div
                        key={list.id}
                        className="list-row-item"
                        data-edit-list={list.id}
                        onClick={() => openEditListModal(list)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && openEditListModal(list)}
                      >
                        <span className="list-dot" style={{ background: list.color }} />
                        <span className="list-name">{list.name}</span>
                        {list.task_count > 0 && <span className="list-count-badge">{list.task_count} tasks</span>}
                        <Icon name="chev-right" style={{ color: "var(--faint)", width: 16, height: 16 }} />
                      </div>
                    ))
                  )}
                </div>
                <div className="card-actions" style={{ justifyContent: "center", marginTop: 14 }}>
                  <button
                    className="btn-quiet"
                    type="button"
                    id="btn-new-list"
                    style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}
                    onClick={() => openEditListModal(null)}
                  >
                    <Icon name="plus" style={{ width: 14, height: 14 }} />
                    New list
                  </button>
                </div>
              </div>
            )}

            {settingsPane === "events-tasks" && (
              <div data-pane-body="events-tasks">
                <EventsTasksPane s={s} lists={lists} activeCals={activeCals} chosenList={chosenList} chosenCal={chosenCal} saveEventDefault={saveEventDefault} />
              </div>
            )}

            {settingsPane === "hours" && (
              <div data-pane-body="hours">
                <div id="scheduling-hours-list" className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {schedulingPresets.length === 0 ? (
                    <div className="list-row-item">
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>No scheduling hours presets found</span>
                    </div>
                  ) : (
                    schedulingPresets.map((p) => (
                      <div
                        key={p.id}
                        className="list-row-item"
                        data-edit-preset={p.id}
                        style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                        onClick={() => setEditingPreset(p)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setEditingPreset(p)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 500, fontSize: 14, color: "var(--text)" }}>{p.name}</span>
                          {p.is_default && (
                            <span style={{ fontSize: 11, color: "var(--faint)", background: "var(--elev)", padding: "2px 6px", borderRadius: 4 }}>Default</span>
                          )}
                        </div>
                        <Icon name="chev-right" style={{ color: "var(--faint)", width: 16, height: 16 }} />
                      </div>
                    ))
                  )}
                </div>
                <div className="card-actions" style={{ justifyContent: "center", marginTop: 14 }}>
                  <button
                    className="btn-quiet"
                    type="button"
                    id="btn-new-hours-preset"
                    style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}
                    onClick={() => setEditingPreset(null)}
                  >
                    <Icon name="plus" style={{ width: 14, height: 14 }} />
                    Add new
                  </button>
                </div>
              </div>
            )}

            {settingsPane === "appearance" && (
              <div data-pane-body="appearance">
                {(["system", "light", "dark"] as const).map((choice) => (
                  <div
                    key={choice}
                    className={`radio-row ${themeChoice === choice ? "on" : ""}`}
                    data-theme-choice={choice}
                    role="button"
                    tabIndex={0}
                    onClick={() => applyTheme(choice)}
                    onKeyDown={(e) => e.key === "Enter" && applyTheme(choice)}
                  >
                    <span className="mark" />
                    {choice === "system" ? "System" : choice === "light" ? "Light" : "Dark"}
                  </div>
                ))}
              </div>
            )}

            {settingsPane === "app" && (
              <div data-pane-body="app">
                <p className="hint">Use your Cloudflare tunnel URL here. Web, API, APK, and Google OAuth all share one origin.</p>
                <label className="field">
                  <span>Server URL</span>
                  <input id="public-origin" readOnly value={appInfo?.public_url || window.location.origin} />
                </label>
                <div className="field">
                  <span>APK status</span>
                  <span className="mono" id="apk-status">
                    {appInfo
                      ? appInfo.apk_available
                        ? `${appInfo.apk_filename} · ${(appInfo.apk_size / 1048576).toFixed(1)} MB · v${appInfo.version} (${appInfo.version_code})`
                        : "Not published yet"
                      : "…"}
                  </span>
                </div>
                <div className="card-actions">
                  <a
                    className="btn-accent"
                    id="apk-download"
                    href={appInfo?.apk_download_url || appInfo?.apk_url || "/download/flowforge.apk"}
                    download={appInfo?.apk_filename || "flowforge.apk"}
                  >
                    Download APK
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SettingsSubModals
        editingPreset={editingPreset}
        setEditingPreset={setEditingPreset}
      />
    </>
  );
}

function SettingsSubModals({
  editingPreset,
  setEditingPreset,
}: {
  editingPreset: SchedulingPreset | null | undefined;
  setEditingPreset: (value: SchedulingPreset | null | undefined) => void;
}) {
  return (
    <>
      <AddAccountModal />
      <HoursEditModal preset={editingPreset === undefined ? null : editingPreset} open={editingPreset !== undefined} onClose={() => setEditingPreset(undefined)} />
    </>
  );
}

function AccountPane({
  settings: s,
  googleStatus,
  updateSettings,
  toast,
  closeSettings,
  openAddAccountModal,
  loadGoogleData,
}: {
  settings: Settings;
  googleStatus: ReturnType<typeof useAppContext>["googleStatus"];
  updateSettings: ReturnType<typeof useAppContext>["updateSettings"];
  toast: ReturnType<typeof useAppContext>["toast"];
  closeSettings: () => void;
  openAddAccountModal: () => void;
  loadGoogleData: () => Promise<void>;
}) {
  const { user, setUser, logout } = useAuth();
  const email = s.user_email || user.email || "user@example.com";
  const [name, setName] = useState(s.user_name || user.username || "user");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast("New password must be at least 8 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setPasswordBusy(true);
    try {
      const res = await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setAuthToken(res.token);
      setUser(res.user);
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password updated", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to change password", "error");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <>
      <div className="account-card-section">
        <label className="account-field-label">Name</label>
        <input
          id="account-name-input"
          className="account-card-input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim() || "user";
            if (trimmed === s.user_name || (!s.user_name && trimmed === "user")) return;
            void (async () => {
              try {
                await updateSettings({ user_name: trimmed });
                toast("Name updated", "ok");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Failed", "error");
              }
            })();
          }}
        />

        <label className="account-field-label">Email</label>
        <div id="account-email-display" className="account-email-val">{email}</div>

        <div className="section-divider" style={{ margin: "12px 0 16px" }} />

        <div className="stack" style={{ gap: 8 }}>
          <button
            type="button"
            className="account-block-btn"
            id="btn-change-email"
            onClick={() => {
              const newEmail = prompt("Enter new email address:", email);
              if (newEmail?.trim() && newEmail.trim() !== email) {
                void updateSettings({ user_email: newEmail.trim() }).then(() => toast("Email updated", "ok"));
              }
            }}
          >
            Change email
          </button>
          <button
            type="button"
            className="account-block-btn"
            id="btn-change-password"
            onClick={() => setShowPasswordForm((v) => !v)}
          >
            Change password
          </button>
          {showPasswordForm && (
            <form className="stack" style={{ gap: 10, padding: 12, background: "var(--elev)", borderRadius: 8, border: "1px solid var(--line)" }} onSubmit={(e) => void submitPasswordChange(e)}>
              <label className="field">
                <span>Current password</span>
                <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={passwordBusy} />
              </label>
              <label className="field">
                <span>New password</span>
                <input type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={passwordBusy} />
              </label>
              <label className="field">
                <span>Confirm new password</span>
                <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={passwordBusy} />
              </label>
              <div className="card-actions" style={{ marginTop: 0 }}>
                <button className="btn-quiet" type="button" onClick={() => setShowPasswordForm(false)} disabled={passwordBusy}>Cancel</button>
                <button className="btn-accent" type="submit" disabled={passwordBusy}>{passwordBusy ? "Saving…" : "Update password"}</button>
              </div>
            </form>
          )}
          <button
            type="button"
            className="account-block-btn danger"
            id="btn-delete-account"
            onClick={() => {
              if (confirm("Reset all local data? This deletes tasks, events, lists (except default), and schedules. This cannot be undone.")) {
                void api.resetAccount().then(async () => {
                  toast("All data reset", "ok");
                  closeSettings();
                  window.location.reload();
                }).catch((err: Error) => toast(err.message || "Reset failed", "error"));
              }
            }}
          >
            Reset all data
          </button>
        </div>
      </div>

      <div className="section-divider" style={{ margin: "24px 0 16px" }} />

      <div className="account-card-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Connected accounts</h4>
          <button
            type="button"
            className="btn-quiet"
            id="btn-add-account-from-pane"
            style={{ fontSize: 12.5, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}
            onClick={openAddAccountModal}
          >
            <Icon name="plus" style={{ width: 12, height: 12 }} /> Add account
          </button>
        </div>
        <div id="account-pane-list" className="stack" style={{ gap: 8 }}>
          {!googleStatus?.configured ? (
            <p className="hint" style={{ color: "var(--faint)" }}>No external Google calendar integration configured.</p>
          ) : !googleStatus.accounts.length ? (
            <p className="hint" style={{ color: "var(--faint)" }}>No Google accounts connected yet. Click &quot;+ Add account&quot; to link one.</p>
          ) : (
            googleStatus.accounts.map((acc) => (
              <div
                key={acc.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--elev)", border: "1px solid var(--line)", borderRadius: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </div>
                  <div>
                    <strong style={{ fontSize: 13.5, color: "var(--text)" }}>{acc.email}</strong>
                    <div className="hint" style={{ fontSize: 11.5, marginTop: 1 }}>
                      {acc.calendar_count} calendar{acc.calendar_count === 1 ? "" : "s"} ·{" "}
                      {acc.last_synced_at
                        ? `Synced ${new Date(acc.last_synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Not synced"}
                    </div>
                  </div>
                </div>
                <button
                  className="link-btn"
                  type="button"
                  style={{ color: "var(--danger)" }}
                  onClick={() =>
                    void api.disconnectGoogleAccount(acc.id).then(async () => {
                      await loadGoogleData();
                      toast("Disconnected", "ok");
                    })
                  }
                >
                  Disconnect
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
        <button
          type="button"
          className="account-block-btn"
          id="btn-logout"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--muted)" }}
          onClick={() => {
            if (confirm("Are you sure you want to log out?")) {
              closeSettings();
              void logout();
            }
          }}
        >
          <Icon name="logout" style={{ width: 16, height: 16 }} /> Log out
        </button>
      </div>
    </>
  );
}

function UsersPane({ toast }: { toast: ReturnType<typeof useAppContext>["toast"] }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setCreating(true);
    try {
      const res = await api.createUser({
        username: newUsername.trim(),
        ...(newEmail.trim() ? { email: newEmail.trim() } : {}),
        ...(newPassword ? { password: newPassword } : {}),
        is_admin: newIsAdmin,
      });
      if (res.temporary_password) {
        alert(`User created. Temporary password:\n\n${res.temporary_password}`);
      } else {
        toast("User created", "ok");
      }
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setNewIsAdmin(false);
      await loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create user", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="hint" style={{ margin: 0, color: "var(--muted)" }}>
        Manage FlowForge accounts. Only admins can access this pane.
      </p>

      {loading ? (
        <p className="hint">Loading users…</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {users.map((u) => (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                background: "var(--elev)",
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 13.5 }}>{u.username}</strong>
                {u.is_admin && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>Admin</span>
                )}
                <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>{u.email}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ fontSize: 12, padding: "4px 8px" }}
                  disabled={u.id === currentUser.id && u.is_admin}
                  onClick={() =>
                    void (async () => {
                      try {
                        await api.updateUser(u.id, { is_admin: !u.is_admin });
                        toast(u.is_admin ? "Admin removed" : "Admin granted", "ok");
                        await loadUsers();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Failed", "error");
                      }
                    })()
                  }
                >
                  {u.is_admin ? "Remove admin" : "Make admin"}
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ fontSize: 12, padding: "4px 8px" }}
                  onClick={() =>
                    void (async () => {
                      if (!confirm(`Reset password for ${u.username}?`)) return;
                      try {
                        const res = await api.resetUserPassword(u.id);
                        alert(`Temporary password for ${u.username}:\n\n${res.temporary_password}`);
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Failed", "error");
                      }
                    })()
                  }
                >
                  Reset password
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ fontSize: 12, padding: "4px 8px", color: "var(--danger)" }}
                  disabled={u.id === currentUser.id}
                  onClick={() =>
                    void (async () => {
                      if (!confirm(`Delete user ${u.username}? This cannot be undone.`)) return;
                      try {
                        await api.deleteUser(u.id);
                        toast("User deleted", "ok");
                        await loadUsers();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Failed", "error");
                      }
                    })()
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-divider" />

      <form className="stack" style={{ gap: 10 }} onSubmit={(e) => void createUser(e)}>
        <h4 style={{ margin: 0, fontSize: 14 }}>Create user</h4>
        <label className="field">
          <span>Username</span>
          <input required value={newUsername} onChange={(e) => setNewUsername(e.target.value)} disabled={creating} />
        </label>
        <label className="field">
          <span>Email (optional)</span>
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} disabled={creating} />
        </label>
        <label className="field">
          <span>Password (optional — auto-generated if empty)</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={creating} autoComplete="new-password" />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} disabled={creating} />
          Admin
        </label>
        <button className="btn-accent" type="submit" disabled={creating} style={{ alignSelf: "flex-start" }}>
          {creating ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}

function EventsTasksPane({
  s,
  lists,
  activeCals,
  chosenList,
  chosenCal,
  saveEventDefault,
}: {
  s: Settings;
  lists: TaskList[];
  activeCals: ReturnType<typeof useAppContext>["calendars"];
  chosenList?: TaskList;
  chosenCal?: ReturnType<typeof useAppContext>["calendars"][number];
  saveEventDefault: (p: Partial<Settings>) => Promise<void>;
}) {
  const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--line-soft)" } as const;
  const selectStyle = { textAlign: "right" as const, background: "transparent", border: 0, color: "var(--muted)", fontSize: 14, cursor: "pointer" };

  return (
    <>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>&quot;More options&quot; expanded</span>
        <Switch
          id="pref-more-options"
          checked={s.default_more_options_expanded !== false}
          onToggle={() => void saveEventDefault({ default_more_options_expanded: s.default_more_options_expanded === false })}
        />
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Duration</span>
        <select
          id="pref-task-duration"
          className="clean-select"
          style={selectStyle}
          value={String(s.default_task_duration || 60)}
          onChange={(e) => void saveEventDefault({ default_task_duration: Number(e.target.value) })}
        >
          {DEFAULT_DURATION_OPTIONS.map((m) => (
            <option key={m} value={m}>{m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}</option>
          ))}
        </select>
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Splittable</span>
        <Switch
          id="pref-task-splittable"
          checked={s.default_task_splittable !== false}
          onToggle={() => void saveEventDefault({ default_task_splittable: s.default_task_splittable === false })}
        />
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Min duration</span>
        <select id="pref-task-minsplit" className="clean-select" style={selectStyle} value={String(s.default_task_min_split || 10)} onChange={(e) => void saveEventDefault({ default_task_min_split: Number(e.target.value) })}>
          {MIN_SPLIT_OPTIONS.map((m) => <option key={m} value={m}>{m === 60 ? "1 hr" : `${m} min`}</option>)}
        </select>
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Buffer before</span>
        <select id="pref-task-buffer-before" className="clean-select" style={selectStyle} value={String(s.default_task_buffer_before || 0)} onChange={(e) => void saveEventDefault({ default_task_buffer_before: Number(e.target.value) })}>
          {BUFFER_MINUTES_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? "None" : `${m} min`}</option>)}
        </select>
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Buffer after</span>
        <select id="pref-task-buffer-after" className="clean-select" style={selectStyle} value={String(s.default_task_buffer_after || 0)} onChange={(e) => void saveEventDefault({ default_task_buffer_after: Number(e.target.value) })}>
          {BUFFER_MINUTES_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? "None" : `${m} min`}</option>)}
        </select>
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Task list</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span id="pref-task-list-dot" className="color-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: chosenList?.color || "#5cc98d" }} />
          <select
            id="pref-task-list"
            className="clean-select"
            style={{ textAlign: "right", background: "transparent", border: 0, color: "var(--text)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            value={chosenList ? String(chosenList.id) : ""}
            onChange={(e) => void saveEventDefault({ default_task_list_id: e.target.value ? Number(e.target.value) : null })}
          >
            {lists.length === 0 ? <option value="">Default list</option> : lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div className="settings-row-item" style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Task color</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>List color</span>
      </div>
      <div className="settings-row-item" style={{ ...rowStyle, borderBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Calendar for events</span>
          <HelpIcon title="The calendar new events are added to by default" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span id="pref-event-cal-dot" className="color-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: chosenCal?.color || "#5cc98d" }} />
          <select
            id="pref-event-cal"
            className="clean-select"
            style={{ textAlign: "right", background: "transparent", border: 0, color: "var(--text)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            value={chosenCal ? String(chosenCal.id) : ""}
            onChange={(e) => void saveEventDefault({ default_event_calendar_id: e.target.value ? Number(e.target.value) : null })}
          >
            {activeCals.length === 0 ? <option value="">FlowForge</option> : activeCals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

function CalInternalRow({
  cal,
  canDelete,
  onMutate,
  toast,
}: {
  cal: ReturnType<typeof useAppContext>["calendars"][number];
  canDelete: boolean;
  onMutate: () => Promise<void>;
  toast: ReturnType<typeof useAppContext>["toast"];
}) {
  return (
    <div className="cal-item-row" data-toggle-internal={cal.id}>
      <div
        className={`cal-checkbox ${cal.is_active ? "on" : ""}`}
        style={cal.is_active ? { background: cal.color || "#5cc98d", borderColor: cal.color || "#5cc98d" } : undefined}
        role="button"
        tabIndex={0}
        onClick={() =>
          void api.updateCalendar(cal.id, { is_active: !cal.is_active }).then(onMutate)
        }
      >
        {cal.is_active && <Icon name="check-circle" style={{ width: 12, height: 12, stroke: "#fff" }} />}
      </div>
      <div className="body" style={{ flex: 1 }}>
        <span className="cal-item-title">{cal.name}</span>
        <span style={{ fontSize: 11, color: "var(--faint)", display: "block" }}>Only available in FlowForge</span>
      </div>
      {canDelete && (
        <button
          className="link-btn"
          type="button"
          onClick={() =>
            void api.deleteCalendar(cal.id).then(async () => {
              await onMutate();
              toast("Calendar deleted", "ok");
            })
          }
        >
          Delete
        </button>
      )}
    </div>
  );
}

function IcalRow({
  cal,
  color,
  onMutate,
}: {
  cal: ReturnType<typeof useAppContext>["calendars"][number];
  color: string;
  onMutate: () => Promise<void>;
}) {
  return (
    <div className="cal-item-row">
      <div
        className={`cal-checkbox ${cal.is_active ? "on" : ""}`}
        data-toggle-ical={cal.id}
        style={cal.is_active ? { background: color, borderColor: color } : undefined}
        role="button"
        tabIndex={0}
        onClick={() => void api.updateCalendar(cal.id, { is_active: !cal.is_active }).then(onMutate)}
      >
        {cal.is_active && <Icon name="check-circle" style={{ width: 12, height: 12, stroke: "#fff" }} />}
      </div>
      <div className="body" style={{ flex: 1, minWidth: 0 }}>
        <span className="cal-item-title">{cal.name}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--faint)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cal.url}
        </span>
      </div>
      <button className="link-btn" type="button" onClick={() => void api.deleteCalendar(cal.id).then(onMutate)}>Remove</button>
    </div>
  );
}

function GoogleCalRow({
  accountId,
  cal,
  onMutate,
}: {
  accountId: number;
  cal: { id: string; name: string; color?: string | null; linked: boolean; is_active: boolean; calendar_row_id?: number | null };
  onMutate: () => Promise<void>;
}) {
  const isLinked = cal.linked && cal.is_active;
  const calColor = cal.color || "#5b9bff";

  return (
    <div
      className="cal-item-row"
      data-account-id={accountId}
      data-cal-id={cal.id}
      data-cal-name={cal.name}
      data-cal-color={calColor}
      data-row-id={cal.calendar_row_id || ""}
      role="button"
      tabIndex={0}
      onClick={() =>
        void (async () => {
          if (isLinked && cal.calendar_row_id) {
            await api.updateCalendar(cal.calendar_row_id, { is_active: false });
          } else if (!isLinked && cal.calendar_row_id) {
            await api.updateCalendar(cal.calendar_row_id, { is_active: true });
          } else {
            await api.linkGoogleCalendar(accountId, { calendar_id: cal.id, name: cal.name, color: calColor });
          }
          await onMutate();
        })()
      }
    >
      <div className={`cal-checkbox ${isLinked ? "on" : ""}`} style={isLinked ? { background: calColor, borderColor: calColor } : undefined}>
        {isLinked && <Icon name="check-circle" style={{ width: 12, height: 12, stroke: "#fff" }} />}
      </div>
      <span className="cal-item-title">{cal.name}</span>
    </div>
  );
}
