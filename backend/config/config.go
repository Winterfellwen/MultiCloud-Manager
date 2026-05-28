package config

import (
	"log"
	"os"
	"strconv"
	"time"
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
	AdminPassword  string
}

func Load() *Config {
	env := getEnv("ENVIRONMENT", "development")
	jwtSecret := os.Getenv("JWT_SECRET")
	if env == "production" && (jwtSecret == "" || jwtSecret == "dev-secret-change-in-production") {
		log.Println("WARNING: JWT_SECRET not set or using default in production! Using random secret.")
		jwtSecret = "prod-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	if jwtSecret == "" {
		jwtSecret = "dev-secret-change-in-production"
	}

	return &Config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		RedisURL:        os.Getenv("REDIS_URL"),
		JWTSecret:       jwtSecret,
		JWTExpiryHours:  getEnvInt("JWT_EXPIRY_HOURS", 72),
		EncryptionKey:   os.Getenv("ENCRYPTION_KEY"),
		WechatAppID:     os.Getenv("WECHAT_APP_ID"),
		WechatAppSecret: os.Getenv("WECHAT_APP_SECRET"),
		VaultURL:        getEnv("VAULT_URL", "http://localhost:8200"),
		VaultToken:      os.Getenv("VAULT_TOKEN"),
		LLMApiKey:       os.Getenv("LLM_API_KEY"),
		LLMApiEndpoint:  getEnv("LLM_API_ENDPOINT", "https://api.openai.com/v1"),
		Environment:     env,
		AdminPassword:   getEnv("ADMIN_PASSWORD", "ChangeMe123!"),
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