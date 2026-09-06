import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  Calendar as CalIcon,
  Check,
  ChevronRight,
  Clock,
  Download,
  Dumbbell,
  ExternalLink,
  Layers,
  Link as LinkIcon,
  List as ListIcon,
  Moon,
  Plus,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  Shield,
  Sliders,
  Sun,
  Trash2,
  User,
  Wifi,
  X,
  Zap,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createCalendar,
  createTaskList,
  createUser,
  deleteCalendar,
  deleteTaskList,
  deleteUser,
  disconnectGoogleAccount,
  getAppInfo,
  getGoogleCalendars,
  getGoogleStatus,
  getSettings,
  googleAuthStartUrl,
  linkGoogleCalendar,
  listCalendars,
  listSchedulingPresets,
  listTaskLists,
  listUsers,
  listWorkingHours,
  logout as apiLogout,
  me,
  replaceWorkingHours,
  resetAccount,
  resetUserPassword,
  triggerSyncTasks,
  updateCalendar,
  updateSettings,
  updateTaskList,
  updateUser,
  AUTO_CUTOFF_OPTIONS,
  BUFFER_DAYS_OPTIONS,
  BUFFER_MINUTES_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DEFAULT_DURATION_OPTIONS,
  MIN_SPLIT_OPTIONS,
  WORKLOAD_OPTIONS,
  type AppInfo,
  type AuthUser,
  type Calendar,
  type GoogleAccount,
  type GoogleCalendarItem,
  type SchedulingPreset,
  type Settings,
  type TaskList,
  type WorkingHours,
} from "../api/client";
import { notifyHabitsComplete, isHabitsAppInstalled } from "../habitsLink";
import {
  checkServerUpdate,
  downloadAndInstallNow,
  downloadApkUpdate,
  installCachedApk,
  maybeAutoDownloadOnWifi,
  readCachedApk,
  type CachedApk,
} from "../services/appUpdate";
import { useTheme } from "../ThemeProvider";
import type { Colors, ThemeName } from "../theme";
import { DEFAULT_SERVER_URL, getAuthToken, getServerUrl, setAuthToken, setServerUrl } from "../utils/storage";
import { syncLocalNotifications } from "../services/notifications";
export type SettingsPane =
  | "general"
  | "calendars"
  | "lists"
  | "hours"
  | "events_tasks"
  | "account"
  | "users"
  | "integrations"
  | "updates";

const PANES: { id: SettingsPane; label: string; icon: any }[] = [
  { id: "general", label: "General", icon: Sliders },
  { id: "calendars", label: "Calendars", icon: CalIcon },
  { id: "lists", label: "Lists", icon: ListIcon },
  { id: "hours", label: "Scheduling hours", icon: Clock },
  { id: "events_tasks", label: "Events and tasks", icon: Layers },
  { id: "account", label: "Account", icon: User },
  { id: "users", label: "Users", icon: Shield },
  { id: "integrations", label: "Integrations", icon: LinkIcon },
  { id: "updates", label: "App Updates", icon: Download },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const CAL_PRESET_COLORS = [
  "#5cc98d",
  "#10b981",
  "#4ade80",
  "#84cc16",
  "#14b8a6",
  "#06b6d4",
  "#38bdf8",
  "#5b9bff",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#c084fc",
  "#ec4899",
  "#f472b6",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#facc15",
  "#94a3b8",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** UI Mon-first index → server day_of_week (0=Sunday). */
function uiIndexToServerDay(uiIndex: number): number {
  return (uiIndex + 1) % 7;
}
/** Server day_of_week (0=Sunday) → UI Mon-first index. */
function serverDayToUiIndex(serverDay: number): number {
  return (serverDay + 6) % 7;
}

type DayDraft = {
  enabled: boolean;
  start_time: string;
  end_time: string;
};

function emptyDays(): DayDraft[] {
  return DAYS.map((_, index) => ({
    enabled: index < 5,
    start_time: "09:00",
    end_time: "17:00",
  }));
}

type Props = {
  initialPane?: SettingsPane;
  onClose?: () => void;
};

export function SettingsScreen({ initialPane = "general", onClose }: Props) {
  const { colors, theme, setTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [activePane, setActivePane] = useState<SettingsPane>(initialPane);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [bufferDays, setBufferDays] = useState(1);
  const [autoCutoff, setAutoCutoff] = useState("2 weeks");
  const [workloadDistribution, setWorkloadDistribution] = useState("Balanced");
  const [autoRecalculate, setAutoRecalculate] = useState(true);
  const [lockStartedBlocks, setLockStartedBlocks] = useState(false);
  const [use24Hour, setUse24Hour] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [startWeekOn, setStartWeekOn] = useState(0);
  const [dateFormat, setDateFormat] = useState("MMM D, YYYY");
  const [tzDefaultType, setTzDefaultType] = useState("Floating");
  const [detectTzChanges, setDetectTzChanges] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [days, setDays] = useState<DayDraft[]>(emptyDays);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [accountCalendarsMap, setAccountCalendarsMap] = useState<Record<number, GoogleCalendarItem[]>>({});
  const [syncTasksCalId, setSyncTasksCalId] = useState<number | null>(null);

  const [schedulingPresets, setSchedulingPresets] = useState<SchedulingPreset[]>([]);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);

  // Events & Tasks defaults
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [defaultSplittable, setDefaultSplittable] = useState(true);
  const [defaultMinSplit, setDefaultMinSplit] = useState(10);
  const [defaultBufferBefore, setDefaultBufferBefore] = useState(0);
  const [defaultBufferAfter, setDefaultBufferAfter] = useState(0);
  const [defaultMoreOptions, setDefaultMoreOptions] = useState(false);
  const [defaultTaskListId, setDefaultTaskListId] = useState<number | null>(null);
  const [defaultEventCalId, setDefaultEventCalId] = useState<number | null>(null);

  // Modals
  const [listModalVisible, setListModalVisible] = useState(false);
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [listName, setListName] = useState("");
  const [listColor, setListColor] = useState(CAL_PRESET_COLORS[0]);

  const [addAccountModal, setAddAccountModal] = useState(false);
  const [addAccountMode, setAddAccountMode] = useState<"menu" | "internal" | "ical">("menu");
  const [newInternalName, setNewInternalName] = useState("");
  const [newInternalColor, setNewInternalColor] = useState(CAL_PRESET_COLORS[0]);
  const [newIcalName, setNewIcalName] = useState("");
  const [newIcalUrl, setNewIcalUrl] = useState("");

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserAdmin, setNewUserAdmin] = useState(false);

  // App updates
  const [updateInfo, setUpdateInfo] = useState<{
    installedVersion: string;
    installedCode: number;
    serverVersion: string | null;
    serverCode: number | null;
    updateAvailable: boolean;
    readyToInstall: boolean;
    cached: CachedApk | null;
    onWifi: boolean;
  } | null>(null);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const loadUpdateStatus = useCallback(async () => {
    await maybeAutoDownloadOnWifi();
    const snapshot = await checkServerUpdate();
    setUpdateInfo({
      installedVersion: snapshot.installed.version,
      installedCode: snapshot.installed.versionCode,
      serverVersion: snapshot.info?.version ?? null,
      serverCode: snapshot.info ? Number(snapshot.info.version_code) : null,
      updateAvailable: snapshot.updateAvailable,
      readyToInstall: snapshot.readyToInstall,
      cached: snapshot.cached,
      onWifi: snapshot.onWifi,
    });
  }, []);

  const load = useCallback(async () => {
    setErrorMessage(null);
    const stored = await getServerUrl();
    setServerUrlState(stored);
    try {
      const [settings, hours, feeds, google, fetchedLists, presets] = await Promise.all([
        getSettings(),
        listWorkingHours(),
        listCalendars(),
        getGoogleStatus(),
        listTaskLists(),
        listSchedulingPresets().catch(() => []),
      ]);

      setTimezone(settings.timezone || "America/New_York");
      if (settings.user_name) setUserName(settings.user_name);
      if (settings.user_email) setUserEmail(settings.user_email);
      if (settings.buffer_days !== undefined) setBufferDays(settings.buffer_days);
      if (settings.auto_scheduling_cutoff) setAutoCutoff(settings.auto_scheduling_cutoff);
      if (settings.workload_distribution) setWorkloadDistribution(settings.workload_distribution);
      if (settings.auto_recalculate !== undefined) setAutoRecalculate(settings.auto_recalculate);
      if (settings.lock_started_blocks !== undefined) setLockStartedBlocks(settings.lock_started_blocks);
      if (settings.use_24_hour_time !== undefined) setUse24Hour(settings.use_24_hour_time);
      if (settings.show_completed_tasks !== undefined) setShowCompleted(settings.show_completed_tasks);
      if (settings.start_week_on !== undefined) setStartWeekOn(settings.start_week_on);
      if (settings.date_format) setDateFormat(settings.date_format);
      if (settings.timezone_default_type) setTzDefaultType(settings.timezone_default_type);
      if (settings.detect_timezone_changes !== undefined) setDetectTzChanges(settings.detect_timezone_changes);
      if (settings.push_notifications !== undefined) setPushNotifications(settings.push_notifications);
      setSyncTasksCalId(settings.sync_tasks_calendar_id ?? null);

      if (settings.default_task_duration) setDefaultDuration(settings.default_task_duration);
      if (settings.default_task_splittable !== undefined) setDefaultSplittable(settings.default_task_splittable);
      if (settings.default_task_min_split !== undefined) setDefaultMinSplit(settings.default_task_min_split);
      if (settings.default_task_buffer_before !== undefined) setDefaultBufferBefore(settings.default_task_buffer_before);
      if (settings.default_task_buffer_after !== undefined) setDefaultBufferAfter(settings.default_task_buffer_after);
      if (settings.default_more_options_expanded !== undefined) setDefaultMoreOptions(settings.default_more_options_expanded);
      setDefaultTaskListId(settings.default_task_list_id ?? null);
      setDefaultEventCalId(settings.default_event_calendar_id ?? null);

      void syncLocalNotifications(Boolean(settings.push_notifications));

      setGoogleConfigured(google.configured);
      setGoogleAccounts(google.accounts);
      setTaskLists(fetchedLists);
      setSchedulingPresets(presets);
      setCalendars(feeds);

      try {
        const current = await me();
        setAuthUser(current);
        if (current.is_admin) {
          setAdminUsers(await listUsers());
        } else {
          setAdminUsers([]);
        }
      } catch {
        setAuthUser(null);
        setAdminUsers([]);
      }

      const calMap: Record<number, GoogleCalendarItem[]> = {};
      await Promise.all(
        google.accounts.map(async (acc) => {
          try {
            calMap[acc.id] = await getGoogleCalendars(acc.id);
          } catch {
            calMap[acc.id] = [];
          }
        }),
      );
      setAccountCalendarsMap(calMap);

      const next = emptyDays();
      hours.forEach((row: WorkingHours) => {
        const ui = serverDayToUiIndex(row.day_of_week);
        next[ui] = {
          enabled: true,
          start_time: row.start_time,
          end_time: row.end_time,
        };
      });
      DAYS.forEach((_, index) => {
        const serverDay = uiIndexToServerDay(index);
        if (!hours.some((row) => row.day_of_week === serverDay)) {
          next[index] = { ...next[index], enabled: false };
        }
      });
      setDays(next);

      await loadUpdateStatus();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load settings.");
    }
  }, [loadUpdateStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveGeneral() {
    setErrorMessage(null);
    try {
      await updateSettings({
        timezone: timezone.trim(),
        buffer_days: bufferDays,
        auto_scheduling_cutoff: autoCutoff,
        workload_distribution: workloadDistribution,
        auto_recalculate: autoRecalculate,
        lock_started_blocks: lockStartedBlocks,
        use_24_hour_time: use24Hour,
        show_completed_tasks: showCompleted,
        start_week_on: startWeekOn,
        date_format: dateFormat,
        timezone_default_type: tzDefaultType,
        detect_timezone_changes: detectTzChanges,
        push_notifications: pushNotifications,
      });
      await syncLocalNotifications(pushNotifications);
      showStatus("General settings saved.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function handleConnectServer() {
    setErrorMessage(null);
    try {
      const normalized = await setServerUrl(serverUrl);
      const appInfo = await getAppInfo();
      if (appInfo.public_url && appInfo.public_url !== normalized) {
        await setServerUrl(appInfo.public_url);
        setServerUrlState(appInfo.public_url);
      } else {
        setServerUrlState(normalized);
      }
      showStatus("Connected to server successfully.");
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Connection failed.");
    }
  }

  async function handleSaveHours() {
    setErrorMessage(null);
    try {
      const payload = days
        .map((day, index) =>
          day.enabled
            ? { day_of_week: uiIndexToServerDay(index), start_time: day.start_time, end_time: day.end_time }
            : null,
        )
        .filter((row): row is { day_of_week: number; start_time: string; end_time: string } => row !== null);
      await replaceWorkingHours(payload);
      showStatus("Working hours saved.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save hours.");
    }
  }

  async function handleSaveDefaults() {
    setErrorMessage(null);
    try {
      await updateSettings({
        default_task_duration: defaultDuration,
        default_task_splittable: defaultSplittable,
        default_task_min_split: defaultMinSplit,
        default_task_buffer_before: defaultBufferBefore,
        default_task_buffer_after: defaultBufferAfter,
        default_more_options_expanded: defaultMoreOptions,
        default_task_list_id: defaultTaskListId,
        default_event_calendar_id: defaultEventCalId,
      });
      showStatus("Defaults saved.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save defaults.");
    }
  }

  function showStatus(msg: string) {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  }

  // --- Panes Renderers ---

  function renderGeneralPane() {
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Theme</Text>
          <View style={styles.themeRow}>
            {([
              { id: "system" as ThemeName, label: "System" },
              { id: "dark" as ThemeName, label: "Dark" },
              { id: "light" as ThemeName, label: "Light" },
            ]).map((t) => (
              <Pressable
                key={t.id}
                style={[styles.themeOption, theme === t.id && styles.themeOptionActive]}
                onPress={() => void setTheme(t.id)}
              >
                {t.id === "dark" ? (
                  <Moon size={16} color={theme === t.id ? colors.accent : colors.muted} />
                ) : t.id === "light" ? (
                  <Sun size={16} color={theme === t.id ? colors.accent : colors.muted} />
                ) : (
                  <SettingsIcon size={16} color={theme === t.id ? colors.accent : colors.muted} />
                )}
                <Text style={[styles.themeOptionText, theme === t.id && styles.themeOptionTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scheduling</Text>
          <Text style={styles.rowLabel}>Buffer days before deadline</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {BUFFER_DAYS_OPTIONS.map((n) => (
              <Pressable key={n} style={[styles.chip, bufferDays === n && styles.chipActive]} onPress={() => setBufferDays(n)}>
                <Text style={[styles.chipText, bufferDays === n && styles.chipTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Auto-scheduling cutoff</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {AUTO_CUTOFF_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                style={[styles.chip, autoCutoff === opt && styles.chipActive]}
                onPress={() => setAutoCutoff(opt)}
              >
                <Text style={[styles.chipText, autoCutoff === opt && styles.chipTextActive]}>{opt}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Workload distribution</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {WORKLOAD_OPTIONS.map((mode) => (
              <Pressable
                key={mode}
                style={[styles.chip, workloadDistribution === mode && styles.chipActive]}
                onPress={() => setWorkloadDistribution(mode)}
              >
                <Text style={[styles.chipText, workloadDistribution === mode && styles.chipTextActive]}>{mode}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Auto-recalculate schedule</Text>
            <Switch value={autoRecalculate} onValueChange={setAutoRecalculate} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Lock started blocks</Text>
            <Switch value={lockStartedBlocks} onValueChange={setLockStartedBlocks} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Timezone</Text>
          <Text style={styles.rowLabel}>Default type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {["Floating", "Fixed"].map((t) => (
              <Pressable key={t} style={[styles.chip, tzDefaultType === t && styles.chipActive]} onPress={() => setTzDefaultType(t)}>
                <Text style={[styles.chipText, tzDefaultType === t && styles.chipTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {TIMEZONES.map((tz) => (
              <Pressable key={tz} style={[styles.chip, timezone === tz && styles.chipActive]} onPress={() => setTimezone(tz)}>
                <Text style={[styles.chipText, timezone === tz && styles.chipTextActive]}>{tz.replace(/_/g, " ")}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Detect timezone changes</Text>
            <Switch value={detectTzChanges} onValueChange={setDetectTzChanges} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calendar Preferences</Text>
          <Text style={styles.rowLabel}>Start week on</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {[
              { v: 0, label: "Sunday" },
              { v: 1, label: "Monday" },
              { v: 6, label: "Saturday" },
            ].map((opt) => (
              <Pressable key={opt.v} style={[styles.chip, startWeekOn === opt.v && styles.chipActive]} onPress={() => setStartWeekOn(opt.v)}>
                <Text style={[styles.chipText, startWeekOn === opt.v && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Date format</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {DATE_FORMAT_OPTIONS.map((fmt) => (
              <Pressable key={fmt} style={[styles.chip, dateFormat === fmt && styles.chipActive]} onPress={() => setDateFormat(fmt)}>
                <Text style={[styles.chipText, dateFormat === fmt && styles.chipTextActive]}>{fmt}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Use 24-hour time</Text>
            <Switch value={use24Hour} onValueChange={setUse24Hour} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Show completed tasks</Text>
            <Switch value={showCompleted} onValueChange={setShowCompleted} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Task & event notifications</Text>
            <Switch value={pushNotifications} onValueChange={setPushNotifications} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Server Connection</Text>
          <TextInput
            style={styles.textInput}
            value={serverUrl}
            onChangeText={setServerUrlState}
            placeholder="http://your-server:8098"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <Pressable style={styles.btnSecondary} onPress={() => void handleConnectServer()}>
            <Server size={14} color={colors.text} />
            <Text style={styles.btnSecondaryText}>Connect & Test</Text>
          </Pressable>
        </View>

        <Pressable style={styles.btnPrimary} onPress={() => void handleSaveGeneral()}>
          <Check size={16} color={colors.onAccent} />
          <Text style={styles.btnPrimaryText}>Save General Settings</Text>
        </Pressable>
      </View>
    );
  }

  function renderCalendarsPane() {
    return (
      <View style={styles.paneContent}>
        {/* Sync Tasks to Google */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Sync Tasks to Google Calendar</Text>
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>INCLUDED</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>
            Automatically push scheduled FlowForge tasks into your Google Calendar.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Pressable
              style={[styles.chip, syncTasksCalId === null && styles.chipActive]}
              onPress={() => {
                setSyncTasksCalId(null);
                void updateSettings({ sync_tasks_calendar_id: null });
              }}
            >
              <Text style={[styles.chipText, syncTasksCalId === null && styles.chipTextActive]}>
                Don't sync
              </Text>
            </Pressable>
            {calendars.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, syncTasksCalId === c.id && styles.chipActive]}
                onPress={() => {
                  setSyncTasksCalId(c.id);
                  void updateSettings({ sync_tasks_calendar_id: c.id });
                  void triggerSyncTasks().catch(() => undefined);
                }}
              >
                <View style={[styles.dot, { backgroundColor: c.color || colors.accent }]} />
                <Text style={[styles.chipText, syncTasksCalId === c.id && styles.chipTextActive]}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Internal FlowForge Calendars */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>FlowForge Calendars</Text>
          {calendars
            .filter((c) => !c.provider || c.provider === "internal")
            .map((c) => (
              <View key={c.id} style={styles.calRow}>
                <View style={[styles.dot, { backgroundColor: c.color || colors.accent }]} />
                <Text style={styles.calName}>{c.name}</Text>
                <Switch
                  value={c.is_active}
                  onValueChange={() => {
                    void updateCalendar(c.id, { is_active: !c.is_active });
                    setCalendars((prev) =>
                      prev.map((item) => (item.id === c.id ? { ...item, is_active: !c.is_active } : item)),
                    );
                  }}
                  trackColor={{ false: colors.line, true: c.color || colors.accent }}
                  thumbColor={colors.onAccent}
                />
              </View>
            ))}
        </View>

        {/* Google Connected Accounts */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Google Accounts</Text>
          {googleAccounts.length === 0 ? (
            <Text style={styles.emptyText}>No Google accounts connected yet.</Text>
          ) : (
            googleAccounts.map((acc) => (
              <View key={acc.id} style={styles.googleAccountBox}>
                <View style={styles.googleAccountHeader}>
                  <Text style={styles.googleEmail}>{acc.email}</Text>
                  <Pressable
                    onPress={() => {
                      void disconnectGoogleAccount(acc.id);
                      void load();
                    }}
                  >
                    <Trash2 size={15} color={colors.danger} />
                  </Pressable>
                </View>
                {(accountCalendarsMap[acc.id] || []).map((gCal) => (
                  <View key={gCal.id} style={styles.calRow}>
                    <View style={[styles.dot, { backgroundColor: gCal.color || colors.accent }]} />
                    <Text style={styles.calName}>{gCal.name}</Text>
                    <Switch
                      value={gCal.is_active}
                      onValueChange={() => {
                        if (gCal.linked && gCal.calendar_row_id) {
                          void updateCalendar(gCal.calendar_row_id, { is_active: !gCal.is_active });
                        } else {
                          void linkGoogleCalendar(acc.id, {
                            calendar_id: gCal.id,
                            name: gCal.name,
                            color: gCal.color,
                          });
                        }
                        void load();
                      }}
                      trackColor={{ false: colors.line, true: gCal.color || colors.accent }}
                      thumbColor={colors.onAccent}
                    />
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        <Pressable
          style={styles.btnPrimary}
          onPress={() => {
            setAddAccountMode("menu");
            setAddAccountModal(true);
          }}
        >
          <Plus size={16} color={colors.onAccent} />
          <Text style={styles.btnPrimaryText}>Add Account / Calendar</Text>
        </Pressable>
      </View>
    );
  }

  function renderListsPane() {
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Task Lists</Text>
          {taskLists.map((l) => (
            <View key={l.id} style={styles.listCardRow}>
              <View style={[styles.dot, { backgroundColor: l.color || colors.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.listRowTitle}>{l.name}</Text>
                <Text style={styles.listRowSubtitle}>
                  {l.task_count || 0} tasks · {l.default_hours || "Personal hours"}
                </Text>
              </View>
              <Pressable
                style={styles.actionIconBtn}
                onPress={() => {
                  setEditingList(l);
                  setListName(l.name);
                  setListColor(l.color || CAL_PRESET_COLORS[0]);
                  setListModalVisible(true);
                }}
              >
                <Sliders size={16} color={colors.muted} />
              </Pressable>
              <Pressable
                style={styles.actionIconBtn}
                onPress={() => {
                  Alert.alert("Delete List", `Delete list “${l.name}”?`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => {
                        void deleteTaskList(l.id);
                        void load();
                      },
                    },
                  ]);
                }}
              >
                <Trash2 size={16} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          style={styles.btnPrimary}
          onPress={() => {
            setEditingList(null);
            setListName("");
            setListColor(CAL_PRESET_COLORS[0]);
            setListModalVisible(true);
          }}
        >
          <Plus size={16} color={colors.onAccent} />
          <Text style={styles.btnPrimaryText}>Create New List</Text>
        </Pressable>
      </View>
    );
  }

  function renderHoursPane() {
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scheduling Presets</Text>
          <Text style={styles.cardSubtitle}>
            Same presets as the website. The default preset drives auto-scheduling.
          </Text>
          {schedulingPresets.length === 0 ? (
            <Text style={styles.emptyText}>No presets yet. Save weekly hours below to seed the default preset on the server.</Text>
          ) : (
            schedulingPresets.map((p) => (
              <View key={p.id} style={styles.listCardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{p.name}</Text>
                  <Text style={styles.listRowSubtitle}>{p.is_default ? "Default preset" : "Custom hours set"}</Text>
                </View>
                {p.is_default && (
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>DEFAULT</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Working Windows</Text>
          <Text style={styles.cardSubtitle}>
            Edits the flat working-hours grid (synced with the server, used when presets are empty).
          </Text>

          {days.map((day, idx) => (
            <View key={DAYS[idx]} style={styles.dayRow}>
              <View style={styles.dayColLeft}>
                <Switch
                  value={day.enabled}
                  onValueChange={(val) => {
                    const next = [...days];
                    next[idx].enabled = val;
                    setDays(next);
                  }}
                  trackColor={{ false: colors.line, true: colors.accent }}
                  thumbColor={colors.onAccent}
                />
                <Text style={[styles.dayName, day.enabled && { color: colors.text, fontWeight: "700" }]}>
                  {DAYS[idx]}
                </Text>
              </View>

              {day.enabled ? (
                <View style={styles.dayTimes}>
                  <TextInput
                    style={styles.timeInput}
                    value={day.start_time}
                    onChangeText={(val) => {
                      const next = [...days];
                      next[idx].start_time = val;
                      setDays(next);
                    }}
                    placeholder="09:00"
                    placeholderTextColor={colors.muted}
                  />
                  <Text style={{ color: colors.muted }}>–</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={day.end_time}
                    onChangeText={(val) => {
                      const next = [...days];
                      next[idx].end_time = val;
                      setDays(next);
                    }}
                    placeholder="17:00"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              ) : (
                <Text style={styles.offText}>Off</Text>
              )}
            </View>
          ))}
        </View>

        <Pressable style={styles.btnPrimary} onPress={() => void handleSaveHours()}>
          <Check size={16} color={colors.onAccent} />
          <Text style={styles.btnPrimaryText}>Save Scheduling Hours</Text>
        </Pressable>
      </View>
    );
  }

  function renderEventsTasksPane() {
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Task Defaults</Text>

          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>More options expanded</Text>
            <Switch value={defaultMoreOptions} onValueChange={setDefaultMoreOptions} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Default Duration</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {DEFAULT_DURATION_OPTIONS.map((dur) => (
                <Pressable key={dur} style={[styles.chip, defaultDuration === dur && styles.chipActive]} onPress={() => setDefaultDuration(dur)}>
                  <Text style={[styles.chipText, defaultDuration === dur && styles.chipTextActive]}>
                    {dur < 60 ? `${dur}m` : `${dur / 60}h`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Splittable by default</Text>
            <Switch value={defaultSplittable} onValueChange={setDefaultSplittable} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.onAccent} />
          </View>

          <Text style={styles.rowLabel}>Min split duration</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {MIN_SPLIT_OPTIONS.map((n) => (
              <Pressable key={n} style={[styles.chip, defaultMinSplit === n && styles.chipActive]} onPress={() => setDefaultMinSplit(n)}>
                <Text style={[styles.chipText, defaultMinSplit === n && styles.chipTextActive]}>{n}m</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Buffer before</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {BUFFER_MINUTES_OPTIONS.map((buf) => (
              <Pressable key={buf} style={[styles.chip, defaultBufferBefore === buf && styles.chipActive]} onPress={() => setDefaultBufferBefore(buf)}>
                <Text style={[styles.chipText, defaultBufferBefore === buf && styles.chipTextActive]}>{buf === 0 ? "None" : `${buf}m`}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Buffer after</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {BUFFER_MINUTES_OPTIONS.map((buf) => (
              <Pressable key={buf} style={[styles.chip, defaultBufferAfter === buf && styles.chipActive]} onPress={() => setDefaultBufferAfter(buf)}>
                <Text style={[styles.chipText, defaultBufferAfter === buf && styles.chipTextActive]}>{buf === 0 ? "None" : `${buf}m`}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Default task list</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Pressable style={[styles.chip, defaultTaskListId === null && styles.chipActive]} onPress={() => setDefaultTaskListId(null)}>
              <Text style={[styles.chipText, defaultTaskListId === null && styles.chipTextActive]}>None</Text>
            </Pressable>
            {taskLists.map((l) => (
              <Pressable key={l.id} style={[styles.chip, defaultTaskListId === l.id && styles.chipActive]} onPress={() => setDefaultTaskListId(l.id)}>
                <Text style={[styles.chipText, defaultTaskListId === l.id && styles.chipTextActive]}>{l.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.rowLabel, { marginTop: 10 }]}>Default event calendar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Pressable style={[styles.chip, defaultEventCalId === null && styles.chipActive]} onPress={() => setDefaultEventCalId(null)}>
              <Text style={[styles.chipText, defaultEventCalId === null && styles.chipTextActive]}>None</Text>
            </Pressable>
            {calendars.map((c) => (
              <Pressable key={c.id} style={[styles.chip, defaultEventCalId === c.id && styles.chipActive]} onPress={() => setDefaultEventCalId(c.id)}>
                <Text style={[styles.chipText, defaultEventCalId === c.id && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Pressable style={styles.btnPrimary} onPress={() => void handleSaveDefaults()}>
          <Check size={16} color={colors.onAccent} />
          <Text style={styles.btnPrimaryText}>Save Task Defaults</Text>
        </Pressable>
      </View>
    );
  }

  function renderUsersPane() {
    if (!authUser?.is_admin) {
      return (
        <View style={styles.paneContent}>
          <Text style={{ color: colors.muted }}>Admin access required.</Text>
        </View>
      );
    }
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Users</Text>
          {adminUsers.map((u) => (
            <View key={u.id} style={[styles.googleAccountBox, { marginBottom: 10 }]}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {u.username} {u.is_admin ? "(admin)" : ""}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{u.email}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <Pressable
                  style={styles.btnSecondary}
                  onPress={() => {
                    void updateUser(u.id, { is_admin: !u.is_admin })
                      .then(() => load())
                      .catch((err) => setErrorMessage(err instanceof Error ? err.message : "Update failed"));
                  }}
                >
                  <Text style={styles.btnSecondaryText}>{u.is_admin ? "Remove admin" : "Make admin"}</Text>
                </Pressable>
                <Pressable
                  style={styles.btnSecondary}
                  onPress={() => {
                    void resetUserPassword(u.id)
                      .then((res) => {
                        Alert.alert("Password reset", `Temporary password: ${res.temporary_password}`);
                        void load();
                      })
                      .catch((err) => setErrorMessage(err instanceof Error ? err.message : "Reset failed"));
                  }}
                >
                  <Text style={styles.btnSecondaryText}>Reset password</Text>
                </Pressable>
                <Pressable
                  style={styles.dangerRow}
                  onPress={() => {
                    Alert.alert("Delete user", `Delete ${u.username} and all their data?`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          void deleteUser(u.id)
                            .then(() => load())
                            .catch((err) => setErrorMessage(err instanceof Error ? err.message : "Delete failed"));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.dangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create user</Text>
          <TextInput
            style={styles.textInput}
            value={newUserName}
            onChangeText={setNewUserName}
            placeholder="Username"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.textInput, { marginTop: 8 }]}
            value={newUserEmail}
            onChangeText={setNewUserEmail}
            placeholder="Email (optional)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.textInput, { marginTop: 8 }]}
            value={newUserPassword}
            onChangeText={setNewUserPassword}
            placeholder="Password (blank = auto)"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <Text style={{ color: colors.text }}>Admin</Text>
            <Switch value={newUserAdmin} onValueChange={setNewUserAdmin} />
          </View>
          <Pressable
            style={[styles.btnPrimary, { marginTop: 12 }]}
            onPress={() => {
              if (!newUserName.trim()) {
                setErrorMessage("Username is required.");
                return;
              }
              void createUser({
                username: newUserName.trim(),
                email: newUserEmail.trim() || undefined,
                password: newUserPassword || undefined,
                is_admin: newUserAdmin,
              })
                .then((res) => {
                  setNewUserName("");
                  setNewUserEmail("");
                  setNewUserPassword("");
                  setNewUserAdmin(false);
                  if (res.temporary_password) {
                    Alert.alert("User created", `Temporary password: ${res.temporary_password}`);
                  } else {
                    showStatus("User created.");
                  }
                  void load();
                })
                .catch((err) => setErrorMessage(err instanceof Error ? err.message : "Create failed"));
            }}
          >
            <Plus size={16} color={colors.onAccent} />
            <Text style={styles.btnPrimaryText}>Create user</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderAccountPane() {
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>User Profile</Text>
          <View style={styles.profileBox}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{(userName[0] || "U").toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{userName}</Text>
              <Text style={styles.profileEmail}>{userEmail || "user@example.com"}</Text>
            </View>
          </View>

          <Text style={[styles.rowLabel, { marginTop: 12 }]}>Display Name</Text>
          <TextInput
            style={styles.textInput}
            value={userName}
            onChangeText={setUserName}
            placeholder="Your Name"
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.rowLabel, { marginTop: 8 }]}>Email</Text>
          <TextInput
            style={styles.textInput}
            value={userEmail}
            onChangeText={setUserEmail}
            placeholder="user@example.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />

          <Pressable
            style={[styles.btnSecondary, { marginTop: 10 }]}
            onPress={() => {
              void updateSettings({ user_name: userName.trim(), user_email: userEmail.trim() });
              showStatus("Profile saved.");
            }}
          >
            <Check size={14} color={colors.text} />
            <Text style={styles.btnSecondaryText}>Update Profile</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Actions</Text>
          <Pressable
            style={styles.dangerRow}
            onPress={() => {
              Alert.alert(
                "Reset all data",
                "This deletes tasks, events, and schedule data on the server. This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Reset",
                    style: "destructive",
                    onPress: () => {
                      void resetAccount()
                        .then(() => {
                          showStatus("All data reset.");
                          void load();
                        })
                        .catch((err) => {
                          setErrorMessage(err instanceof Error ? err.message : "Reset failed.");
                        });
                    },
                  },
                ],
              );
            }}
          >
            <Text style={styles.dangerText}>Reset All Data</Text>
          </Pressable>
          <Pressable
            style={styles.dangerRow}
            onPress={() => {
              Alert.alert("Log out", "Sign out of FlowForge on this device?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Log out",
                  style: "destructive",
                  onPress: () => {
                    void (async () => {
                      try {
                        await apiLogout();
                      } catch {
                        // ignore network errors on logout
                      }
                      await setAuthToken(null);
                      Alert.alert("Logged out", "Restart the app to sign in again.");
                    })();
                  },
                },
              ]);
            }}
          >
            <Text style={styles.dangerText}>Log Out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderIntegrationsPane() {
    return (
      <View style={styles.paneContent}>
        {/* Google Calendar */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <CalIcon size={18} color={colors.accent} />
            <Text style={styles.cardTitle}>Google Calendar</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Two-way sync and busy-time blocking with Google Calendar.
          </Text>
          <Text style={{ fontSize: 12, color: googleAccounts.length > 0 ? colors.ok : colors.muted, fontWeight: "600" }}>
            {googleAccounts.length > 0 ? `Connected (${googleAccounts.length} accounts)` : "Not Connected"}
          </Text>
        </View>

        {/* Forge Workout Sync */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Dumbbell size={18} color={colors.danger} />
            <Text style={styles.cardTitle}>Forge Workout Sync</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Sync completed workouts and scheduled plans directly from Forge into FlowForge.
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeTitle}>Webhook Endpoint:</Text>
            <Text style={styles.codeText}>POST /api/tasks/forge-sync</Text>
            <Text style={styles.codeHint}>Send JSON: &#123;"title": "Leg Day", "duration_minutes": 60, "event_type": "workout_plan"&#125;</Text>
          </View>
        </View>

        {/* Habits Link */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Check size={18} color={colors.ok} />
            <Text style={styles.cardTitle}>Habits App Link</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Completing tasks in FlowForge automatically marks habits complete in your linked Loop Habits app.
          </Text>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => {
              void (async () => {
                const installed = await isHabitsAppInstalled();
                if (!installed) {
                  showStatus("Loop Habits app (org.isoron.uhabits) is not installed.");
                  return;
                }
                const ok = await notifyHabitsComplete("flowforge");
                showStatus(
                  ok
                    ? "Habit link sent — linked habits should be marked complete."
                    : "Could not reach Loop Habits. Reinstall the Habits APK and try again.",
                );
              })();
            }}
          >
            <Check size={14} color={colors.text} />
            <Text style={styles.btnSecondaryText}>Test Habits Link Notification</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderUpdatesPane() {
    return (
      <View style={styles.paneContent}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>FlowForge App Updates</Text>
            <Pressable
              style={styles.refreshBadgeBtn}
              onPress={() => void loadUpdateStatus()}
              hitSlop={8}
            >
              <RefreshCw size={13} color={colors.accent} />
              <Text style={styles.refreshBadgeText}>Check Now</Text>
            </Pressable>
          </View>

          {/* Wi-Fi Status Bar */}
          <View style={[styles.wifiStatusCard, updateInfo?.onWifi ? styles.wifiActive : styles.wifiInactive]}>
            <Wifi size={16} color={updateInfo?.onWifi ? colors.ok : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.wifiStatusTitle}>
                {updateInfo?.onWifi ? "Connected to Wi-Fi" : "Connected on Mobile Data"}
              </Text>
              <Text style={styles.wifiStatusSub}>
                {updateInfo?.onWifi
                  ? "Automatic background download is active over Wi-Fi."
                  : "You can manually download updates anytime on cellular or Wi-Fi."}
              </Text>
            </View>
          </View>

          {/* Version Info */}
          <View style={styles.versionBox}>
            <View>
              <Text style={styles.versionLabel}>Installed App Version</Text>
              <Text style={styles.versionVal}>
                v{updateInfo?.installedVersion || "1.0.7"} ({updateInfo?.installedCode || 7})
              </Text>
            </View>
            <View>
              <Text style={styles.versionLabel}>Server Available Version</Text>
              <Text style={styles.versionVal}>
                v{updateInfo?.serverVersion || "1.0.7"} ({updateInfo?.serverCode || 7})
              </Text>
            </View>
          </View>

          {updateInfo?.updateAvailable ? (
            <View style={styles.updateAvailableBanner}>
              <Download size={16} color={colors.ok} />
              <Text style={styles.updateAvailableText}>
                New version v{updateInfo.serverVersion} is available on the server!
              </Text>
            </View>
          ) : (
            <View style={styles.upToDateBanner}>
              <Check size={16} color={colors.ok} />
              <Text style={styles.upToDateText}>You are on the latest version.</Text>
            </View>
          )}

          {/* 1-Button Install or 1-Button Download & Install */}
          {updateInfo?.readyToInstall && updateInfo.cached ? (
            <Pressable
              style={[styles.btnPrimary, { backgroundColor: colors.ok, marginTop: 8 }]}
              onPress={() => {
                if (updateInfo.cached) void installCachedApk(updateInfo.cached.path);
              }}
            >
              <Zap size={16} color={colors.onAccent} />
              <Text style={styles.btnPrimaryText}>⚡ 1-Button Install Downloaded Update</Text>
            </Pressable>
          ) : updateInfo?.updateAvailable ? (
            <Pressable
              style={[styles.btnPrimary, { marginTop: 8 }]}
              disabled={downloadingApk}
              onPress={() => {
                void (async () => {
                  setDownloadingApk(true);
                  try {
                    const info = await getAppInfo();
                    await downloadAndInstallNow(info, (progress) => {
                      setDownloadProgress(Math.round(progress * 100));
                    });
                    await loadUpdateStatus();
                    showStatus("Update downloaded and launched!");
                  } catch (err) {
                    setErrorMessage(err instanceof Error ? err.message : "Download failed.");
                  } finally {
                    setDownloadingApk(false);
                    setDownloadProgress(null);
                  }
                })();
              }}
            >
              {downloadingApk ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={colors.onAccent} />
                  <Text style={styles.btnPrimaryText}>
                    {downloadProgress !== null
                      ? `Downloading ${downloadProgress}%…`
                      : "Downloading update…"}
                  </Text>
                </View>
              ) : (
                <>
                  <Download size={16} color={colors.onAccent} />
                  <Text style={styles.btnPrimaryText}>
                    ⚡ 1-Button Download & Install Now
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}

          {/* Manual Install Options */}
          <View style={[styles.card, { backgroundColor: colors.surfaceRaised, marginTop: 8 }]}>
            <Text style={[styles.cardTitle, { fontSize: 13 }]}>Manual Installation</Text>
            <Text style={styles.cardSubtitle}>
              Directly trigger the Android package installer for the currently cached APK.
            </Text>

            <Pressable
              style={styles.btnSecondary}
              onPress={() => {
                void (async () => {
                  const cached = await readCachedApk();
                  if (cached) {
                    await installCachedApk(cached.path);
                  } else {
                    Alert.alert(
                      "No Cached APK",
                      "No APK has been downloaded yet. Tap Download & Install above to fetch the latest APK.",
                    );
                  }
                })();
              }}
            >
              <Download size={14} color={colors.text} />
              <Text style={styles.btnSecondaryText}>Launch Installer for Cached APK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* Top Bar with Back / Close Button */}
      <View style={styles.topBar}>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <ArrowLeft size={20} color={colors.text} />
          </Pressable>
        ) : null}
        <Text style={styles.screenTitle}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Status & Error Toasts */}
      {statusMessage ? <Text style={styles.statusToast}>{statusMessage}</Text> : null}
      {errorMessage ? <Text style={styles.errorToast}>{errorMessage}</Text> : null}

      {/* Tabs / Panes Navigation Header (Matching Web Design) */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {PANES.filter((p) => p.id !== "users" || authUser?.is_admin).map((p) => {
            const Icon = p.icon;
            const isActive = activePane === p.id;
            return (
              <Pressable
                key={p.id}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActivePane(p.id)}
              >
                <Icon size={14} color={isActive ? colors.onAccent : colors.muted} />
                <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Active Pane Content */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyScroll}>
        {activePane === "general" && renderGeneralPane()}
        {activePane === "calendars" && renderCalendarsPane()}
        {activePane === "lists" && renderListsPane()}
        {activePane === "hours" && renderHoursPane()}
        {activePane === "events_tasks" && renderEventsTasksPane()}
        {activePane === "account" && renderAccountPane()}
        {activePane === "users" && renderUsersPane()}
        {activePane === "integrations" && renderIntegrationsPane()}
        {activePane === "updates" && renderUpdatesPane()}
      </ScrollView>

      {/* Add Account Modal */}
      <Modal visible={addAccountModal} transparent animationType="fade" onRequestClose={() => setAddAccountModal(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddAccountModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {addAccountMode === "menu" ? "Add Account" : addAccountMode === "internal" ? "New Internal Calendar" : "Add iCal Feed"}
              </Text>
              <Pressable onPress={() => setAddAccountModal(false)} hitSlop={8}>
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>

            {addAccountMode === "menu" ? (
              <View style={{ gap: 8 }}>
                <Pressable
                  style={styles.choiceCard}
                  onPress={() => {
                    setAddAccountModal(false);
                    void (async () => {
                      const url = await getServerUrl();
                      const token = await getAuthToken();
                      await Linking.openURL(googleAuthStartUrl(url, token));
                    })();
                  }}
                >
                  <CalIcon size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>Google Calendar</Text>
                    <Text style={styles.choiceSubtitle}>Connect Google account with 2-way sync</Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted} />
                </Pressable>

                <Pressable style={styles.choiceCard} onPress={() => setAddAccountMode("internal")}>
                  <Plus size={18} color={colors.ok} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>Internal Calendar</Text>
                    <Text style={styles.choiceSubtitle}>FlowForge standalone custom calendar</Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted} />
                </Pressable>

                <Pressable style={styles.choiceCard} onPress={() => setAddAccountMode("ical")}>
                  <LinkIcon size={18} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>iCal Webcal URL</Text>
                    <Text style={styles.choiceSubtitle}>Subscribe to read-only .ics URL</Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted} />
                </Pressable>
              </View>
            ) : addAccountMode === "internal" ? (
              <View style={{ gap: 12 }}>
                <TextInput
                  style={styles.textInput}
                  value={newInternalName}
                  onChangeText={setNewInternalName}
                  placeholder="Calendar Name"
                  placeholderTextColor={colors.muted}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {CAL_PRESET_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.colorPickerCircle, { backgroundColor: c }, newInternalColor === c && styles.colorPickerSelected]}
                      onPress={() => setNewInternalColor(c)}
                    />
                  ))}
                </ScrollView>
                <Pressable
                  style={styles.btnPrimary}
                  onPress={() => {
                    void (async () => {
                      if (!newInternalName.trim()) return;
                      await createCalendar({ name: newInternalName.trim(), color: newInternalColor, provider: "internal" });
                      setAddAccountModal(false);
                      setNewInternalName("");
                      void load();
                    })();
                  }}
                >
                  <Text style={styles.btnPrimaryText}>Create Calendar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <TextInput
                  style={styles.textInput}
                  value={newIcalName}
                  onChangeText={setNewIcalName}
                  placeholder="Feed Name"
                  placeholderTextColor={colors.muted}
                />
                <TextInput
                  style={styles.textInput}
                  value={newIcalUrl}
                  onChangeText={setNewIcalUrl}
                  placeholder="https://example.com/calendar.ics"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.btnPrimary}
                  onPress={() => {
                    void (async () => {
                      if (!newIcalName.trim() || !newIcalUrl.trim()) return;
                      await createCalendar({ name: newIcalName.trim(), url: newIcalUrl.trim(), provider: "ical" });
                      setAddAccountModal(false);
                      setNewIcalName("");
                      setNewIcalUrl("");
                      void load();
                    })();
                  }}
                >
                  <Text style={styles.btnPrimaryText}>Add Feed</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit / Add List Modal */}
      <Modal visible={listModalVisible} transparent animationType="fade" onRequestClose={() => setListModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setListModalVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingList ? "Edit List" : "New List"}</Text>
              <Pressable onPress={() => setListModalVisible(false)} hitSlop={8}>
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>

            <View style={{ gap: 12 }}>
              <TextInput
                style={styles.textInput}
                value={listName}
                onChangeText={setListName}
                placeholder="List Name"
                placeholderTextColor={colors.muted}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {CAL_PRESET_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.colorPickerCircle, { backgroundColor: c }, listColor === c && styles.colorPickerSelected]}
                    onPress={() => setListColor(c)}
                  />
                ))}
              </ScrollView>

              <Pressable
                style={styles.btnPrimary}
                onPress={() => {
                  void (async () => {
                    if (!listName.trim()) return;
                    if (editingList) {
                      await updateTaskList(editingList.id, { name: listName.trim(), color: listColor });
                    } else {
                      await createTaskList({ name: listName.trim(), color: listColor });
                    }
                    setListModalVisible(false);
                    setListName("");
                    void load();
                  })();
                }}
              >
                <Text style={styles.btnPrimaryText}>{editingList ? "Save Changes" : "Create List"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    screenTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text,
    },
    iconBtn: {
      padding: 6,
    },
    statusToast: {
      backgroundColor: colors.okLight,
      color: colors.ok,
      fontWeight: "700",
      fontSize: 12,
      padding: 8,
      textAlign: "center",
      marginHorizontal: 16,
      marginTop: 6,
      borderRadius: 8,
    },
    errorToast: {
      backgroundColor: colors.dangerLight,
      color: colors.danger,
      fontWeight: "700",
      fontSize: 12,
      padding: 8,
      textAlign: "center",
      marginHorizontal: 16,
      marginTop: 6,
      borderRadius: 8,
    },
    tabsContainer: {
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
      backgroundColor: colors.surface,
    },
    tabsScroll: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 6,
    },
    tabBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.mutedBg,
    },
    tabBtnActive: {
      backgroundColor: colors.accent,
    },
    tabBtnText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: colors.muted,
    },
    tabBtnTextActive: {
      color: colors.onAccent,
      fontWeight: "700",
    },
    bodyScroll: {
      padding: 16,
      paddingBottom: 40,
    },
    paneContent: {
      gap: 14,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 12,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
    },
    cardSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: -4,
      lineHeight: 16,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    freeBadge: {
      backgroundColor: colors.accentLight,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    freeBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.accent,
    },
    themeRow: {
      flexDirection: "row",
      gap: 10,
    },
    themeOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.mutedBg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    themeOptionActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    themeOptionText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted,
    },
    themeOptionTextActive: {
      color: colors.accent,
    },
    chipsRow: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 2,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.mutedBg,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.onAccent,
    },
    rowItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    rowLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
    },
    textInput: {
      backgroundColor: colors.inputBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.text,
    },
    btnPrimary: {
      backgroundColor: colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
    },
    btnPrimaryText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "700",
    },
    btnSecondary: {
      backgroundColor: colors.mutedBg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    btnSecondaryText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "600",
    },
    calRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    calName: {
      flex: 1,
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
    },
    googleAccountBox: {
      backgroundColor: colors.surfaceRaised,
      padding: 10,
      borderRadius: 8,
      gap: 6,
      marginBottom: 6,
    },
    googleAccountHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    googleEmail: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
    },
    emptyText: {
      fontSize: 12,
      color: colors.muted,
      fontStyle: "italic",
    },
    listCardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    listRowTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    listRowSubtitle: {
      fontSize: 11,
      color: colors.muted,
    },
    actionIconBtn: {
      padding: 6,
    },
    dayRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    dayColLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      width: 90,
    },
    dayName: {
      fontSize: 13,
      color: colors.muted,
    },
    dayTimes: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    timeInput: {
      backgroundColor: colors.inputBg,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 12,
      color: colors.text,
      width: 68,
      textAlign: "center",
    },
    offText: {
      fontSize: 12,
      color: colors.muted,
      fontStyle: "italic",
    },
    profileBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatarLarge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarLargeText: {
      color: colors.onAccent,
      fontSize: 20,
      fontWeight: "800",
    },
    profileName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    profileEmail: {
      fontSize: 12,
      color: colors.muted,
    },
    dangerRow: {
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    dangerText: {
      color: colors.danger,
      fontWeight: "700",
      fontSize: 14,
    },
    codeBox: {
      backgroundColor: colors.inputBg,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.lineSoft,
      gap: 4,
    },
    codeTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text,
    },
    codeText: {
      fontSize: 12,
      color: colors.accent,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    codeHint: {
      fontSize: 11,
      color: colors.muted,
    },
    refreshBadgeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accentLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    refreshBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent,
    },
    wifiStatusCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    wifiActive: {
      backgroundColor: colors.okLight,
      borderColor: colors.ok,
    },
    wifiInactive: {
      backgroundColor: colors.mutedBg,
      borderColor: colors.lineSoft,
    },
    wifiStatusTitle: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.text,
    },
    wifiStatusSub: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    versionBox: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: colors.inputBg,
      padding: 12,
      borderRadius: 10,
    },
    versionLabel: {
      fontSize: 11,
      color: colors.muted,
    },
    versionVal: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      marginTop: 2,
    },
    updateAvailableBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.okLight,
      padding: 10,
      borderRadius: 8,
    },
    updateAvailableText: {
      color: colors.ok,
      fontWeight: "700",
      fontSize: 12,
    },
    upToDateBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.okLight,
      padding: 10,
      borderRadius: 8,
    },
    upToDateText: {
      color: colors.ok,
      fontWeight: "600",
      fontSize: 12,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 12,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    choiceCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceRaised,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.lineSoft,
    },
    choiceTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    choiceSubtitle: {
      fontSize: 11,
      color: colors.muted,
    },
    colorPickerCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 8,
    },
    colorPickerSelected: {
      borderWidth: 3,
      borderColor: colors.text,
    },
  });
}
