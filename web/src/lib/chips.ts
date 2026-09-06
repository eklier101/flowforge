import type { Task, TimelineItem } from "@flowforge/api-client";

import { HOUR_H } from "./constants";
import { addDays, isoDate, parseDateKey, toLocalParts } from "./dates";

export type ChipData = {
  item: TimelineItem;
  index: number;
  startMinutes?: number;
  endMinutes?: number;
  top?: number;
  height?: number;
  lane?: number;
  lanes?: number;
};

export function isAllDay(item: TimelineItem, timeZone: string): boolean {
  const start = toLocalParts(item.start, timeZone);
  const end = toLocalParts(item.end, timeZone);
  const span = new Date(item.end).getTime() - new Date(item.start).getTime();
  return start.minutes === 0 && (span >= 23.5 * 3600 * 1000 || (end.minutes === 0 && end.date !== start.date));
}

export function packDay(chips: ChipData[]): ChipData[] {
  const sorted = [...chips].sort((a, b) => (a.top ?? 0) - (b.top ?? 0) || (b.height ?? 0) - (a.height ?? 0));
  let cluster: ChipData[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    cluster.forEach((chip) => {
      let lane = laneEnds.findIndex((end) => end <= (chip.top ?? 0) + 0.5);
      if (lane === -1) {
        laneEnds.push((chip.top ?? 0) + (chip.height ?? 0));
        lane = laneEnds.length - 1;
      } else {
        laneEnds[lane] = (chip.top ?? 0) + (chip.height ?? 0);
      }
      chip.lane = lane;
    });
    cluster.forEach((chip) => {
      chip.lanes = laneEnds.length;
    });
    cluster = [];
    clusterEnd = -1;
  };

  sorted.forEach((chip) => {
    if (cluster.length && (chip.top ?? 0) >= clusterEnd) flush();
    cluster.push(chip);
    clusterEnd = Math.max(clusterEnd, (chip.top ?? 0) + (chip.height ?? 0));
  });
  flush();
  return sorted;
}

export function buildChips(
  dayKeys: string[],
  items: TimelineItem[],
  timeZone: string,
): { timed: Map<string, ChipData[]>; allDay: Map<string, { item: TimelineItem; index: number }[]> } {
  const timed = new Map(dayKeys.map((key) => [key, [] as ChipData[]]));
  const allDay = new Map(dayKeys.map((key) => [key, [] as { item: TimelineItem; index: number }[]]));

  items.forEach((item, index) => {
    const start = toLocalParts(item.start, timeZone);
    const end = toLocalParts(item.end, timeZone);
    if (isAllDay(item, timeZone)) {
      let cursor = parseDateKey(start.date);
      const last = end.minutes === 0 ? addDays(parseDateKey(end.date), -1) : parseDateKey(end.date);
      while (cursor <= last) {
        const key = isoDate(cursor);
        if (allDay.has(key)) allDay.get(key)!.push({ item, index });
        cursor = addDays(cursor, 1);
      }
      return;
    }
    if (!timed.has(start.date)) return;
    const endMinutes = end.date === start.date ? Math.max(end.minutes, start.minutes + 15) : 24 * 60;
    timed.get(start.date)!.push({
      item,
      index,
      startMinutes: start.minutes,
      endMinutes,
      top: (start.minutes / 60) * HOUR_H,
      height: Math.max(20, ((endMinutes - start.minutes) / 60) * HOUR_H - 2),
    });
  });

  timed.forEach((chips, key) => timed.set(key, packDay(chips)));
  return { timed, allDay };
}

export function isTaskCompleted(item: TimelineItem, tasks: Task[]): boolean {
  if (item.kind !== "task") return false;
  if (item.is_completed) return true;
  if (item.task_id) return Boolean(tasks.find((t) => t.id === item.task_id)?.is_completed);
  return false;
}
