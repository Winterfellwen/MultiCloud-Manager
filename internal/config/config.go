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
	env := GetEnv("ENVIRONMENT", "development")
	cfg := &Config{
		Port:          GetEnv("PORT", "8099"),
		DBPath:        GetEnv("DB_PATH", "multicloud.db"),
		DatabaseURL:   GetEnv("DATABASE_URL", ""),
		RedisURL:      GetEnv("REDIS_URL", ""),
		JWTSecret:     GetEnv("JWT_SECRET", defaultJWTSecret),
		AdminPassword: GetEnv("ADMIN_PASSWORD", defaultAdminPassword),
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

func GetEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
