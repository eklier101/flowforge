import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
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
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
  Calendar as CalIcon,
  Check,
  Clock,
  Copy,
  Flag,
  List as ListIcon,
  MapPin,
  MoreVertical,
  Repeat,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";
import { Alert } from "react-native";
import { notifyHabitsComplete } from "../habitsLink";

import {
  createEvent,
  createTask,
  deleteEvent,
  deleteTask,
  getSettings,
  listCalendars,
  listTaskLists,
  updateEvent,
  updateTask,
  type Calendar,
  type Task,
  type TaskList,
} from "../api/client";
import { useTheme } from "../ThemeProvider";
import type { Colors } from "../theme";

type Kind = "task" | "event";

type EditEventData = {
  id: number;
  title: string;
  start: string;
  end: string;
  notes?: string;
  location?: string;
  calendar_id?: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  editTask?: Task | null;
  editEvent?: EditEventData | null;
};

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240];
const BUFFER_PRESETS = [0, 5, 10, 15, 30];

export function AddTaskModal({ visible, onClose, onCreated, editTask, editEvent }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [kind, setKind] = useState<Kind>("task");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);

  // Task states
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [dueDate, setDueDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d;
  });
  const [hasDueDate, setHasDueDate] = useState(true);
  const [priority, setPriority] = useState<number>(3);
  const [allowSplitting, setAllowSplitting] = useState(true);
  const [minSplitMinutes, setMinSplitMinutes] = useState(10);
  const [bufferBeforeMinutes, setBufferBeforeMinutes] = useState(0);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  // Event states
  const [isAllDay, setIsAllDay] = useState(false);
  const [eventStart, setEventStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [eventEnd, setEventEnd] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  });
  const [eventLocation, setEventLocation] = useState("");
  const [eventCalendarId, setEventCalendarId] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(true);

  // Pickers and lists
  const [pickerTarget, setPickerTarget] = useState<"due_date" | "due_time" | "event_start_date" | "event_start_time" | "event_end_date" | "event_end_time" | null>(null);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (editTask) {
        setKind("task");
        setTitle(editTask.title || "");
        setNotes(editTask.notes || "");
        setIsCompleted(!!editTask.is_completed);
        setDurationMinutes(editTask.duration_minutes || 60);
        setPriority(editTask.priority || 3);
        const isFixed = editTask.allow_splitting === false && !!editTask.start_after;
        setAutoSchedule(!isFixed);
        setAllowSplitting(isFixed ? false : editTask.allow_splitting !== false);
        setMinSplitMinutes(editTask.min_split_minutes || 10);
        setBufferBeforeMinutes(editTask.buffer_before_minutes || 0);
        setBufferMinutes(editTask.buffer_minutes || 0);
        setSelectedListId(editTask.list_id ?? null);
        if (editTask.due_date) {
          setDueDate(new Date(editTask.due_date));
          setHasDueDate(true);
        } else {
          setHasDueDate(false);
        }
      } else if (editEvent) {
        setKind("event");
        setTitle(editEvent.title || "");
        setNotes(editEvent.notes || "");
        setEventLocation(editEvent.location || "");
        setEventCalendarId(editEvent.calendar_id ?? null);
        if (editEvent.start) setEventStart(new Date(editEvent.start));
        if (editEvent.end) setEventEnd(new Date(editEvent.end));
      }

      void (async () => {
        try {
          const [fetchedLists, fetchedCals, s] = await Promise.all([
            listTaskLists().catch(() => []),
            listCalendars().catch(() => []),
            getSettings().catch(() => null),
          ]);
          setLists(fetchedLists);
          setCalendars(fetchedCals);

          if (!editTask && !editEvent && s) {
            if (s.default_task_duration) setDurationMinutes(s.default_task_duration);
            if (s.default_task_splittable !== undefined) setAllowSplitting(s.default_task_splittable);
            if (s.default_task_min_split !== undefined) setMinSplitMinutes(s.default_task_min_split);
            if (s.default_task_buffer_before !== undefined) setBufferBeforeMinutes(s.default_task_buffer_before);
            if (s.default_task_buffer_after !== undefined) setBufferMinutes(s.default_task_buffer_after);

            if (s.default_task_list_id && fetchedLists.some((l) => l.id === s.default_task_list_id)) {
              setSelectedListId(s.default_task_list_id);
            } else if (fetchedLists.length > 0) {
              const def = fetchedLists.find((l) => l.is_default) || fetchedLists[0];
              setSelectedListId(def.id);
            }

            if (s.default_event_calendar_id && fetchedCals.some((c) => c.id === s.default_event_calendar_id)) {
              setEventCalendarId(s.default_event_calendar_id);
            } else if (fetchedCals.length > 0) {
              setEventCalendarId(fetchedCals[0].id);
            }
          }
        } catch {
          // ignore
        }
      })();
    }
  }, [visible, editTask, editEvent]);

  function reset() {
    setTitle("");
    setNotes("");
    setIsCompleted(false);
    setKind("task");
    setAutoSchedule(true);
    setDurationMinutes(60);
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    setDueDate(d);
    setHasDueDate(true);
    setPriority(3);
    setAllowSplitting(true);
    setBufferBeforeMinutes(0);
    setBufferMinutes(0);
    setError(null);
    setPickerTarget(null);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handlePickerChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") {
      setPickerTarget(null);
    }
    if (!selectedDate) return;

    if (pickerTarget === "due_date") {
      const next = new Date(dueDate);
      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setDueDate(next);
    } else if (pickerTarget === "due_time") {
      const next = new Date(dueDate);
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      setDueDate(next);
    } else if (pickerTarget === "event_start_date") {
      const next = new Date(eventStart);
      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setEventStart(next);
    } else if (pickerTarget === "event_start_time") {
      const next = new Date(eventStart);
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      setEventStart(next);
    } else if (pickerTarget === "event_end_date") {
      const next = new Date(eventEnd);
      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setEventEnd(next);
    } else if (pickerTarget === "event_end_time") {
      const next = new Date(eventEnd);
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      setEventEnd(next);
    }
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Please enter a title");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (kind === "task") {
        if (editTask) {
          await updateTask(editTask.id, {
            title: trimmedTitle,
            duration_minutes: durationMinutes,
            due_date: hasDueDate ? dueDate.toISOString() : undefined,
            priority,
            allow_splitting: allowSplitting,
            min_split_minutes: minSplitMinutes,
            buffer_before_minutes: bufferBeforeMinutes,
            buffer_minutes: bufferMinutes,
            is_completed: isCompleted,
            list_id: selectedListId,
            notes: notes.trim() || undefined,
          });
          if (!editTask.is_completed && isCompleted) {
            void notifyHabitsComplete("flowforge");
          }
        } else {
          await createTask({
            title: trimmedTitle,
            duration_minutes: durationMinutes,
            due_date: hasDueDate ? dueDate.toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
            priority,
            allow_splitting: allowSplitting,
            min_split_minutes: minSplitMinutes,
            buffer_before_minutes: bufferBeforeMinutes,
            buffer_minutes: bufferMinutes,
            is_completed: isCompleted,
            list_id: selectedListId,
            notes: notes.trim() || undefined,
          });
          if (isCompleted) {
            void notifyHabitsComplete("flowforge");
          }
        }

        handleClose();
        onCreated();
      } else {
        if (eventEnd <= eventStart && !isAllDay) {
          setError("End time must be after start time");
          setSaving(false);
          return;
        }

        let sIso = eventStart.toISOString();
        let eIso = eventEnd.toISOString();

        if (isAllDay) {
          const s = new Date(eventStart);
          s.setHours(0, 0, 0, 0);
          const e = new Date(eventEnd);
          e.setHours(23, 59, 59, 999);
          sIso = s.toISOString();
          eIso = e.toISOString();
        }

        if (editEvent) {
          await updateEvent(editEvent.id, {
            title: trimmedTitle,
            start_time: sIso,
            end_time: eIso,
            location: eventLocation.trim() || undefined,
            notes: notes.trim() || undefined,
            calendar_id: eventCalendarId,
            is_busy: isBusy,
          });
        } else {
          await createEvent({
            title: trimmedTitle,
            start_time: sIso,
            end_time: eIso,
            location: eventLocation.trim() || undefined,
            notes: notes.trim() || undefined,
            calendar_id: eventCalendarId,
            is_busy: isBusy,
          });
        }

        handleClose();
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
      setSaving(false);
    }
  }

  function handleDelete() {
    if (editTask) {
      Alert.alert("Delete Task", `Delete "${editTask.title}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await deleteTask(editTask.id);
              handleClose();
              onCreated();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete task");
            } finally {
              setSaving(false);
            }
          },
        },
      ]);
    } else if (editEvent) {
      Alert.alert("Delete Event", `Delete "${editEvent.title}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await deleteEvent(editEvent.id);
              handleClose();
              onCreated();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete event");
            } finally {
              setSaving(false);
            }
          },
        },
      ]);
    }
  }

  function handleMoreOptions() {
    Alert.alert(
      kind === "task" ? "Task Options" : "Event Options",
      title || undefined,
      [
        {
          text: "Duplicate",
          onPress: async () => {
            setSaving(true);
            try {
              if (kind === "task") {
                await createTask({
                  title: `${title.trim() || "Task"} (Copy)`,
                  duration_minutes: durationMinutes,
                  due_date: hasDueDate ? dueDate.toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
                  priority,
                  allow_splitting: allowSplitting,
                  min_split_minutes: minSplitMinutes,
                  buffer_before_minutes: bufferBeforeMinutes,
                  buffer_minutes: bufferMinutes,
                  is_completed: false,
                  list_id: selectedListId,
                  notes: notes.trim() || undefined,
                });
              } else {
                await createEvent({
                  title: `${title.trim() || "Event"} (Copy)`,
                  start_time: eventStart.toISOString(),
                  end_time: eventEnd.toISOString(),
                  location: eventLocation.trim() || undefined,
                  notes: notes.trim() || undefined,
                  calendar_id: eventCalendarId,
                  is_busy: isBusy,
                });
              }
              handleClose();
              onCreated();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to duplicate");
            } finally {
              setSaving(false);
            }
          },
        },
        {
          text: kind === "task" ? "Convert to Event" : "Convert to Task",
          onPress: () => {
            setKind(kind === "task" ? "event" : "task");
          },
        },
        ...(editTask || editEvent
          ? [
              {
                text: "Delete",
                style: "destructive" as const,
                onPress: handleDelete,
              },
            ]
          : []),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
              <X size={20} color={colors.muted} />
            </Pressable>

            {/* Segmented Task / Event Switcher */}
            <View style={styles.segment}>
              {(["task", "event"] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.segmentBtn, kind === v && styles.segmentBtnActive]}
                  onPress={() => setKind(v)}
                >
                  <Text style={[styles.segmentBtnText, kind === v && styles.segmentBtnTextActive]}>
                    {v === "task" ? "Task" : "Event"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Pressable onPress={handleMoreOptions} hitSlop={8} style={{ padding: 6 }}>
                <MoreVertical size={20} color={colors.muted} />
              </Pressable>
              <Pressable
                style={[styles.saveBtn, (!title.trim() || saving) && styles.saveBtnDisabled]}
                onPress={() => void handleSave()}
                disabled={!title.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={styles.saveBtnText}>{editTask || editEvent ? "Save" : "Add"}</Text>
                )}
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Title Row with circle checkbox */}
            <View style={styles.titleRow}>
              {kind === "task" ? (
                <Pressable
                  style={[styles.checkCircle, isCompleted && styles.checkCircleChecked]}
                  onPress={() => setIsCompleted(!isCompleted)}
                  hitSlop={8}
                >
                  {isCompleted ? <Check size={14} color="#111827" strokeWidth={3} /> : null}
                </Pressable>
              ) : null}
              <TextInput
                style={[styles.titleInput, isCompleted && kind === "task" && styles.titleInputCompleted]}
                value={title}
                onChangeText={setTitle}
                placeholder={kind === "task" ? "Add title" : "Event title"}
                placeholderTextColor={colors.muted}
                autoFocus
              />
            </View>

            {kind === "task" ? (
              <>
                {/* Auto-Schedule Switch */}
                <View style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <Sparkles size={18} color={colors.accent} />
                    <View>
                      <Text style={styles.cardRowTitle}>Auto-Schedule</Text>
                      <Text style={styles.cardRowSubtitle}>
                        Automatically finds the optimal time slot
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={autoSchedule}
                    onValueChange={setAutoSchedule}
                    trackColor={{ false: colors.line, true: colors.accent }}
                    thumbColor={colors.onAccent}
                  />
                </View>

                {/* Duration Picker */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Duration</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}
                  >
                    {DURATION_PRESETS.map((dur) => (
                      <Pressable
                        key={dur}
                        style={[
                          styles.chip,
                          durationMinutes === dur && styles.chipActive,
                        ]}
                        onPress={() => setDurationMinutes(dur)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            durationMinutes === dur && styles.chipTextActive,
                          ]}
                        >
                          {dur < 60 ? `${dur}m` : dur % 60 === 0 ? `${dur / 60}h` : `${(dur / 60).toFixed(1)}h`}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Due Date & Time */}
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionLabel}>Due Date</Text>
                    <Switch
                      value={hasDueDate}
                      onValueChange={setHasDueDate}
                      trackColor={{ false: colors.line, true: colors.accent }}
                      thumbColor={colors.onAccent}
                    />
                  </View>

                  {hasDueDate ? (
                    <View style={styles.dateTimeRow}>
                      <Pressable
                        style={styles.dateTimeBtn}
                        onPress={() => setPickerTarget("due_date")}
                      >
                        <CalIcon size={16} color={colors.accent} />
                        <Text style={styles.dateTimeBtnText}>
                          {dueDate.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.dateTimeBtn}
                        onPress={() => setPickerTarget("due_time")}
                      >
                        <Clock size={16} color={colors.accent} />
                        <Text style={styles.dateTimeBtnText}>
                          {dueDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.hintText}>No due date (schedules whenever free)</Text>
                  )}
                </View>

                {/* List Selector */}
                {lists.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Task List</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsRow}
                    >
                      {lists.map((l) => {
                        const isSelected = selectedListId === l.id;
                        const listColor = l.color || colors.accent;
                        return (
                          <Pressable
                            key={l.id}
                            style={[
                              styles.listChip,
                              isSelected && {
                                borderColor: listColor,
                                backgroundColor: listColor + "20",
                              },
                            ]}
                            onPress={() => setSelectedListId(l.id)}
                          >
                            <View style={[styles.listDot, { backgroundColor: listColor }]} />
                            <Text
                              style={[
                                styles.listChipText,
                                isSelected && { color: listColor, fontWeight: "700" },
                              ]}
                            >
                              {l.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Priority */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Priority</Text>
                  <View style={styles.priorityRow}>
                    {[
                      { val: 1, label: "P1 Urgent", color: colors.p1 },
                      { val: 2, label: "P2 High", color: colors.p2 },
                      { val: 3, label: "P3 Medium", color: colors.p3 },
                      { val: 4, label: "P4 Low", color: colors.p4 },
                    ].map((p) => (
                      <Pressable
                        key={p.val}
                        style={[
                          styles.priorityBtn,
                          priority === p.val && {
                            borderColor: p.color,
                            backgroundColor: p.color + "20",
                          },
                        ]}
                        onPress={() => setPriority(p.val)}
                      >
                        <Flag size={14} color={p.color} />
                        <Text
                          style={[
                            styles.priorityBtnText,
                            priority === p.val && { color: p.color, fontWeight: "700" },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Splittable & Buffers */}
                <View style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <Text style={styles.cardRowTitle}>Allow Splitting</Text>
                    <Text style={styles.cardRowSubtitle}>
                      Can divide into multiple sessions if needed
                    </Text>
                  </View>
                  <Switch
                    value={allowSplitting}
                    onValueChange={setAllowSplitting}
                    trackColor={{ false: colors.line, true: colors.accent }}
                    thumbColor={colors.onAccent}
                  />
                </View>

                {/* Buffer Before / After */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Buffer Time (After)</Text>
                  <View style={styles.chipsRow}>
                    {BUFFER_PRESETS.map((buf) => (
                      <Pressable
                        key={buf}
                        style={[
                          styles.chip,
                          bufferMinutes === buf && styles.chipActive,
                        ]}
                        onPress={() => setBufferMinutes(buf)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            bufferMinutes === buf && styles.chipTextActive,
                          ]}
                        >
                          {buf === 0 ? "None" : `${buf}m`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Event Form */}
                <View style={styles.cardRow}>
                  <Text style={styles.cardRowTitle}>All-Day</Text>
                  <Switch
                    value={isAllDay}
                    onValueChange={setIsAllDay}
                    trackColor={{ false: colors.line, true: colors.accent }}
                    thumbColor={colors.onAccent}
                  />
                </View>

                {/* Start Date & Time */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Start</Text>
                  <View style={styles.dateTimeRow}>
                    <Pressable
                      style={styles.dateTimeBtn}
                      onPress={() => setPickerTarget("event_start_date")}
                    >
                      <CalIcon size={16} color={colors.accent} />
                      <Text style={styles.dateTimeBtnText}>
                        {eventStart.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </Pressable>

                    {!isAllDay ? (
                      <Pressable
                        style={styles.dateTimeBtn}
                        onPress={() => setPickerTarget("event_start_time")}
                      >
                        <Clock size={16} color={colors.accent} />
                        <Text style={styles.dateTimeBtnText}>
                          {eventStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {/* End Date & Time */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>End</Text>
                  <View style={styles.dateTimeRow}>
                    <Pressable
                      style={styles.dateTimeBtn}
                      onPress={() => setPickerTarget("event_end_date")}
                    >
                      <CalIcon size={16} color={colors.accent} />
                      <Text style={styles.dateTimeBtnText}>
                        {eventEnd.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </Pressable>

                    {!isAllDay ? (
                      <Pressable
                        style={styles.dateTimeBtn}
                        onPress={() => setPickerTarget("event_end_time")}
                      >
                        <Clock size={16} color={colors.accent} />
                        <Text style={styles.dateTimeBtnText}>
                          {eventEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {/* Calendar */}
                {calendars.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Calendar</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsRow}
                    >
                      {calendars.map((c) => {
                        const isSelected = eventCalendarId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            style={[
                              styles.listChip,
                              isSelected && {
                                borderColor: c.color || colors.accent,
                                backgroundColor: (c.color || colors.accent) + "20",
                              },
                            ]}
                            onPress={() => setEventCalendarId(c.id)}
                          >
                            <View
                              style={[
                                styles.listDot,
                                { backgroundColor: c.color || colors.accent },
                              ]}
                            />
                            <Text
                              style={[
                                styles.listChipText,
                                isSelected && { color: c.color || colors.accent, fontWeight: "700" },
                              ]}
                            >
                              {c.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Busy Switch */}
                <View style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <Text style={styles.cardRowTitle}>Blocks Schedule (Busy)</Text>
                    <Text style={styles.cardRowSubtitle}>
                      Prevents tasks from being scheduled during this time
                    </Text>
                  </View>
                  <Switch
                    value={isBusy}
                    onValueChange={setIsBusy}
                    trackColor={{ false: colors.line, true: colors.accent }}
                    thumbColor={colors.onAccent}
                  />
                </View>

                {/* Location Input */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Location</Text>
                  <View style={styles.inputRow}>
                    <MapPin size={16} color={colors.muted} />
                    <TextInput
                      style={styles.textInput}
                      value={eventLocation}
                      onChangeText={setEventLocation}
                      placeholder="Add location"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>
              </>
            )}

            {/* Notes Input */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Notes</Text>
              <TextInput
                style={[styles.textInput, { height: 72, textAlignVertical: "top" }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes or description…"
                placeholderTextColor={colors.muted}
                multiline
              />
            </View>
          </ScrollView>

          {/* DateTimePicker Native Dialog */}
          {pickerTarget ? (
            <DateTimePicker
              value={
                pickerTarget.startsWith("due")
                  ? dueDate
                  : pickerTarget.startsWith("event_start")
                  ? eventStart
                  : eventEnd
              }
              mode={pickerTarget.endsWith("time") ? "time" : "date"}
              is24Hour={false}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handlePickerChange}
            />
          ) : null}
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
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "90%",
      paddingBottom: 24,
      borderWidth: 1,
      borderColor: colors.line,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.lineSoft,
    },
    closeBtn: {
      padding: 6,
    },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.mutedBg,
      borderRadius: 10,
      padding: 3,
    },
    segmentBtn: {
      paddingHorizontal: 18,
      paddingVertical: 6,
      borderRadius: 8,
    },
    segmentBtnActive: {
      backgroundColor: colors.accent,
    },
    segmentBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted,
    },
    segmentBtnTextActive: {
      color: colors.onAccent,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
    },
    saveBtnDisabled: {
      opacity: 0.5,
    },
    saveBtnText: {
      color: colors.onAccent,
      fontWeight: "700",
      fontSize: 14,
    },
    errorBanner: {
      color: colors.danger,
      backgroundColor: colors.dangerLight,
      padding: 8,
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 8,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
    },
    scrollBody: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      gap: 16,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    checkCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    checkCircleChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    titleInput: {
      flex: 1,
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      paddingVertical: 6,
    },
    titleInputCompleted: {
      color: colors.muted,
      textDecorationLine: "line-through",
      opacity: 0.7,
    },
    cardRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceRaised,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.lineSoft,
    },
    cardRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      marginRight: 10,
    },
    cardRowTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    cardRowSubtitle: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 1,
    },
    section: {
      gap: 8,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    chipsRow: {
      flexDirection: "row",
      gap: 8,
    },
    chip: {
      backgroundColor: colors.mutedBg,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.onAccent,
    },
    dateTimeRow: {
      flexDirection: "row",
      gap: 10,
    },
    dateTimeBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    dateTimeBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    hintText: {
      fontSize: 12,
      color: colors.muted,
      fontStyle: "italic",
    },
    listChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    listDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    listChipText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
    },
    priorityRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    priorityBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    priorityBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    textInput: {
      backgroundColor: colors.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
    },
  });
}
