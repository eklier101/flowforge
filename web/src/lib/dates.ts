import { pad } from "./format";

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfWeek(date: Date, weekStartsOn: number): Date {
  const copy = startOfDay(date);
  const shift = (copy.getDay() - weekStartsOn + 7) % 7;
  return addDays(copy, -shift);
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function tzOffset(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - ts;
}

export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let ts = naive - tzOffset(naive, timeZone);
  ts = naive - tzOffset(ts, timeZone);
  return new Date(ts);
}

export function localValueToUtcISO(value: string, timeZone: string): string {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  return zonedToUtc(y, m, d, h, mi, timeZone).toISOString();
}

export function toLocalParts(iso: string, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function todayKey(timeZone: string): string {
  return toLocalParts(new Date().toISOString(), timeZone).date;
}

export function nowMinutes(timeZone: string): number {
  return toLocalParts(new Date().toISOString(), timeZone).minutes;
}

export function rangeDays(range: string): number {
  return range === "week" ? 7 : Number(range);
}

export function visibleDays(anchor: Date, prefs: { range: string; weekStart: number }): Date[] {
  const start = prefs.range === "week" ? startOfWeek(anchor, prefs.weekStart) : startOfDay(anchor);
  return Array.from({ length: rangeDays(prefs.range) }, (_, i) => addDays(start, i));
}
