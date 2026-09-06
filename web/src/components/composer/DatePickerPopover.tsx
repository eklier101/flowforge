import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "../icons/IconSprite";
import { addDays, isoDate, parseDateKey, todayKey } from "../../lib/dates";
import { pad } from "../../lib/format";
import { positionPopover } from "./positionPopover";

const CAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type DatePickerPopoverProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  value: string;
  timeZone: string;
  onSelect: (date: string) => void;
  onClose: () => void;
};

function validDateKey(value: string, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function DatePickerPopover({ open, anchorEl, value, timeZone, onSelect, onClose }: DatePickerPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const today = todayKey(timeZone);
  const initial = validDateKey(value, today);
  const [year, setYear] = useState(() => Number(initial.split("-")[0]));
  const [month, setMonth] = useState(() => Number(initial.split("-")[1]) - 1);
  const [selected, setSelected] = useState(initial);

  useEffect(() => {
    if (!open) return;
    const next = validDateKey(value, today);
    const parts = next.split("-").map(Number);
    setYear(parts[0]);
    setMonth(parts[1] - 1);
    setSelected(next);
  }, [open, value, today]);

  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    positionPopover(popRef.current, anchorEl);
  }, [open, anchorEl, year, month, selected]);

  if (!open) return null;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: { dateStr: string; day: number; otherMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevMonthDate = new Date(year, month - 1, d);
    cells.push({ dateStr: isoDate(prevMonthDate), day: d, otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = pad(month + 1);
    const dd = pad(d);
    cells.push({ dateStr: `${year}-${mm}-${dd}`, day: d, otherMonth: false });
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextMonthDate = new Date(year, month + 1, d);
    cells.push({ dateStr: isoDate(nextMonthDate), day: d, otherMonth: true });
  }

  const selectedParts = selected.split("-").map(Number);

  return (
    <div className="calendar-picker-popover" id="calendar-picker-popover" ref={popRef}>
      <div className="cal-picker-head">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>On:</span>
          <span className="cal-picker-selected-text" id="cal-picker-selected-text">
            {selectedParts[1]}/{selectedParts[2]}/{selectedParts[0]}
          </span>
        </div>
        <button
          type="button"
          className="text-blue-link"
          id="cal-picker-done-btn"
          style={{ fontSize: 13.5, fontWeight: 600 }}
          onClick={() => {
            onSelect(selected);
            onClose();
          }}
        >
          done
        </button>
      </div>

      <div className="cal-picker-month-row">
        <button
          type="button"
          className="icon-btn"
          id="cal-picker-prev-month"
          title="Previous month"
          style={{ width: 26, height: 26 }}
          onClick={() => {
            let m = month - 1;
            let y = year;
            if (m < 0) {
              m = 11;
              y -= 1;
            }
            setMonth(m);
            setYear(y);
          }}
        >
          <Icon name="chev-left" style={{ width: 14, height: 14 }} />
        </button>
        <span className="cal-picker-month-title" id="cal-picker-month-title">
          {CAL_MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          className="icon-btn"
          id="cal-picker-next-month"
          title="Next month"
          style={{ width: 26, height: 26 }}
          onClick={() => {
            let m = month + 1;
            let y = year;
            if (m > 11) {
              m = 0;
              y += 1;
            }
            setMonth(m);
            setYear(y);
          }}
        >
          <Icon name="chev-right" style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div className="cal-picker-weekdays">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>

      <div className="cal-picker-grid" id="cal-picker-grid">
        {cells.map((cell) => {
          const isToday = cell.dateStr === today;
          const isSel = cell.dateStr === selected;
          let cls = "cal-picker-day";
          if (cell.otherMonth) cls += " other-month";
          if (isToday) cls += " today";
          if (isSel) cls += " selected";
          return (
            <button
              key={cell.dateStr}
              type="button"
              className={cls}
              data-cal-date={cell.dateStr}
              onClick={() => {
                setSelected(cell.dateStr);
                onSelect(cell.dateStr);
                onClose();
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function datePickerDefault(value: string, timeZone: string): string {
  return validDateKey(value, todayKey(timeZone));
}

export { parseDateKey, addDays };
