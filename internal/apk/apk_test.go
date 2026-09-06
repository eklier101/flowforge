package apk

import (
	"os"
	"path/filepath"
	"testing"
)

// The release workflow stamps the APK with major*10000+minor*100+patch. If
// /api/app reports a different code, the mobile updater compares mismatched
// numbers and reports "up to date" forever.
func TestVersionCodeForMatchesReleaseWorkflowFormula(t *testing.T) {
	cases := []struct {
		version string
		want    int
	}{
		{"3.0.9", 30009},
		{"v3.0.9", 30009},
		{" 3.0.9 ", 30009},
		{"3.1.0", 30100},
		{"12.4.7", 120407},
		{"0.0.1", 1},
		{"3.0", 0},
		{"", 0},
		{"3.0.x", 0},
	}
	for _, c := range cases {
		if got := VersionCodeFor(c.version); got != c.want {
			t.Errorf("VersionCodeFor(%q) = %d, want %d", c.version, got, c.want)
		}
	}
}

func TestReadRejectsDirectoryNamedFlowForgeApk(t *testing.T) {
	dir := t.TempDir()
	apkDir := filepath.Join(dir, "apk")
	if err := os.MkdirAll(filepath.Join(apkDir, "FlowForge.apk"), 0o755); err != nil {
		t.Fatal(err)
	}
	realAPK := filepath.Join(apkDir, "app-debug.apk")
	if err := os.WriteFile(realAPK, []byte("PK fake apk"), 0o644); err != nil {
		t.Fatal(err)
	}

	info := Read(dir, "3.0.1", 10)
	if !info.APKAvailable {
		t.Fatal("expected apk_available when sibling .apk exists")
	}
	if info.APKPath != realAPK {
		t.Fatalf("expected %s, got %s", realAPK, info.APKPath)
	}
	if info.APKURL == nil || *info.APKURL != DownloadURL {
		t.Fatalf("expected stable download url %s, got %#v", DownloadURL, info.APKURL)
	}
}

func TestReadPrefersRegularFlowForgeApk(t *testing.T) {
	dir := t.TempDir()
	apkDir := filepath.Join(dir, "apk")
	if err := os.MkdirAll(apkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	preferred := filepath.Join(apkDir, "FlowForge.apk")
	if err := os.WriteFile(preferred, []byte("PK preferred"), 0o644); err != nil {
		t.Fatal(err)
	}

	info := Read(dir, "3.0.1", 10)
	if !info.APKAvailable || info.APKPath != preferred {
		t.Fatalf("expected preferred apk path, got %#v", info)
	}
}
