package handlers

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/flowforge/scheduler/internal/apk"
	"github.com/flowforge/scheduler/internal/config"
)

func TestDownloadAPKServesAndroidMimeType(t *testing.T) {
	_ = mime.AddExtensionType(".apk", "application/vnd.android.package-archive")

	dir := t.TempDir()
	apkDir := filepath.Join(dir, "apk")
	if err := os.MkdirAll(apkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(apkDir, "FlowForge.apk")
	payload := []byte{0x50, 0x4b, 0x03, 0x04, 0x00, 0x00}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatal(err)
	}

	s := &Server{Cfg: config.Config{DataDir: dir, AppVersion: "3.0.1", VersionCode: 10}}
	req := httptest.NewRequest(http.MethodGet, apk.DownloadURL, nil)
	rec := httptest.NewRecorder()
	s.downloadAPK(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "application/vnd.android.package-archive" {
		t.Fatalf("expected android package mime, got %q", ct)
	}
	cd := rec.Header().Get("Content-Disposition")
	if cd == "" || !contains(cd, ".apk") {
		t.Fatalf("expected apk filename in content-disposition, got %q", cd)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
