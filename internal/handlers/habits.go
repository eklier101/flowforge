package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) mountHabits(r chi.Router) {
	r.Post("/api/habits/notify", s.habitsNotify)
}

func (s *Server) habitsNotify(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
