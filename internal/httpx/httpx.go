package httpx

import (
	"encoding/json"
	"net/http"
	"time"
)

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, detail string) {
	WriteJSON(w, status, map[string]string{"detail": detail})
}

func DecodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func ParseTime(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			if t.Location() == time.UTC || f == time.RFC3339 || f == time.RFC3339Nano {
				return t.UTC(), nil
			}
			return t.UTC(), nil
		}
	}
	return time.Time{}, &time.ParseError{Layout: "RFC3339", Value: s, Message: "invalid time"}
}
