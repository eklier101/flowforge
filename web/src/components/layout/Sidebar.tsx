import { useState } from "react";

import { useAppContext } from "../../context/AppContext";
import { CAL_COLORS } from "../../lib/constants";
import { Icon } from "../icons/IconSprite";
import { ListActionMenu } from "../lists/ListActionMenu";

export function Sidebar() {
  const {
    view,
    navigateToView,
    tasks,
    scheduled,
    lists,
    calendars,
    collapsed,
    setCollapsed,
    settings,
    openSettings,
    openBulkImportModal,
    openAddListFlow,
    openAddCalendarFlow,
    appInfo,
    bootReady,
  } = useAppContext();

  const [listMenuId, setListMenuId] = useState<number | null>(null);
  const [listMenuAnchor, setListMenuAnchor] = useState<HTMLElement | null>(null);

  const pending = tasks.filter((t) => !t.is_completed);
  const inboxCount = pending.filter((t) => !scheduled.has(t.id)).length;
  const userName = settings?.user_name || "User";
  const avatar = userName.charAt(0).toUpperCase();

  const navViews: { id: typeof view; label: string; icon: string; count?: number }[] = [
    { id: "schedule", label: "Schedule", icon: "calendar" },
    { id: "inbox", label: "Inbox", icon: "inbox", count: inboxCount },
    { id: "all", label: "All tasks", icon: "list", count: pending.length },
    { id: "completed", label: "Completed", icon: "check-circle", count: tasks.filter((t) => t.is_completed).length },
  ];

  function onNav(id: typeof view) {
    void navigateToView(id);
  }

  function openListMenu(listId: number, anchor: HTMLElement) {
    setListMenuId(listId);
    setListMenuAnchor(anchor);
  }

  return (
    <>
      <aside className="sidebar">
        <div className="side-top">
          <button
            className="brand-chip"
            type="button"
            title="Account & Settings"
            onClick={() => void openSettings("account")}
          >
            <span className="avatar">{avatar}</span>
            <strong>{userName}</strong>
            <Icon name="chev-down" style={{ width: 14, height: 14, color: "var(--faint)" }} />
          </button>
          <button className="icon-btn" type="button" title="Hide sidebar" onClick={() => setCollapsed((c) => !c)}>
            <Icon name="panel" />
          </button>
        </div>

        <nav className="side-nav">
          {navViews.map((v) => (
            <button
              key={v.id}
              className={`nav-item${view === v.id ? " active" : ""}`}
              type="button"
              onClick={() => onNav(v.id)}
            >
              <Icon name={v.icon} />
              {v.label}
              {v.count !== undefined && v.count > 0 && <span className="count">{v.count}</span>}
            </button>
          ))}
          <button className="nav-item" type="button" title="Import class assignments & tasks" onClick={() => openBulkImportModal()}>
            <Icon name="copy" />
            Bulk import
          </button>
        </nav>

        <div className="side-section">
          Lists
          <span className="pill">{lists.length}</span>
          <button className="icon-btn" type="button" title="Add list" onClick={() => void openAddListFlow()}>
            <Icon name="plus" style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div className="side-list" id="side-lists">
          {!bootReady ? (
            <div className="sidebar-loading"><span className="spinner" /> Loading…</div>
          ) : !lists.length ? (
            <p className="empty" style={{ padding: "4px 8px", fontSize: 12, color: "var(--faint)" }}>No lists yet</p>
          ) : (
            lists.map((list) => (
              <div
                key={list.id}
                className={`nav-item${view === `list-${list.id}` ? " active" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => onNav(`list-${list.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onNav(`list-${list.id}`)}
              >
                <span className="dot" style={{ background: list.color }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.name}</span>
                {list.task_count > 0 && <span className="count">{list.task_count}</span>}
                <button
                  type="button"
                  className="dots-btn"
                  data-list-menu={list.id}
                  title="List options"
                  onClick={(e) => {
                    e.stopPropagation();
                    openListMenu(list.id, e.currentTarget);
                  }}
                >
                  <Icon name="dots" style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="side-section">
          Calendars
          <span className="pill">{calendars.length}</span>
          <button className="icon-btn" type="button" title="Add calendar" onClick={() => void openAddCalendarFlow()}>
            <Icon name="plus" style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div className="side-list" id="side-calendars">
          {!bootReady ? null : !calendars.length ? (
            <p className="empty">No calendars connected yet.</p>
          ) : (
            calendars.map((cal, index) => (
              <div
                key={cal.id}
                className={`nav-item${view === `calendar-${cal.id}` ? " active" : ""}`}
                title={cal.url || ""}
                style={{ cursor: "pointer" }}
                onClick={() => onNav(`calendar-${cal.id}`)}
                role="button"
                tabIndex={0}
              >
                <span className="dot" style={{ background: cal.color || CAL_COLORS[index % CAL_COLORS.length] }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cal.name}</span>
              </div>
            ))
          )}
        </div>

        <div className="side-foot">
          <a
            className="nav-item"
            href={appInfo?.apk_download_url || appInfo?.apk_url || "/download/flowforge.apk"}
            id="apk-link"
            download={appInfo?.apk_filename || "flowforge.apk"}
          >
            <Icon name="download" />
            {appInfo?.apk_available ? `Get Android app (v${appInfo.version})` : "Get Android app"}
          </a>
        </div>
      </aside>
      <div className="sidebar-backdrop" id="sidebar-backdrop" onClick={() => setCollapsed(true)} role="presentation" />
      <ListActionMenu
        listId={listMenuId}
        anchorEl={listMenuAnchor}
        onClose={() => {
          setListMenuId(null);
          setListMenuAnchor(null);
        }}
      />
    </>
  );
}
