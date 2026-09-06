package auth

import "context"

type ctxKey int

const (
	ctxUserID ctxKey = iota
	ctxIsAdmin
	ctxUsername
)

// WithUser attaches authenticated user identity to ctx.
func WithUser(ctx context.Context, userID int64, isAdmin bool, username string) context.Context {
	ctx = context.WithValue(ctx, ctxUserID, userID)
	ctx = context.WithValue(ctx, ctxIsAdmin, isAdmin)
	ctx = context.WithValue(ctx, ctxUsername, username)
	return ctx
}

// UserID returns the authenticated user ID if present.
func UserID(ctx context.Context) (int64, bool) {
	v, ok := ctx.Value(ctxUserID).(int64)
	return v, ok
}

// IsAdmin reports whether the authenticated user is an admin.
func IsAdmin(ctx context.Context) bool {
	v, ok := ctx.Value(ctxIsAdmin).(bool)
	return ok && v
}

// Username returns the authenticated username, or "" if missing.
func Username(ctx context.Context) string {
	v, ok := ctx.Value(ctxUsername).(string)
	if !ok {
		return ""
	}
	return v
}

// MustUserID returns the authenticated user ID.
// Panics if missing — use only after auth middleware has set the context.
func MustUserID(ctx context.Context) int64 {
	id, ok := UserID(ctx)
	if !ok {
		panic("auth: MustUserID called without authenticated user in context")
	}
	return id
}
