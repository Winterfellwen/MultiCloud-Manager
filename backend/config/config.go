package config

import "os"

type Config struct {
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	EncryptionKey  string
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
		DatabaseURL:     getEnv("DATABASE_URL", "postgresql://multicloud_db_hwsf_user:0Yjdwn65XrxH8h5PyUaBaiN3hozLRwav@dpg-d8avf49akrks73d7d2h0-a/multicloud_db_hwsf"),
		RedisURL:        os.Getenv("REDIS_URL"),
		JWTSecret:       getEnv("JWT_SECRET", "dev-secret-change-in-production"),
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