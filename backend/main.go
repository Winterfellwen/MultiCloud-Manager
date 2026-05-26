package main

import (
	"log"
	"os"

	"multicloud-manager/config"
	"multicloud-manager/internal/api"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	var db *services.Database
	var rdb *services.RedisClient

	if cfg.DatabaseURL != "" {
		var err error
		db, err = services.NewDatabase(cfg.DatabaseURL)
		if err != nil {
			log.Printf("WARNING: Database connection failed: %v", err)
			db = nil
		} else {
			defer db.Close()
			log.Println("Database connected")
		}
	}
	if db == nil {
		log.Println("Starting in dev mode (no database)")
	}

	if cfg.RedisURL != "" {
		var err error
		rdb, err = services.NewRedisClient(cfg.RedisURL)
		if err != nil {
			log.Printf("WARNING: Redis connection failed: %v", err)
		} else {
			defer rdb.Close()
			log.Println("Redis connected")
		}
	}

	router := gin.Default()

	api.SetupRoutes(router, db, rdb, cfg)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}