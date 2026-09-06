function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type BulkParsedTask = {
  selected: boolean;
  title: string;
  dueDate: string;
  dueTime: string;
  duration: number;
  priority: number;
  hasExplicitDue: boolean;
  lineIndex?: number;
};

function parseDateString(dateStr: string, timeStr: string): { date: string; time: string } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  const raw = `${dateStr || ""} ${timeStr || ""}`.trim();

  let t24 = "23:59";
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let h = Number(timeMatch[1]);
    const m = Number(timeMatch[2]);
    const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    t24 = `${pad(h)}:${pad(m)}`;
  } else {
    const hourOnlyMatch = raw.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    if (hourOnlyMatch) {
      let h = Number(hourOnlyMatch[1]);
      const ampm = hourOnlyMatch[2].toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      t24 = `${pad(h)}:00`;
    }
  }

  const m1 = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m1) {
    month = Number(m1[1]);
    day = Number(m1[2]);
    if (m1[3]) {
      year = Number(m1[3]);
      if (year < 100) year += 2000;
    }
  } else {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    for (let i = 0; i < monthNames.length; i++) {
      const reg = new RegExp(`\\b${monthNames[i]}[a-z]*\\s+(\\d{1,2})(?:(?:st|nd|rd|th)?,?\\s*(\\d{4}))?`, "i");
      const mm = raw.match(reg);
      if (mm) {
        month = i + 1;
        day = Number(mm[1]);
        if (mm[2]) year = Number(mm[2]);
        break;
      }
    }
  }

  return { date: `${year}-${pad(month)}-${pad(day)}`, time: t24 };
}

function isIgnoredLine(lower: string, lines: string[], i: number): boolean {
  return (
    lower === "learning activities" ||
    lower === "course materials" ||
    lower === "mark as started" ||
    lower === "mark as completed" ||
    lower === "mark as complete" ||
    lower === "completed" ||
    lower === "not started" ||
    lower === "in progress" ||
    lower.startsWith("skip to") ||
    lower.startsWith("http") ||
    lower.startsWith("due") ||
    /^\d+\s+of\s+\d+\s+completed/i.test(lower)
  );
}

export function parseBulkAssignmentsText(
  text: string,
  defaultDur: number,
  defaultPrio: number,
): BulkParsedTask[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tasks: BulkParsedTask[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];
    const dueMatch = line.match(/due(?:\s+date)?[:\s]+([^\n\r]+)/i);

    if (dueMatch) {
      let title = "";
      if (i > 0) {
        let prevIdx = i - 1;
        while (prevIdx >= 0 && (consumed.has(prevIdx) || lines[prevIdx].match(/due(?:\s+date)?[:\s]/i))) {
          prevIdx--;
        }
        if (prevIdx >= 0 && !consumed.has(prevIdx)) {
          title = lines[prevIdx]
            .replace(/^[\s\-•*\d.)\]]+\s*/, "")
            .replace(/\s*\([A-Z]{3,4}\)/gi, "")
            .trim();
          consumed.add(prevIdx);
        }
      }
      if (!title) {
        title = line.substring(0, dueMatch.index)
          .replace(/^[\s\-•*\d.)\]]+\s*/, "")
          .replace(/[-–:]$/, "")
          .trim();
      }
      consumed.add(i);
      if (title) {
        const rawDue = dueMatch[1].replace(/\s*\([A-Z]{3,4}\)/gi, "").trim();
        const parsed = parseDateString(rawDue, "");
        tasks.push({
          selected: true,
          title,
          dueDate: parsed.date,
          dueTime: parsed.time,
          duration: defaultDur,
          priority: defaultPrio,
          hasExplicitDue: true,
          lineIndex: i,
        });
      }
      continue;
    }

    const dateAtEnd = line.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s*,?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
    if (dateAtEnd && dateAtEnd.index !== undefined && dateAtEnd.index > 3) {
      const titlePart = line.substring(0, dateAtEnd.index)
        .replace(/^[\s\-•*\d.)\]]+\s*/, "")
        .replace(/[-–:]$/, "")
        .trim();
      if (titlePart) {
        consumed.add(i);
        const parsed = parseDateString(dateAtEnd[0], "");
        tasks.push({
          selected: true,
          title: titlePart,
          dueDate: parsed.date,
          dueTime: parsed.time,
          duration: defaultDur,
          priority: defaultPrio,
          hasExplicitDue: true,
          lineIndex: i,
        });
      }
    }
  }

  let moduleDueDate: string | null = null;
  let moduleDueTime = "23:59";
  for (const t of tasks) {
    if (t.dueDate) {
      if (!moduleDueDate || t.dueDate > moduleDueDate) {
        moduleDueDate = t.dueDate;
        moduleDueTime = t.dueTime || "23:59";
      }
    }
  }
  if (!moduleDueDate) {
    moduleDueDate = isoDate(addDays(new Date(), 7));
  }

  const nonDueTasks: BulkParsedTask[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];
    const lower = line.toLowerCase().trim();
    if (isIgnoredLine(lower, lines, i) || line.length <= 2 || line.length > 85) {
      continue;
    }

    let cleanTitle = line.replace(/^[\s\-•*\d.)\]]+\s*/, "").replace(/\s*\([A-Z]{3,4}\)/gi, "").trim();
    if (cleanTitle && cleanTitle.length > 3) {
      nonDueTasks.push({
        selected: true,
        title: cleanTitle,
        dueDate: moduleDueDate!,
        dueTime: moduleDueTime,
        duration: defaultDur,
        priority: defaultPrio,
        hasExplicitDue: false,
        lineIndex: i,
      });
    }
  }

  const allTasks = [...nonDueTasks, ...tasks];
  allTasks.sort((a, b) => (a.lineIndex || 0) - (b.lineIndex || 0));
  return allTasks;
}

export function localValueToUtcISO(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = new Date(y, m - 1, d, hh, mm, 0, 0);
  return local.toISOString();
}
