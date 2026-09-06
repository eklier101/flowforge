import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Calendar,
  Check,
  Clock,
  Flag,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deleteTask,
  listTaskLists,
  listTasks,
  updateTask,
  type Task,
  type TaskList,
} from "../api/client";
import { AddTaskModal } from "../components/AddTaskModal";
import { notifyHabitsComplete } from "../habitsLink";
import { maybeAutoDownloadOnWifi } from "../services/appUpdate";
import { useTheme } from "../ThemeProvider";
import type { Colors } from "../theme";

type Props = {
  selectedListId?: number | null;
  onSelectTaskList?: (id: number | null) => void;
  onOpenSidebar?: () => void;
  onOpenSettings?: () => void;
};

export function TaskListScreen({
  selectedListId: propListId,
  onSelectTaskList,
  onOpenSidebar,
  onOpenSettings,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [filter, setFilter] = useState<"pending" | "completed">("pending");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(propListId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Sync prop changes
  useMemo(() => {
    if (propListId !== undefined) {
      setSelectedListId(propListId);
    }
  }, [propListId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allTasks, allLists] = await Promise.all([
        listTasks(undefined, selectedListId ?? undefined),
        listTaskLists().catch(() => []),
      ]);
      setTasks(allTasks);
      setLists(allLists);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [selectedListId]);

  useEffect(() => {
    void load();
    void maybeAutoDownloadOnWifi();
  }, [load]);

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      const matchesCompleted = filter === "completed" ? task.is_completed : !task.is_completed;
      if (!matchesCompleted) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return task.title.toLowerCase().includes(q) || (task.notes && task.notes.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tasks, filter, searchQuery]);

  async function toggleComplete(task: Task) {
    try {
      const completing = !task.is_completed;
      await updateTask(task.id, { is_completed: completing });
      if (completing) {
        void notifyHabitsComplete("flowforge");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  function confirmDelete(task: Task) {
    Alert.alert("Delete Task", `Remove “${task.title}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteTask(task.id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not delete task.");
            }
          })();
        },
      },
    ]);
  }

  function formatDueDate(dueStr: string) {
    if (!dueStr) return null;
    try {
      const d = new Date(dueStr);
      const now = new Date();
      const isPast = d.getTime() < now.getTime();
      const isToday = d.toDateString() === now.toDateString();
      const dateText = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const timeText = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

      if (isToday) return { text: `Due Today ${timeText}`, isPast: false, isToday: true };
      return { text: `Due ${dateText} ${timeText}`, isPast, isToday: false };
    } catch {
      return { text: dueStr.slice(0, 10), isPast: false, isToday: false };
    }
  }

  function handleListSelect(id: number | null) {
    setSelectedListId(id);
    if (onSelectTaskList) onSelectTaskList(id);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.leftControls}>
          {onOpenSidebar ? (
            <Pressable onPress={onOpenSidebar} hitSlop={10} style={styles.menuIconBtn}>
              <Menu size={22} color={colors.text} />
            </Pressable>
          ) : null}

          <View style={styles.titleRow}>
            <Text style={styles.title}>Tasks</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{visible.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rightControls}>
          {onOpenSettings ? (
            <Pressable onPress={onOpenSettings} hitSlop={8} style={styles.headerIconBtn}>
              <SettingsIcon size={19} color={colors.textSecondary} />
            </Pressable>
          ) : null}

          {/* Pending / Completed Switcher */}
          <View style={styles.segment}>
            {(["pending", "completed"] as const).map((v) => (
              <Pressable
                key={v}
                style={[styles.segBtn, filter === v && styles.segBtnActive]}
                onPress={() => setFilter(v)}
              >
                <Text style={[styles.segBtnText, filter === v && styles.segBtnTextActive]}>
                  {v === "pending" ? "Pending" : "Completed"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <Search size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search tasks…"
          placeholderTextColor={colors.muted}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
            <X size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Task Lists Chips */}
      {lists.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listChipsRow}
          style={{ flexGrow: 0 }}
        >
          <Pressable
            style={[styles.chip, selectedListId === null && styles.chipActive]}
            onPress={() => handleListSelect(null)}
          >
            <Text style={[styles.chipText, selectedListId === null && styles.chipTextActive]}>
              All Lists
            </Text>
          </Pressable>
          {lists.map((l) => {
            const isSelected = selectedListId === l.id;
            const listColor = l.color || colors.accent;
            return (
              <Pressable
                key={l.id}
                style={[
                  styles.chip,
                  isSelected && {
                    backgroundColor: listColor + "20",
                    borderColor: listColor,
                  },
                ]}
                onPress={() => handleListSelect(l.id)}
              >
                <View style={[styles.dot, { backgroundColor: listColor }]} />
                <Text
                  style={[
                    styles.chipText,
                    isSelected && { color: listColor, fontWeight: "700" },
                  ]}
                >
                  {l.name}
                </Text>
                {l.task_count !== undefined && l.task_count > 0 ? (
                  <Text style={[styles.chipCount, isSelected && { color: listColor }]}>
                    {l.task_count}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Task List Items */}
      <ScrollView
        contentContainerStyle={styles.scrollList}
        showsVerticalScrollIndicator={false}
      >
        {loading && tasks.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : visible.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              {searchQuery ? "No matching tasks" : `No ${filter} tasks`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {filter === "pending"
                ? "You're all caught up! Tap + to add a new task."
                : "Completed tasks will show up here."}
            </Text>
          </View>
        ) : (
          visible.map((task) => {
            const dueInfo = formatDueDate(task.due_date);
            const listColor = task.list_color || colors.accent;

            return (
              <View key={task.id} style={styles.taskCard}>
                {/* Checkbox */}
                <Pressable
                  style={[styles.checkbox, task.is_completed && styles.checkboxActive]}
                  onPress={() => void toggleComplete(task)}
                >
                  {task.is_completed ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
                </Pressable>

                {/* Task Details - Tap to edit */}
                <Pressable
                  style={styles.taskBody}
                  onPress={() => setEditingTask(task)}
                  hitSlop={4}
                >
                  <Text
                    style={[
                      styles.taskTitle,
                      task.is_completed && styles.taskTitleCompleted,
                    ]}
                  >
                    {task.title}
                  </Text>

                  {/* Metadata Badges */}
                  <View style={styles.metaRow}>
                    {task.list_name ? (
                      <View style={[styles.metaBadge, { backgroundColor: listColor + "20" }]}>
                        <View style={[styles.dot, { backgroundColor: listColor }]} />
                        <Text style={[styles.metaBadgeText, { color: listColor }]}>
                          {task.list_name}
                        </Text>
                      </View>
                    ) : null}

                    {dueInfo ? (
                      <View
                        style={[
                          styles.metaBadge,
                          dueInfo.isPast && !task.is_completed
                            ? { backgroundColor: colors.dangerLight }
                            : dueInfo.isToday
                            ? { backgroundColor: colors.warningLight }
                            : { backgroundColor: colors.mutedBg },
                        ]}
                      >
                        <Calendar
                          size={11}
                          color={
                            dueInfo.isPast && !task.is_completed
                              ? colors.danger
                              : dueInfo.isToday
                              ? colors.warning
                              : colors.muted
                          }
                        />
                        <Text
                          style={[
                            styles.metaBadgeText,
                            dueInfo.isPast && !task.is_completed
                              ? { color: colors.danger, fontWeight: "700" }
                              : dueInfo.isToday
                              ? { color: colors.warning, fontWeight: "700" }
                              : { color: colors.muted },
                          ]}
                        >
                          {dueInfo.text}
                        </Text>
                      </View>
                    ) : null}

                    <View style={[styles.metaBadge, { backgroundColor: colors.mutedBg }]}>
                      <Clock size={11} color={colors.muted} />
                      <Text style={[styles.metaBadgeText, { color: colors.muted }]}>
                        {task.duration_minutes < 60
                          ? `${task.duration_minutes}m`
                          : `${(task.duration_minutes / 60).toFixed(1).replace(".0", "")}h`}
                      </Text>
                    </View>

                    {task.priority < 3 ? (
                      <View
                        style={[
                          styles.metaBadge,
                          { backgroundColor: task.priority === 1 ? colors.dangerLight : colors.warningLight },
                        ]}
                      >
                        <Flag
                          size={11}
                          color={task.priority === 1 ? colors.danger : colors.warning}
                        />
                        <Text
                          style={[
                            styles.metaBadgeText,
                            {
                              color: task.priority === 1 ? colors.danger : colors.warning,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          P{task.priority}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>

                {/* Delete button */}
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(task)}
                  hitSlop={8}
                >
                  <Trash2 size={16} color={colors.muted} />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setEditingTask(null);
          setModalOpen(true);
        }}
      >
        <Plus color={colors.onAccent} size={26} strokeWidth={2.5} />
      </Pressable>

      <AddTaskModal
        visible={modalOpen || editingTask !== null}
        editTask={editingTask}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
        }}
        onCreated={() => {
          setModalOpen(false);
          setEditingTask(null);
          void load();
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
    header: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    countBadge: {
      backgroundColor: colors.accentLight,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
    },
    countText: {
      color: colors.accent,
      fontSize: 11.5,
      fontWeight: "700",
    },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.mutedBg,
      borderRadius: 8,
      padding: 2,
    },
    segBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    segBtnActive: {
      backgroundColor: colors.accent,
    },
    segBtnText: {
      color: colors.muted,
      fontSize: 11.5,
      fontWeight: "600",
    },
    segBtnTextActive: {
      color: colors.onAccent,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      marginHorizontal: 14,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      padding: 0,
    },
    listChipsRow: {
      paddingHorizontal: 14,
      paddingBottom: 8,
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.onAccent,
    },
    chipCount: {
      fontSize: 11,
      color: colors.muted,
      fontWeight: "600",
    },
    errorText: {
      color: colors.danger,
      marginHorizontal: 14,
      marginBottom: 8,
      fontSize: 12,
      textAlign: "center",
    },
    scrollList: {
      paddingHorizontal: 14,
      paddingBottom: 80,
      gap: 8,
    },
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: 48,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.muted,
      textAlign: "center",
    },
    taskCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxActive: {
      backgroundColor: colors.ok,
      borderColor: colors.ok,
    },
    taskBody: {
      flex: 1,
      gap: 6,
    },
    taskTitle: {
      fontSize: 14.5,
      fontWeight: "600",
      color: colors.text,
    },
    taskTitleCompleted: {
      textDecorationLine: "line-through",
      color: colors.muted,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
    },
    metaBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    metaBadgeText: {
      fontSize: 11,
      fontWeight: "600",
    },
    deleteBtn: {
      padding: 6,
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
