import { useEffect, useState } from "react";

import { api } from "../../api";
import { useAppContext } from "../../context/AppContext";
import type { DeadlineTaskAlert } from "@flowforge/api-client";
import { Icon } from "../icons/IconSprite";
import { AlertsPanel } from "./AlertsPanel";

type TopbarProps = {
  onRecalculate: () => void;
  recalcBusy: boolean;
  onRangeChange: (range: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onFarPrev: () => void;
  onFarNext: () => void;
  onToday: () => void;
};

export function Topbar({
  onRecalculate,
  recalcBusy,
  onRangeChange,
  onPrev,
  onNext,
  onFarPrev,
  onFarNext,
  onToday,
}: TopbarProps) {
  const {
    prefs,
    query,
    setQuery,
    searchOpen,
    setSearchOpen,
    setCollapsed,
    openSettings,
    openComposer,
    tasks,
  } = useAppContext();
  const [alerts, setAlerts] = useState<DeadlineTaskAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // Only genuinely past-deadline tasks raise the warning badge. "close" and
  // "will_miss" are projections and would otherwise keep it permanently lit.
  const visibleAlerts = alerts.filter((alert) => {
    if (alert.status !== "overdue") return false;
    const task = tasks.find((t) => t.id === alert.task_id);
    return !task || !task.is_completed;
  });
  const visibleCount = visibleAlerts.length;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getDeadlineAlerts();
        if (!cancelled) {
          setAlerts(data.tasks);
        }
      } catch {
        if (!cancelled) {
          setAlerts([]);
        }
      }
    };
    void load();
    const onRefresh = () => void load();
    window.addEventListener("flowforge:schedule-updated", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("flowforge:schedule-updated", onRefresh);
    };
  }, []);

  function toggleSearch() {
    if (searchOpen) {
      setQuery("");
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
    }
  }

  return (
    <header className="topbar">
      <button className="icon-btn" type="button" title="Toggle sidebar" onClick={() => setCollapsed((c) => !c)}>
        <Icon name="menu" />
      </button>
      <select
        className="range-select"
        title="Days shown"
        value={prefs.range}
        onChange={(e) => onRangeChange(e.target.value)}
      >
        <option value="1">1 day</option>
        <option value="3">3 days</option>
        <option value="5">5 days</option>
        <option value="7">7 days</option>
        <option value="week">Week</option>
      </select>
      <div className="nav-group">
        <button className="icon-btn" type="button" title="Jump back" onClick={onFarPrev}>
          <Icon name="chevs-left" />
        </button>
        <button className="icon-btn" type="button" title="Previous" onClick={onPrev}>
          <Icon name="chev-left" />
        </button>
        <button className="today-btn" type="button" onClick={onToday}>Today</button>
        <button className="icon-btn" type="button" title="Next" onClick={onNext}>
          <Icon name="chev-right" />
        </button>
        <button className="icon-btn" type="button" title="Jump forward" onClick={onFarNext}>
          <Icon name="chevs-right" />
        </button>
      </div>
      <span className="spacer" />
      <div className="search-wrap" hidden={!searchOpen}>
        <input
          id="search-input"
          type="search"
          placeholder="Search tasks and events"
          value={query}
          onChange={(e) => setQuery(e.target.value.trim().toLowerCase())}
        />
      </div>
      {visibleCount > 0 && (
        <button
          className="icon-btn alert-badge-btn has-alerts"
          type="button"
          title="Deadline alerts"
          onClick={() => setAlertsOpen((o) => !o)}
        >
          <Icon name="alert-triangle" style={{ width: 16, height: 16 }} />
          <span className="alert-badge-count">{visibleCount}</span>
        </button>
      )}
      {alertsOpen && visibleCount > 0 && (
        <>
          <div className="alerts-panel-backdrop" onClick={() => setAlertsOpen(false)} />
          <AlertsPanel alerts={visibleAlerts} onClose={() => setAlertsOpen(false)} />
        </>
      )}
      <button className="icon-btn" type="button" title="Add task or event" onClick={() => openComposer("task")}>
        <Icon name="plus" />
      </button>
      <button className="icon-btn" type="button" title="Search" onClick={toggleSearch}>
        <Icon name="search" />
      </button>
      <button className="icon-btn" type="button" title="Settings" onClick={() => void openSettings()}>
        <Icon name="gear" />
      </button>
      <button className="btn-accent" id="recalc-btn" type="button" disabled={recalcBusy} onClick={onRecalculate}>
        <Icon name="refresh" style={{ width: 14, height: 14 }} />
        Recalculate
      </button>
    </header>
  );
}
