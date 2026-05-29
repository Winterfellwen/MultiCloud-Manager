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

	database := db.Init(cfg.DBPath)
	defer database.Close()

	authHandler := api.NewAuthHandler(cfg.JWTSecret, cfg.AdminPassword)
	router := api.SetupRouter(authHandler, cfg.JWTSecret)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
