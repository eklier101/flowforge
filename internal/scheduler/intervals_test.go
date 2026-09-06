package scheduler

import (
	"testing"
	"time"

	"github.com/flowforge/scheduler/internal/models"
)

func TestMergeIntervals(t *testing.T) {
	base := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	merged := MergeIntervals([]Interval{
		{base, base.Add(1 * time.Hour)},
		{base.Add(30 * time.Minute), base.Add(2 * time.Hour)},
	})
	if len(merged) != 1 {
		t.Fatalf("expected 1 merged interval, got %d", len(merged))
	}
	if !merged[0].End.Equal(base.Add(2 * time.Hour)) {
		t.Fatalf("unexpected end: %v", merged[0].End)
	}
}

func TestSubtractBusy(t *testing.T) {
	base := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	windows := []Interval{{base, base.Add(4 * time.Hour)}}
	busy := []Interval{{base.Add(1 * time.Hour), base.Add(2 * time.Hour)}}
	free := SubtractBusy(windows, busy)
	if len(free) != 2 {
		t.Fatalf("expected 2 free windows, got %d", len(free))
	}
}

func TestScheduleTaskUnsplit(t *testing.T) {
	base := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	available := []Interval{{base, base.Add(3 * time.Hour)}}
	task := TaskWithList{Task: modelsTask(60, true, 10, 0, 0)}
	opts := ScheduleOptions{WorkloadMode: "Front-load", DueDate: base.Add(24 * time.Hour), BufferDays: 1}
	avail, placements := scheduleTask(available, task, opts)
	if len(placements) != 1 {
		t.Fatalf("expected 1 placement, got %d", len(placements))
	}
	if IntervalMinutes(placements[0]) != 60 {
		t.Fatalf("expected 60 minute placement")
	}
	if len(avail) == 0 {
		t.Fatal("expected remaining availability")
	}
}

func modelsTask(duration int, allowSplit bool, minSplit, bufBefore, bufAfter int) models.Task {
	return models.Task{
		DurationMinutes:     duration,
		AllowSplitting:      allowSplit,
		MinSplitMinutes:     minSplit,
		BufferBeforeMinutes: bufBefore,
		BufferMinutes:       bufAfter,
	}
}
