package handlers

import (
	"net/http"
	"strings"

	"github.com/flowforge/scheduler/internal/auth"
	"github.com/flowforge/scheduler/internal/httpx"
)

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(h) < len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}

// requireAuth rejects unauthenticated requests and attaches the user to the context.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			httpx.WriteError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		userID, isAdmin, username, _, _, err := auth.LookupSession(s.DB, token)
		if err != nil {
			httpx.WriteError(w, http.StatusUnauthorized, "invalid or expired session")
			return
		}
		ctx := auth.WithUser(r.Context(), userID, isAdmin, username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireAdmin rejects non-admin authenticated users.
func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !auth.IsAdmin(r.Context()) {
			httpx.WriteError(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}
