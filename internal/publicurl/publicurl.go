package publicurl

import (
	"net/http"
	"strings"
)

func FirstHeader(value string) string {
	if value == "" {
		return ""
	}
	return strings.TrimSpace(strings.SplitN(value, ",", 2)[0])
}

func Resolve(r *http.Request, envURL string) string {
	env := strings.TrimRight(strings.TrimSpace(envURL), "/")
	if env != "" {
		return env
	}
	if r == nil {
		return ""
	}
	proto := FirstHeader(r.Header.Get("X-Forwarded-Proto"))
	host := FirstHeader(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = FirstHeader(r.Host)
	}
	if proto != "" && host != "" {
		return proto + "://" + host
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func Absolute(r *http.Request, envURL, path string) string {
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	base := Resolve(r, envURL)
	if base == "" {
		return path
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}
