package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/db"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/models"
	"github.com/go-chi/chi/v5"
)

func (s *Server) mountAuthPublic(r chi.Router) {
	r.Post("/api/auth/bootstrap", s.authBootstrap)
	r.Post("/api/auth/login", s.authLogin)
	r.Get("/api/auth/status", s.authStatus)
}

func (s *Server) mountAuthProtected(r chi.Router) {
	r.Get("/api/auth/me", s.authMe)
	r.Post("/api/auth/logout", s.authLogout)
	r.Post("/api/auth/change-password", s.authChangePassword)
}

type authCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
}

type authTokenResponse struct {
	Token     string          `json:"token"`
	ExpiresAt time.Time       `json:"expires_at"`
	User      models.AuthUser `json:"user"`
}

func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	var count int
	_ = s.DB.Get(&count, `SELECT COUNT(*) FROM users`)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"needs_bootstrap": count == 0,
		"user_count":      count,
	})
}

func (s *Server) authBootstrap(w http.ResponseWriter, r *http.Request) {
	var count int
	if err := s.DB.Get(&count, `SELECT COUNT(*) FROM users`); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if count > 0 {
		httpx.WriteError(w, http.StatusConflict, "bootstrap already completed")
		return
	}

	var p authCredentials
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	p.Username = strings.TrimSpace(p.Username)
	p.Email = strings.TrimSpace(p.Email)
	if p.Username == "" || p.Password == "" {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "username and password are required")
		return
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
		VALUES (?, ?, ?, 1, 0, ?)`,
		p.Username, p.Email, hash, time.Now().UTC())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userID, _ := res.LastInsertId()
	if err := db.EnsureUserData(s.DB, userID, s.Cfg.Timezone, p.Username, p.Email); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// First user owns any pre-auth data that still has user_id=0.
	_ = db.ClaimOrphanData(s.DB, userID)

	token, expires, err := auth.CreateSession(s.DB, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, authTokenResponse{
		Token:     token,
		ExpiresAt: expires,
		User: models.AuthUser{
			ID: userID, Username: p.Username, Email: p.Email, IsAdmin: true,
		},
	})
}

func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	var p authCredentials
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	p.Username = strings.TrimSpace(p.Username)
	if p.Username == "" || p.Password == "" {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "username and password are required")
		return
	}

	var u models.User
	err := s.DB.Get(&u, `SELECT * FROM users WHERE username = ? OR email = ?`, p.Username, p.Username)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	ok, err := auth.VerifyPassword(u.PasswordHash, p.Password)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	token, expires, err := auth.CreateSession(s.DB, u.ID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, authTokenResponse{
		Token:     token,
		ExpiresAt: expires,
		User: models.AuthUser{
			ID: u.ID, Username: u.Username, Email: u.Email,
			IsAdmin: u.IsAdmin, MustChangePassword: u.MustChangePassword,
		},
	})
}

func (s *Server) authMe(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var u models.User
	if err := s.DB.Get(&u, `SELECT * FROM users WHERE id = ?`, userID); err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "user not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, models.AuthUser{
		ID: u.ID, Username: u.Username, Email: u.Email,
		IsAdmin: u.IsAdmin, MustChangePassword: u.MustChangePassword,
	})
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	_ = auth.RevokeSession(s.DB, bearerToken(r))
	w.WriteHeader(http.StatusNoContent)
}

type changePasswordPayload struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (s *Server) authChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := auth.MustUserID(r.Context())
	var p changePasswordPayload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if len(p.NewPassword) < 8 {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
		return
	}
	var u models.User
	if err := s.DB.Get(&u, `SELECT * FROM users WHERE id = ?`, userID); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	ok, err := auth.VerifyPassword(u.PasswordHash, p.CurrentPassword)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	hash, err := auth.HashPassword(p.NewPassword)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, err = s.DB.Exec(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`, hash, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = auth.RevokeAllForUser(s.DB, userID)
	token, expires, err := auth.CreateSession(s.DB, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, authTokenResponse{
		Token: token, ExpiresAt: expires,
		User: models.AuthUser{
			ID: u.ID, Username: u.Username, Email: u.Email, IsAdmin: u.IsAdmin,
		},
	})
}
