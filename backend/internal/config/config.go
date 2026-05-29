package config

import "os"

type Config struct {
	Port          string
	DBPath        string
	JWTSecret     string
	AdminPassword string
}

func Load() *Config {
	return &Config{
		Port:          getEnv("PORT", "8099"),
		DBPath:        getEnv("DB_PATH", "multicloud.db"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-prod"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "test123"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
