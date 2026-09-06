/**
 * Local task/event reminders via expo-notifications (no FCM / push tokens).
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getDeadlineAlerts, getSchedule, getSettings } from "../api/client";

const CHANNEL_ID = "flowforge-reminders";
const LEAD_MINUTES_DEFAULT = 15;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channelReady = false;

export function notificationChannelSetup(): void {
  void ensureChannel();
}

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task & event reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  channelReady = true;
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function syncLocalNotifications(enabled: boolean): Promise<void> {
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return;
  if (!(await ensurePermission())) return;

  const leadMinutes = LEAD_MINUTES_DEFAULT;
  try {
    const settings = await getSettings();
    if (!settings.push_notifications) return;
  } catch {
    // continue with defaults when settings are unreachable
  }

  const now = Date.now();
  const horizonMs = 24 * 60 * 60 * 1000;
  const dateStr = new Date().toISOString().slice(0, 10);

  try {
    const schedule = await getSchedule(dateStr, 2);
    for (const item of schedule.items || []) {
      if (!item.start) continue;
      const startMs = new Date(item.start).getTime();
      const fireAt = startMs - leadMinutes * 60 * 1000;
      if (fireAt <= now || fireAt > now + horizonMs) continue;
      const kind = item.kind === "event" || item.kind === "busy" ? "Event" : "Task";
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${kind} starting soon`,
          body: item.title || "Upcoming item",
          sound: true,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
        trigger: {
          type: "date",
          date: new Date(fireAt),
          channelId: Platform.OS === "android" ? CHANNEL_ID : undefined,
        } as Notifications.NotificationTriggerInput,
      });
    }
  } catch {
    // schedule fetch optional
  }

  try {
    const alerts = await getDeadlineAlerts();
    for (const alert of alerts.tasks || []) {
      if (alert.status !== "overdue" && alert.status !== "will_miss") continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alert.status === "overdue" ? "Past deadline" : "Deadline at risk",
          body: alert.title,
          sound: true,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
        trigger: {
          type: "timeInterval",
          seconds: 3,
          channelId: Platform.OS === "android" ? CHANNEL_ID : undefined,
        } as Notifications.NotificationTriggerInput,
      });
    }
  } catch {
    // alerts optional
  }
}

export async function refreshNotificationsFromSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    await syncLocalNotifications(Boolean(settings.push_notifications));
  } catch {
    await syncLocalNotifications(false);
  }
}
