/** Local browser notifications for upcoming blocks and deadline-close tasks. */

type ReminderItem = {
  id: string;
  title: string;
  body: string;
  at: number;
};

const STORAGE_KEY = "flowforge.localReminders";
let timer: ReturnType<typeof setTimeout> | null = null;

async function ensurePermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function loadQueue(): ReminderItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReminderItem[];
  } catch {
    return [];
  }
}

function saveQueue(items: ReminderItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function armTimer() {
  if (timer) clearTimeout(timer);
  const queue = loadQueue().filter((r) => r.at > Date.now());
  saveQueue(queue);
  if (queue.length === 0) return;
  queue.sort((a, b) => a.at - b.at);
  const next = queue[0];
  const delay = Math.max(500, Math.min(next.at - Date.now(), 60_000));
  timer = setTimeout(() => {
    void flushDue();
  }, delay);
}

async function flushDue() {
  const now = Date.now();
  const queue = loadQueue();
  const due = queue.filter((r) => r.at <= now);
  const rest = queue.filter((r) => r.at > now);
  saveQueue(rest);
  for (const item of due) {
    try {
      new Notification(item.title, { body: item.body, tag: item.id });
    } catch {
      // ignore
    }
  }
  armTimer();
}

export async function clearLocalReminders() {
  saveQueue([]);
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function syncWebNotifications(enabled: boolean, opts?: {
  blocks?: { id?: number | string; title?: string; start?: string }[];
  deadlineAlerts?: { task_id: number; title: string; status: string }[];
}): Promise<void> {
  await clearLocalReminders();
  if (!enabled) return;
  if (!(await ensurePermission())) return;

  const now = Date.now();
  const horizon = now + 24 * 60 * 60 * 1000;
  const reminders: ReminderItem[] = [];

  for (const block of opts?.blocks || []) {
    if (!block.start) continue;
    const start = new Date(block.start).getTime();
    const at = start - 15 * 60 * 1000;
    if (at <= now || at > horizon) continue;
    reminders.push({
      id: `block-${block.id ?? block.start}`,
      title: "Upcoming block",
      body: block.title || "Scheduled work starting soon",
      at,
    });
  }

  for (const alert of opts?.deadlineAlerts || []) {
    reminders.push({
      id: `deadline-${alert.task_id}-${alert.status}`,
      title: alert.status === "will_miss" ? "Deadline at risk" : "Deadline approaching",
      body: alert.title,
      at: now + 3_000,
    });
  }

  saveQueue(reminders);
  armTimer();
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "flowforge-reminders", reminders });
  }
}
