import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "../icons/IconSprite";

type HelpTooltipProps = {
  text: string;
  className?: string;
};

export function HelpTooltip({ text, className }: HelpTooltipProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const hideTimer = useRef<number | null>(null);

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 260;
    let left = rect.left + rect.width / 2 - width / 2;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    let top = rect.bottom + 8;
    if (top + 60 > window.innerHeight) top = Math.max(8, rect.top - 44);
    setPos({ left, top });
    setOpen(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={className}
        data-help={text}
        title={text}
        aria-label="Help"
        onClick={(e) => {
          e.stopPropagation();
          show();
        }}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", display: "inline-flex" }}
      >
        <Icon name="help" style={{ width: 14, height: 14, color: "var(--muted)" }} />
      </button>
      {open && (
        <div className="help-tooltip-popover" style={{ left: pos.left, top: pos.top }}>
          {text}
        </div>
      )}
    </>
  );
}
