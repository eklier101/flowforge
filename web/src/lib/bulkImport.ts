import { pad } from "./format";
import { addDays, isoDate } from "./dates";

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
    lower === "opened" ||
    lower === "open" ||
    lower === "course status open" ||
    lower === "content" ||
    lower === "calendar" ||
    lower === "announcements" ||
    lower === "gradebook" ||
    lower === "messages" ||
    lower === "groups" ||
    lower === "achievements" ||
    lower === "course faculty" ||
    lower === "instructor" ||
    lower === "details & actions" ||
    lower === "roster" ||
    lower === "view everyone in your course" ||
    lower === "attendance" ||
    lower === "view your attendance" ||
    lower === "books & tools" ||
    lower === "view course & institution tools" ||
    lower === "help for current page" ||
    lower === "courses" ||
    (i > 0 && lines[i - 1].toLowerCase().trim() === "course faculty") ||
    (i < lines.length - 1 && lines[i + 1].toLowerCase().trim() === "instructor") ||
    lower.startsWith("skip to") ||
    lower.startsWith("let's learn") ||
    lower.startsWith("no more content") ||
    /^\d+\s+of\s+\d+\s+completed/i.test(lower) ||
    lower.startsWith("mark as") ||
    lower.startsWith("this item cannot be") ||
    lower.startsWith("this item is a container") ||
    lower.startsWith("it will be marked") ||
    lower.startsWith("preview what is") ||
    lower.startsWith("topics covered") ||
    lower.startsWith("welcome") ||
    lower.startsWith("in this assignment") ||
    lower.startsWith("this folder") ||
    lower.startsWith("this enchanted") ||
    lower.startsWith("for this module") ||
    lower.startsWith("select the appropriate") ||
    lower.startsWith("the academic policies") ||
    lower.startsWith("website homepage for") ||
    lower.startsWith("find the resources") ||
    lower.startsWith("central carolina community college advising") ||
    lower.startsWith("http") ||
    lower.startsWith("due") ||
    lower.startsWith("instead of") ||
    lower.startsWith("you have") ||
    lower.includes("graded reflection")
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
    if (
      isIgnoredLine(lower, lines, i) ||
      line.length <= 2 ||
      line.length > 85 ||
      (line.length > 50 && (line.includes(". ") || line.includes("! ") || line.includes("? ")))
    ) {
      continue;
    }

    let cleanTitle = line;
    if (cleanTitle.includes(":") && cleanTitle.length > 40) {
      const parts = cleanTitle.split(":");
      if (parts[0].length > 3 && parts[0].length < 50) cleanTitle = parts[0];
    }
    cleanTitle = cleanTitle.replace(/^[\s\-•*\d.)\]]+\s*/, "").replace(/\s*\([A-Z]{3,4}\)/gi, "").trim();
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

export const BOOKMARKLET_CODE =
  `javascript:(function(){var items=[];var seen=new Set();function clean(s){return s?s.replace(/\\s+/g,' ').trim():'';}function isNavOrSystem(t){var l=t.toLowerCase();return l==='content'||l==='calendar'||l==='announcements'||l==='gradebook'||l==='messages'||l==='groups'||l==='achievements'||l==='course faculty'||l==='details & actions'||l==='roster'||l==='attendance'||l==='books & tools'||l==='courses'||l.startsWith('help for')||l.startsWith('skip to')||l.startsWith('view your')||l.startsWith('view everyone');}function isStatusOrBoilerplate(t){var l=t.toLowerCase();return l==='mark as started'||l==='mark as completed'||l==='completed'||l==='not started'||l==='in progress'||l==='no more content items to load'||l.startsWith('this item')||l.startsWith('it will be marked')||l.startsWith('let\\'s learn')||l.startsWith('preview what is')||l.match(/^\\d+\\s+of\\s+\\d+\\s+completed/i);}var containers=document.querySelectorAll('[data-content-id], .content-list-item, li[class*=\"content\"], [role=\"treeitem\"], [role=\"listitem\"], [class*=\"item-row\"], [class*=\"content-item\"], [class*=\"module-item\"]');if(!containers||containers.length===0){containers=document.querySelectorAll('a, button, [role=\"button\"], [class*=\"title\"], [class*=\"name\"]');}containers.forEach(function(c){var tEl=c.querySelector('a.ax-focusable-title, button.ax-focusable-title, a[data-analytics-id*=\"link\"], [data-analytics-id*=\"courseContent.link\"], [data-analytics-id*=\"document.link\"], [data-analytics-id*=\"assessment\"], [data-analytics-id*=\"toggleFolder\"], [data-analytics-id*=\"toggleLm\"], h3, h4, .title, [class*=\"title\"], [class*=\"item-title\"]')||c;if(!tEl)return;var t=clean(tEl.innerText);if(!t||t.length<3||isNavOrSystem(t)||isStatusOrBoilerplate(t)||seen.has(t))return;var dEl=c.querySelector('[class*=\"gradeDetail\"],[data-analytics-id*=\"due\"],.due-date,[class*=\"due\"],[class*=\"date\"]');var dText=dEl?clean(dEl.innerText):clean(c.innerText);var m=dText.match(/due(?:\\s+date)?:?\\s*([^\\n\\r]+)/i);seen.add(t);if(m){items.push(t+'\\nDue date: '+clean(m[1]));}else{items.push(t);}});var out=items.join('\\n\\n');if(out){navigator.clipboard.writeText(out).then(function(){alert('Copied '+items.length+' items/assignments! Paste into FlowForge.');});}else{alert('No items found. Make sure the module folder is open/expanded.');}})();`;
