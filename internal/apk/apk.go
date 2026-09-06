package apk

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const DownloadURL = "/download/flowforge.apk"

// VersionCodeFor mirrors the formula the release workflow uses to stamp the APK
// (major*10000 + minor*100 + patch). /api/app must report the same code the
// installed APK carries, otherwise the mobile updater compares a hand-written
// number against the real build version and concludes it is already current.
// Returns 0 when version is not a parseable x.y.z.
func VersionCodeFor(version string) int {
	parts := strings.Split(strings.TrimPrefix(strings.TrimSpace(version), "v"), ".")
	if len(parts) < 3 {
		return 0
	}
	nums := make([]int, 3)
	for i := 0; i < 3; i++ {
		n, err := strconv.Atoi(strings.TrimSpace(parts[i]))
		if err != nil || n < 0 {
			return 0
		}
		nums[i] = n
	}
	return nums[0]*10000 + nums[1]*100 + nums[2]
}

type Info struct {
	Name           string
	Version        string
	VersionCode    int
	APKAvailable   bool
	APKURL         *string
	APKSize        int64
	APKFilename    *string
	APKPath        string
	DefaultVersion string
	DefaultCode    int
}

func Read(dataDir, defaultVersion string, defaultCode int) Info {
	apkDir := filepath.Join(dataDir, "apk")
	metaPath := filepath.Join(apkDir, "release.json")

	meta := map[string]any{}
	if b, err := os.ReadFile(metaPath); err == nil {
		_ = json.Unmarshal(b, &meta)
	}

	version := defaultVersion
	if v, ok := meta["version"].(string); ok && v != "" {
		version = v
	}
	code := defaultCode
	if c, ok := meta["version_code"].(float64); ok {
		code = int(c)
	}
	filename := versionedFilename(version)
	if f, ok := meta["filename"].(string); ok && f != "" {
		filename = f
	}

	info := Info{
		Name:           "FlowForge",
		Version:        version,
		VersionCode:    code,
		DefaultVersion: defaultVersion,
		DefaultCode:    defaultCode,
	}

	if path, ok := resolveAPKPath(apkDir, meta); ok {
		st, err := os.Stat(path)
		if err == nil && st.Mode().IsRegular() {
			info.APKAvailable = true
			info.APKPath = path
			info.APKSize = st.Size()
			info.APKFilename = &filename
			url := DownloadURL
			info.APKURL = &url
		}
	}
	return info
}

type githubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// EnsureFromGitHub downloads FlowForge.apk from GitHub Releases when missing or outdated,
// and always refreshes release.json so /api/app reports the latest published version.
func EnsureFromGitHub(dataDir, repo string) error {
	if strings.TrimSpace(repo) == "" {
		return nil
	}

	client := &http.Client{Timeout: 120 * time.Second}
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", strings.Trim(repo, "/"))
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "FlowForge")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("github release: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github release: HTTP %d from %s", resp.StatusCode, apiURL)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return fmt.Errorf("github release decode: %w", err)
	}

	version := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
	if version == "" {
		return fmt.Errorf("github release: empty tag")
	}

	downloadURL := fmt.Sprintf("https://github.com/%s/releases/latest/download/FlowForge.apk", strings.Trim(repo, "/"))
	for _, asset := range release.Assets {
		if strings.EqualFold(asset.Name, "FlowForge.apk") && asset.BrowserDownloadURL != "" {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	apkDir := filepath.Join(dataDir, "apk")
	if err := os.MkdirAll(apkDir, 0o755); err != nil {
		return err
	}

	info := Read(dataDir, "", 0)
	needDownload := !info.APKAvailable || info.Version != version
	if needDownload {
		if err := downloadFile(client, downloadURL, filepath.Join(apkDir, "FlowForge.apk")); err != nil {
			return err
		}
	}

	// Derive from the release tag rather than reusing whatever was in the old
	// release.json, so the reported code always matches the published APK.
	code := VersionCodeFor(version)
	if code <= 0 {
		code = info.VersionCode
	}

	meta := map[string]any{
		"version":      version,
		"version_code": code,
		"filename":     versionedFilename(version),
		"apk_file":     "FlowForge.apk",
		"source":       "github",
		"tag":          release.TagName,
	}
	b, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(apkDir, "release.json"), b, 0o644)
}

func downloadFile(client *http.Client, url, dest string) error {
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("download apk: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download apk: HTTP %d from %s", resp.StatusCode, url)
	}

	tmp := dest + ".partial"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func resolveAPKPath(apkDir string, meta map[string]any) (string, bool) {
	if apkDir == "" {
		return "", false
	}
	if raw, ok := meta["apk_file"].(string); ok && raw != "" {
		candidate := raw
		if !filepath.IsAbs(candidate) {
			candidate = filepath.Join(apkDir, filepath.Base(raw))
		}
		if st, err := os.Stat(candidate); err == nil && st.Mode().IsRegular() && strings.HasSuffix(strings.ToLower(candidate), ".apk") {
			return candidate, true
		}
	}

	preferred := filepath.Join(apkDir, "FlowForge.apk")
	if st, err := os.Stat(preferred); err == nil {
		if st.Mode().IsRegular() {
			return preferred, true
		}
		if st.IsDir() {
			if inner, ok := findLargestAPK(preferred); ok {
				return inner, true
			}
		}
	}

	return findLargestAPK(apkDir)
}

func findLargestAPK(dir string) (string, bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", false
	}
	var best string
	var bestSize int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".apk") {
			continue
		}
		path := filepath.Join(dir, name)
		st, err := os.Stat(path)
		if err != nil || !st.Mode().IsRegular() {
			continue
		}
		if st.Size() > bestSize {
			best = path
			bestSize = st.Size()
		}
	}
	return best, best != ""
}

func versionedFilename(version string) string {
	re := regexp.MustCompile(`[^\w.\-]`)
	return "FlowForge-" + re.ReplaceAllString(version, "_") + ".apk"
}

func (i Info) ToMap(publicURL, downloadURL string) map[string]any {
	m := map[string]any{
		"name":             i.Name,
		"version":          i.Version,
		"version_code":     i.VersionCode,
		"apk_available":    i.APKAvailable,
		"apk_url":          nil,
		"apk_download_url": nil,
		"apk_size":         i.APKSize,
		"apk_filename":     nil,
		"public_url":       publicURL,
	}
	if i.APKURL != nil {
		m["apk_url"] = *i.APKURL
	}
	if downloadURL != "" {
		m["apk_download_url"] = downloadURL
	}
	if i.APKFilename != nil {
		m["apk_filename"] = *i.APKFilename
	}
	return m
}

func SafeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "flowforge.apk"
	}
	return filepath.Base(name)
}
