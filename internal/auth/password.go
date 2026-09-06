package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonTime    = 3
	argonMemory  = 65536
	argonThreads = 2
	argonKeyLen  = 32
	argonSaltLen = 16
	argonVersion = argon2.Version // 19
)

var (
	errInvalidHash         = errors.New("auth: invalid password hash format")
	errIncompatibleVersion = errors.New("auth: incompatible argon2 version")
)

// HashPassword hashes password with argon2id and returns the encoded string:
// $argon2id$v=19$m=65536,t=3,p=2$<saltB64>$<hashB64>
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argonVersion, argonMemory, argonTime, argonThreads, b64Salt, b64Hash,
	)
	return encoded, nil
}

// VerifyPassword checks password against an argon2id encoded hash.
func VerifyPassword(encoded, password string) (bool, error) {
	memory, timeCost, threads, salt, hash, err := decodeHash(encoded)
	if err != nil {
		return false, err
	}

	other := argon2.IDKey([]byte(password), salt, timeCost, memory, threads, uint32(len(hash)))
	if subtle.ConstantTimeCompare(hash, other) == 1 {
		return true, nil
	}
	return false, nil
}

func decodeHash(encoded string) (memory, timeCost uint32, threads uint8, salt, hash []byte, err error) {
	parts := strings.Split(encoded, "$")
	// "", "argon2id", "v=19", "m=...,t=...,p=...", salt, hash
	if len(parts) != 6 {
		return 0, 0, 0, nil, nil, errInvalidHash
	}
	if parts[1] != "argon2id" {
		return 0, 0, 0, nil, nil, errInvalidHash
	}

	var version int
	if _, err = fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return 0, 0, 0, nil, nil, errInvalidHash
	}
	if version != argonVersion {
		return 0, 0, 0, nil, nil, errIncompatibleVersion
	}

	if _, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &timeCost, &threads); err != nil {
		return 0, 0, 0, nil, nil, errInvalidHash
	}

	salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return 0, 0, 0, nil, nil, errInvalidHash
	}
	hash, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return 0, 0, 0, nil, nil, errInvalidHash
	}
	return memory, timeCost, threads, salt, hash, nil
}
