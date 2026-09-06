import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ThemeName } from "../theme";

const SERVER_URL_KEY = "flowforge.serverUrl";
const THEME_KEY = "flowforge.theme";
const TOKEN_KEY = "flowforge.authToken";

/**
 * Intentionally empty: the app ships with no server baked in, so the first
 * launch asks for a host URL. Never hardcode a personal or private host here —
 * this file is part of the public export.
 */
const DEFAULT_SERVER_URL = "";

export async function getServerUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(SERVER_URL_KEY);
  if (stored && stored.trim().length > 0) {
    return stored.replace(/\/+$/, "");
  }
  return DEFAULT_SERVER_URL;
}

export async function hasServerUrl(): Promise<boolean> {
  return (await getServerUrl()).length > 0;
}

export async function setServerUrl(url: string): Promise<string> {
  const normalized = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
  return normalized;
}

export async function getAuthToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(TOKEN_KEY);
  return stored && stored.length > 0 ? stored : null;
}

export async function setAuthToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export async function getTheme(): Promise<ThemeName> {
  const stored = await AsyncStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "system") return stored;
  return "dark";
}

export async function setTheme(theme: ThemeName): Promise<ThemeName> {
  const next = theme === "light" || theme === "system" ? theme : "dark";
  await AsyncStorage.setItem(THEME_KEY, next);
  return next;
}

export { DEFAULT_SERVER_URL };
