import { createApiClient } from "@flowforge/api-client";
import type { Settings, Task, TimelineItem, TimelineResponse } from "@flowforge/api-client";

const TOKEN_KEY = "flowforge.authToken";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = createApiClient(() => "", getAuthToken);

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export type { Settings, Task, TimelineItem, TimelineResponse };
