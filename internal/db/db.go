package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type Database struct {
	*sql.DB
}

type RedisClient struct {
	*redis.Client
}

func NewDatabase(dsn string) (*Database, error) {
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL is required (PostgreSQL)")
	}
	return initPostgres(dsn)
}

func initPostgres(dsn string) (*Database, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	var pingErr error
	for i := 0; i < 10; i++ {
		pingErr = db.Ping()
		if pingErr == nil {
			log.Printf("PostgreSQL connected after %d attempt(s)", i+1)
			break
		}
		log.Printf("PostgreSQL ping attempt %d/10 failed: %v", i+1, pingErr)
		time.Sleep(3 * time.Second)
	}
	if pingErr != nil {
		db.Close()
		return nil, pingErr
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(5 * time.Minute)

	d := &Database{db}
	if err := d.Migrate(); err != nil {
		log.Printf("WARNING: Migration failed: %v", err)
	}

	log.Println("PostgreSQL database initialized")
	return d, nil
}

func (d *Database) Migrate() error {
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "test123"
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %v", err)
	}
	adminHash := string(hashBytes)

	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			username VARCHAR(50) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role VARCHAR(20) DEFAULT 'admin',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id VARCHAR(64) UNIQUE NOT NULL,
			title VARCHAR(200),
			status VARCHAR(20) DEFAULT 'idle',
			mode VARCHAR(20) DEFAULT 'plan',
			parent_id UUID,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			archived_at TIMESTAMP,
			share_url TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			role VARCHAR(10) NOT NULL,
			content TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS parts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			type VARCHAR(20) NOT NULL,
			content TEXT,
			metadata JSONB,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS tool_calls (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
			tool_name VARCHAR(50) NOT NULL,
			params JSONB,
			status VARCHAR(20) DEFAULT 'pending',
			output TEXT,
			requires_confirm BOOLEAN DEFAULT false,
			confirmed_by UUID,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS file_changes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			message_id UUID,
			path TEXT NOT NULL,
			action VARCHAR(20) NOT NULL,
			diff TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS credentials (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(100) NOT NULL,
			provider VARCHAR(50) NOT NULL,
			credential TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID,
			action VARCHAR(50) NOT NULL,
			details JSONB,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
		`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_parts_message ON parts(message_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tool_calls_part ON tool_calls(part_id)`,
		`CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_changes(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id, created_at)`,
		`CREATE TABLE IF NOT EXISTS cloud_accounts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(200) NOT NULL,
			cloud_type VARCHAR(50) NOT NULL,
			credentials TEXT NOT NULL DEFAULT '',
			is_active BOOLEAN DEFAULT true,
			last_sync_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS credentials TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS vault_path VARCHAR(500) DEFAULT ''`,
		`ALTER TABLE cloud_accounts DROP COLUMN IF EXISTS encrypted_credentials`,
		`ALTER TABLE cloud_accounts DROP COLUMN IF EXISTS team_id`,
		`ALTER TABLE cloud_accounts DROP COLUMN IF EXISTS encryption_key_id`,
		`CREATE TABLE IF NOT EXISTS resources_cache (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			account_id UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
			cloud_resource_id VARCHAR(500) NOT NULL,
			resource_type VARCHAR(100),
			cloud_region VARCHAR(100),
			name VARCHAR(500),
			status VARCHAR(50) DEFAULT 'unknown',
			spec JSONB,
			tags JSONB,
			last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(account_id, cloud_resource_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_resources_account ON resources_cache(account_id)`,
		`DELETE FROM resources_cache WHERE account_id NOT IN (SELECT id FROM cloud_accounts)`,
		fmt.Sprintf(`INSERT INTO users (username, password_hash, role) VALUES ('admin', '%s', 'admin') ON CONFLICT (username) DO NOTHING`, adminHash),
		`CREATE TABLE IF NOT EXISTS agent_config (
			id SERIAL PRIMARY KEY,
			config_type VARCHAR(50) NOT NULL,
			config JSONB NOT NULL DEFAULT '{}',
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(config_type)
		)`,
		`INSERT INTO agent_config (config_type, config) VALUES 
			('shell', '{"workspace_dir": "/workspace", "timeout_seconds": 300}'),
			('mcp', '{}'),
			('skills', '[]')
		ON CONFLICT (config_type) DO NOTHING`,
		`CREATE TABLE IF NOT EXISTS runs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			state VARCHAR(20) NOT NULL DEFAULT 'pending',
			mode VARCHAR(20) NOT NULL DEFAULT 'plan',
			user_message TEXT NOT NULL,
			final_content TEXT,
			error_message TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			started_at TIMESTAMP,
			terminal_at TIMESTAMP,
			token_count INTEGER DEFAULT 0,
			CONSTRAINT runs_state_check CHECK (state IN ('pending','running','waiting_confirm','done','error','stopped'))
		)`,
		`CREATE INDEX IF NOT EXISTS idx_runs_session_state ON runs(session_id, state)`,
		`CREATE INDEX IF NOT EXISTS idx_runs_state_created ON runs(state, created_at)`,
		`CREATE TABLE IF NOT EXISTS run_events (
			id BIGSERIAL PRIMARY KEY,
			run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
			session_id UUID NOT NULL,
			seq INTEGER NOT NULL,
			event_type VARCHAR(30) NOT NULL,
			payload JSONB NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(run_id, seq)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, seq)`,
		`CREATE INDEX IF NOT EXISTS idx_run_events_session ON run_events(session_id, id)`,
		`DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'run_events_event_type_check'
          AND table_name = 'run_events'
    ) THEN
        ALTER TABLE run_events
            ADD CONSTRAINT run_events_event_type_check
            CHECK (event_type IN ('token','tool_start','tool_result','confirm_required','state_change','done','error','stopped'));
    END IF;
END $$`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_run_id UUID`,
		`DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_sessions_active_run'
          AND table_name = 'sessions'
    ) THEN
        ALTER TABLE sessions
            ADD CONSTRAINT fk_sessions_active_run
            FOREIGN KEY (active_run_id) REFERENCES runs(id) ON DELETE SET NULL;
    END IF;
END $$`,
		`CREATE TABLE IF NOT EXISTS team_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(100) NOT NULL,
			email VARCHAR(200) UNIQUE NOT NULL,
			role VARCHAR(20) DEFAULT 'member',
			status VARCHAR(20) DEFAULT 'active',
			invited_by VARCHAR(100),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
		`CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)`,
		`CREATE TABLE IF NOT EXISTS terraform_templates (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(200) NOT NULL,
			content TEXT NOT NULL,
			version VARCHAR(20) DEFAULT '1.0',
			status VARCHAR(20) DEFAULT 'draft',
			last_applied_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	for i, q := range queries {
		if _, err := d.Exec(q); err != nil {
			return fmt.Errorf("PostgreSQL migration %d failed: %v", i+1, err)
		}
	}

	log.Println("PostgreSQL migrations completed")
	return nil
}

func NewRedisClient(url string) (*RedisClient, error) {
	if url == "" {
		return nil, nil
	}

	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	log.Println("Redis connected")
	return &RedisClient{client}, nil
}

func (rc *RedisClient) Close() error {
	if rc != nil && rc.Client != nil {
		return rc.Client.Close()
	}
	return nil
}
