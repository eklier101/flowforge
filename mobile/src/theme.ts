export type ThemeName = "dark" | "light" | "system";

export type Colors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  mutedBg: string;
  inputBg: string;
  line: string;
  lineSoft: string;
  text: string;
  textSecondary: string;
  muted: string;
  accent: string;
  accentDeep: string;
  accentLight: string;
  danger: string;
  dangerLight: string;
  onAccent: string;
  overlay: string;
  task: string;
  taskFill: string;
  taskDot: string;
  event: string;
  eventFill: string;
  eventLine: string;
  busy: string;
  busyFill: string;
  now: string;
  ok: string;
  okLight: string;
  warning: string;
  warningLight: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
};

export const palettes: Record<"dark" | "light", Colors> = {
  dark: {
    bg: "#121214",
    surface: "#1a1a1e",
    surfaceRaised: "#222228",
    mutedBg: "#282830",
    inputBg: "#1f1f25",
    line: "#2c2c36",
    lineSoft: "#23232b",
    text: "#f4f4f6",
    textSecondary: "#b3b3bd",
    muted: "#7e7e8d",
    accent: "#3b82f6",
    accentDeep: "#2563eb",
    accentLight: "rgba(59, 130, 246, 0.15)",
    danger: "#ef4444",
    dangerLight: "rgba(239, 68, 68, 0.15)",
    onAccent: "#ffffff",
    overlay: "rgba(0,0,0,0.65)",
    task: "#f4f4f6",
    taskFill: "#23232b",
    taskDot: "#10b981",
    event: "#93c5fd",
    eventFill: "#1e3a5f",
    eventLine: "#3b82f6",
    busy: "#a1a1aa",
    busyFill: "#27272a",
    now: "#ef4444",
    ok: "#10b981",
    okLight: "rgba(16, 185, 129, 0.15)",
    warning: "#f59e0b",
    warningLight: "rgba(245, 158, 11, 0.15)",
    p1: "#ef4444",
    p2: "#f97316",
    p3: "#3b82f6",
    p4: "#8b5cf6",
  },
  light: {
    bg: "#f8fafc",
    surface: "#ffffff",
    surfaceRaised: "#f1f5f9",
    mutedBg: "#f1f5f9",
    inputBg: "#f8fafc",
    line: "#e2e8f0",
    lineSoft: "#f1f5f9",
    text: "#0f172a",
    textSecondary: "#475569",
    muted: "#64748b",
    accent: "#3b82f6",
    accentDeep: "#2563eb",
    accentLight: "rgba(59, 130, 246, 0.12)",
    danger: "#ef4444",
    dangerLight: "rgba(239, 68, 68, 0.12)",
    onAccent: "#ffffff",
    overlay: "rgba(15, 23, 42, 0.45)",
    task: "#0f172a",
    taskFill: "#f8fafc",
    taskDot: "#10b981",
    event: "#1e40af",
    eventFill: "#dbeafe",
    eventLine: "#60a5fa",
    busy: "#475569",
    busyFill: "#f1f5f9",
    now: "#ef4444",
    ok: "#10b981",
    okLight: "rgba(16, 185, 129, 0.12)",
    warning: "#f59e0b",
    warningLight: "rgba(245, 158, 11, 0.12)",
    p1: "#ef4444",
    p2: "#f97316",
    p3: "#3b82f6",
    p4: "#8b5cf6",
  },
};

export const colors = palettes.dark;
