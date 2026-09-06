package scheduler

import (
	"strings"
	"sync"
	"time"

	"github.com/flowforge/scheduler/internal/ical"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/jmoiron/sqlx"
)

var scheduleLock sync.Mutex

type PresetData struct {
	Preset    models.SchedulingPreset
	Intervals []models.SchedulingInterval
	Overrides []models.SchedulingOverride
}

type TaskWithList struct {
	models.Task
	ListDefaultHours string `db:"default_hours"`
}

type ScheduleOptions struct {
	WorkloadMode string
	DueDate      time.Time
	BufferDays   int
}

type scheduleSettings struct {
	WorkloadDistribution string `db:"workload_distribution"`
	BufferDays           int    `db:"buffer_days"`
	LockStartedBlocks    bool   `db:"lock_started_blocks"`
	AutoSchedulingCutoff string `db:"auto_scheduling_cutoff"`
}

func horizonDaysFromCutoff(cutoff string) int {
	switch strings.TrimSpace(strings.ToLower(cutoff)) {
	case "1 week":
		return 7
	case "2 weeks":
		return 14
	case "3 weeks":
		return 21
	case "4 weeks":
		return 28
	case "5 weeks":
		return 35
	case "6 weeks":
		return 42
	case "7 weeks":
		return 49
	case "8 weeks":
		return 56
	default:
		return HorizonDays
	}
}

func GetZone(db *sqlx.DB, userID int64) *time.Location {
	var tz string
	_ = db.Get(&tz, `SELECT timezone FROM app_settings WHERE user_id = ?`, userID)
	if tz == "" {
		tz = DefaultTimezone
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc, _ = time.LoadLocation(DefaultTimezone)
	}
	return loc
}

func resolveWorkloadMode(globalMode string, taskOverride *string) string {
	if taskOverride != nil {
		v := strings.TrimSpace(*taskOverride)
		if v != "" {
			return v
		}
	}
	if m := strings.TrimSpace(globalMode); m != "" {
		return m
	}
	return "Balanced"
}

func trimBeforeDue(available []Interval, due time.Time) []Interval {
	due = EnsureUTC(due)
	var out []Interval
	for _, iv := range available {
		if !iv.Start.Before(due) {
			continue
		}
		end := iv.End
		if end.After(due) {
			end = due
		}
		if end.After(iv.Start) {
			out = append(out, Interval{iv.Start, end})
		}
	}
	return out
}

func trimAfter(available []Interval, after time.Time) []Interval {
	after = EnsureUTC(after)
	var out []Interval
	for _, iv := range available {
		if iv.End.After(after) {
			start := iv.Start
			if start.Before(after) {
				start = after
			}
			out = append(out, Interval{start, iv.End})
		}
	}
	return out
}

func pickSlotIndex(slots []Interval, minutesNeeded int, mode string, due time.Time, bufferDays int) int {
	var candidates []int
	for i, slot := range slots {
		if IntervalMinutes(slot) >= minutesNeeded {
			candidates = append(candidates, i)
		}
	}
	if len(candidates) == 0 {
		return -1
	}

	switch mode {
	case "Front-load":
		return candidates[0]
	case "Close to deadline":
		due = EnsureUTC(due)
		bufferStart := due.AddDate(0, 0, -bufferDays)
		best := -1
		for _, i := range candidates {
			slot := slots[i]
			if slot.End.After(due) {
				continue
			}
			if slot.Start.Before(bufferStart) {
				continue
			}
			if best < 0 || slot.Start.After(slots[best].Start) {
				best = i
			}
		}
		if best >= 0 {
			return best
		}
		for _, i := range candidates {
			slot := slots[i]
			if slot.End.After(due) {
				continue
			}
			if best < 0 || slot.Start.After(slots[best].Start) {
				best = i
			}
		}
		if best >= 0 {
			return best
		}
		return candidates[len(candidates)-1]
	default:
		return candidates[len(candidates)/2]
	}
}

func BuildWorkWindowsForPreset(preset *PresetData, loc *time.Location, now time.Time, horizonDays int) []Interval {
	now = now.UTC()
	nowLocal := now.In(loc)
	localStart := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc)

	intervalsByDay := make(map[int][]models.SchedulingInterval)
	overridesByDate := make(map[string]models.SchedulingOverride)
	if preset != nil {
		for _, inter := range preset.Intervals {
			intervalsByDay[inter.DayOfWeek] = append(intervalsByDay[inter.DayOfWeek], inter)
		}
		for _, ov := range preset.Overrides {
			overridesByDate[ov.Date] = ov
		}
	} else {
		for d := 1; d <= 5; d++ {
			intervalsByDay[d] = append(intervalsByDay[d], models.SchedulingInterval{
				DayOfWeek: d, StartTime: "09:00", EndTime: "17:00",
			})
		}
	}

	var windows []Interval
	for offset := 0; offset < horizonDays; offset++ {
		day := localStart.AddDate(0, 0, offset)
		dateStr := day.Format("2006-01-02")
		weekdaySun0 := int(day.Weekday())

		if ov, ok := overridesByDate[dateStr]; ok {
			if ov.IsOff {
				continue
			}
			if ov.StartTime != nil && ov.EndTime != nil && *ov.StartTime != "" && *ov.EndTime != "" {
				sh, sm := ParseHHMM(*ov.StartTime)
				eh, em := ParseHHMM(*ov.EndTime)
				wStartLocal := time.Date(day.Year(), day.Month(), day.Day(), sh, sm, 0, 0, loc)
				wEndLocal := time.Date(day.Year(), day.Month(), day.Day(), eh, em, 0, 0, loc)
				if wEndLocal.After(wStartLocal) {
					wStart, wEnd := wStartLocal.UTC(), wEndLocal.UTC()
					if wEnd.After(now) {
						if wStart.Before(now) {
							wStart = now
						}
						windows = append(windows, Interval{wStart, wEnd})
					}
				}
			}
			continue
		}

		for _, inter := range intervalsByDay[weekdaySun0] {
			sh, sm := ParseHHMM(inter.StartTime)
			eh, em := ParseHHMM(inter.EndTime)
			wStartLocal := time.Date(day.Year(), day.Month(), day.Day(), sh, sm, 0, 0, loc)
			wEndLocal := time.Date(day.Year(), day.Month(), day.Day(), eh, em, 0, 0, loc)
			if !wEndLocal.After(wStartLocal) {
				continue
			}
			wStart, wEnd := wStartLocal.UTC(), wEndLocal.UTC()
			if !wEnd.After(now) {
				continue
			}
			if wStart.Before(now) {
				wStart = now
			}
			windows = append(windows, Interval{wStart, wEnd})
		}
	}
	return windows
}

func placeChunk(available []Interval, slot Interval, workMinutes, bufBefore, bufAfter int) (Interval, []Interval) {
	slotStart := EnsureUTC(slot.Start)
	workStart := slotStart.Add(time.Duration(bufBefore) * time.Minute)
	workEnd := workStart.Add(time.Duration(workMinutes) * time.Minute)
	consumedEnd := workEnd.Add(time.Duration(bufAfter) * time.Minute)
	updated := SubtractInterval(available, slotStart, consumedEnd)
	return Interval{workStart, workEnd}, updated
}

func findContiguousSlot(available []Interval, minutesNeeded int, opts ScheduleOptions) *Interval {
	idx := pickSlotIndex(available, minutesNeeded, opts.WorkloadMode, opts.DueDate, opts.BufferDays)
	if idx < 0 {
		return nil
	}
	s := available[idx]
	return &s
}

func scheduleTask(available []Interval, task TaskWithList, opts ScheduleOptions) ([]Interval, []Interval) {
	remaining := task.DurationMinutes
	bufBefore := task.BufferBeforeMinutes
	bufAfter := task.BufferMinutes
	minSplit := task.MinSplitMinutes
	var placements []Interval

	totalNeeded := remaining + bufBefore
	if slot := findContiguousSlot(available, totalNeeded, opts); slot != nil {
		placed, updated := placeChunk(available, *slot, remaining, bufBefore, bufAfter)
		return updated, []Interval{placed}
	}
	if !task.AllowSplitting {
		return available, placements
	}

	changed := true
	for remaining > 0 && changed {
		changed = false
		neededHere := minSplit + bufBefore
		idx := pickSlotIndex(available, neededHere, opts.WorkloadMode, opts.DueDate, opts.BufferDays)
		if idx < 0 {
			break
		}
		slot := available[idx]
		slotMins := IntervalMinutes(slot)
		if slotMins < neededHere {
			break
		}
		usableWork := slotMins - bufBefore
		if usableWork <= 0 {
			break
		}
		chunk := remaining
		if chunk > usableWork {
			chunk = usableWork
		}
		leftover := remaining - chunk
		if leftover > 0 && leftover < minSplit && usableWork > remaining {
			chunk = remaining
		}
		var placed Interval
		placed, available = placeChunk(available, slot, chunk, bufBefore, bufAfter)
		placements = append(placements, placed)
		remaining -= chunk
		changed = true
	}
	return available, placements
}

func resolvePresetName(task TaskWithList, presetIDToKey map[int64]string, defaultKey string) string {
	if task.SchedulingPresetID != nil {
		if key, ok := presetIDToKey[*task.SchedulingPresetID]; ok && key != "" {
			return key
		}
	}
	presetName := strings.TrimSpace(strings.ToLower(task.ListDefaultHours))
	if presetName != "" {
		return presetName
	}
	return defaultKey
}

func hasPendingInstances(taskID int64, pendingCount map[int64]int) bool {
	return pendingCount[taskID] > 0
}

func dependencyReady(depID int64, completed map[int64]bool, taskEndTimes map[int64]time.Time, pendingCount map[int64]int) (bool, time.Time) {
	if completed[depID] {
		return true, time.Time{}
	}
	if hasPendingInstances(depID, pendingCount) {
		return false, time.Time{}
	}
	end, ok := taskEndTimes[depID]
	if !ok {
		return false, time.Time{}
	}
	return true, end
}

func lockedMinutesForTask(taskID int64, locked []models.ScheduledBlock) int {
	total := 0
	for _, lb := range locked {
		if lb.TaskID == taskID {
			total += IntervalMinutes(Interval{lb.StartTime, lb.EndTime})
		}
	}
	return total
}

func RunAutoSchedule(db *sqlx.DB, icalSvc *ical.Service, userID int64) ([]models.ScheduledBlock, error) {
	scheduleLock.Lock()
	defer scheduleLock.Unlock()

	loc := GetZone(db, userID)
	now := time.Now().UTC().Truncate(time.Second)

	var settings scheduleSettings
	_ = db.Get(&settings, `SELECT workload_distribution, buffer_days, lock_started_blocks, auto_scheduling_cutoff FROM app_settings WHERE user_id = ?`, userID)
	if settings.BufferDays < 0 {
		settings.BufferDays = 0
	}
	horizonDays := horizonDaysFromCutoff(settings.AutoSchedulingCutoff)
	horizonEndLocal := time.Now().In(loc).Truncate(time.Second).AddDate(0, 0, horizonDays)
	horizonEnd := horizonEndLocal.UTC()

	var lockedBlocks []models.ScheduledBlock
	if settings.LockStartedBlocks {
		_ = db.Select(&lockedBlocks, `
			SELECT sb.id, sb.task_id, sb.start_time, sb.end_time
			FROM scheduled_blocks sb
			JOIN tasks t ON sb.task_id = t.id
			WHERE t.user_id = ? AND sb.start_time <= ?
		`, userID, now)
	}

	if _, err := db.Exec(`DELETE FROM scheduled_blocks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`, userID); err != nil {
		return nil, err
	}

	busyRaw, err := icalSvc.GetBusyIntervals(db, userID, now, horizonEnd, loc)
	if err != nil {
		return nil, err
	}
	var externalBusy []Interval
	for _, b := range busyRaw {
		externalBusy = append(externalBusy, Interval{b.Start, b.End})
	}
	externalBusyMerged := MergeIntervals(externalBusy)

	type eventRow struct {
		StartTime time.Time `db:"start_time"`
		EndTime   time.Time `db:"end_time"`
		IsActive  bool      `db:"is_active"`
	}
	var events []eventRow
	_ = db.Select(&events, `
		SELECT ce.start_time, ce.end_time, COALESCE(ec.is_active, 1) as is_active
		FROM calendar_events ce
		LEFT JOIN external_calendars ec ON ce.calendar_id = ec.id
		WHERE ce.user_id = ? AND ce.start_time < ? AND ce.end_time > ? AND ce.is_busy = 1
	`, userID, horizonEnd, now)
	var internalBusy []Interval
	for _, ev := range events {
		if ev.IsActive {
			internalBusy = append(internalBusy, Interval{ev.StartTime.UTC(), ev.EndTime.UTC()})
		}
	}
	internalBusyMerged := MergeIntervals(internalBusy)

	var lockedIntervals []Interval
	for _, lb := range lockedBlocks {
		lockedIntervals = append(lockedIntervals, Interval{lb.StartTime.UTC(), lb.EndTime.UTC()})
	}
	lockedMerged := MergeIntervals(lockedIntervals)

	var presets []models.SchedulingPreset
	if err := db.Select(&presets, `SELECT id, name, is_default FROM scheduling_presets WHERE user_id = ?`, userID); err != nil {
		return nil, err
	}

	presetMap := make(map[string]*PresetData)
	presetIDToKey := make(map[int64]string)
	var defaultKey string
	var defaultPreset *PresetData

	var allIntervals []models.SchedulingInterval
	var allOverrides []models.SchedulingOverride
	_ = db.Select(&allIntervals, `
		SELECT si.id, si.preset_id, si.day_of_week, si.start_time, si.end_time
		FROM scheduling_intervals si
		JOIN scheduling_presets sp ON si.preset_id = sp.id
		WHERE sp.user_id = ?`, userID)
	_ = db.Select(&allOverrides, `
		SELECT so.id, so.preset_id, so.date, so.is_off, so.start_time, so.end_time
		FROM scheduling_overrides so
		JOIN scheduling_presets sp ON so.preset_id = sp.id
		WHERE sp.user_id = ?`, userID)
	intervalsByPreset := make(map[int64][]models.SchedulingInterval)
	overridesByPreset := make(map[int64][]models.SchedulingOverride)
	for _, iv := range allIntervals {
		intervalsByPreset[iv.PresetID] = append(intervalsByPreset[iv.PresetID], iv)
	}
	for _, ov := range allOverrides {
		overridesByPreset[ov.PresetID] = append(overridesByPreset[ov.PresetID], ov)
	}

	for _, p := range presets {
		key := strings.TrimSpace(strings.ToLower(p.Name))
		presetIDToKey[p.ID] = key
		pd := &PresetData{
			Preset:    p,
			Intervals: intervalsByPreset[p.ID],
			Overrides: overridesByPreset[p.ID],
		}
		presetMap[key] = pd
		if p.IsDefault {
			defaultKey = key
			defaultPreset = pd
		}
	}
	if defaultKey == "" && len(presets) > 0 {
		defaultKey = strings.TrimSpace(strings.ToLower(presets[0].Name))
		defaultPreset = presetMap[defaultKey]
	}
	if defaultKey == "" {
		defaultKey = "default"
	}

	presetWindowsCache := make(map[string][]Interval)
	for key, pd := range presetMap {
		presetWindowsCache[key] = BuildWorkWindowsForPreset(pd, loc, now, HorizonDays)
	}
	if defaultPreset != nil {
		if _, ok := presetWindowsCache[defaultKey]; !ok {
			presetWindowsCache[defaultKey] = BuildWorkWindowsForPreset(defaultPreset, loc, now, HorizonDays)
		}
	}
	if _, ok := presetWindowsCache["default"]; !ok {
		presetWindowsCache["default"] = BuildWorkWindowsForPreset(nil, loc, now, HorizonDays)
	}

	globalBusy := MergeIntervals(append(append([]Interval{}, internalBusyMerged...), lockedMerged...))
	availableByPreset := make(map[string][]Interval)
	for name, windows := range presetWindowsCache {
		availableByPreset[name] = SubtractBusy(windows, globalBusy)
	}

	var tasks []TaskWithList
	err = db.Select(&tasks, `
		SELECT t.id, t.title, t.duration_minutes, t.due_date, t.priority, t.allow_splitting, t.min_split_minutes,
			t.buffer_before_minutes, t.buffer_minutes, t.is_completed, t.list_id, t.notes, t.color, t.recurrence, t.start_after,
			t.depends_on_task_id, t.auto_ignore, t.workload_distribution, t.scheduling_preset_id,
			COALESCE(tl.default_hours, '') as default_hours
		FROM tasks t
		LEFT JOIN task_lists tl ON t.list_id = tl.id
		WHERE t.user_id = ? AND t.is_completed = 0
		ORDER BY t.due_date ASC, t.priority ASC, t.id ASC
	`, userID)
	if err != nil {
		return nil, err
	}

	completedTasks := make(map[int64]bool)
	var completedIDs []int64
	_ = db.Select(&completedIDs, `SELECT id FROM tasks WHERE user_id = ? AND is_completed = 1`, userID)
	for _, id := range completedIDs {
		completedTasks[id] = true
	}

	instances := ExpandRecurringTasks(tasks, loc, now, horizonEnd)

	taskEndTimes := make(map[int64]time.Time)
	pendingPlacements := make([]models.ScheduledBlock, 0, len(lockedBlocks)+len(instances))

	for _, lb := range lockedBlocks {
		pendingPlacements = append(pendingPlacements, models.ScheduledBlock{
			TaskID: lb.TaskID, StartTime: lb.StartTime, EndTime: lb.EndTime,
		})
		if prev, ok := taskEndTimes[lb.TaskID]; !ok || lb.EndTime.After(prev) {
			taskEndTimes[lb.TaskID] = lb.EndTime
		}
	}

	useRust := EngineFromEnv() == EngineRust
	if useRust {
		placed, err := placeWithRust(
			settings, instances, lockedBlocks, completedTasks,
			availableByPreset, externalBusyMerged, presetIDToKey, defaultKey,
		)
		if err != nil {
			// Fall back to Go placement if Rust solver is unavailable.
			useRust = false
		} else {
			for _, pl := range placed {
				pendingPlacements = append(pendingPlacements, pl)
				if prev, ok := taskEndTimes[pl.TaskID]; !ok || pl.EndTime.After(prev) {
					taskEndTimes[pl.TaskID] = pl.EndTime
				}
			}
		}
	}

	if !useRust {
		pending := instances
		for len(pending) > 0 {
			var nextRound []TaskInstance
			progress := false
			pendingCount := make(map[int64]int)
			for _, inst := range pending {
				pendingCount[inst.ID]++
			}

			for _, inst := range pending {
				task := inst.TaskWithList
				effectiveDue := inst.EffectiveDue

				if task.DependsOnTaskID != nil {
					ready, depEnd := dependencyReady(*task.DependsOnTaskID, completedTasks, taskEndTimes, pendingCount)
					if !ready {
						nextRound = append(nextRound, inst)
						continue
					}
					if !depEnd.IsZero() {
						if task.StartAfter == nil || depEnd.After(*task.StartAfter) {
							t := depEnd
							task.StartAfter = &t
						}
					}
				}

				presetName := resolvePresetName(task, presetIDToKey, defaultKey)
				if _, ok := availableByPreset[presetName]; !ok {
					if _, ok2 := availableByPreset[defaultKey]; ok2 {
						presetName = defaultKey
					} else {
						presetName = "default"
					}
				}

				available := availableByPreset[presetName]
				if task.AutoIgnore {
					available = SubtractBusy(available, externalBusyMerged)
				}
				available = trimBeforeDue(available, effectiveDue)
				if task.StartAfter != nil {
					available = trimAfter(available, *task.StartAfter)
				}

				schedTask := task
				lockedMins := lockedMinutesForTask(task.ID, lockedBlocks)
				if lockedMins > 0 {
					remaining := task.DurationMinutes - lockedMins
					if remaining <= 0 {
						pendingCount[inst.ID]--
						progress = true
						continue
					}
					schedTask.DurationMinutes = remaining
				}

				workloadMode := resolveWorkloadMode(settings.WorkloadDistribution, task.WorkloadDistribution)
				opts := ScheduleOptions{
					WorkloadMode: workloadMode,
					DueDate:      effectiveDue,
					BufferDays:   settings.BufferDays,
				}

				var placements []Interval
				if !schedTask.AllowSplitting && schedTask.StartAfter != nil {
					fixedStart := EnsureUTC(*schedTask.StartAfter)
					fixedEnd := fixedStart.Add(time.Duration(schedTask.DurationMinutes) * time.Minute)
					placements = []Interval{{fixedStart, fixedEnd}}
				} else {
					available, placements = scheduleTask(available, schedTask, opts)
				}

				for _, pl := range placements {
					pendingPlacements = append(pendingPlacements, models.ScheduledBlock{
						TaskID: task.ID, StartTime: pl.Start, EndTime: pl.End,
					})
					if prev, ok := taskEndTimes[task.ID]; !ok || pl.End.After(prev) {
						taskEndTimes[task.ID] = pl.End
					}
					bufBefore := task.BufferBeforeMinutes
					bufAfter := task.BufferMinutes
					bufferStart := pl.Start.Add(-time.Duration(bufBefore) * time.Minute)
					bufferEnd := pl.End.Add(time.Duration(bufAfter) * time.Minute)
					available = SubtractInterval(available, bufferStart, bufferEnd)
				}
				availableByPreset[presetName] = available
				pendingCount[inst.ID]--
				progress = true
			}

			if !progress {
				break
			}
			if len(nextRound) == len(pending) {
				break
			}
			pending = nextRound
		}
	}

	return insertScheduledBlocks(db, pendingPlacements)
}
