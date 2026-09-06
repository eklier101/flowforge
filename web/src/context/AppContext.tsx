import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type {
  AppInfo,
  Calendar,
  GoogleCalendarItem,
  GoogleStatus,
  SchedulingPreset,
  Settings,
  Task,
  TaskList,
  TimelineItem,
} from "@flowforge/api-client";

import { api } from "../api";
import {
  buildEditEventState,
  buildEditTaskState,
  buildOpenComposerState,
  createDefaultComposerState,
  type ComposerState,
} from "../components/composer/composerState";
import { defaultPrefs, PREF_KEY, THEME_KEY, type Prefs, type ViewId } from "../lib/constants";
import { setDateFormat } from "../lib/format";
import { clearLocalReminders, syncWebNotifications } from "../lib/notifications";

export type SettingsPane =
  | "general"
  | "account"
  | "users"
  | "calendars"
  | "integrations"
  | "lists"
  | "events-tasks"
  | "hours"
  | "appearance"
  | "app";

export type GoogleAccountCalendars = {
  accountId: number;
  email: string;
  calendars: GoogleCalendarItem[];
};

type ToastKind = "ok" | "error";

export type ToastAction = { label: string; onClick: () => void };

type ToastMessage = { message: string; kind: ToastKind; action?: ToastAction };

type AppContextValue = {
  settingsOpen: boolean;
  openSettings: (pane?: SettingsPane) => Promise<void>;
  closeSettings: () => void;
  settingsPane: SettingsPane;
  setSettingsPane: (pane: SettingsPane) => void;
  settings: Settings | null;
  updateSettings: (payload: Partial<Settings>) => Promise<Settings>;
  lists: TaskList[];
  calendars: Calendar[];
  schedulingPresets: SchedulingPreset[];
  googleStatus: GoogleStatus | null;
  googleAccountCalendars: GoogleAccountCalendars[];
  appInfo: AppInfo | null;
  loadSettingsData: () => Promise<void>;
  loadLists: () => Promise<void>;
  loadCalendars: () => Promise<void>;
  loadSchedulingPresets: () => Promise<void>;
  loadGoogleData: () => Promise<void>;
  toast: (message: string, kind?: ToastKind, action?: ToastAction) => void;
  syncAfterMutation: () => Promise<void>;
  timezone: string;
  setTimezone: (tz: string) => void;
  prefs: Prefs;
  applyTheme: (choice: string) => void;
  themeChoice: string;
  addAccountOpen: boolean;
  openAddAccountModal: () => void;
  closeAddAccountModal: () => void;
  bulkImportOpen: boolean;
  bulkImportListId: number | null;
  openBulkImportModal: (listId?: number | null) => void;
  closeBulkImportModal: () => void;
  registerRefreshSchedule: (fn: () => Promise<void>) => void;
  refreshScheduleData: () => Promise<void>;
  toastMessage: ToastMessage | null;
  composerOpen: boolean;
  composerState: ComposerState;
  setComposerState: Dispatch<SetStateAction<ComposerState>>;
  closeComposer: () => void;
  openComposer: (kind?: "task" | "event", dateKey?: string, hour?: number, listId?: number | null) => void;
  openEditTask: (task: Task) => void;
  openEditEvent: (item: TimelineItem) => void;
  tasks: Task[];
  loadTasks: () => Promise<void>;
  view: ViewId;
  setView: (view: ViewId) => void;
  query: string;
  setQuery: (q: string) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  updatePrefs: (patch: Partial<Prefs>) => void;
  scheduled: Set<number>;
  setScheduled: Dispatch<SetStateAction<Set<number>>>;
  items: TimelineItem[];
  setItems: Dispatch<SetStateAction<TimelineItem[]>>;
  bootReady: boolean;
  editingList: TaskList | null | undefined;
  openEditListModal: (list: TaskList | null) => void;
  closeEditListModal: () => void;
  navigateToView: (id: ViewId) => Promise<void>;
  openAddCalendarFlow: () => Promise<void>;
  openAddListFlow: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return defaultPrefs();
    return { ...defaultPrefs(), ...JSON.parse(raw) as Partial<Prefs> };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(prefs: Prefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [schedulingPresets, setSchedulingPresets] = useState<SchedulingPreset[]>([]);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [googleAccountCalendars, setGoogleAccountCalendars] = useState<GoogleAccountCalendars[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [timezone, setTimezone] = useState("America/New_York");
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [themeChoice, setThemeChoice] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportListId, setBulkImportListId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const refreshScheduleRef = useRef<() => Promise<void>>(async () => {});
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerState, setComposerState] = useState<ComposerState>(createDefaultComposerState);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<ViewId>("schedule");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(() => localStorage.getItem("sidebar_collapsed") === "true");
  const setCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      localStorage.setItem("sidebar_collapsed", next ? "true" : "false");
      return next;
    });
  }, []);
  const [scheduled, setScheduled] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [bootReady, setBootReady] = useState(false);
  const [editingList, setEditingList] = useState<TaskList | null | undefined>(undefined);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const applyTheme = useCallback((choice: string) => {
    localStorage.setItem(THEME_KEY, choice);
    setThemeChoice(choice);
    const resolved =
      choice === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : choice;
    document.documentElement.dataset.theme = resolved;
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "ok", action?: ToastAction) => {
    setToastMessage({ message, kind, action });
    window.setTimeout(() => setToastMessage(null), action ? 5000 : 3200);
  }, []);

  const registerRefreshSchedule = useCallback((fn: () => Promise<void>) => {
    refreshScheduleRef.current = fn;
  }, []);

  const refreshScheduleData = useCallback(async () => {
    await refreshScheduleRef.current();
  }, []);

  const refreshReminders = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      await clearLocalReminders();
      return;
    }
    try {
      const dateKey = new Date().toISOString().slice(0, 10);
      const [schedule, alerts] = await Promise.all([
        api.getSchedule(dateKey, 2),
        api.getDeadlineAlerts(),
      ]);
      const blocks = (schedule.items || [])
        .filter((it) => it.kind === "task" || it.kind === "event")
        .map((it) => ({
          id: it.task_id ?? it.event_id ?? it.start,
          title: it.title,
          start: it.start,
        }));
      await syncWebNotifications(true, {
        blocks,
        deadlineAlerts: alerts.tasks.map((a) => ({
          task_id: a.task_id,
          title: a.title || `Task #${a.task_id}`,
          status: a.status,
        })),
      });
    } catch {
      // ignore
    }
  }, []);

  const loadLists = useCallback(async () => {
    try {
      setLists(await api.listTaskLists());
    } catch {
      setLists([]);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.listTasks());
    } catch {
      setTasks([]);
    }
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      setCalendars(await api.listCalendars());
    } catch {
      setCalendars([]);
    }
  }, []);

  const loadSchedulingPresets = useCallback(async () => {
    try {
      setSchedulingPresets(await api.listSchedulingPresets());
    } catch {
      setSchedulingPresets([]);
    }
  }, []);

  const loadGoogleData = useCallback(async () => {
    try {
      const status = await api.getGoogleStatus();
      setGoogleStatus(status);
      if (!status.configured || !status.accounts.length) {
        setGoogleAccountCalendars([]);
        return;
      }
      const rows: GoogleAccountCalendars[] = await Promise.all(
        status.accounts.map(async (account) => {
          const cals = await api.getGoogleCalendars(account.id).catch(() => []);
          return { accountId: account.id, email: account.email, calendars: cals };
        }),
      );
      setGoogleAccountCalendars(rows);
    } catch {
      setGoogleStatus(null);
      setGoogleAccountCalendars([]);
    }
  }, []);

  const loadSettingsData = useCallback(async () => {
    const nextSettings = await api.getSettings();
    setSettings(nextSettings);
    setTimezone(nextSettings.timezone);
    if (nextSettings.start_week_on !== undefined) {
      setPrefs((p) => {
        const next = { ...p, weekStart: nextSettings.start_week_on! };
        savePrefs(next);
        return next;
      });
    }
    if (nextSettings.use_24_hour_time !== undefined) {
      setPrefs((p) => {
        const next = { ...p, hour24: nextSettings.use_24_hour_time! };
        savePrefs(next);
        return next;
      });
    }
    if (nextSettings.show_completed_tasks !== undefined) {
      setPrefs((p) => {
        const next = { ...p, showCompleted: nextSettings.show_completed_tasks! };
        savePrefs(next);
        return next;
      });
    }
    await loadSchedulingPresets();
    await loadCalendars();
    await loadGoogleData();
    await loadLists();
    try {
      setAppInfo(await api.getAppInfo());
    } catch {
      setAppInfo(null);
    }
  }, [loadCalendars, loadGoogleData, loadLists, loadSchedulingPresets]);

  const updateSettings = useCallback(async (payload: Partial<Settings>) => {
    const next = await api.updateSettings(payload);
    setSettings(next);
    if (payload.timezone) setTimezone(next.timezone);
    if (payload.start_week_on !== undefined) {
      setPrefs((p) => {
        const updated = { ...p, weekStart: next.start_week_on! };
        savePrefs(updated);
        return updated;
      });
    }
    if (payload.use_24_hour_time !== undefined) {
      setPrefs((p) => {
        const updated = { ...p, hour24: next.use_24_hour_time! };
        savePrefs(updated);
        return updated;
      });
    }
    if (payload.show_completed_tasks !== undefined) {
      setPrefs((p) => {
        const updated = { ...p, showCompleted: next.show_completed_tasks! };
        savePrefs(updated);
        return updated;
      });
    }
    if (payload.push_notifications !== undefined) {
      void refreshReminders(Boolean(next.push_notifications));
    }
    return next;
  }, [refreshReminders]);

  const syncAfterMutation = useCallback(async () => {
    await refreshScheduleData();
    window.dispatchEvent(new CustomEvent("flowforge:schedule-updated"));
    if (settings?.push_notifications) {
      void refreshReminders(true);
    }
  }, [refreshScheduleData, refreshReminders, settings?.push_notifications]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setComposerState(createDefaultComposerState());
  }, []);

  const openComposer = useCallback(
    (kind: "task" | "event" = "task", dateKey?: string, hour?: number, listId?: number | null) => {
      setComposerState(
        buildOpenComposerState(kind, dateKey, hour, lists, calendars, schedulingPresets, settings, listId),
      );
      setComposerOpen(true);
    },
    [lists, calendars, schedulingPresets, settings],
  );

  const openEditTask = useCallback(
    (task: Task) => {
      setComposerState(buildEditTaskState(task, lists, schedulingPresets, timezone));
      setComposerOpen(true);
    },
    [lists, schedulingPresets, timezone],
  );

  const openEditEvent = useCallback(
    async (item: TimelineItem) => {
      const base = buildEditEventState(item, timezone);
      if (item.event_id) {
        try {
          const ev = await api.getEvent(item.event_id);
          const cal = calendars.find((c) => c.id === ev.calendar_id) ?? calendars[0];
          setComposerState({
            ...base,
            eventNotes: ev.notes || "",
            eventLocation: ev.location || "",
            isBusy: ev.is_busy !== false,
            eventRepeat: ev.recurrence || "none",
            eventCalendarId: ev.calendar_id ?? cal?.id ?? null,
            eventCalendarName: cal?.name ?? "Personal",
            eventCalendarColor: cal?.color || "#5cc98d",
            eventColor: ev.color || item.color || "",
          });
          setComposerOpen(true);
          return;
        } catch {
          /* fall through with timeline data */
        }
      }
      const cal = calendars[0];
      setComposerState({
        ...base,
        eventCalendarId: item.calendar_id ?? cal?.id ?? null,
        eventCalendarName: item.calendar_summary || cal?.name || "Personal",
        eventCalendarColor: cal?.color || "#5cc98d",
      });
      setComposerOpen(true);
    },
    [timezone, calendars],
  );

  const openSettings = useCallback(async (pane?: SettingsPane) => {
    applyTheme(localStorage.getItem(THEME_KEY) || "dark");
    if (pane) setSettingsPane(pane);
    setSettingsOpen(true);
    try {
      await loadSettingsData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load settings", "error");
    }
  }, [applyTheme, loadSettingsData, toast]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const openAddAccountModal = useCallback(() => setAddAccountOpen(true), []);
  const closeAddAccountModal = useCallback(() => setAddAccountOpen(false), []);

  const openBulkImportModal = useCallback((listId?: number | null) => {
    setBulkImportListId(listId ?? null);
    setBulkImportOpen(true);
  }, []);

  const closeBulkImportModal = useCallback(() => {
    setBulkImportOpen(false);
    setBulkImportListId(null);
  }, []);

  const openEditListModal = useCallback((list: TaskList | null) => {
    setEditingList(list);
  }, []);

  const closeEditListModal = useCallback(() => {
    setEditingList(undefined);
  }, []);

  const navigateToView = useCallback(
    async (id: ViewId) => {
      setView(id);
      if (id.startsWith("list-") || id.startsWith("calendar-")) {
        await refreshScheduleData();
      }
    },
    [refreshScheduleData],
  );

  useEffect(() => {
    if (themeChoice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      document.documentElement.dataset.theme = mq.matches ? "light" : "dark";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeChoice]);

  const openAddListFlow = useCallback(async () => {
    await openSettings("lists");
    setEditingList(null);
  }, [openSettings]);

  const openAddCalendarFlow = useCallback(async () => {
    await openSettings("calendars");
    setAddAccountOpen(true);
  }, [openSettings]);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          loadTasks(),
          loadLists(),
          loadCalendars(),
          loadSchedulingPresets(),
          api.getSettings()
            .then((s) => {
              setSettings(s);
              setTimezone(s.timezone);
              if (s.start_week_on !== undefined) {
                setPrefs((p) => {
                  const next = { ...p, weekStart: s.start_week_on! };
                  savePrefs(next);
                  return next;
                });
              }
              if (s.use_24_hour_time !== undefined) {
                setPrefs((p) => {
                  const next = { ...p, hour24: s.use_24_hour_time! };
                  savePrefs(next);
                  return next;
                });
              }
              if (s.show_completed_tasks !== undefined) {
                setPrefs((p) => {
                  const next = { ...p, showCompleted: s.show_completed_tasks! };
                  savePrefs(next);
                  return next;
                });
              }
              if (s.date_format) {
                setDateFormat(s.date_format);
              }
              if (s.push_notifications) {
                void refreshReminders(true);
              }
            }),
        ]);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to load settings", "error");
      } finally {
        setBootReady(true);
      }
      api.getAppInfo().then(setAppInfo).catch(() => setAppInfo(null));
    })();
  }, [loadTasks, loadLists, loadCalendars, loadSchedulingPresets, toast, refreshReminders]);

  const value = useMemo<AppContextValue>(
    () => ({
      settingsOpen,
      openSettings,
      closeSettings,
      settingsPane,
      setSettingsPane,
      settings,
      updateSettings,
      lists,
      calendars,
      schedulingPresets,
      googleStatus,
      googleAccountCalendars,
      appInfo,
      loadSettingsData,
      loadLists,
      loadCalendars,
      loadSchedulingPresets,
      loadGoogleData,
      toast,
      syncAfterMutation,
      timezone,
      setTimezone,
      prefs,
      applyTheme,
      themeChoice,
      addAccountOpen,
      openAddAccountModal,
      closeAddAccountModal,
      bulkImportOpen,
      bulkImportListId,
      openBulkImportModal,
      closeBulkImportModal,
      registerRefreshSchedule,
      refreshScheduleData,
      composerOpen,
      composerState,
      setComposerState,
      closeComposer,
      openComposer,
      openEditTask,
      openEditEvent,
      tasks,
      loadTasks,
      view,
      setView,
      query,
      setQuery,
      searchOpen,
      setSearchOpen,
      collapsed,
      setCollapsed,
      updatePrefs,
      scheduled,
      setScheduled,
      items,
      setItems,
      toastMessage,
      bootReady,
      editingList,
      openEditListModal,
      closeEditListModal,
      navigateToView,
      openAddCalendarFlow,
      openAddListFlow,
    }),
    [
      settingsOpen,
      openSettings,
      closeSettings,
      settingsPane,
      settings,
      updateSettings,
      lists,
      calendars,
      schedulingPresets,
      googleStatus,
      googleAccountCalendars,
      appInfo,
      loadSettingsData,
      loadLists,
      loadCalendars,
      loadSchedulingPresets,
      loadGoogleData,
      toast,
      syncAfterMutation,
      timezone,
      setTimezone,
      prefs,
      applyTheme,
      themeChoice,
      addAccountOpen,
      openAddAccountModal,
      closeAddAccountModal,
      bulkImportOpen,
      bulkImportListId,
      openBulkImportModal,
      closeBulkImportModal,
      registerRefreshSchedule,
      refreshScheduleData,
      composerOpen,
      composerState,
      closeComposer,
      openComposer,
      openEditTask,
      openEditEvent,
      tasks,
      loadTasks,
      view,
      query,
      searchOpen,
      collapsed,
      updatePrefs,
      scheduled,
      items,
      toastMessage,
      bootReady,
      editingList,
      openEditListModal,
      closeEditListModal,
      navigateToView,
      openAddCalendarFlow,
      openAddListFlow,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
