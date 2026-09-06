package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	DataDir        string
	Timezone       string
	PublicURL      string
	AppVersion     string
	VersionCode    int
	GoogleID       string
	GoogleSecret   string
	Port           string
	StaticDir      string
	TemplatesDir   string
	WebDistDir     string
	RequireSecrets bool
	APKGitHubRepo  string
}

func Load() Config {
	dataDir := os.Getenv("FLOWFORGE_DATA_DIR")
	if dataDir == "" {
		if _, err := os.Stat("/app/data"); err == nil {
			dataDir = "/app/data"
		} else {
			dataDir = filepath.Join("data")
		}
	}
	_ = os.MkdirAll(dataDir, 0o755)
	_ = os.MkdirAll(filepath.Join(dataDir, "apk"), 0o755)

	// Must match the release workflow's major*10000+minor*100+patch formula,
	// otherwise the mobile updater compares mismatched codes and never updates.
	versionCode, _ := strconv.Atoi(getEnv("FLOWFORGE_VERSION_CODE", "30009"))

	staticDir := os.Getenv("FLOWFORGE_STATIC_DIR")
	if staticDir == "" {
		staticDir = filepath.Join("assets", "static")
	}
	templatesDir := os.Getenv("FLOWFORGE_TEMPLATES_DIR")
	if templatesDir == "" {
		templatesDir = filepath.Join("assets", "templates")
	}
	webDist := os.Getenv("FLOWFORGE_WEB_DIST")
	if webDist == "" {
		webDist = filepath.Join("web", "dist")
	}

	return Config{
		DataDir:        dataDir,
		Timezone:       getEnv("FLOWFORGE_TZ", "America/New_York"),
		PublicURL:      os.Getenv("FLOWFORGE_PUBLIC_URL"),
		AppVersion:     getEnv("FLOWFORGE_APP_VERSION", "3.0.9"),
		VersionCode:    versionCode,
		GoogleID:       os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleSecret:   os.Getenv("GOOGLE_CLIENT_SECRET"),
		Port:           getEnv("FLOWFORGE_PORT", "8000"),
		StaticDir:      staticDir,
		TemplatesDir:   templatesDir,
		WebDistDir:     webDist,
		RequireSecrets: os.Getenv("FLOWFORGE_REQUIRE_SECRETS") == "1",
		APKGitHubRepo:  getEnv("FLOWFORGE_APK_GITHUB_REPO", "eklier101/flowforge"),
	}
}

func (c Config) Validate() error {
	if c.RequireSecrets && c.PublicURL == "" {
		return fmt.Errorf("FLOWFORGE_PUBLIC_URL is required when FLOWFORGE_REQUIRE_SECRETS=1")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func (c Config) GoogleConfigured() bool {
	return c.GoogleID != "" && c.GoogleSecret != ""
}
