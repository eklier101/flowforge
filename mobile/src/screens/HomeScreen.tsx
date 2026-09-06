import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Menu,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  Zap,
  X,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getSchedule, getTask, runAutoSchedule, type AppInfo, type Task, type TimelineItem } from "../api/client";
import { AddTaskModal } from "../components/AddTaskModal";
import { ScheduleTimeline } from "../components/ScheduleTimeline";
import {
  checkServerUpdate,
  downloadAndInstallNow,
  installCachedApk,
  maybeAutoDownloadOnWifi,
  type CachedApk,
} from "../services/appUpdate";
import { refreshNotificationsFromSettings } from "../services/notifications";
import { useTheme } from "../ThemeProvider";
import type { Colors } from "../theme";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatRangeTitle(startDate: Date, rangeDays: 1 | 3 | 7): string {
  if (rangeDays === 1) {
    const isToday = isoDate(startDate) === isoDate(new Date());
    const dateStr = startDate.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return isToday ? `Today · ${dateStr}` : dateStr;
  }
  const end = addDays(startDate, rangeDays - 1);
  const startText = startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endText = end.toLocaleDateString(undefined, {
    month: startDate.getMonth() === end.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${startText} – ${endText}`;
}

type Props = {
  onOpenSidebar?: () => void;
  onOpenSettings?: () => void;
};

export function HomeScreen({ onOpenSidebar, onOpenSettings }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Default to 3 days view as requested
  const [rangeDays, setRangeDays] = useState<1 | 3 | 7>(3);
  const [currentDate, setCurrentDate] = useState<Date>(() => startOfDay(new Date()));
  const [timezone, setTimezone] = useState("America/New_York");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingEvent, setEditingEvent] = useState<{
    id: number;
    title: string;
    start: string;
    end: string;
    notes?: string;
    location?: string;
    calendar_id?: number | null;
  } | null>(null);

  const handleEditItem = useCallback(async (item: TimelineItem) => {
    if (item.kind === "task" && item.task_id) {
      try {
        const fullTask = await getTask(item.task_id);
        setEditingTask(fullTask);
      } catch {
        // Fallback minimal task
        setEditingTask({
          id: item.task_id,
          title: item.title,
          duration_minutes: 60,
          due_date: item.start,
          priority: 3,
          allow_splitting: true,
          min_split_minutes: 10,
          buffer_before_minutes: 0,
          buffer_minutes: 0,
          is_completed: false,
        });
      }
    } else if (item.kind === "event" && item.event_id) {
      setEditingEvent({
        id: item.event_id,
        title: item.title,
        start: item.start,
        end: item.end,
      });
    }
  }, []);

  // In-app update state
  const [updateInfo, setUpdateInfo] = useState<{
    serverVersion: string;
    readyToInstall: boolean;
    cached: CachedApk | null;
    info: AppInfo | null;
  } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const load = useCallback(async (start: Date, days: 1 | 3 | 7) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getSchedule(isoDate(start), days);
      setItems(payload.items);
      if (payload.timezone) {
        setTimezone(payload.timezone);
      }
      void refreshNotificationsFromSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUpdates = useCallback(async () => {
    try {
      await maybeAutoDownloadOnWifi();
      const status = await checkServerUpdate();
      if (status.updateAvailable || status.readyToInstall) {
        setUpdateInfo({
          serverVersion: status.info?.version || "Latest",
          readyToInstall: status.readyToInstall,
          cached: status.cached,
          info: status.info,
        });
      } else {
        setUpdateInfo(null);
      }
    } catch {
      // ignore update check errors
    }
  }, []);

  useEffect(() => {
    void load(currentDate, rangeDays);
    void checkUpdates();
  }, [currentDate, rangeDays, load, checkUpdates]);

  function handleRangeChange(nextRange: 1 | 3 | 7) {
    setRangeDays(nextRange);
    if (nextRange === 7) {
      setCurrentDate((prev) => startOfWeek(prev));
    } else if (nextRange === 1 || nextRange === 3) {
      setCurrentDate(startOfDay(new Date()));
    }
  }

  function handleNavigate(direction: -1 | 1) {
    const delta = rangeDays === 7 ? 7 * direction : rangeDays * direction;
    setCurrentDate((prev) => addDays(prev, delta));
  }

  function handleToday() {
    if (rangeDays === 7) {
      setCurrentDate(startOfWeek(new Date()));
    } else {
      setCurrentDate(startOfDay(new Date()));
    }
  }

  async function onRecalculate() {
    setScheduling(true);
    setError(null);
    try {
      const blocks = await runAutoSchedule(true);
      if (blocks[0]?.start_time) {
        const firstDate = new Date(blocks[0].start_time);
        if (rangeDays === 7) {
          const nextStart = startOfWeek(firstDate);
          if (isoDate(nextStart) !== isoDate(currentDate)) {
            setCurrentDate(nextStart);
            return;
          }
        }
      }
      await load(currentDate, rangeDays);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recalculate failed.");
    } finally {
      setScheduling(false);
    }
  }

  async function handleOneTapInstall() {
    if (!updateInfo) return;
    setInstallingUpdate(true);
    try {
      if (updateInfo.readyToInstall && updateInfo.cached) {
        await installCachedApk(updateInfo.cached.path);
      } else if (updateInfo.info) {
        await downloadAndInstallNow(updateInfo.info, (progress) => {
          setDownloadProgress(Math.round(progress * 100));
        });
        await checkUpdates();
      }
    } catch (err) {
      Alert.alert("Update Failed", err instanceof Error ? err.message : "Could not complete update.");
    } finally {
      setInstallingUpdate(false);
      setDownloadProgress(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* Top Header matching Web Bar */}
      <View style={styles.topHeader}>
        <View style={styles.leftControls}>
          {onOpenSidebar ? (
            <Pressable onPress={onOpenSidebar} hitSlop={10} style={styles.menuIconBtn}>
              <Menu size={22} color={colors.text} />
            </Pressable>
          ) : null}

          <View style={styles.brandContainer}>
            <Sparkles size={18} color={colors.accent} />
            <Text style={styles.brand}>FlowForge</Text>
          </View>
        </View>

        <View style={styles.rightControls}>
          {onOpenSettings ? (
            <Pressable onPress={onOpenSettings} hitSlop={8} style={styles.headerIconBtn}>
              <SettingsIcon size={19} color={colors.textSecondary} />
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.recalcBtn, scheduling && { opacity: 0.8 }]}
            onPress={() => void onRecalculate()}
            disabled={scheduling}
          >
            {scheduling ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <RefreshCw size={13} color={colors.onAccent} />
            )}
            <Text style={styles.recalcText}>{scheduling ? "Planning…" : "Recalc"}</Text>
          </Pressable>
        </View>
      </View>

      {/* In-App Update 1-Button Banner */}
      {updateInfo && !bannerDismissed ? (
        <View style={styles.updateBanner}>
          <View style={styles.updateBannerLeft}>
            <Zap size={16} color={updateInfo.readyToInstall ? colors.ok : colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.updateBannerTitle}>
                {updateInfo.readyToInstall
                  ? `Update v${updateInfo.serverVersion} Ready (Wi-Fi Auto-Downloaded)`
                  : `FlowForge v${updateInfo.serverVersion} Available`}
              </Text>
              {downloadProgress !== null ? (
                <Text style={styles.updateBannerSub}>Downloading... {downloadProgress}%</Text>
              ) : (
                <Text style={styles.updateBannerSub}>
                  {updateInfo.readyToInstall
                    ? "Tap to install in 1 step"
                    : "Tap to download & install now"}
                </Text>
              )}
            </View>
          </View>

          <Pressable
            style={[
              styles.updateBannerBtn,
              updateInfo.readyToInstall && { backgroundColor: colors.ok },
              installingUpdate && { opacity: 0.7 },
            ]}
            onPress={() => void handleOneTapInstall()}
            disabled={installingUpdate}
          >
            {installingUpdate ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Download size={13} color={colors.onAccent} />
                <Text style={styles.updateBannerBtnText}>
                  {updateInfo.readyToInstall ? "1-Tap Install" : "Install Now"}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.bannerCloseBtn}
            onPress={() => setBannerDismissed(true)}
            hitSlop={8}
          >
            <X size={15} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {/* Date Navigation & Range Selector Bar */}
      <View style={styles.controlsBar}>
        {/* Range Selector */}
        <View style={styles.rangeSegment}>
          {([1, 3, 7] as const).map((r) => (
            <Pressable
              key={r}
              style={[styles.rangeOption, rangeDays === r && styles.rangeOptionActive]}
              onPress={() => handleRangeChange(r)}
            >
              <Text
                style={[
                  styles.rangeOptionText,
                  rangeDays === r && styles.rangeOptionTextActive,
                ]}
              >
                {r === 1 ? "1 Day" : r === 3 ? "3 Days" : "Week"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date Navigation */}
        <View style={styles.navGroup}>
          <Pressable style={styles.navIconBtn} onPress={() => handleNavigate(-1)} hitSlop={8}>
            <ChevronLeft size={18} color={colors.text} />
          </Pressable>

          <Pressable style={styles.todayBtn} onPress={handleToday}>
            <Text style={styles.todayText}>Today</Text>
          </Pressable>

          <Pressable style={styles.navIconBtn} onPress={() => handleNavigate(1)} hitSlop={8}>
            <ChevronRight size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Date Range Subtitle */}
      <View style={styles.rangeTitleRow}>
        <Text style={styles.rangeTitle}>{formatRangeTitle(currentDate, rangeDays)}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Timeline View */}
      <View style={styles.timelineWrapper}>
        <ScheduleTimeline
          startDate={currentDate}
          rangeDays={rangeDays}
          items={items}
          timezone={timezone}
          onRefresh={() => void load(currentDate, rangeDays)}
          onEditItem={(item) => void handleEditItem(item)}
        />
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : null}
      </View>

      {/* Floating Add Button */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setEditingTask(null);
          setEditingEvent(null);
          setModalOpen(true);
        }}
      >
        <Plus color={colors.onAccent} size={26} strokeWidth={2.5} />
      </Pressable>

      {/* Add Task / Event Modal */}
      <AddTaskModal
        visible={modalOpen || editingTask !== null || editingEvent !== null}
        editTask={editingTask}
        editEvent={editingEvent}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
          setEditingEvent(null);
        }}
        onCreated={() => {
          setModalOpen(false);
          setEditingTask(null);
          setEditingEvent(null);
          void (async () => {
            await load(currentDate, rangeDays);
          })();
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    topHeader: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    leftControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    rightControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    menuIconBtn: {
      padding: 6,
      borderRadius: 8,
    },
    headerIconBtn: {
      padding: 6,
      borderRadius: 8,
    },
    brandContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    brand: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.3,
    },
    recalcBtn: {
      backgroundColor: colors.accent,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    recalcText: {
      color: colors.onAccent,
      fontWeight: "700",
      fontSize: 12.5,
    },
    updateBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceRaised,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      gap: 8,
    },
    updateBannerLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    updateBannerTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text,
    },
    updateBannerSub: {
      fontSize: 10.5,
      color: colors.muted,
      marginTop: 1,
    },
    updateBannerBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    updateBannerBtnText: {
      color: colors.onAccent,
      fontSize: 11.5,
      fontWeight: "700",
    },
    bannerCloseBtn: {
      padding: 4,
    },
    controlsBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
      backgroundColor: colors.surface,
    },
    rangeSegment: {
      flexDirection: "row",
      backgroundColor: colors.mutedBg,
      borderRadius: 8,
      padding: 2,
    },
    rangeOption: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    rangeOptionActive: {
      backgroundColor: colors.accent,
    },
    rangeOptionText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
    },
    rangeOptionTextActive: {
      color: colors.onAccent,
    },
    navGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    navIconBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.mutedBg,
    },
    todayBtn: {
      backgroundColor: colors.accentLight,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    todayText: {
      color: colors.accent,
      fontSize: 11.5,
      fontWeight: "700",
    },
    rangeTitleRow: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: colors.bg,
    },
    rangeTitle: {
      fontSize: 13.5,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    error: {
      color: colors.danger,
      textAlign: "center",
      marginHorizontal: 16,
      marginVertical: 4,
      fontSize: 12,
    },
    timelineWrapper: {
      flex: 1,
      position: "relative",
    },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.15)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20,
    },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 24,
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 30,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 8,
    },
  });
}
