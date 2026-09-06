package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/flowforge/scheduler/internal/apk"
	"github.com/flowforge/scheduler/internal/config"
	"github.com/flowforge/scheduler/internal/google"
	"github.com/flowforge/scheduler/internal/httpx"
	"github.com/flowforge/scheduler/internal/ical"
	"github.com/flowforge/scheduler/internal/publicurl"
	"github.com/flowforge/scheduler/internal/recalc"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jmoiron/sqlx"
)

type Server struct {
	DB     *sqlx.DB
	Cfg    config.Config
	Recalc *recalc.Service
	Google *google.Service
	ICal   *ical.Service
}

func New(db *sqlx.DB, cfg config.Config) *Server {
	goog := google.NewService(cfg)
	icalSvc := ical.NewService(goog)
	return &Server{
		DB:     db,
		Cfg:    cfg,
		Recalc: &recalc.Service{DB: db, ICal: icalSvc, Google: goog},
		Google: goog,
		ICal:   icalSvc,
	}
}

func (s *Server) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false,
	}))

	// Public
	r.Get("/api/health", s.health)
	r.Get("/api/app", s.appInfo)
	r.Get("/api/public-url", s.publicURLInfo)
	r.Get("/favicon.ico", s.favicon)
	r.Get("/favicon.svg", s.favicon)
	r.Get("/download/{filename}", s.downloadAPK)
	r.Get("/download/flowforge.apk", s.downloadAPK)
	r.Get("/FlowForge.apk", s.downloadAPK)
	s.mountAuthPublic(r)

	// Google OAuth: start accepts Bearer or ?access_token= (browser redirect has no Authorization header).
	// Calendar-link form uses a one-time form_token (no Bearer).
	r.Get("/api/google/auth/start", s.googleAuthStart)
	r.Get("/api/google/auth/callback", s.googleAuthCallback)
	r.Post("/api/google/accounts/{accountID}/link", s.linkCalendarsForm)

	r.Get("/privacy", s.serveTemplate("privacy.html"))
	r.Get("/terms", s.serveTemplate("terms.html"))

	// Authenticated API
	r.Group(func(r chi.Router) {
		r.Use(s.requireAuth)
		s.mountAuthProtected(r)
		s.mountAdmin(r)
		s.mountTasks(r)
		s.mountLists(r)
		s.mountEvents(r)
		s.mountCalendars(r)
		s.mountSettings(r)
		s.mountSchedulingHours(r)
		s.mountSchedule(r)
		s.mountGoogleProtected(r)
		s.mountAccount(r)
		s.mountHabits(r)
	})

	if st, err := os.Stat(s.Cfg.WebDistDir); err == nil && st.IsDir() {
		r.NotFound(s.spaHandler().ServeHTTP)
	} else {
		staticDir := s.Cfg.StaticDir
		r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	}
	return r
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "flowforge"})
}

func (s *Server) appInfo(w http.ResponseWriter, r *http.Request) {
	info := apk.Read(s.Cfg.DataDir, s.Cfg.AppVersion, s.Cfg.VersionCode)
	pub := publicurl.Resolve(r, s.Cfg.PublicURL)
	var dl string
	if info.APKURL != nil {
		dl = publicurl.Absolute(r, s.Cfg.PublicURL, *info.APKURL)
	}
	httpx.WriteJSON(w, http.StatusOK, info.ToMap(pub, dl))
}

func (s *Server) publicURLInfo(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"public_url": publicurl.Resolve(r, s.Cfg.PublicURL)})
}

func (s *Server) favicon(w http.ResponseWriter, r *http.Request) {
	path := filepath.Join(s.Cfg.StaticDir, "favicon.svg")
	http.ServeFile(w, r, path)
}

func (s *Server) downloadAPK(w http.ResponseWriter, r *http.Request) {
	info := apk.Read(s.Cfg.DataDir, s.Cfg.AppVersion, s.Cfg.VersionCode)
	if !info.APKAvailable || info.APKPath == "" {
		httpx.WriteError(w, http.StatusNotFound, "APK not published yet")
		return
	}
	st, err := os.Stat(info.APKPath)
	if err != nil || !st.Mode().IsRegular() {
		httpx.WriteError(w, http.StatusNotFound, "APK file missing or invalid")
		return
	}
	name := "flowforge.apk"
	if info.APKFilename != nil && *info.APKFilename != "" {
		name = apk.SafeFilename(*info.APKFilename)
	}
	if !strings.HasSuffix(strings.ToLower(name), ".apk") {
		name += ".apk"
	}

	f, err := os.Open(info.APKPath)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to open APK")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/vnd.android.package-archive")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, name, st.ModTime(), f)
}

func (s *Server) serveTemplate(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(s.Cfg.TemplatesDir, name)
		http.ServeFile(w, r, path)
	}
}

func (s *Server) spaHandler() http.Handler {
	dist := s.Cfg.WebDistDir
	fileServer := http.FileServer(http.Dir(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dist, r.URL.Path)
		if r.URL.Path != "/" {
			if st, err := os.Stat(path); err == nil && !st.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, filepath.Join(dist, "index.html"))
	})
}
