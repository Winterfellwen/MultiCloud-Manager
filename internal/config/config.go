package config

import (
	"log"
	"os"
)

const (
	defaultJWTSecret     = "dev-secret-change-in-production"
	defaultAdminPassword = "Test.1234"
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
		JWTSecret:     getEnv("JWT_SECRET", defaultJWTSecret),
		AdminPassword: getEnv("ADMIN_PASSWORD", defaultAdminPassword),
		Environment:   env,
	}

	if env == "production" {
		if cfg.JWTSecret == defaultJWTSecret || cfg.JWTSecret == "" {
			log.Fatal("FATAL: JWT_SECRET must be set in production")
		}
		// Check default values from multiple sources:
		// - Go default (Test.1234) from getEnv fallback
		// - docker-compose default (test123) from compose file
		// - empty string for explicit unset
		if cfg.AdminPassword == defaultAdminPassword || cfg.AdminPassword == "test123" || cfg.AdminPassword == "" {
			log.Fatal("FATAL: ADMIN_PASSWORD must be set in production")
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
