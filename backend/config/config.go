package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL    string
	RedisURL       string
	JWTSecret       string
	JWTExpiryHours  int
	EncryptionKey   string
	WechatAppID    string
	WechatAppSecret string
	VaultURL       string
	VaultToken     string
	LLMApiKey      string
	LLMApiEndpoint string
	Environment    string
}

func Load() *Config {
	return &Config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		RedisURL:        os.Getenv("REDIS_URL"),
		JWTSecret:       getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTExpiryHours:  getEnvInt("JWT_EXPIRY_HOURS", 72),
		EncryptionKey:   getEnv("ENCRYPTION_KEY", ""),
		WechatAppID:     os.Getenv("WECHAT_APP_ID"),
		WechatAppSecret: os.Getenv("WECHAT_APP_SECRET"),
		VaultURL:        getEnv("VAULT_URL", "http://localhost:8200"),
		VaultToken:      os.Getenv("VAULT_TOKEN"),
		LLMApiKey:       os.Getenv("LLM_API_KEY"),
		LLMApiEndpoint:  getEnv("LLM_API_ENDPOINT", "https://api.openai.com/v1"),
		Environment:     getEnv("ENVIRONMENT", "development"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}