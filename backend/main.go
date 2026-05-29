package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"multicloud/internal/api"
	"multicloud/internal/config"
	"multicloud/internal/db"
)

func main() {
	cfg := config.Load()

	database, err := db.NewDatabase(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	redisClient, err := db.NewRedisClient(cfg.RedisURL)
	if err != nil {
		log.Printf("WARNING: Redis connection failed: %v", err)
	}
	if redisClient != nil {
		defer redisClient.Close()
	}

	api.InitAIConfig(database.DB, database.IsPostgres())

	authHandler := api.NewAuthHandler(cfg.JWTSecret, database.DB, database.IsPostgres())
	router := api.SetupRouter(authHandler, cfg.JWTSecret, database.DB, database.IsPostgres())

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: router,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Server starting on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	<-quit
	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}
	log.Println("Server stopped")
}
