import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import { createTask, listTaskLists, runAutoSchedule, type TaskList } from "../api/client";
import { useTheme } from "../ThemeProvider";
import type { Colors } from "../theme";
import { localValueToUtcISO, parseBulkAssignmentsText, type BulkParsedTask } from "../utils/bulkImport";

type Props = {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
  defaultListId?: number | null;
};

export function BulkImportModal({ visible, onClose, onImported, defaultListId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [lists, setLists] = useState<TaskList[]>([]);
  const [inputText, setInputText] = useState("");
  const [targetListId, setTargetListId] = useState<number | null>(defaultListId ?? null);
  const [defaultDur, setDefaultDur] = useState(60);
  const [defaultPrio, setDefaultPrio] = useState(3);
  const [parsedTasks, setParsedTasks] = useState<BulkParsedTask[]>([]);
  const [statusMsg, setStatusMsg] = useState("Ready");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setInputText("");
    setDefaultDur(60);
    setDefaultPrio(3);
    setParsedTasks([]);
    setStatusMsg("Ready");
    setSubmitting(false);
    void listTaskLists()
      .then((fetched) => {
        setLists(fetched);
        if (defaultListId && fetched.some((l) => l.id === defaultListId)) {
          setTargetListId(defaultListId);
        } else if (fetched.length) {
          setTargetListId(fetched[0].id);
        }
      })
      .catch(() => setLists([]));
  }, [visible, defaultListId]);

  function reparse(text: string) {
    setParsedTasks(parseBulkAssignmentsText(text, defaultDur, defaultPrio));
  }

  useEffect(() => {
    if (visible) reparse(inputText);
  }, [defaultDur, defaultPrio, visible]);

  const selectedCount = parsedTasks.filter((t) => t.selected).length;

  function toggleAll(selected: boolean) {
    setParsedTasks((prev) => prev.map((t) => ({ ...t, selected })));
  }

  async function submit() {
    const selected = parsedTasks.filter((t) => t.selected);
    if (!selected.length) return;
    setSubmitting(true);
    setStatusMsg("Importing & calculating schedule...");
    try {
      for (const t of selected) {
        await createTask({
          title: t.title.trim(),
          duration_minutes: t.duration || defaultDur,
          due_date: localValueToUtcISO(t.dueDate, t.dueTime || "23:59"),
          priority: t.priority || defaultPrio,
          allow_splitting: true,
          min_split_minutes: 10,
          buffer_before_minutes: 0,
          buffer_minutes: 0,
          list_id: targetListId,
          recurrence: "none",
          start_after: null,
        });
      }
      await runAutoSchedule(true);
      onClose();
      onImported();
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bulk Import Tasks</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.tip}>
            Paste assignments from Blackboard, Canvas, or a syllabus. Titles and due dates are detected automatically.
          </Text>

          <TextInput
            style={styles.textarea}
            multiline
            placeholder="Paste assignments here..."
            placeholderTextColor={colors.muted}
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              reparse(text);
            }}
          />

          <Text style={styles.previewHead}>
            Parsed: {parsedTasks.length} ({selectedCount} selected)
          </Text>

          {parsedTasks.map((task, idx) => (
            <View key={`${task.lineIndex}-${idx}`} style={styles.row}>
              <Switch
                value={task.selected}
                onValueChange={(v) =>
                  setParsedTasks((prev) => {
                    const copy = [...prev];
                    copy[idx] = { ...copy[idx], selected: v };
                    return copy;
                  })
                }
                trackColor={{ false: colors.line, true: colors.accent }}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{task.title}</Text>
                <Text style={styles.rowMeta}>
                  Due {task.dueDate} {task.dueTime}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.status}>{statusMsg}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={() => toggleAll(!parsedTasks.every((t) => t.selected))}>
              <Text style={styles.secondaryBtnText}>Select All</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, (!selectedCount || submitting) && styles.primaryBtnDisabled]}
              disabled={!selectedCount || submitting}
              onPress={() => void submit()}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>Import {selectedCount || ""}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.text },
    body: { padding: 16, gap: 12 },
    tip: { color: colors.muted, lineHeight: 20 },
    textarea: {
      minHeight: 140,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      textAlignVertical: "top",
    },
    previewHead: { color: colors.muted, fontWeight: "600" },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
    rowText: { flex: 1 },
    rowTitle: { color: colors.text, fontWeight: "600" },
    rowMeta: { color: colors.muted, fontSize: 12 },
    footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: 10 },
    status: { color: colors.muted, fontSize: 12 },
    actions: { flexDirection: "row", gap: 10 },
    secondaryBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    secondaryBtnText: { color: colors.text, fontWeight: "600" },
    primaryBtn: {
      flex: 2,
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: colors.onAccent, fontWeight: "700" },
  });
}
