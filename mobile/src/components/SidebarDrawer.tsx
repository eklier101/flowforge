import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  Calendar as CalIcon,
  CheckSquare,
  ChevronRight,
  Download,
  Inbox,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react-native";

import {
  getAppInfo,
  listCalendars,
  listTaskLists,
  updateCalendar,
  type AppInfo,
  type Calendar,
  type TaskList,
} from "../api/client";
import { useTheme } from "../ThemeProvider";
import type { Colors } from "../theme";

type Props = {
  visible: boolean;
  activeView: "schedule" | "tasks" | "settings";
  selectedListId: number | null;
  onClose: () => void;
  onNavigate: (view: "schedule" | "tasks" | "settings", listId?: number | null, settingsPane?: string) => void;
  onOpenAddAccount: () => void;
  onOpenAddList: () => void;
};

export function SidebarDrawer({
  visible,
  activeView,
  selectedListId,
  onClose,
  onNavigate,
  onOpenAddAccount,
  onOpenAddList,
}: Props) {
  const { colors, theme } = useTheme();
  const styles = makeStyles(colors);

  const [lists, setLists] = useState<TaskList[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (visible) {
      void (async () => {
        try {
          const [fetchedLists, fetchedCals, info] = await Promise.all([
            listTaskLists().catch(() => []),
            listCalendars().catch(() => []),
            getAppInfo().catch(() => null),
          ]);
          setLists(fetchedLists);
          setCalendars(fetchedCals);
          setAppInfo(info);
        } catch {
          // ignore
        }
      })();
    }
  }, [visible]);

  async function toggleCal(cal: Calendar) {
    try {
      const nextActive = !cal.is_active;
      await updateCalendar(cal.id, { is_active: nextActive });
      setCalendars((prev) =>
        prev.map((c) => (c.id === cal.id ? { ...c, is_active: nextActive } : c)),
      );
    } catch {
      // ignore
    }
  }

  const totalTaskCount = lists.reduce((acc, l) => acc + (l.task_count || 0), 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.drawer}>
          {/* Header Brand */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>F</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brandName}>FlowForge</Text>
                <Text style={styles.brandEmail} numberOfLines={1}>
                  Smart Scheduler
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Main Navigation Items */}
            <View style={styles.navSection}>
              <Pressable
                style={[
                  styles.navItem,
                  activeView === "schedule" && styles.navItemActive,
                ]}
                onPress={() => {
                  onNavigate("schedule");
                  onClose();
                }}
              >
                <CalIcon
                  size={18}
                  color={activeView === "schedule" ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    styles.navItemText,
                    activeView === "schedule" && styles.navItemTextActive,
                  ]}
                >
                  Schedule
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.navItem,
                  activeView === "tasks" && selectedListId === null && styles.navItemActive,
                ]}
                onPress={() => {
                  onNavigate("tasks", null);
                  onClose();
                }}
              >
                <Inbox
                  size={18}
                  color={activeView === "tasks" && selectedListId === null ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    styles.navItemText,
                    activeView === "tasks" && selectedListId === null && styles.navItemTextActive,
                  ]}
                >
                  Inbox / Tasks
                </Text>
                {totalTaskCount > 0 ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{totalTaskCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            {/* Task Lists Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Lists</Text>
              <View style={styles.sectionActions}>
                <View style={styles.miniPill}>
                  <Text style={styles.miniPillText}>{lists.length}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    onClose();
                    onOpenAddList();
                  }}
                  hitSlop={8}
                  style={styles.addIconBtn}
                >
                  <Plus size={16} color={colors.accent} />
                </Pressable>
              </View>
            </View>

            <View style={styles.subList}>
              {lists.map((l) => {
                const isSelected = activeView === "tasks" && selectedListId === l.id;
                const listColor = l.color || colors.accent;
                return (
                  <Pressable
                    key={l.id}
                    style={[styles.subItem, isSelected && styles.subItemActive]}
                    onPress={() => {
                      onNavigate("tasks", l.id);
                      onClose();
                    }}
                  >
                    <View style={[styles.colorDot, { backgroundColor: listColor }]} />
                    <Text
                      style={[
                        styles.subItemText,
                        isSelected && { color: colors.text, fontWeight: "700" },
                      ]}
                      numberOfLines={1}
                    >
                      {l.name}
                    </Text>
                    {l.task_count !== undefined && l.task_count > 0 ? (
                      <View style={styles.miniPill}>
                        <Text style={styles.miniPillText}>{l.task_count}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Calendars Section */}
            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <Text style={styles.sectionTitle}>Calendars</Text>
              <View style={styles.sectionActions}>
                <View style={styles.miniPill}>
                  <Text style={styles.miniPillText}>{calendars.length}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    onClose();
                    onOpenAddAccount();
                  }}
                  hitSlop={8}
                  style={styles.addIconBtn}
                >
                  <Plus size={16} color={colors.accent} />
                </Pressable>
              </View>
            </View>

            <View style={styles.subList}>
              {calendars.map((c) => {
                const calColor = c.color || colors.accent;
                return (
                  <View key={c.id} style={styles.subItem}>
                    <View style={[styles.colorDot, { backgroundColor: calColor }]} />
                    <Text style={styles.subItemText} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Switch
                      value={c.is_active}
                      onValueChange={() => void toggleCal(c)}
                      trackColor={{ false: colors.line, true: calColor }}
                      thumbColor={colors.onAccent}
                      style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                    />
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Drawer Footer */}
          <View style={styles.footer}>
            <Pressable
              style={styles.footerItem}
              onPress={() => {
                onNavigate("settings", null, "general");
                onClose();
              }}
            >
              <SettingsIcon size={18} color={colors.muted} />
              <Text style={styles.footerItemText}>Settings</Text>
            </Pressable>

            {appInfo ? (
              <Pressable
                style={styles.apkItem}
                onPress={() => {
                  onNavigate("settings", null, "updates");
                  onClose();
                }}
              >
                <Download size={14} color={colors.accent} />
                <Text style={styles.apkText}>
                  v{appInfo.version} (Latest)
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      flexDirection: "row",
    },
    drawer: {
      width: 290,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.line,
      paddingTop: 44,
      paddingBottom: 20,
      display: "flex",
      flexDirection: "column",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: "800",
    },
    brandName: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.2,
    },
    brandEmail: {
      fontSize: 11,
      color: colors.muted,
    },
    closeBtn: {
      padding: 4,
    },
    scroll: {
      paddingHorizontal: 12,
      paddingVertical: 14,
    },
    navSection: {
      gap: 4,
      marginBottom: 16,
    },
    navItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    navItemActive: {
      backgroundColor: colors.accentLight,
    },
    navItemText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      flex: 1,
    },
    navItemTextActive: {
      color: colors.accent,
      fontWeight: "700",
    },
    pill: {
      backgroundColor: colors.mutedBg,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    pillText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    sectionActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    miniPill: {
      backgroundColor: colors.mutedBg,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
    },
    miniPillText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.muted,
    },
    addIconBtn: {
      padding: 2,
    },
    subList: {
      gap: 2,
      marginTop: 2,
    },
    subItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    subItemActive: {
      backgroundColor: colors.surfaceRaised,
    },
    colorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    subItemText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textSecondary,
      flex: 1,
    },
    footer: {
      paddingHorizontal: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.lineSoft,
      gap: 6,
    },
    footerItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
    },
    footerItemText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    apkItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.accentLight,
    },
    apkText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent,
    },
  });
}
