import React, { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, Clock, Trash2, X, Calendar as CalIcon, MapPin } from "lucide-react-native";

import {
  deleteEvent,
  deleteTask,
  updateTask,
  type TimelineItem,
} from "../api/client";
import { notifyHabitsComplete } from "../habitsLink";
import { useTheme } from "../ThemeProvider";
import type { Colors } from "../theme";

const HOUR_START = 0;
const HOUR_END = 24;
const HOUR_HEIGHT = 58;
const HEAD_HEIGHT = 50;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  startDate: Date;
  rangeDays?: 1 | 3 | 7;
  items: TimelineItem[];
  timezone: string;
  onRefresh?: () => void;
  onEditItem?: (item: TimelineItem) => void;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function minutesOnDay(iso: string, timeZone: string): { date: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      minutes: Number(get("hour")) * 60 + Number(get("minute")),
    };
  } catch {
    const d = new Date(iso);
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      minutes: d.getHours() * 60 + d.getMinutes(),
    };
  }
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function clockLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${display}${suffix}` : `${display}:${pad(minute)}${suffix}`;
}

function chipGeometry(item: TimelineItem, timezone: string) {
  const start = minutesOnDay(item.start, timezone);
  const end = minutesOnDay(item.end, timezone);
  const span = new Date(item.end).getTime() - new Date(item.start).getTime();
  const isAllDay = start.minutes === 0 && (span >= 23.5 * 3600 * 1000 || end.date !== start.date && end.minutes === 0);

  const endMinutes =
    end.date !== start.date ? HOUR_END * 60 : Math.max(end.minutes, start.minutes + 15);
  const rangeStart = HOUR_START * 60;
  const rangeEnd = HOUR_END * 60;
  const startClamped = Math.min(Math.max(start.minutes, rangeStart), rangeEnd - 20);
  const endClamped = Math.min(Math.max(endMinutes, startClamped + 20), rangeEnd);

  return {
    date: start.date,
    isAllDay,
    label: `${clockLabel(start.minutes)} – ${clockLabel(endMinutes)}`,
    top: HEAD_HEIGHT + ((startClamped - rangeStart) / 60) * HOUR_HEIGHT,
    height: Math.max(26, ((endClamped - startClamped) / 60) * HOUR_HEIGHT - 3),
  };
}

export function ScheduleTimeline({ startDate, rangeDays = 7, items, timezone, onRefresh, onEditItem }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const screenWidth = Dimensions.get("window").width;
  const hourColWidth = 48;

  const dayColWidth = useMemo(() => {
    if (rangeDays === 1) return screenWidth - hourColWidth - 2;
    if (rangeDays === 3) return Math.floor((screenWidth - hourColWidth - 2) / 3);
    return 114;
  }, [rangeDays, screenWidth]);

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, index) => HOUR_START + index),
    [],
  );
  const days = useMemo(
    () => Array.from({ length: rangeDays }, (_, index) => addDays(startDate, index)),
    [startDate, rangeDays],
  );

  const now = minutesOnDay(new Date().toISOString(), timezone);

  async function handleQuickToggleTask(taskItem: TimelineItem) {
    if (!taskItem.task_id) return;
    const nextState = !taskItem.is_completed;
    try {
      await updateTask(taskItem.task_id, { is_completed: nextState });
      if (nextState) {
        void notifyHabitsComplete("flowforge");
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update task");
    }
  }

  async function handleToggleTaskComplete(taskItem: TimelineItem) {
    if (!taskItem.task_id) return;
    setActionLoading(true);
    try {
      await updateTask(taskItem.task_id, { is_completed: true });
      void notifyHabitsComplete("flowforge");
      setSelectedItem(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setActionLoading(false);
    }
  }

  function handleDeleteItem(item: TimelineItem) {
    Alert.alert("Delete", `Delete “${item.title}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setActionLoading(true);
            try {
              if (item.kind === "task" && item.task_id) {
                await deleteTask(item.task_id);
              } else if (item.kind === "event" && item.event_id) {
                await deleteEvent(item.event_id);
              }
              setSelectedItem(null);
              if (onRefresh) onRefresh();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
            } finally {
              setActionLoading(false);
            }
          })();
        },
      },
    ]);
  }

  const allDayItemsByDate = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    items.forEach((item) => {
      const geo = chipGeometry(item, timezone);
      if (geo.isAllDay) {
        const list = map.get(geo.date) || [];
        list.push(item);
        map.set(geo.date, list);
      }
    });
    return map;
  }, [items, timezone]);

  const hasAnyAllDay = allDayItemsByDate.size > 0;

  const contentOffsetInitialY = Math.max(0, (now.minutes / 60 - HOUR_START - 1) * HOUR_HEIGHT);

  const timelineContent = (
    <View style={styles.grid}>
      {/* Hour Labels Column */}
      <View style={[styles.hourCol, { width: hourColWidth }]}>
        <View style={[styles.head, hasAnyAllDay && styles.headWithAllDay]} />
        {hours.map((hour) => (
          <View key={hour} style={styles.hourLabelBox}>
            <Text style={styles.hourLabel}>{hourLabel(hour)}</Text>
          </View>
        ))}
      </View>

      {/* Day Columns */}
      {days.map((day) => {
        const key = isoDate(day);
        const isToday = key === now.date;
        const dayAllDay = allDayItemsByDate.get(key) || [];

        return (
          <View key={key} style={[styles.dayCol, { width: dayColWidth }]}>
            {/* Column Header */}
            <View style={[styles.head, hasAnyAllDay && styles.headWithAllDay]}>
              <Text style={[styles.dow, isToday && styles.dowToday]}>
                {DAY_NAMES[day.getDay()]}
              </Text>
              <View style={[styles.domBox, isToday && styles.domToday]}>
                <Text style={[styles.dom, isToday && styles.domTodayText]}>
                  {day.getDate()}
                </Text>
              </View>

              {/* All-Day Chips */}
              {dayAllDay.map((adItem, idx) => {
                const isTask = adItem.kind === "task";
                const isDone = isTask && Boolean(adItem.is_completed);
                const taskColor = adItem.color || colors.ok;
                return (
                  <Pressable
                    key={`ad-${idx}`}
                    style={[
                      styles.allDayChip,
                      { backgroundColor: isDone ? colors.mutedBg : colors.accentLight },
                    ]}
                    onPress={() => setSelectedItem(adItem)}
                  >
                    {isTask && adItem.task_id ? (
                      <Pressable
                        style={[
                          styles.chipCheckCircle,
                          { borderColor: taskColor },
                          isDone && { backgroundColor: taskColor },
                        ]}
                        hitSlop={6}
                        onPress={() => void handleQuickToggleTask(adItem)}
                      >
                        {isDone ? <Check size={8} color="#FFFFFF" strokeWidth={3} /> : null}
                      </Pressable>
                    ) : null}
                    <Text
                      style={[
                        styles.allDayText,
                        isDone && { textDecorationLine: "line-through", opacity: 0.65 },
                      ]}
                      numberOfLines={1}
                    >
                      {adItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Grid Slots */}
            {hours.map((hour) => (
              <View key={hour} style={styles.slot} />
            ))}

            {/* Timeline Items */}
            {items
              .map((item) => ({ item, geo: chipGeometry(item, timezone) }))
              .filter(({ geo }) => geo.date === key && !geo.isAllDay)
              .map(({ item, geo }, index) => {
                const isTask = item.kind === "task";
                const isEvent = item.kind === "event";
                const isDone = isTask && Boolean(item.is_completed);

                let fill = colors.surfaceRaised;
                let border = item.color || colors.line;
                let textColor = colors.text;

                if (isTask) {
                  fill = isDone ? colors.mutedBg : colors.surfaceRaised;
                  border = item.color || colors.ok;
                  textColor = colors.text;
                } else if (isEvent) {
                  fill = colors.eventFill;
                  border = item.color || colors.eventLine;
                  textColor = colors.event;
                } else {
                  fill = colors.busyFill;
                  border = colors.muted;
                  textColor = colors.busy;
                }

                return (
                  <Pressable
                    key={`${item.kind}-${item.start}-${index}`}
                    style={[
                      styles.chip,
                      {
                        top: geo.top + (hasAnyAllDay ? 26 : 0),
                        height: geo.height,
                        backgroundColor: fill,
                        borderLeftColor: border,
                        opacity: isDone ? 0.72 : 1,
                      },
                    ]}
                    onPress={() => setSelectedItem(item)}
                  >
                    <View style={styles.chipHeader}>
                      {isTask && item.task_id ? (
                        <Pressable
                          style={[
                            styles.chipCheckCircle,
                            { borderColor: border },
                            isDone && { backgroundColor: border },
                          ]}
                          hitSlop={6}
                          onPress={() => void handleQuickToggleTask(item)}
                        >
                          {isDone ? <Check size={8} color="#FFFFFF" strokeWidth={3} /> : null}
                        </Pressable>
                      ) : null}
                      <Text
                        style={[
                          styles.chipTitle,
                          { color: textColor },
                          isDone && { textDecorationLine: "line-through", opacity: 0.7 },
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                    </View>
                    {geo.height > 32 ? (
                      <Text
                        style={[
                          styles.chipMeta,
                          { color: colors.muted },
                          isDone && { textDecorationLine: "line-through", opacity: 0.6 },
                        ]}
                        numberOfLines={1}
                      >
                        {geo.label}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}

            {/* Current Time Indicator */}
            {isToday ? (
              <View
                pointerEvents="none"
                style={[
                  styles.nowLine,
                  {
                    top:
                      HEAD_HEIGHT +
                      (hasAnyAllDay ? 26 : 0) +
                      ((now.minutes - HOUR_START * 60) / 60) * HOUR_HEIGHT,
                  },
                ]}
              >
                <View style={styles.nowDot} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      {rangeDays === 7 ? (
        <ScrollView horizontal style={styles.scroller} contentContainerStyle={styles.scrollerContent}>
          <ScrollView contentOffset={{ x: 0, y: contentOffsetInitialY }} showsVerticalScrollIndicator={false}>
            {timelineContent}
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView contentOffset={{ x: 0, y: contentOffsetInitialY }} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {timelineContent}
        </ScrollView>
      )}

      {/* Item Detail Modal */}
      {selectedItem ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedItem(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedItem(null)} />
            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.kindBadgeRow}>
                    <View
                      style={[
                        styles.kindBadge,
                        {
                          backgroundColor:
                            selectedItem.kind === "task"
                              ? colors.okLight
                              : selectedItem.kind === "event"
                              ? colors.accentLight
                              : colors.mutedBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.kindBadgeText,
                          {
                            color:
                              selectedItem.kind === "task"
                                ? colors.ok
                                : selectedItem.kind === "event"
                                ? colors.accent
                                : colors.muted,
                          },
                        ]}
                      >
                        {selectedItem.kind.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.detailTitle}>{selectedItem.title}</Text>
                </View>
                <Pressable onPress={() => setSelectedItem(null)} hitSlop={12}>
                  <X size={20} color={colors.muted} />
                </Pressable>
              </View>

              <View style={styles.detailRow}>
                <Clock size={16} color={colors.muted} />
                <Text style={styles.detailText}>
                  {new Date(selectedItem.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                  {new Date(selectedItem.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
              </View>

              {selectedItem.calendar_summary ? (
                <View style={styles.detailRow}>
                  <CalIcon size={16} color={colors.muted} />
                  <Text style={styles.detailText}>{selectedItem.calendar_summary}</Text>
                </View>
              ) : null}

              <View style={styles.detailActions}>
                {onEditItem && (selectedItem.task_id || selectedItem.event_id) ? (
                  <Pressable
                    style={[styles.btnSecondary, { borderColor: colors.line }]}
                    onPress={() => {
                      const item = selectedItem;
                      setSelectedItem(null);
                      onEditItem(item);
                    }}
                  >
                    <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Edit</Text>
                  </Pressable>
                ) : null}

                {selectedItem.kind === "task" && selectedItem.task_id ? (
                  <Pressable
                    style={[styles.btnPrimary, { backgroundColor: colors.ok }]}
                    onPress={() => handleToggleTaskComplete(selectedItem)}
                    disabled={actionLoading}
                  >
                    <Check size={18} color={colors.onAccent} />
                    <Text style={styles.btnPrimaryText}>Mark Complete</Text>
                  </Pressable>
                ) : null}

                {(selectedItem.task_id || selectedItem.event_id) ? (
                  <Pressable
                    style={[styles.btnDanger, { borderColor: colors.danger }]}
                    onPress={() => handleDeleteItem(selectedItem)}
                    disabled={actionLoading}
                  >
                    <Trash2 size={16} color={colors.danger} />
                    <Text style={[styles.btnDangerText, { color: colors.danger }]}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroller: {
      flex: 1,
    },
    scrollerContent: {
      flexGrow: 1,
    },
    grid: {
      flexDirection: "row",
    },
    hourCol: {
      borderRightWidth: 1,
      borderRightColor: colors.lineSoft,
    },
    dayCol: {
      borderLeftWidth: 1,
      borderLeftColor: colors.lineSoft,
      position: "relative",
    },
    head: {
      height: HEAD_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.bg,
      paddingVertical: 4,
    },
    headWithAllDay: {
      height: HEAD_HEIGHT + 26,
    },
    dow: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    dowToday: {
      color: colors.accent,
    },
    domBox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    domToday: {
      backgroundColor: colors.accent,
    },
    dom: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    domTodayText: {
      color: colors.onAccent,
    },
    allDayChip: {
      marginTop: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: "stretch",
      marginHorizontal: 4,
    },
    allDayText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.accent,
      textAlign: "center",
    },
    hourLabelBox: {
      height: HOUR_HEIGHT,
      alignItems: "flex-end",
      paddingRight: 6,
    },
    hourLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "500",
      marginTop: -6,
    },
    slot: {
      height: HOUR_HEIGHT,
      borderTopWidth: 1,
      borderTopColor: colors.lineSoft,
    },
    chip: {
      position: "absolute",
      left: 2,
      right: 2,
      borderRadius: 8,
      borderLeftWidth: 3.5,
      paddingHorizontal: 6,
      paddingVertical: 4,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    chipHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    taskDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    chipCheckCircle: {
      width: 13,
      height: 13,
      borderRadius: 6.5,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 2,
    },
    chipTitle: {
      fontSize: 12,
      fontWeight: "700",
      flex: 1,
    },
    chipMeta: {
      fontSize: 10,
      marginTop: 2,
      fontWeight: "500",
    },
    nowLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.now,
      zIndex: 10,
    },
    nowDot: {
      position: "absolute",
      left: -4,
      top: -3,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.now,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
      padding: 16,
      paddingBottom: 24,
    },
    detailCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 10,
    },
    detailHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    kindBadgeRow: {
      flexDirection: "row",
      marginBottom: 6,
    },
    kindBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    kindBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    detailTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    detailText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    detailActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 8,
    },
    btnPrimary: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
    },
    btnPrimaryText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "700",
    },
    btnSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      backgroundColor: colors.surface,
    },
    btnSecondaryText: {
      fontSize: 14,
      fontWeight: "700",
    },
    btnDanger: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
    },
    btnDangerText: {
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
