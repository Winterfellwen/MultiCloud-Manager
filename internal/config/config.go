package config

import (
	"log"
	"os"
)

type Config struct {
	Port          string
	DBPath        string
	DatabaseURL   string
	RedisURL      string
	JWTSecret     string
	AdminPassword string
	Environment   string
}

func Load() *Config {
	env := getEnv("ENVIRONMENT", "development")
	cfg := &Config{
		Port:          getEnv("PORT", "8099"),
		DBPath:        getEnv("DB_PATH", "multicloud.db"),
		DatabaseURL:   getEnv("DATABASE_URL", ""),
		RedisURL:      getEnv("REDIS_URL", ""),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "Test.1234"),
		Environment:   env,
	}

	if env == "production" {
		if cfg.JWTSecret == "dev-secret-change-in-production" {
			log.Fatal("FATAL: JWT_SECRET must be set in production")
		}
		if cfg.AdminPassword == "Test.1234" || cfg.AdminPassword == "test123" {
			log.Println("WARNING: Using default ADMIN_PASSWORD in production, consider changing it")
		}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
