package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/db"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountAdmin(r chi.Router) {
	r.Route("/api/admin", func(r chi.Router) {
		r.Use(s.requireAdmin)
		r.Get("/users", s.adminListUsers)
		r.Post("/users", s.adminCreateUser)
		r.Patch("/users/{userID}", s.adminUpdateUser)
		r.Delete("/users/{userID}", s.adminDeleteUser)
		r.Post("/users/{userID}/reset-password", s.adminResetPassword)
	})
}

type adminCreateUserPayload struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"is_admin"`
}

type adminUpdateUserPayload struct {
	IsAdmin *bool   `json:"is_admin"`
	Email   *string `json:"email"`
}

type adminResetPasswordPayload struct {
	Password string `json:"password"`
}

type adminResetPasswordResponse struct {
	TemporaryPassword string `json:"temporary_password,omitempty"`
}

func (s *Server) adminListUsers(w http.ResponseWriter, r *http.Request) {
	var users []models.User
	if err := s.DB.Select(&users, `SELECT id, username, email, is_admin, must_change_password, created_at FROM users ORDER BY id ASC`); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]models.AuthUser, 0, len(users))
	for _, u := range users {
		out = append(out, models.AuthUser{
			ID: u.ID, Username: u.Username, Email: u.Email,
			IsAdmin: u.IsAdmin, MustChangePassword: u.MustChangePassword,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) adminCreateUser(w http.ResponseWriter, r *http.Request) {
	var p adminCreateUserPayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	p.Username = strings.TrimSpace(p.Username)
	p.Email = strings.TrimSpace(p.Email)
	if p.Username == "" {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "username is required")
		return
	}
	tempPassword := false
	if p.Password == "" {
		raw := make([]byte, 8)
		_, _ = rand.Read(raw)
		p.Password = hex.EncodeToString(raw)
		tempPassword = true
	}
	if len(p.Password) < 8 {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
		return
	}
	if p.Email == "" {
		p.Email = p.Username + "@localhost"
	}
	hash, err := auth.HashPassword(p.Password)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	res, err := s.DB.Exec(`
		INSERT INTO users (username, email, password_hash, is_admin, must_change_password, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		p.Username, p.Email, hash, p.IsAdmin, tempPassword, time.Now().UTC())
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			httpx.WriteError(w, http.StatusConflict, "username or email already exists")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userID, _ := res.LastInsertId()
	if err := db.EnsureUserData(s.DB, userID, s.Cfg.Timezone, p.Username, p.Email); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	resp := map[string]any{
		"user": models.AuthUser{
			ID: userID, Username: p.Username, Email: p.Email,
			IsAdmin: p.IsAdmin, MustChangePassword: tempPassword,
		},
	}
	if tempPassword {
		resp["temporary_password"] = p.Password
	}
	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (s *Server) adminUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var p adminUpdateUserPayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	var u models.User
	if err := s.DB.Get(&u, `SELECT * FROM users WHERE id = ?`, id); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	if p.IsAdmin != nil {
		if !*p.IsAdmin && u.IsAdmin {
			var adminCount int
			_ = s.DB.Get(&adminCount, `SELECT COUNT(*) FROM users WHERE is_admin = 1`)
			if adminCount <= 1 {
				httpx.WriteError(w, http.StatusBadRequest, "cannot remove the last admin")
				return
			}
		}
		u.IsAdmin = *p.IsAdmin
	}
	if p.Email != nil {
		u.Email = strings.TrimSpace(*p.Email)
	}
	_, err = s.DB.Exec(`UPDATE users SET is_admin = ?, email = ? WHERE id = ?`, u.IsAdmin, u.Email, id)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, models.AuthUser{
		ID: u.ID, Username: u.Username, Email: u.Email,
		IsAdmin: u.IsAdmin, MustChangePassword: u.MustChangePassword,
	})
}

func (s *Server) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	callerID := auth.MustUserID(r.Context())
	if id == callerID {
		httpx.WriteError(w, http.StatusBadRequest, "cannot delete your own account")
		return
	}
	var u models.User
	if err := s.DB.Get(&u, `SELECT * FROM users WHERE id = ?`, id); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	if u.IsAdmin {
		var adminCount int
		_ = s.DB.Get(&adminCount, `SELECT COUNT(*) FROM users WHERE is_admin = 1`)
		if adminCount <= 1 {
			httpx.WriteError(w, http.StatusBadRequest, "cannot delete the last admin")
			return
		}
	}

	tx, err := s.DB.Beginx()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	_, _ = tx.Exec(`DELETE FROM scheduled_blocks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`, id)
	_, _ = tx.Exec(`DELETE FROM tasks WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM calendar_events WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM task_lists WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM external_calendars WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM google_accounts WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM scheduling_intervals WHERE preset_id IN (SELECT id FROM scheduling_presets WHERE user_id = ?)`, id)
	_, _ = tx.Exec(`DELETE FROM scheduling_overrides WHERE preset_id IN (SELECT id FROM scheduling_presets WHERE user_id = ?)`, id)
	_, _ = tx.Exec(`DELETE FROM scheduling_presets WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM working_hours WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM app_settings WHERE user_id = ?`, id)
	_, _ = tx.Exec(`DELETE FROM sessions WHERE user_id = ?`, id)
	if _, err := tx.Exec(`DELETE FROM users WHERE id = ?`, id); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) adminResetPassword(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var p adminResetPasswordPayload
	_ = httpx.DecodeJSON(r, &p)

	temp := p.Password
	if temp == "" {
		raw := make([]byte, 8)
		_, _ = rand.Read(raw)
		temp = hex.EncodeToString(raw)
	}
	if len(temp) < 8 {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(temp)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	res, err := s.DB.Exec(`UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?`, hash, id)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	_ = auth.RevokeAllForUser(s.DB, id)
	httpx.WriteJSON(w, http.StatusOK, adminResetPasswordResponse{TemporaryPassword: temp})
}
