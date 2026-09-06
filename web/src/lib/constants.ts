export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
export const SUNDAY_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const HOUR_H = 52;
export const PREF_KEY = "flowforge.prefs";
export const THEME_KEY = "flowforge.theme";

export const CAL_COLORS = [
  "#5cc98d", "#10b981", "#4ade80", "#84cc16", "#14b8a6", "#06b6d4", "#38bdf8", "#5b9bff",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#ec4899", "#f472b6", "#f43f5e",
  "#ef4444", "#f97316", "#f59e0b", "#facc15", "#94a3b8",
];

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney",
];

export const ALL_15MIN_TIMES: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    ALL_15MIN_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

export type ViewId = "schedule" | "inbox" | "all" | "completed" | `list-${number}` | `calendar-${number}`;

export type Prefs = {
  hour24: boolean;
  showCompleted: boolean;
  weekStart: number;
  range: string;
};

export const defaultPrefs = (): Prefs => ({
  hour24: false,
  showCompleted: false,
  weekStart: 0,
  range: "3",
});
