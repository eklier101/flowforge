import { useEffect, useLayoutEffect, useRef } from "react";

import { ALL_15MIN_TIMES } from "../../lib/constants";
import { hhmmTo12 } from "../../lib/format";
import { positionPopover } from "./positionPopover";

type TimePickerPopoverProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  value: string;
  title?: string;
  onSelect: (time: string) => void;
  onClose: () => void;
};

export function TimePickerPopover({ open, anchorEl, value, title = "Time", onSelect, onClose }: TimePickerPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    positionPopover(popRef.current, anchorEl);
    if (anchorEl?.classList) anchorEl.classList.add("active");
    return () => {
      anchorEl?.classList.remove("active");
    };
  }, [open, anchorEl, value]);

  useEffect(() => {
    if (!open || !wheelRef.current) return;
    const selEl = wheelRef.current.querySelector(".time-picker-option.selected");
    if (selEl) {
      const timer = window.setTimeout(() => {
        selEl.scrollIntoView({ block: "center", behavior: "auto" });
      }, 20);
      return () => window.clearTimeout(timer);
    }
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="time-picker-popover" id="time-picker-popover" ref={popRef}>
      <div className="time-picker-head">
        <span id="time-picker-title">
          {title}: <strong>{hhmmTo12(value)}</strong>
        </span>
        <button type="button" className="time-picker-done" id="time-picker-done-btn" onClick={onClose}>
          done
        </button>
      </div>
      <div className="time-picker-wheel" id="time-picker-wheel" ref={wheelRef}>
        {ALL_15MIN_TIMES.map((t) => {
          const isSel = t === value;
          return (
            <div
              key={t}
              className={`time-picker-option ${isSel ? "selected" : ""}`}
              data-pick-time={t}
              onClick={() => {
                onSelect(t);
                onClose();
              }}
            >
              {hhmmTo12(t)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
