package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

const SessionTTL = 30 * 24 * time.Hour

var ErrSessionNotFound = errors.New("auth: session not found")

func hashToken(plainToken string) string {
	sum := sha256.Sum256([]byte(plainToken))
	return hex.EncodeToString(sum[:])
}

// CreateSession generates a new session for userID, stores the SHA-256 hex of
// the token in sessions, and returns the plain token and expiry.
func CreateSession(db *sqlx.DB, userID int64) (plainToken string, expiresAt time.Time, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", time.Time{}, fmt.Errorf("auth: generate session token: %w", err)
	}
	plainToken = hex.EncodeToString(raw)
	expiresAt = time.Now().UTC().Add(SessionTTL)
	tokenHash := hashToken(plainToken)
	now := time.Now().UTC()

	_, err = db.Exec(
		`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		tokenHash, userID, expiresAt, now,
	)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("auth: insert session: %w", err)
	}
	return plainToken, expiresAt, nil
}

// LookupSession resolves a plain session token to user details.
// Expired sessions are rejected; expired rows may be deleted on lookup.
func LookupSession(db *sqlx.DB, plainToken string) (userID int64, isAdmin bool, username string, email string, expiresAt time.Time, err error) {
	if plainToken == "" {
		return 0, false, "", "", time.Time{}, ErrSessionNotFound
	}
	tokenHash := hashToken(plainToken)

	var row struct {
		UserID    int64     `db:"user_id"`
		IsAdmin   bool      `db:"is_admin"`
		Username  string    `db:"username"`
		Email     string    `db:"email"`
		ExpiresAt time.Time `db:"expires_at"`
	}

	err = db.Get(&row, `
		SELECT s.user_id, u.is_admin, u.username, u.email, s.expires_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ?
	`, tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, false, "", "", time.Time{}, ErrSessionNotFound
		}
		return 0, false, "", "", time.Time{}, fmt.Errorf("auth: lookup session: %w", err)
	}

	if time.Now().UTC().After(row.ExpiresAt) {
		_, _ = db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
		return 0, false, "", "", time.Time{}, ErrSessionNotFound
	}

	return row.UserID, row.IsAdmin, row.Username, row.Email, row.ExpiresAt, nil
}

// RevokeSession deletes the session matching plainToken.
func RevokeSession(db *sqlx.DB, plainToken string) error {
	if plainToken == "" {
		return nil
	}
	_, err := db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(plainToken))
	if err != nil {
		return fmt.Errorf("auth: revoke session: %w", err)
	}
	return nil
}

// RevokeAllForUser deletes all sessions for the given user.
func RevokeAllForUser(db *sqlx.DB, userID int64) error {
	_, err := db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	if err != nil {
		return fmt.Errorf("auth: revoke all sessions: %w", err)
	}
	return nil
}
