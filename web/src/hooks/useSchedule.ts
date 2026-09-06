import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api";
import { useAppContext } from "../context/AppContext";
import { addDays, isoDate, parseDateKey, startOfDay, toLocalParts, visibleDays } from "../lib/dates";

function useBusyFlag() {
  const countRef = useRef(0);
  const [busy, setBusy] = useState(false);

  const setBusyFlag = useCallback((active: boolean) => {
    countRef.current = Math.max(0, countRef.current + (active ? 1 : -1));
    setBusy(countRef.current > 0);
  }, []);

  return { busy, setBusyFlag };
}

export function useSchedule() {
  const {
    prefs,
    timezone,
    updatePrefs,
    setItems,
    setScheduled,
    loadTasks,
    loadLists,
    loadCalendars,
    setTimezone,
    toast,
  } = useAppContext();

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [scrolled, setScrolled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { busy, setBusyFlag } = useBusyFlag();

  const scheduleParams = useMemo(() => {
    const days = visibleDays(anchor, prefs);
    return {
      days,
      dayKeys: days.map(isoDate),
      start: isoDate(days[0]),
      count: days.length,
    };
  }, [anchor, prefs.range, prefs.weekStart]);

  const applySchedulePayload = useCallback(
    (payload: Awaited<ReturnType<typeof api.getSchedule>>, ids: number[]) => {
      if (payload.timezone) setTimezone(payload.timezone);
      setItems(payload.items ?? []);
      setScheduled(new Set(ids ?? []));
    },
    [setItems, setScheduled, setTimezone],
  );

  const refreshScheduleData = useCallback(async () => {
    const [payload, ids] = await Promise.all([
      api.getSchedule(scheduleParams.start, scheduleParams.count),
      api.getScheduledTaskIds().catch(() => [] as number[]),
      loadTasks(),
    ]);
    applySchedulePayload(payload, ids);
  }, [scheduleParams.start, scheduleParams.count, loadTasks, applySchedulePayload]);

  const refresh = useCallback(async () => {
    setBusyFlag(true);
    try {
      const [payload, ids] = await Promise.all([
        api.getSchedule(scheduleParams.start, scheduleParams.count),
        api.getScheduledTaskIds().catch(() => [] as number[]),
        loadTasks(),
        loadLists(),
        loadCalendars(),
      ]);
      applySchedulePayload(payload, ids);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load schedule", "error");
    } finally {
      setBusyFlag(false);
    }
  }, [
    scheduleParams.start,
    scheduleParams.count,
    loadTasks,
    loadLists,
    loadCalendars,
    applySchedulePayload,
    setBusyFlag,
    toast,
  ]);

  useEffect(() => {
    void refresh();
    window.dispatchEvent(new CustomEvent("flowforge:schedule-updated"));
  }, [refresh]);

  const shiftRange = useCallback((steps: number) => {
    const n = prefs.range === "week" ? 7 : Number(prefs.range);
    setAnchor((a) => addDays(a, steps * n));
  }, [prefs.range]);

  const goToday = useCallback(() => {
    setAnchor(startOfDay(new Date()));
    setScrolled(false);
    void refreshScheduleData();
  }, [refreshScheduleData]);

  const jumpWeeks = useCallback((weeks: number) => {
    setAnchor((a) => addDays(a, weeks * 28));
  }, []);

  const setRange = useCallback((range: string) => {
    updatePrefs({ range });
  }, [updatePrefs]);

  const recalculate = useCallback(async (forceRefresh = false) => {
    setBusyFlag(true);
    try {
      const blocks = await api.runAutoSchedule(forceRefresh);
      if (blocks.length) {
        const first = toLocalParts(blocks[0].start_time, timezone).date;
        if (!scheduleParams.dayKeys.includes(first)) {
          setAnchor(parseDateKey(first));
        }
      }
      await refreshScheduleData();
      window.dispatchEvent(new CustomEvent("flowforge:schedule-updated"));
      return blocks.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recalculate failed";
      toast(message, "error");
      throw err;
    } finally {
      setBusyFlag(false);
    }
  }, [scheduleParams.dayKeys, refreshScheduleData, timezone, setBusyFlag, toast]);

  return {
    anchor,
    days: scheduleParams.days,
    dayKeys: scheduleParams.dayKeys,
    scrolled,
    setScrolled,
    isDragging,
    setIsDragging,
    busy,
    refreshScheduleData,
    refresh,
    shiftRange,
    goToday,
    jumpWeeks,
    setRange,
    recalculate,
  };
}
