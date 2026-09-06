import { useEffect, useState } from "react";

import { api } from "../../../api";
import { useAppContext } from "../../../context/AppContext";
import { localValueToUtcISO } from "../../../lib/dates";
import {
  BOOKMARKLET_CODE,
  parseBulkAssignmentsText,
  type BulkParsedTask,
} from "../../../lib/bulkImport";
import { Icon } from "../../icons/IconSprite";

type BulkTab = "paste" | "bookmarklet" | "ical";

export function BulkImportModal() {
  const {
    bulkImportOpen,
    bulkImportListId,
    closeBulkImportModal,
    lists,
    timezone,
    toast,
    syncAfterMutation,
  } = useAppContext();

  const [tab, setTab] = useState<BulkTab>("paste");
  const [inputText, setInputText] = useState("");
  const [targetListId, setTargetListId] = useState("");
  const [defaultDur, setDefaultDur] = useState(60);
  const [defaultPrio, setDefaultPrio] = useState(3);
  const [parsedTasks, setParsedTasks] = useState<BulkParsedTask[]>([]);
  const [statusMsg, setStatusMsg] = useState("Ready");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!bulkImportOpen) return;
    setTab("paste");
    setInputText("");
    setDefaultDur(60);
    setDefaultPrio(3);
    setParsedTasks([]);
    setStatusMsg("Ready");
    setSubmitting(false);
    if (bulkImportListId) {
      setTargetListId(String(bulkImportListId));
    } else if (lists.length) {
      setTargetListId(String(lists[0].id));
    } else {
      setTargetListId("");
    }
  }, [bulkImportOpen, bulkImportListId, lists]);

  function reparse(text: string) {
    setParsedTasks(parseBulkAssignmentsText(text, defaultDur, defaultPrio));
  }

  useEffect(() => {
    if (bulkImportOpen) reparse(inputText);
  }, [defaultDur, defaultPrio]); // reparse when defaults change

  if (!bulkImportOpen) return null;

  const selectedCount = parsedTasks.filter((t) => t.selected).length;

  function updateTask(idx: number, patch: Partial<BulkParsedTask>) {
    setParsedTasks((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }

  function toggleAll(selected: boolean) {
    setParsedTasks((prev) => prev.map((t) => ({ ...t, selected })));
  }

  async function submit() {
    const selected = parsedTasks.filter((t) => t.selected);
    if (!selected.length) return;
    setSubmitting(true);
    setStatusMsg("Importing & calculating schedule...");
    try {
      const listId = targetListId ? Number(targetListId) : null;
      const payload = selected.map((t) => ({
        title: t.title.trim(),
        duration_minutes: t.duration || 60,
        due_date: localValueToUtcISO(`${t.dueDate}T${t.dueTime || "23:59"}`, timezone),
        priority: t.priority || defaultPrio,
        allow_splitting: true,
        min_split_minutes: 10,
        buffer_before_minutes: 0,
        buffer_minutes: 0,
        list_id: listId,
        recurrence: "none",
        start_after: null,
      }));
      await api.createTasksBulk(payload);
      closeBulkImportModal();
      await syncAfterMutation();
      toast(`Imported and auto-scheduled ${payload.length} tasks!`, "ok");
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
      setSubmitting(false);
      toast(`Import failed: ${err instanceof Error ? err.message : "unknown"}`, "error");
    }
  }

  return (
    <div className="backdrop open" id="bulk-import-modal">
      <div className="bulk-import-card">
        <div className="bulk-header">
          <div className="bulk-title-wrap">
            <Icon name="copy" style={{ width: 20, height: 20, color: "var(--accent)" }} />
            <h3>Bulk Import Class Tasks & Due Dates</h3>
          </div>
          <div className="bulk-tabs">
            <button type="button" className={`bulk-tab-btn ${tab === "paste" ? "active" : ""}`} id="bulk-tab-paste" onClick={() => setTab("paste")}>
              Paste Text / Syllabus
            </button>
            <button type="button" className={`bulk-tab-btn ${tab === "bookmarklet" ? "active" : ""}`} id="bulk-tab-bookmarklet" onClick={() => setTab("bookmarklet")}>
              Blackboard 1-Click
            </button>
            <button type="button" className={`bulk-tab-btn ${tab === "ical" ? "active" : ""}`} id="bulk-tab-ical" onClick={() => setTab("ical")}>
              Calendar Sync
            </button>
          </div>
          <button className="icon-btn" type="button" id="bulk-import-close" title="Close" onClick={closeBulkImportModal}>
            <Icon name="x" />
          </button>
        </div>

        {tab === "paste" && (
          <div className="bulk-body" id="bulk-view-paste">
            <div className="bulk-section-tip">
              💡 <strong>Smart Parser:</strong> Copy and paste assignments straight from Blackboard, Canvas, syllabus documents, or emails. We&apos;ll automatically detect task titles and due dates!
            </div>

            <div className="bulk-options-bar">
              <div className="bulk-opt-group">
                <label htmlFor="bulk-target-list">Assign to List:</label>
                <select id="bulk-target-list" className="bulk-select" value={targetListId} onChange={(e) => setTargetListId(e.target.value)}>
                  {lists.map((l) => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="bulk-opt-group">
                <label htmlFor="bulk-default-dur">Default Duration:</label>
                <select id="bulk-default-dur" className="bulk-select" value={defaultDur} onChange={(e) => setDefaultDur(Number(e.target.value))}>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
              <div className="bulk-opt-group">
                <label htmlFor="bulk-default-prio">Priority:</label>
                <select id="bulk-default-prio" className="bulk-select" value={defaultPrio} onChange={(e) => setDefaultPrio(Number(e.target.value))}>
                  <option value={1}>Do ASAP</option>
                  <option value={2}>High</option>
                  <option value={3}>Normal</option>
                  <option value={4}>Low</option>
                </select>
              </div>
            </div>

            <textarea
              id="bulk-input-text"
              className="bulk-textarea"
              placeholder="Paste your Blackboard / course assignments or syllabus here..."
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                reparse(e.target.value);
              }}
              onPaste={() => window.setTimeout(() => reparse(inputText), 20)}
            />

            <div className="bulk-preview-wrap">
              <div className="bulk-preview-head">
                <span id="bulk-preview-count">Parsed Tasks: {parsedTasks.length} ({selectedCount} selected)</span>
                <button
                  type="button"
                  className="btn-quiet"
                  id="bulk-select-all-btn"
                  style={{ padding: "2px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    const allSel = parsedTasks.every((t) => t.selected);
                    toggleAll(!allSel);
                  }}
                >
                  Select All
                </button>
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                <table className="bulk-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          id="bulk-check-all"
                          checked={parsedTasks.length > 0 && parsedTasks.every((t) => t.selected)}
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                      </th>
                      <th>Task Title</th>
                      <th style={{ width: 130 }}>Due Date</th>
                      <th style={{ width: 100 }}>Due Time</th>
                      <th style={{ width: 80 }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody id="bulk-preview-tbody">
                    {parsedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                          Paste assignments above to preview tasks here.
                        </td>
                      </tr>
                    ) : (
                      parsedTasks.map((t, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              className="bulk-row-check"
                              data-bulk-idx={idx}
                              checked={t.selected}
                              onChange={(e) => updateTask(idx, { selected: e.target.checked })}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="bulk-task-title-input"
                              data-bulk-idx={idx}
                              data-field="title"
                              value={t.title}
                              onChange={(e) => updateTask(idx, { title: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              className="bulk-date-input"
                              data-bulk-idx={idx}
                              data-field="dueDate"
                              value={t.dueDate}
                              onChange={(e) => updateTask(idx, { dueDate: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              className="bulk-time-input"
                              data-bulk-idx={idx}
                              data-field="dueTime"
                              value={t.dueTime}
                              onChange={(e) => updateTask(idx, { dueTime: e.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              className="bulk-select"
                              style={{ padding: "2px 4px", fontSize: 11.5 }}
                              data-bulk-idx={idx}
                              data-field="duration"
                              value={t.duration}
                              onChange={(e) => updateTask(idx, { duration: Number(e.target.value) })}
                            >
                              <option value={30}>30m</option>
                              <option value={45}>45m</option>
                              <option value={60}>1h</option>
                              <option value={90}>1.5h</option>
                              <option value={120}>2h</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "bookmarklet" && (
          <div className="bulk-body" id="bulk-view-bookmarklet">
            <div className="bulk-section-tip">
              🎓 <strong>Blackboard 1-Click Tool:</strong> Save this bookmarklet to your browser. Whenever you&apos;re on a Blackboard course page, click it to automatically extract all assignments on the page and send them into FlowForge!
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>Bookmarklet Javascript:</label>
              <div className="bulk-bookmarklet-box" id="bulk-bookmarklet-code">{BOOKMARKLET_CODE}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-accent"
                  id="bulk-copy-bookmarklet-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(BOOKMARKLET_CODE).then(() => toast("Bookmarklet copied to clipboard!", "ok"));
                  }}
                >
                  Copy Bookmarklet Code
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  id="bulk-test-sample-btn"
                  onClick={() => {
                    const sample = `Academic Integrity and Citing Sources Quiz\nDue date: 8/30/26, 11:59 PM (EDT)\n\nA Conversation with Lincoln\nDue date: 8/30/26, 11:59 PM (EDT)\n\nAcademic Integrity Discussion Board: Ethical Scenario\nDue date: 8/28/26, 11:59 PM (EDT)`;
                    setInputText(sample);
                    reparse(sample);
                    setTab("paste");
                    toast("Sample Blackboard assignments loaded!", "ok");
                  }}
                >
                  Load Sample Blackboard Data
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 6 }}>
              <strong style={{ color: "var(--text)" }}>How to use:</strong><br />
              1. Copy the code above.<br />
              2. In Chrome/Brave/Edge, create a new bookmark (Ctrl+D), name it <code>Export Blackboard to FlowForge</code>, and paste the code into the <strong>URL</strong> field.<br />
              3. On any Blackboard page, click the bookmark to copy all assignments and paste them into the box!
            </div>
          </div>
        )}

        {tab === "ical" && (
          <div className="bulk-body" id="bulk-view-ical">
            <div className="bulk-section-tip">
              📅 <strong>Live Blackboard / Canvas Calendar Sync:</strong> Blackboard has a built-in iCal feed for all assignments across your courses.
            </div>
            <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.6 }}>
              <strong>To connect your Blackboard Calendar:</strong><br />
              1. Go to Blackboard and click <strong>Calendar</strong> in the left navigation bar.<br />
              2. Click the settings gear or <strong>External Calendar Link</strong> (or <em>Share Calendar</em>).<br />
              3. Copy the <code>.ics</code> URL.<br />
              4. In FlowForge, click <strong>+ Add Calendar</strong> in the sidebar, choose <strong>iCal / Webcal</strong>, and paste the URL.<br />
              5. FlowForge will continuously sync all assignment due dates and auto-schedule study/work time around them!
            </div>
          </div>
        )}

        <div className="bulk-footer">
          <span id="bulk-status-msg" style={{ fontSize: 13, color: "var(--muted)" }}>{statusMsg}</span>
          <div className="bulk-footer-actions">
            <button type="button" className="btn-secondary" id="bulk-cancel-btn" onClick={closeBulkImportModal}>Cancel</button>
            <button
              type="button"
              className="btn-accent"
              id="bulk-submit-btn"
              disabled={selectedCount === 0 || submitting}
              onClick={() => void submit()}
            >
              Import {selectedCount} Tasks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
