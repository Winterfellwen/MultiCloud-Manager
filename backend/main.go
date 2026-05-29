package main

import (
	"fmt"
	"log"

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

	api.InitAIConfig(database.DB)

	authHandler := api.NewAuthHandler(cfg.JWTSecret, database.DB)
	router := api.SetupRouter(authHandler, cfg.JWTSecret, database.DB)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
