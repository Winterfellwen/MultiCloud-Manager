package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type Database struct {
	*sql.DB
}

func NewDatabase(dsn string) (*Database, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	// Retry ping up to 10 times for Render free PostgreSQL cold start
	var pingErr error
	for i := 0; i < 10; i++ {
		pingErr = db.Ping()
		if pingErr == nil {
			log.Printf("Database connected after %d attempt(s)", i+1)
			break
		}
		log.Printf("Database ping attempt %d/10 failed: %v", i+1, pingErr)
		time.Sleep(3 * time.Second)
	}
	if pingErr != nil {
		db.Close()
		return nil, pingErr
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Run migrations
	if err := (&Database{db}).Migrate(); err != nil {
		log.Printf("WARNING: Migration failed (tables may already exist): %v", err)
	}

	return &Database{db}, nil
}

// NewDatabaseWithFallback tries multiple DSNs in sequence
func NewDatabaseWithFallback(dsns ...string) (*Database, error) {
	var lastErr error
	for i, dsn := range dsns {
		if dsn == "" {
			continue
		}
		log.Printf("Trying database connection %d/%d...", i+1, len(dsns))
		db, err := NewDatabase(dsn)
		if err == nil {
			return db, nil
		}
		lastErr = err
		log.Printf("Connection %d failed: %v", i+1, err)
	}
	return nil, fmt.Errorf("all connection attempts failed: %w", lastErr)
}

func (db *Database) Migrate() error {
	hashBytes, err := bcrypt.GenerateFromPassword([]byte("Test@20181025"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %v", err)
	}
	adminHash := string(hashBytes)

	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			openid VARCHAR(128) UNIQUE NOT NULL,
			nickname VARCHAR(100),
			avatar_url TEXT,
			team_id UUID,
			role VARCHAR(20) DEFAULT 'member',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS teams (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(100) NOT NULL,
			description TEXT,
			created_by UUID,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS cloud_accounts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			team_id UUID NOT NULL,
			cloud_type VARCHAR(20) NOT NULL,
			name VARCHAR(100) NOT NULL,
			encrypted_credentials BYTEA NOT NULL,
			encryption_key_id VARCHAR(64),
			is_active BOOLEAN DEFAULT true,
			last_sync_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS ai_agent_sessions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			team_id UUID NOT NULL,
			session_id VARCHAR(64) UNIQUE NOT NULL,
			title VARCHAR(200),
			status VARCHAR(20) DEFAULT 'active',
			last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS ai_agent_messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL,
			role VARCHAR(10) NOT NULL,
			content TEXT NOT NULL,
			metadata JSONB,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS ai_agent_plans (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL,
			plan_id VARCHAR(64) UNIQUE NOT NULL,
			title VARCHAR(200) NOT NULL,
			steps JSONB NOT NULL,
			risk_summary JSONB,
			missing_params JSONB,
			estimated_cost DECIMAL(10,2),
			status VARCHAR(20) DEFAULT 'pending',
			confirmed_by UUID,
			confirmed_at TIMESTAMP,
			execution_started_at TIMESTAMP,
			execution_completed_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS resources_cache (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			account_id UUID,
			resource_type VARCHAR(50) NOT NULL,
			cloud_resource_id VARCHAR(255) NOT NULL,
			cloud_region VARCHAR(50),
			name VARCHAR(200),
			status VARCHAR(50),
			spec JSONB,
			tags JSONB,
			last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(account_id, cloud_resource_id)
		)`,
		`CREATE TABLE IF NOT EXISTS terraform_templates (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			team_id UUID NOT NULL,
			name VARCHAR(100) NOT NULL,
			description TEXT,
			content TEXT NOT NULL,
			variables JSONB,
			version INTEGER DEFAULT 1,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS vault_audit_log (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			credential_ref VARCHAR(100) NOT NULL,
			action VARCHAR(50) NOT NULL,
			request_source INET,
			user_id UUID,
			success BOOLEAN NOT NULL,
			error_message TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS resource_deletions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			resource_cache_id UUID,
			account_id UUID NOT NULL,
			cloud_resource_id VARCHAR(255) NOT NULL,
			cloud_type VARCHAR(20) NOT NULL,
			resource_name VARCHAR(200),
			resource_type VARCHAR(50),
			deletion_type VARCHAR(20) NOT NULL,
			deleted_by UUID,
			deleted_by_username VARCHAR(100),
			detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			metadata JSONB
		)`,
		`CREATE TABLE IF NOT EXISTS ai_config (
			id SERIAL PRIMARY KEY,
			api_endpoint VARCHAR(500) NOT NULL DEFAULT 'https://api.openai.com/v1',
			model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
			api_key VARCHAR(500) NOT NULL DEFAULT '',
			enable_reasoning BOOLEAN NOT NULL DEFAULT false,
			reasoning_effort VARCHAR(20) NOT NULL DEFAULT 'medium',
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`INSERT INTO ai_config (id, api_endpoint, model) VALUES (1, 'https://api.openai.com/v1', 'gpt-4o-mini') ON CONFLICT (id) DO NOTHING`,
		`ALTER TABLE users ALTER COLUMN openid DROP NOT NULL`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
		`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer'`,
		`UPDATE users SET role = 'viewer' WHERE role = 'member'`,
		fmt.Sprintf(`INSERT INTO users (username, password_hash, nickname, role) VALUES ('admin', '%s', 'Admin', 'admin') ON CONFLICT (username) DO NOTHING`, adminHash),
	}

	for i, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return fmt.Errorf("migration %d failed: %v", i+1, err)
		}
	}

	log.Println("Database migrations completed")
	return nil
}

func (db *Database) Close() error {
	return db.DB.Close()
}

type RedisClient struct {
	*redis.Client
}

func NewRedisClient(url string) (*RedisClient, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	return &RedisClient{client}, nil
}

func (rc *RedisClient) Close() error {
	return rc.Client.Close()
}
