package handlers

import (
	"net/http"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountAccount(r chi.Router) {
	r.Post("/api/account/reset", s.resetAccount)
}

func (s *Server) resetAccount(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	tx, err := s.DB.Beginx()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM scheduled_blocks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`, userID); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`DELETE FROM tasks WHERE user_id = ?`, userID); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`DELETE FROM calendar_events WHERE user_id = ?`, userID); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(`DELETE FROM task_lists WHERE user_id = ? AND is_default = 0`, userID); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.ICal.ClearCache()
	w.WriteHeader(http.StatusNoContent)
}
