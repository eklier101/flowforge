package scheduler

import (
	"strconv"
	"strings"
	"time"
)

type TaskInstance struct {
	TaskWithList
	EffectiveDue time.Time
}

func ExpandRecurringTasks(tasks []TaskWithList, loc *time.Location, rangeStart, rangeEnd time.Time) []TaskInstance {
	rangeStart = EnsureUTC(rangeStart)
	rangeEnd = EnsureUTC(rangeEnd)
	var out []TaskInstance
	for _, t := range tasks {
		rec := strings.TrimSpace(strings.ToLower(t.Recurrence))
		if rec == "" || rec == "none" {
			out = append(out, TaskInstance{TaskWithList: t, EffectiveDue: t.DueDate})
			continue
		}
		dates := expandRecurrence(rec, t.DueDate.In(loc), loc, rangeStart, rangeEnd)
		if len(dates) == 0 {
			out = append(out, TaskInstance{TaskWithList: t, EffectiveDue: t.DueDate})
			continue
		}
		for _, d := range dates {
			out = append(out, TaskInstance{TaskWithList: t, EffectiveDue: d.UTC()})
		}
	}
	return out
}

func expandRecurrence(recurrence string, anchor time.Time, loc *time.Location, rangeStart, rangeEnd time.Time) []time.Time {
	anchor = anchor.In(loc)
	rangeStartLocal := rangeStart.In(loc)
	rangeEndLocal := rangeEnd.In(loc)

	if strings.HasPrefix(recurrence, "custom:") {
		return expandCustomRecurrence(recurrence, anchor, loc, rangeStartLocal, rangeEndLocal)
	}

	switch recurrence {
	case "daily":
		return expandDaily(anchor, rangeStartLocal, rangeEndLocal, 1)
	case "weekly":
		return expandWeekly(anchor, rangeStartLocal, rangeEndLocal, 1)
	case "weekdays":
		return expandWeekdays(anchor, rangeStartLocal, rangeEndLocal)
	case "monthly":
		return expandMonthly(anchor, rangeStartLocal, rangeEndLocal, 1)
	case "yearly":
		return expandYearly(anchor, rangeStartLocal, rangeEndLocal, 1)
	default:
		return nil
	}
}

func expandCustomRecurrence(recurrence string, anchor time.Time, loc *time.Location, rangeStart, rangeEnd time.Time) []time.Time {
	parts := strings.Split(recurrence, ":")
	if len(parts) < 3 {
		return nil
	}
	interval, _ := strconv.Atoi(parts[1])
	if interval < 1 {
		interval = 1
	}
	unit := parts[2]
	daysStr := ""
	endType := "never"
	if len(parts) > 3 {
		daysStr = parts[3]
	}
	if len(parts) > 4 {
		endType = parts[4]
	}

	maxOccurrences := 0
	switch endType {
	case "after_occurrences":
		maxOccurrences = 10
	}

	switch unit {
	case "day":
		return limitOccurrences(expandDaily(anchor, rangeStart, rangeEnd, interval), maxOccurrences)
	case "week":
		var days []int
		if daysStr != "" {
			for _, s := range strings.Split(daysStr, ",") {
				s = strings.TrimSpace(s)
				if s == "" {
					continue
				}
				if d, err := strconv.Atoi(s); err == nil {
					days = append(days, d)
				}
			}
		}
		if len(days) == 0 {
			days = []int{int(anchor.Weekday())}
		}
		return limitOccurrences(expandCustomWeekly(anchor, rangeStart, rangeEnd, interval, days), maxOccurrences)
	case "month":
		return limitOccurrences(expandMonthly(anchor, rangeStart, rangeEnd, interval), maxOccurrences)
	case "year":
		return limitOccurrences(expandYearly(anchor, rangeStart, rangeEnd, interval), maxOccurrences)
	default:
		return nil
	}
}

func limitOccurrences(dates []time.Time, max int) []time.Time {
	if max <= 0 || len(dates) <= max {
		return dates
	}
	return dates[:max]
}

func occurrenceInRange(candidate time.Time, rangeStart, rangeEnd time.Time) bool {
	candidateUTC := candidate.UTC()
	return !candidateUTC.Before(rangeStart.UTC()) && !candidateUTC.After(rangeEnd.UTC())
}

func expandDaily(anchor, rangeStart, rangeEnd time.Time, stepDays int) []time.Time {
	var out []time.Time
	cursor := time.Date(anchor.Year(), anchor.Month(), anchor.Day(), anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), anchor.Location())
	if cursor.Before(rangeStart) {
		days := int(rangeStart.Sub(cursor).Hours() / 24)
		skip := days / stepDays
		if days%stepDays != 0 || rangeStart.After(cursor.AddDate(0, 0, skip*stepDays)) {
			skip++
		}
		cursor = cursor.AddDate(0, 0, skip*stepDays)
	}
	for !cursor.After(rangeEnd) {
		if occurrenceInRange(cursor, rangeStart, rangeEnd) {
			out = append(out, cursor.UTC())
		}
		cursor = cursor.AddDate(0, 0, stepDays)
	}
	return out
}

func expandWeekly(anchor, rangeStart, rangeEnd time.Time, stepWeeks int) []time.Time {
	return expandCustomWeekly(anchor, rangeStart, rangeEnd, stepWeeks, []int{int(anchor.Weekday())})
}

func expandCustomWeekly(anchor, rangeStart, rangeEnd time.Time, stepWeeks int, weekdays []int) []time.Time {
	daySet := make(map[int]bool, len(weekdays))
	for _, d := range weekdays {
		daySet[d] = true
	}
	var out []time.Time
	startDay := time.Date(rangeStart.Year(), rangeStart.Month(), rangeStart.Day(), 0, 0, 0, 0, rangeStart.Location())
	if anchor.Before(startDay) {
		startDay = time.Date(anchor.Year(), anchor.Month(), anchor.Day(), 0, 0, 0, 0, anchor.Location())
	}
	endDay := time.Date(rangeEnd.Year(), rangeEnd.Month(), rangeEnd.Day(), 23, 59, 59, 0, rangeEnd.Location())
	anchorWeekStart := weekStart(anchor)
	for day := startDay; !day.After(endDay); day = day.AddDate(0, 0, 1) {
		if !daySet[int(day.Weekday())] {
			continue
		}
		weeksSince := int(day.Sub(anchorWeekStart).Hours() / (24 * 7))
		if weeksSince < 0 || weeksSince%stepWeeks != 0 {
			continue
		}
		occ := time.Date(day.Year(), day.Month(), day.Day(), anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), anchor.Location())
		if occ.Before(anchor) {
			continue
		}
		if occurrenceInRange(occ, rangeStart, rangeEnd) {
			out = append(out, occ.UTC())
		}
	}
	return out
}

func weekStart(t time.Time) time.Time {
	wd := int(t.Weekday())
	return time.Date(t.Year(), t.Month(), t.Day()-wd, 0, 0, 0, 0, t.Location())
}

func expandWeekdays(anchor, rangeStart, rangeEnd time.Time) []time.Time {
	return expandCustomWeekly(anchor, rangeStart, rangeEnd, 1, []int{1, 2, 3, 4, 5})
}

func expandMonthly(anchor, rangeStart, rangeEnd time.Time, stepMonths int) []time.Time {
	var out []time.Time
	cursor := time.Date(anchor.Year(), anchor.Month(), anchor.Day(), anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), anchor.Location())
	for cursor.Before(rangeStart) {
		cursor = cursor.AddDate(0, stepMonths, 0)
	}
	for !cursor.After(rangeEnd) {
		if !cursor.Before(anchor) && occurrenceInRange(cursor, rangeStart, rangeEnd) {
			out = append(out, cursor.UTC())
		}
		cursor = cursor.AddDate(0, stepMonths, 0)
	}
	return out
}

func expandYearly(anchor, rangeStart, rangeEnd time.Time, stepYears int) []time.Time {
	var out []time.Time
	cursor := time.Date(anchor.Year(), anchor.Month(), anchor.Day(), anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), anchor.Location())
	for cursor.Before(rangeStart) {
		cursor = cursor.AddDate(stepYears, 0, 0)
	}
	for !cursor.After(rangeEnd) {
		if !cursor.Before(anchor) && occurrenceInRange(cursor, rangeStart, rangeEnd) {
			out = append(out, cursor.UTC())
		}
		cursor = cursor.AddDate(stepYears, 0, 0)
	}
	return out
}
