package config

import "os"

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
	return &Config{
		Port:          getEnv("PORT", "8099"),
		DBPath:        getEnv("DB_PATH", "multicloud.db"),
		DatabaseURL:   getEnv("DATABASE_URL", ""),
		RedisURL:      getEnv("REDIS_URL", ""),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "test123"),
		Environment:   getEnv("ENVIRONMENT", "development"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
