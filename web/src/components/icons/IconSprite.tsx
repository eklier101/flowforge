import type { CSSProperties } from "react";

type IconProps = {
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  id?: string;
};

export function Icon({ name, className = "i", style, title, id }: IconProps) {
  return (
    <svg className={className} style={style} id={id} aria-label={title}>
      {title ? <title>{title}</title> : null}
      <use href={`#ic-${name}`} />
    </svg>
  );
}

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="ic-inbox" viewBox="0 0 24 24"><path d="M3 12h5l1.5 3h5L16 12h5" /><path d="M4.5 5.5h15l1.5 6.5v6.5H3V12z" /></symbol>
      <symbol id="ic-list" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></symbol>
      <symbol id="ic-check-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></symbol>
      <symbol id="ic-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" /></symbol>
      <symbol id="ic-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="ic-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></symbol>
      <symbol id="ic-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a1.7 1.7 0 11-2.4 2.4l-.1-.1a1.6 1.6 0 00-2.7 1.1v.2a1.7 1.7 0 11-3.4 0v-.1a1.6 1.6 0 00-2.7-1.2l-.1.1A1.7 1.7 0 114 16.9l.1-.1A1.6 1.6 0 003 14.1h-.2a1.7 1.7 0 110-3.4h.1A1.6 1.6 0 004.1 8L4 7.9a1.7 1.7 0 112.4-2.4l.1.1A1.6 1.6 0 009.2 4.5V4.3a1.7 1.7 0 013.4 0v.2a1.6 1.6 0 002.7 1.1l.1-.1a1.7 1.7 0 112.4 2.4l-.1.1a1.6 1.6 0 001.1 2.7h.2a1.7 1.7 0 010 3.4h-.2z" /></symbol>
      <symbol id="ic-refresh" viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.6 5.9" /><path d="M20 5.5V11h-5.5" /></symbol>
      <symbol id="ic-panel" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M10 4.5v15" /></symbol>
      <symbol id="ic-chev-down" viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6" /></symbol>
      <symbol id="ic-chev-left" viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6" /></symbol>
      <symbol id="ic-chev-right" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6" /></symbol>
      <symbol id="ic-chevs-left" viewBox="0 0 24 24"><path d="M11.5 6l-6 6 6 6M18.5 6l-6 6 6 6" /></symbol>
      <symbol id="ic-chevs-right" viewBox="0 0 24 24"><path d="M12.5 6l6 6-6 6M5.5 6l6 6-6 6" /></symbol>
      <symbol id="ic-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 114.3 1.8c-.9.8-1.9 1.2-1.9 2.4M12 17h.01" /></symbol>
      <symbol id="ic-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
      <symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></symbol>
      <symbol id="ic-download" viewBox="0 0 24 24"><path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 19.5h14" /></symbol>
      <symbol id="ic-paint" viewBox="0 0 24 24"><path d="M5 9.5A4.5 4.5 0 019.5 5h9V12a4 4 0 01-4 4h-1.5a2 2 0 00-2 2v1.5a2.5 2.5 0 01-5 0z" /></symbol>
      <symbol id="ic-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" /></symbol>
      <symbol id="ic-puzzle" viewBox="0 0 24 24"><path d="M4 11a2 2 0 012-2h1a2 2 0 002-2V6a2 2 0 012-2 2 2 0 012 2v1a2 2 0 002 2h1a2 2 0 012 2 2 2 0 01-2 2h-1a2 2 0 00-2 2v1a2 2 0 01-2 2 2 2 0 01-2-2v-1a2 2 0 00-2-2H6a2 2 0 01-2-2z" /></symbol>
      <symbol id="ic-trash" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></symbol>
      <symbol id="ic-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></symbol>
      <symbol id="ic-calendar-plus" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M12 14v4M10 16h4" /></symbol>
      <symbol id="ic-dots" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="19" cy="12" r="2" fill="currentColor" /></symbol>
      <symbol id="ic-edit" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></symbol>
      <symbol id="ic-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></symbol>
      <symbol id="ic-menu" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></symbol>
      <symbol id="ic-sidebar" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></symbol>
      <symbol id="ic-lock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></symbol>
      <symbol id="ic-mail" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></symbol>
      <symbol id="ic-sparkles" viewBox="0 0 24 24"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2zM19 16l1.2 2.8L23 20l-2.8 1.2L19 24l-1.2-2.8L15 20l2.8-1.2L19 16z" fill="currentColor" /></symbol>
      <symbol id="ic-flag" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v19" fill="currentColor" /></symbol>
      <symbol id="ic-repeat" viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></symbol>
      <symbol id="ic-car" viewBox="0 0 24 24"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></symbol>
      <symbol id="ic-pin" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></symbol>
      <symbol id="ic-notes" viewBox="0 0 24 24"><line x1="21" y1="6" x2="3" y2="6" /><line x1="15" y1="12" x2="3" y2="12" /><line x1="17" y1="18" x2="3" y2="18" /></symbol>
      <symbol id="ic-nodes" viewBox="0 0 24 24"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="12" r="3" /><line x1="8.5" y1="7.5" x2="15.5" y2="10.5" /><line x1="8.5" y1="16.5" x2="15.5" y2="13.5" /></symbol>
      <symbol id="ic-list-bullet" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" /><line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" /><line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" /></symbol>
      <symbol id="ic-calendar-x" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="14" x2="15" y2="20" /><line x1="15" y1="14" x2="9" y2="20" /></symbol>
      <symbol id="ic-swap" viewBox="0 0 24 24"><path d="M4 17h16M16 13l4 4-4 4M20 7H4M8 11L4 7l4-4" /></symbol>
      <symbol id="ic-check" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></symbol>
      <symbol id="ic-alert-triangle" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></symbol>
      <symbol id="ic-split" viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="6" rx="1" /><rect x="13" y="14" width="8" height="6" rx="1" /><path d="M11 7h2v10" /></symbol>
    </svg>
  );
}
