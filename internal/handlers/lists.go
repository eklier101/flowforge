package handlers

import (
	"net/http"
	"strconv"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountLists(r chi.Router) {
	r.Route("/api/lists", func(r chi.Router) {
		r.Get("/", s.listTaskLists)
		r.Post("/", s.createTaskList)
		r.Get("/{listID}", s.getTaskList)
		r.Put("/{listID}", s.updateTaskList)
		r.Delete("/{listID}", s.deleteTaskList)
	})
}

func (s *Server) listTaskLists(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var lists []models.TaskList
	_ = s.DB.Select(&lists, `SELECT * FROM task_lists WHERE user_id = ? ORDER BY is_default DESC, id ASC`, userID)
	type countRow struct {
		ListID int64 `db:"list_id"`
		Cnt    int   `db:"cnt"`
	}
	var counts []countRow
	_ = s.DB.Select(&counts, `SELECT list_id, COUNT(*) as cnt FROM tasks WHERE user_id = ? AND is_completed = 0 AND list_id IS NOT NULL GROUP BY list_id`, userID)
	cm := make(map[int64]int)
	for _, c := range counts {
		cm[c.ListID] = c.Cnt
	}
	for i := range lists {
		lists[i].TaskCount = cm[lists[i].ID]
	}
	if lists == nil {
		lists = []models.TaskList{}
	}
	httpx.WriteJSON(w, http.StatusOK, lists)
}

func (s *Server) createTaskList(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p models.TaskList
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if p.IsDefault {
		_, _ = s.DB.Exec(`UPDATE task_lists SET is_default = 0 WHERE user_id = ?`, userID)
	}
	res, err := s.DB.Exec(`INSERT INTO task_lists (user_id, name, color, default_hours, sync_tasks_calendar_id, is_default) VALUES (?,?,?,?,?,?)`,
		userID, p.Name, p.Color, p.DefaultHours, p.SyncTasksCalendarID, p.IsDefault)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	p.ID = id
	httpx.WriteJSON(w, http.StatusCreated, p)
}

func (s *Server) getTaskList(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "listID"), 10, 64)
	var tl models.TaskList
	if err := s.DB.Get(&tl, `SELECT * FROM task_lists WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "List not found")
		return
	}
	_ = s.DB.Get(&tl.TaskCount, `SELECT COUNT(*) FROM tasks WHERE user_id = ? AND list_id = ? AND is_completed = 0`, userID, id)
	httpx.WriteJSON(w, http.StatusOK, tl)
}

func (s *Server) updateTaskList(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "listID"), 10, 64)
	var p models.TaskList
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if p.IsDefault {
		_, _ = s.DB.Exec(`UPDATE task_lists SET is_default = 0 WHERE user_id = ? AND id != ?`, userID, id)
	}
	_, err := s.DB.Exec(`UPDATE task_lists SET name=?, color=?, default_hours=?, sync_tasks_calendar_id=?, is_default=? WHERE id=? AND user_id=?`,
		p.Name, p.Color, p.DefaultHours, p.SyncTasksCalendarID, p.IsDefault, id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	_ = s.DB.Get(&p, `SELECT * FROM task_lists WHERE id = ? AND user_id = ?`, id, userID)
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (s *Server) deleteTaskList(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "listID"), 10, 64)
	var fallback int64
	err := s.DB.Get(&fallback, `SELECT id FROM task_lists WHERE user_id = ? AND id != ? LIMIT 1`, userID, id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Cannot delete the only list")
		return
	}
	var isDefault bool
	_ = s.DB.Get(&isDefault, `SELECT is_default FROM task_lists WHERE id = ? AND user_id = ?`, id, userID)
	_, _ = s.DB.Exec(`UPDATE tasks SET list_id = ? WHERE user_id = ? AND list_id = ?`, fallback, userID, id)
	if isDefault {
		_, _ = s.DB.Exec(`UPDATE task_lists SET is_default = 1 WHERE id = ? AND user_id = ?`, fallback, userID)
	}
	res, _ := s.DB.Exec(`DELETE FROM task_lists WHERE id = ? AND user_id = ?`, id, userID)
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "List not found")
		return
	}
	_, _ = s.Recalc.RecalculateAndSync(userID, false)
	w.WriteHeader(http.StatusNoContent)
}
