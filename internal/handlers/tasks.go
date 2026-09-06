package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountTasks(r chi.Router) {
	r.Route("/api/tasks", func(r chi.Router) {
		r.Get("/", s.listTasks)
		r.Post("/forge-sync", s.forgeSync)
		r.Post("/bulk", s.createTasksBulk)
		r.Post("/bulk-update", s.bulkUpdateTasks)
		r.Post("/", s.createTask)
		r.Get("/{taskID}", s.getTask)
		r.Put("/{taskID}", s.updateTask)
		r.Delete("/{taskID}", s.deleteTask)
	})
}

func taskToRead(t models.Task) models.Task {
	return t
}

func (s *Server) loadTask(id, userID int64) (*models.Task, error) {
	var t models.Task
	err := s.DB.Get(&t, `
		SELECT t.*, tl.name as list_name, tl.color as list_color
		FROM tasks t LEFT JOIN task_lists tl ON t.list_id = tl.id
		WHERE t.id = ? AND t.user_id = ?`, id, userID)
	return &t, err
}

func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	q := `SELECT t.*, tl.name as list_name, tl.color as list_color FROM tasks t LEFT JOIN task_lists tl ON t.list_id = tl.id WHERE t.user_id = ?`
	args := []any{userID}
	if v := r.URL.Query().Get("completed"); v != "" {
		q += ` AND t.is_completed = ?`
		args = append(args, v == "true")
	}
	if v := r.URL.Query().Get("list_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			q += ` AND t.list_id = ?`
			args = append(args, id)
		}
	}
	q += ` ORDER BY t.due_date ASC, t.priority ASC, t.id ASC`
	var tasks []models.Task
	if err := s.DB.Select(&tasks, q, args...); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tasks == nil {
		tasks = []models.Task{}
	}
	httpx.WriteJSON(w, http.StatusOK, tasks)
}

func (s *Server) getTask(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "taskID"), 10, 64)
	t, err := s.loadTask(id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "Task not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, t)
}

type taskCreatePayload struct {
	Title                string  `json:"title"`
	DurationMinutes      int     `json:"duration_minutes"`
	DueDate              string  `json:"due_date"`
	Priority             int     `json:"priority"`
	AllowSplitting       bool    `json:"allow_splitting"`
	MinSplitMinutes      int     `json:"min_split_minutes"`
	BufferBeforeMinutes  int     `json:"buffer_before_minutes"`
	BufferMinutes        int     `json:"buffer_minutes"`
	IsCompleted          bool    `json:"is_completed"`
	ListID               *int64  `json:"list_id"`
	Notes                string  `json:"notes"`
	Color                *string `json:"color"`
	Recurrence           string  `json:"recurrence"`
	StartAfter           *string `json:"start_after"`
	DependsOnTaskID      *int64  `json:"depends_on_task_id"`
	AutoIgnore           bool    `json:"auto_ignore"`
	WorkloadDistribution *string `json:"workload_distribution"`
	SchedulingPresetID   *int64  `json:"scheduling_preset_id"`
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p taskCreatePayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	due, err := httpx.ParseTime(p.DueDate)
	if err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "invalid due_date")
		return
	}
	listID := p.ListID
	if listID == nil {
		var id int64
		if err := s.DB.Get(&id, `SELECT id FROM task_lists WHERE user_id = ? AND is_default = 1 LIMIT 1`, userID); err != nil {
			_ = s.DB.Get(&id, `SELECT id FROM task_lists WHERE user_id = ? LIMIT 1`, userID)
		}
		if id > 0 {
			listID = &id
		}
	}
	var startAfter *time.Time
	if p.StartAfter != nil {
		t, e := httpx.ParseTime(*p.StartAfter)
		if e == nil {
			startAfter = &t
		}
	}
	res, err := s.DB.Exec(`INSERT INTO tasks (user_id, title, duration_minutes, due_date, priority, allow_splitting, min_split_minutes, buffer_before_minutes, buffer_minutes, is_completed, list_id, notes, color, recurrence, start_after, depends_on_task_id, auto_ignore, workload_distribution, scheduling_preset_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		userID, strings.TrimSpace(p.Title), p.DurationMinutes, due, p.Priority, p.AllowSplitting, p.MinSplitMinutes, p.BufferBeforeMinutes, p.BufferMinutes, p.IsCompleted, listID, p.Notes, p.Color, p.Recurrence, startAfter, p.DependsOnTaskID, p.AutoIgnore, p.WorkloadDistribution, p.SchedulingPresetID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	t, _ := s.loadTask(id, userID)
	httpx.WriteJSON(w, http.StatusCreated, t)
}

func (s *Server) updateTask(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "taskID"), 10, 64)
	var raw map[string]json.RawMessage
	if err := httpx.DecodeJSON(r, &raw); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	fields := map[string]any{}
	for k, v := range raw {
		var val any
		_ = json.Unmarshal(v, &val)
		switch k {
		case "due_date", "start_after":
			if s, ok := val.(string); ok {
				t, e := httpx.ParseTime(s)
				if e == nil {
					fields[k] = t
				}
			}
		default:
			fields[k] = val
		}
	}
	if len(fields) == 0 {
		t, _ := s.loadTask(id, userID)
		httpx.WriteJSON(w, http.StatusOK, t)
		return
	}
	sets := make([]string, 0, len(fields))
	args := make([]any, 0, len(fields)+2)
	for k, v := range fields {
		sets = append(sets, k+" = ?")
		args = append(args, v)
	}
	args = append(args, id, userID)
	_, err := s.DB.Exec(`UPDATE tasks SET `+strings.Join(sets, ", ")+` WHERE id = ? AND user_id = ?`, args...)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	t, _ := s.loadTask(id, userID)
	httpx.WriteJSON(w, http.StatusOK, t)
}

func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "taskID"), 10, 64)
	res, err := s.DB.Exec(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "Task not found")
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createTasksBulk(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var items []taskCreatePayload
	if err := httpx.DecodeJSON(r, &items); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if len(items) == 0 {
		httpx.WriteJSON(w, http.StatusCreated, []models.Task{})
		return
	}
	var fallback int64
	_ = s.DB.Get(&fallback, `SELECT id FROM task_lists WHERE user_id = ? AND is_default = 1 LIMIT 1`, userID)
	var ids []int64
	for _, p := range items {
		due, _ := httpx.ParseTime(p.DueDate)
		listID := p.ListID
		if listID == nil && fallback > 0 {
			listID = &fallback
		}
		res, err := s.DB.Exec(`INSERT INTO tasks (user_id, title, duration_minutes, due_date, priority, allow_splitting, min_split_minutes, buffer_before_minutes, buffer_minutes, is_completed, list_id, notes, color, recurrence, start_after, depends_on_task_id, auto_ignore, workload_distribution, scheduling_preset_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			userID, strings.TrimSpace(p.Title), p.DurationMinutes, due, p.Priority, p.AllowSplitting, p.MinSplitMinutes, p.BufferBeforeMinutes, p.BufferMinutes, p.IsCompleted, listID, p.Notes, p.Color, p.Recurrence, nil, p.DependsOnTaskID, p.AutoIgnore, p.WorkloadDistribution, p.SchedulingPresetID)
		if err == nil {
			id, _ := res.LastInsertId()
			ids = append(ids, id)
		}
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	var tasks []models.Task
	if len(ids) > 0 {
		q, args, _ := sqlxIn(ids)
		args = append(args, userID)
		_ = s.DB.Select(&tasks, `SELECT t.*, tl.name as list_name, tl.color as list_color FROM tasks t LEFT JOIN task_lists tl ON t.list_id = tl.id WHERE t.id IN (`+q+`) AND t.user_id = ?`, args...)
	}
	httpx.WriteJSON(w, http.StatusCreated, tasks)
}

func sqlxIn(ids []int64) (string, []any, error) {
	args := make([]any, len(ids))
	placeholders := make([]string, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	return strings.Join(placeholders, ","), args, nil
}

func (s *Server) forgeSync(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var payload map[string]any
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	eventType, _ := payload["event_type"].(string)
	if eventType == "" {
		eventType, _ = payload["type"].(string)
	}
	if eventType == "" {
		eventType = "workout_plan"
	}
	title, _ := payload["title"].(string)
	if title == "" {
		title, _ = payload["name"].(string)
	}
	if title == "" {
		title = "Workout"
	}
	duration := 60
	if v, ok := payload["duration_minutes"].(float64); ok {
		duration = int(v)
	}
	isCompleted := payload["completed"] == true || eventType == "workout_completed" || eventType == "completed"

	var listID int64
	err := s.DB.Get(&listID, `SELECT id FROM task_lists WHERE user_id = ? AND name LIKE '%workout%' LIMIT 1`, userID)
	if err != nil {
		err = s.DB.Get(&listID, `SELECT id FROM task_lists WHERE user_id = ? AND name LIKE '%fitness%' LIMIT 1`, userID)
	}
	if err != nil {
		err = s.DB.Get(&listID, `SELECT id FROM task_lists WHERE user_id = ? AND name LIKE '%gym%' LIMIT 1`, userID)
	}
	if err != nil {
		res, e := s.DB.Exec(`INSERT INTO task_lists (user_id, name, color, is_default) VALUES (?, 'Workouts', '#ef4444', 0)`, userID)
		if e == nil {
			listID, _ = res.LastInsertId()
		}
	}

	var existingID int64
	_ = s.DB.Get(&existingID, `SELECT id FROM tasks WHERE user_id = ? AND title = ? AND list_id = ? AND is_completed = 0`, userID, title, listID)

	if isCompleted {
		if existingID > 0 {
			_, _ = s.DB.Exec(`UPDATE tasks SET is_completed = 1 WHERE id = ? AND user_id = ?`, existingID, userID)
			_, _ = s.Recalc.RecalculateAndSync(userID, false)
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "action": "completed", "task_id": existingID})
			return
		}
		res, e := s.DB.Exec(`INSERT INTO tasks (user_id, title, duration_minutes, due_date, is_completed, list_id, priority) VALUES (?, ?, ?, datetime('now'), 1, ?, 2)`, userID, title, duration, listID)
		id, _ := res.LastInsertId()
		if e == nil {
			_, _ = s.Recalc.RecalculateAndSync(userID, false)
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "action": "created_completed", "task_id": id})
			return
		}
	}

	if existingID > 0 {
		if due, ok := payload["due_date"].(string); ok {
			t, e := httpx.ParseTime(due)
			if e == nil {
				_, _ = s.DB.Exec(`UPDATE tasks SET duration_minutes = ?, due_date = ? WHERE id = ? AND user_id = ?`, duration, t, existingID, userID)
			}
		} else {
			_, _ = s.DB.Exec(`UPDATE tasks SET duration_minutes = ? WHERE id = ? AND user_id = ?`, duration, existingID, userID)
		}
		_, _ = s.Recalc.RecalculateAndSync(userID, false)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "action": "updated", "task_id": existingID})
		return
	}

	due := time.Now().UTC()
	if ds, ok := payload["due_date"].(string); ok {
		if t, e := httpx.ParseTime(ds); e == nil {
			due = t
		}
	}
	res, err := s.DB.Exec(`INSERT INTO tasks (user_id, title, duration_minutes, due_date, priority, allow_splitting, min_split_minutes, list_id, notes) VALUES (?, ?, ?, ?, 2, 0, ?, ?, 'Synced from Forge workout tracker')`,
		userID, title, duration, due, duration, listID)
	id, _ := res.LastInsertId()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "action": "created", "task_id": id})
}

type bulkUpdatePayload struct {
	TaskIDs []int64        `json:"task_ids"`
	Update  map[string]any `json:"update"`
	Delete  bool           `json:"delete"`
}

func (s *Server) bulkUpdateTasks(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p bulkUpdatePayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if len(p.TaskIDs) == 0 {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"updated": 0})
		return
	}
	if p.Delete {
		for _, id := range p.TaskIDs {
			_, _ = s.DB.Exec(`DELETE FROM scheduled_blocks WHERE task_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ?)`, id, userID)
			_, _ = s.DB.Exec(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, id, userID)
		}
		_, _ = s.Recalc.RecalculateAndSync(userID, false)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": len(p.TaskIDs)})
		return
	}
	updated := 0
	for _, id := range p.TaskIDs {
		if v, ok := p.Update["is_completed"]; ok {
			if completed, ok := v.(bool); ok {
				_, _ = s.DB.Exec(`UPDATE tasks SET is_completed = ? WHERE id = ? AND user_id = ?`, completed, id, userID)
				updated++
			}
		}
		if v, ok := p.Update["list_id"]; ok {
			if listID, ok := v.(float64); ok {
				_, _ = s.DB.Exec(`UPDATE tasks SET list_id = ? WHERE id = ? AND user_id = ?`, int64(listID), id, userID)
				updated++
			}
		}
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"updated": updated})
}

// avoid unused import
var _ = sql.ErrNoRows
