export const WORKLOAD_OPTIONS = ["Balanced", "Front-load", "Close to deadline"] as const;
export const AUTO_CUTOFF_OPTIONS = ["1 week", "2 weeks", "3 weeks", "4 weeks", "6 weeks", "8 weeks"] as const;
export const BUFFER_DAYS_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
export const DATE_FORMAT_OPTIONS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMM D, YYYY"] as const;
export const DEFAULT_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
export const MIN_SPLIT_OPTIONS = [5, 10, 15, 30, 45, 60] as const;
export const BUFFER_MINUTES_OPTIONS = [0, 5, 10, 15, 20, 30] as const;

export type SettingsPaneId =
  | "general"
  | "appearance"
  | "account"
  | "users"
  | "calendars"
  | "integrations"
  | "lists"
  | "events-tasks"
  | "hours"
  | "app";

export const SETTINGS_PANES: { id: SettingsPaneId; label: string; adminOnly?: boolean }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "users", label: "Users", adminOnly: true },
  { id: "calendars", label: "Calendars" },
  { id: "integrations", label: "Integrations" },
  { id: "lists", label: "Lists" },
  { id: "events-tasks", label: "Events and tasks" },
  { id: "hours", label: "Scheduling hours" },
  { id: "app", label: "Android app" },
];
