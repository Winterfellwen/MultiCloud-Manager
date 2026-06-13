package main

import (
	"flag"
	"log"
	"os"

	"github.com/multicloud/opencode-go/internal/database"
	"github.com/multicloud/opencode-go/internal/event"
	"github.com/multicloud/opencode-go/internal/provider"
	"github.com/multicloud/opencode-go/internal/server"
)

func main() {
	port := flag.String("port", "8077", "Server port")
	dbURL := flag.String("db", "", "PostgreSQL database URL (or set OPENCODE_DATABASE_URL)")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("AI Backend v1.0.0")

	provider.LogProviders()

	// Use provided dbURL or fall back to environment variable
	databaseURL := *dbURL
	if databaseURL == "" {
		databaseURL = os.Getenv("OPENCODE_DATABASE_URL")
	}

	// Initialize database
	db, err := database.New(databaseURL)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer db.Close()

	bus := event.NewBus()
	bus.StartHeartbeat()

	srv, err := server.NewWithDB(db, bus, *port)
	if err != nil {
		log.Fatalf("failed to create server: %v", err)
	}

	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
