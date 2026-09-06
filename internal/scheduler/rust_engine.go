package scheduler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/flowforge/scheduler/internal/models"
)

func lookupEnv(key string) string {
	return os.Getenv(key)
}

type rustInterval struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type rustTaskInput struct {
	ID                  int64   `json:"id"`
	DurationMinutes     int     `json:"duration_minutes"`
	DueDate             string  `json:"due_date"`
	AllowSplitting      bool    `json:"allow_splitting"`
	MinSplitMinutes     int     `json:"min_split_minutes"`
	BufferBeforeMinutes int     `json:"buffer_before_minutes"`
	BufferMinutes       int     `json:"buffer_minutes"`
	StartAfter          *string `json:"start_after,omitempty"`
	DependsOnTaskID     *int64  `json:"depends_on_task_id,omitempty"`
	AutoIgnore          bool    `json:"auto_ignore"`
	WorkloadMode        string  `json:"workload_mode"`
	PresetName          string  `json:"preset_name"`
	LockedMinutes       int     `json:"locked_minutes"`
}

type rustRequest struct {
	BufferDays         int                       `json:"buffer_days"`
	GlobalWorkloadMode string                    `json:"global_workload_mode"`
	CompletedTaskIDs   []int64                   `json:"completed_task_ids"`
	ExternalBusy       []rustInterval            `json:"external_busy"`
	AvailableByPreset  map[string][]rustInterval `json:"available_by_preset"`
	Tasks              []rustTaskInput           `json:"tasks"`
}

type rustPlacement struct {
	TaskID int64  `json:"task_id"`
	Start  string `json:"start"`
	End    string `json:"end"`
}

type rustResponse struct {
	Placements []rustPlacement `json:"placements"`
	Error      string          `json:"error,omitempty"`
}

func solverBinaryPath() string {
	if p := os.Getenv("FLOWFORGE_SOLVER_BIN"); p != "" {
		return p
	}
	candidates := []string{
		filepath.Join(".", "flowforge-solver"),
		filepath.Join("/app", "flowforge-solver"),
		"flowforge-solver",
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return "flowforge-solver"
}

func placeWithRust(
	settings scheduleSettings,
	instances []TaskInstance,
	lockedBlocks []models.ScheduledBlock,
	completed map[int64]bool,
	availableByPreset map[string][]Interval,
	externalBusy []Interval,
	presetIDToKey map[int64]string,
	defaultKey string,
) ([]models.ScheduledBlock, error) {
	completedIDs := make([]int64, 0, len(completed))
	for id := range completed {
		completedIDs = append(completedIDs, id)
	}

	availJSON := make(map[string][]rustInterval, len(availableByPreset))
	for k, ivs := range availableByPreset {
		availJSON[k] = intervalsToRust(ivs)
	}

	tasks := make([]rustTaskInput, 0, len(instances))
	for _, inst := range instances {
		task := inst.TaskWithList
		presetName := resolvePresetName(task, presetIDToKey, defaultKey)
		if _, ok := availableByPreset[presetName]; !ok {
			if _, ok2 := availableByPreset[defaultKey]; ok2 {
				presetName = defaultKey
			} else {
				presetName = "default"
			}
		}
		mode := resolveWorkloadMode(settings.WorkloadDistribution, task.WorkloadDistribution)
		var startAfter *string
		if task.StartAfter != nil {
			s := task.StartAfter.UTC().Format(time.RFC3339)
			startAfter = &s
		}
		tasks = append(tasks, rustTaskInput{
			ID:                  task.ID,
			DurationMinutes:     task.DurationMinutes,
			DueDate:             inst.EffectiveDue.UTC().Format(time.RFC3339),
			AllowSplitting:      task.AllowSplitting,
			MinSplitMinutes:     task.MinSplitMinutes,
			BufferBeforeMinutes: task.BufferBeforeMinutes,
			BufferMinutes:       task.BufferMinutes,
			StartAfter:          startAfter,
			DependsOnTaskID:     task.DependsOnTaskID,
			AutoIgnore:          task.AutoIgnore,
			WorkloadMode:        mode,
			PresetName:          presetName,
			LockedMinutes:       lockedMinutesForTask(task.ID, lockedBlocks),
		})
	}

	req := rustRequest{
		BufferDays:         settings.BufferDays,
		GlobalWorkloadMode: settings.WorkloadDistribution,
		CompletedTaskIDs:   completedIDs,
		ExternalBusy:       intervalsToRust(externalBusy),
		AvailableByPreset:  availJSON,
		Tasks:              tasks,
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(solverBinaryPath())
	cmd.Stdin = bytes.NewReader(payload)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("rust solver: %w (%s)", err, stringsTrim(stderr.String()))
	}

	var resp rustResponse
	if err := json.Unmarshal(stdout.Bytes(), &resp); err != nil {
		return nil, fmt.Errorf("rust solver decode: %w", err)
	}
	if resp.Error != "" {
		return nil, fmt.Errorf("rust solver: %s", resp.Error)
	}

	out := make([]models.ScheduledBlock, 0, len(resp.Placements))
	for _, p := range resp.Placements {
		start, err1 := time.Parse(time.RFC3339, p.Start)
		end, err2 := time.Parse(time.RFC3339, p.End)
		if err1 != nil || err2 != nil {
			continue
		}
		out = append(out, models.ScheduledBlock{
			TaskID: p.TaskID, StartTime: start.UTC(), EndTime: end.UTC(),
		})
	}
	return out, nil
}

func intervalsToRust(ivs []Interval) []rustInterval {
	out := make([]rustInterval, 0, len(ivs))
	for _, iv := range ivs {
		out = append(out, rustInterval{
			Start: iv.Start.UTC().Format(time.RFC3339),
			End:   iv.End.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func stringsTrim(s string) string {
	if len(s) > 400 {
		return s[:400]
	}
	return s
}
