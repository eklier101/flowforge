package main

import (
	"context"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/flowforge/scheduler/internal/apk"
	"github.com/flowforge/scheduler/internal/config"
	"github.com/flowforge/scheduler/internal/db"
	"github.com/flowforge/scheduler/internal/handlers"
)

func init() {
	_ = mime.AddExtensionType(".apk", "application/vnd.android.package-archive")
}

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("config: %v", err)
	}
	if err := apk.EnsureFromGitHub(cfg.DataDir, cfg.APKGitHubRepo); err != nil {
		log.Printf("apk: could not ensure from GitHub Releases (will continue): %v", err)
	}
	database, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	if err := db.Init(database, cfg.Timezone); err != nil {
		log.Fatalf("init db: %v", err)
	}

	srv := handlers.New(database, cfg)
	app := srv.Routes()

	addr := ":" + cfg.Port
	httpServer := &http.Server{Addr: addr, Handler: app}
	go func() {
		log.Printf("FlowForge Go server listening on %s", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
