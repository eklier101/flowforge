import type { Prefs } from "./constants";
import { todayKey } from "./dates";

let dateFormatSetting = "MM/DD/YYYY";

export function setDateFormat(format: string | undefined) {
  dateFormatSetting = format || "MM/DD/YYYY";
}

export function formatSettingsDate(dateStr: string, timezone?: string): string {
  if (!dateStr) return formatDatePill(dateStr, timezone);
  const [y, m, d] = dateStr.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const fmt = dateFormatSetting;
  if (fmt === "DD/MM/YYYY") return `${pad2(d)}/${pad2(m)}/${y}`;
  if (fmt === "YYYY-MM-DD") return `${y}-${pad2(m)}-${pad2(d)}`;
  return `${pad2(m)}/${pad2(d)}/${y}`;
}

export function pad(value: number | string): string {
  return String(value).padStart(2, "0");
}

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[char];
  });
}

export function hhmmTo12(hhmm: string): string {
  if (!hhmm) return "8:00 AM";
  const [hStr, mStr] = hhmm.split(":");
  let h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)} ${ampm}`;
}

export function time12To24(time12: string): string {
  const parts = time12.trim().split(" ");
  if (parts.length < 2) return time12;
  const [hStr, mStr] = parts[0].split(":");
  let h = Number(hStr);
  const m = Number(mStr);
  const ampm = parts[1].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${pad(h)}:${pad(m)}`;
}

export function hourLabel(hour: number, hour24: boolean): string {
  if (hour24) return `${pad(hour)}:00`;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

export function clockLabel(minutes: number, hour24: boolean, withSuffix = true): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  if (hour24) return `${pad(hour)}:${pad(minute)}`;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  const body = minute === 0 ? `${display}` : `${display}:${pad(minute)}`;
  return withSuffix ? `${body}${suffix}` : body;
}

export function rangeLabel(startMinutes: number, endMinutes: number, prefs: Prefs): string {
  if (prefs.hour24) return `${clockLabel(startMinutes, true)} – ${clockLabel(endMinutes, true)}`;
  const sameHalf = Math.floor(startMinutes / 60) < 12 === Math.floor(endMinutes / 60) < 12;
  return `${clockLabel(startMinutes, false, !sameHalf)} – ${clockLabel(endMinutes, false)}`;
}

export function formatDurationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return h === 1 ? "1 hr" : `${h} hrs`;
  return `${h} hr ${m} min`;
}

const CAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDatePill(dateStr: string, timezone?: string): string {
  if (!dateStr) return "Today";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const todayStr = timezone ? todayKey(timezone) : isoDateLocal(new Date());
  if (dateStr === todayStr) return "Today";
  const tomorrowStr = timezone ? addDayKey(todayStr, 1) : isoDateLocal(addDaysLocal(new Date(), 1));
  if (dateStr === tomorrowStr) return "Tomorrow";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
  return `${dow}, ${CAL_MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}

function isoDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysLocal(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function formatRepeatLabel(val: string): string {
  if (!val || val === "none") return "Does not repeat";
  const map: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    weekdays: "Every weekday (M-F)",
    monthly: "Monthly",
    yearly: "Yearly",
  };
  if (map[val]) return map[val];
  if (val.startsWith("custom:")) {
    const parts = val.split(":");
    const interval = parts[1] || "1";
    const unit = parts[2] || "week";
    const daysStr = parts[3] || "";
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let dayLabel = "";
    if (daysStr && unit === "week") {
      const days = daysStr.split(",").filter((x) => x.length > 0).map(Number);
      if (days.length > 0) dayLabel = ` on ${days.map((d) => dayNames[d]).join(", ")}`;
    }
    const unitLabel = Number(interval) > 1 ? `${unit}s` : unit;
    return `Repeats every ${interval} ${unitLabel}${dayLabel}`;
  }
  return val;
}

export function formatPriorityInfo(prio: number): { label: string; color: string } {
  if (prio === 1) return { label: "Do ASAP", color: "#ef4444" };
  if (prio === 2) return { label: "High", color: "#eab308" };
  if (prio === 4) return { label: "Low", color: "#60a5fa" };
  return { label: "Normal priority", color: "#9ca3af" };
}
