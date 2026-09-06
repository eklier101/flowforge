package scheduler

import (
	"testing"
	"time"
)

func TestExpandDailyRecurrence(t *testing.T) {
	loc := time.UTC
	anchor := time.Date(2026, 1, 1, 23, 59, 0, 0, loc)
	rangeStart := time.Date(2026, 1, 1, 0, 0, 0, 0, loc)
	rangeEnd := time.Date(2026, 1, 5, 23, 59, 0, 0, loc)
	dates := expandRecurrence("daily", anchor, loc, rangeStart, rangeEnd)
	if len(dates) != 5 {
		t.Fatalf("expected 5 daily occurrences, got %d", len(dates))
	}
}

func TestExpandWeekdaysRecurrence(t *testing.T) {
	loc := time.UTC
	anchor := time.Date(2026, 1, 5, 12, 0, 0, 0, loc) // Monday
	rangeStart := time.Date(2026, 1, 5, 0, 0, 0, 0, loc)
	rangeEnd := time.Date(2026, 1, 11, 23, 59, 0, 0, loc)
	dates := expandRecurrence("weekdays", anchor, loc, rangeStart, rangeEnd)
	if len(dates) != 5 {
		t.Fatalf("expected 5 weekday occurrences, got %d", len(dates))
	}
}

func TestExpandCustomWeeklyRecurrence(t *testing.T) {
	loc := time.UTC
	anchor := time.Date(2026, 1, 7, 10, 0, 0, 0, loc) // Wednesday
	rangeStart := time.Date(2026, 1, 1, 0, 0, 0, 0, loc)
	rangeEnd := time.Date(2026, 1, 31, 23, 59, 0, 0, loc)
	dates := expandRecurrence("custom:1:week:1,3,5:", anchor, loc, rangeStart, rangeEnd)
	if len(dates) < 4 {
		t.Fatalf("expected multiple Mon/Wed/Fri occurrences, got %d", len(dates))
	}
}

func TestPickSlotCloseToDeadline(t *testing.T) {
	base := time.Date(2026, 1, 10, 9, 0, 0, 0, time.UTC)
	due := time.Date(2026, 1, 10, 17, 0, 0, 0, time.UTC)
	slots := []Interval{
		{base, base.Add(2 * time.Hour)},
		{base.Add(4 * time.Hour), base.Add(6 * time.Hour)},
	}
	idx := pickSlotIndex(slots, 60, "Close to deadline", due, 2)
	if idx != 1 {
		t.Fatalf("expected slot index 1 for close-to-deadline, got %d", idx)
	}
}

func TestPickSlotFrontLoad(t *testing.T) {
	base := time.Date(2026, 1, 10, 9, 0, 0, 0, time.UTC)
	due := time.Date(2026, 1, 10, 17, 0, 0, 0, time.UTC)
	slots := []Interval{
		{base, base.Add(2 * time.Hour)},
		{base.Add(4 * time.Hour), base.Add(6 * time.Hour)},
	}
	idx := pickSlotIndex(slots, 60, "Front-load", due, 1)
	if idx != 0 {
		t.Fatalf("expected slot index 0 for front-load, got %d", idx)
	}
}
