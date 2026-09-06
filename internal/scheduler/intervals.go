package scheduler

import (
	"strings"
	"time"
)

const HorizonDays = 14
const DefaultTimezone = "America/New_York"

type Interval struct {
	Start time.Time
	End   time.Time
}

func EnsureUTC(t time.Time) time.Time {
	if t.Location() == time.UTC {
		return t
	}
	return t.UTC()
}

func ParseHHMM(value string) (int, int) {
	parts := strings.SplitN(value, ":", 2)
	h, m := 0, 0
	if len(parts) > 0 {
		h = atoi(parts[0])
	}
	if len(parts) > 1 {
		m = atoi(parts[1])
	}
	return h, m
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func MergeIntervals(intervals []Interval) []Interval {
	if len(intervals) == 0 {
		return nil
	}
	ordered := make([]Interval, 0, len(intervals))
	for _, iv := range intervals {
		s, e := EnsureUTC(iv.Start), EnsureUTC(iv.End)
		if e.After(s) {
			ordered = append(ordered, Interval{s, e})
		}
	}
	if len(ordered) == 0 {
		return nil
	}
	for i := range ordered {
		for j := i + 1; j < len(ordered); j++ {
			if ordered[j].Start.Before(ordered[i].Start) {
				ordered[i], ordered[j] = ordered[j], ordered[i]
			}
		}
	}
	merged := []Interval{ordered[0]}
	for _, iv := range ordered[1:] {
		last := &merged[len(merged)-1]
		if !iv.Start.After(last.End) {
			if iv.End.After(last.End) {
				last.End = iv.End
			}
		} else {
			merged = append(merged, iv)
		}
	}
	return merged
}

func SubtractBusy(windows, busy []Interval) []Interval {
	busyMerged := MergeIntervals(busy)
	var available []Interval
	for _, w := range MergeIntervals(windows) {
		cursor := w.Start
		for _, b := range busyMerged {
			if !b.End.After(cursor) || !b.Start.Before(w.End) {
				continue
			}
			if b.Start.After(cursor) {
				end := b.Start
				if end.After(w.End) {
					end = w.End
				}
				available = append(available, Interval{cursor, end})
			}
			if b.End.After(cursor) {
				cursor = b.End
			}
			if !cursor.Before(w.End) {
				break
			}
		}
		if cursor.Before(w.End) {
			available = append(available, Interval{cursor, w.End})
		}
	}
	out := make([]Interval, 0, len(available))
	for _, iv := range available {
		if iv.End.After(iv.Start) {
			out = append(out, iv)
		}
	}
	return out
}

func SubtractInterval(available []Interval, cutStart, cutEnd time.Time) []Interval {
	cutStart, cutEnd = EnsureUTC(cutStart), EnsureUTC(cutEnd)
	if !cutEnd.After(cutStart) {
		return available
	}
	var result []Interval
	for _, iv := range available {
		if !cutEnd.After(iv.Start) || !cutStart.Before(iv.End) {
			result = append(result, iv)
			continue
		}
		if iv.Start.Before(cutStart) {
			result = append(result, Interval{iv.Start, cutStart})
		}
		if cutEnd.Before(iv.End) {
			result = append(result, Interval{cutEnd, iv.End})
		}
	}
	out := make([]Interval, 0, len(result))
	for _, iv := range result {
		if iv.End.After(iv.Start) {
			out = append(out, iv)
		}
	}
	return out
}

func IntervalMinutes(iv Interval) int {
	return int(EnsureUTC(iv.End).Sub(EnsureUTC(iv.Start)).Minutes())
}
