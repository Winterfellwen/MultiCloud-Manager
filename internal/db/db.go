package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"multicloud/internal/config"
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

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxIdleTime(2 * time.Hour)
	db.SetConnMaxLifetime(30 * time.Minute)

	d := &Database{db}
	if err := d.Migrate(); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	log.Println("PostgreSQL database initialized")
	return d, nil
}

func (d *Database) Migrate() error {
	adminPassword := config.Load().AdminPassword
	if adminPassword == "" {
		log.Fatal("FATAL: ADMIN_PASSWORD must be set (env var or config)")
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
		`CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role, created_at)`,
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
			UNIQUE(account_id, cloud_resource_id, resource_type)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_resources_account ON resources_cache(account_id)`,
		`DELETE FROM resources_cache WHERE account_id NOT IN (SELECT id FROM cloud_accounts)`,
		// Migrate: change unique constraint to include resource_type
		`DO $$ BEGIN
			ALTER TABLE resources_cache DROP CONSTRAINT IF EXISTS resources_cache_account_id_cloud_resource_id_key;
			ALTER TABLE resources_cache ADD CONSTRAINT resources_cache_account_id_cloud_resource_id_resource_type_key UNIQUE(account_id, cloud_resource_id, resource_type);
		EXCEPTION WHEN OTHERS THEN NULL;
		END $$`,
		`CREATE TABLE IF NOT EXISTS sync_logs (
			id BIGSERIAL PRIMARY KEY,
			account_id UUID REFERENCES cloud_accounts(id) ON DELETE SET NULL,
			cloud_type VARCHAR(50),
			status VARCHAR(20) NOT NULL,
			message TEXT,
			resource_count INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sync_logs_account ON sync_logs(account_id, created_at DESC)`,
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
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) DEFAULT ''`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at)`,
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
		// Cost management tables
		`CREATE TABLE IF NOT EXISTS pricing_plans (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			provider VARCHAR(50) NOT NULL,
			region VARCHAR(100) NOT NULL,
			service VARCHAR(50) NOT NULL DEFAULT 'compute',
			tier VARCHAR(100) NOT NULL,
			price_per_hour DECIMAL(12,6) NOT NULL DEFAULT 0,
			price_per_month DECIMAL(12,6) NOT NULL DEFAULT 0,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			effective_from TIMESTAMP NOT NULL DEFAULT NOW(),
			effective_to TIMESTAMP,
			metadata JSONB DEFAULT '{}',
			UNIQUE(provider, region, tier, effective_from)
		)`,
		`CREATE TABLE IF NOT EXISTS cost_data (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			resource_cache_id UUID REFERENCES resources_cache(id) ON DELETE CASCADE,
			account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
			provider VARCHAR(50) NOT NULL,
			cloud_resource_id VARCHAR(500) NOT NULL,
			cost_type VARCHAR(20) NOT NULL DEFAULT 'estimated',
			amount DECIMAL(12,4) NOT NULL DEFAULT 0,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			billing_period_start TIMESTAMP NOT NULL,
			billing_period_end TIMESTAMP NOT NULL,
			usage_quantity DECIMAL(12,4) DEFAULT 0,
			usage_unit VARCHAR(20) DEFAULT 'hours',
			metadata JSONB DEFAULT '{}',
			fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_cost_data_account ON cost_data(account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_cost_data_provider_period ON cost_data(provider, billing_period_start)`,
		`CREATE INDEX IF NOT EXISTS idx_cost_data_resource ON cost_data(resource_cache_id)`,
		`CREATE TABLE IF NOT EXISTS cost_optimization_suggestions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			resource_cache_id UUID REFERENCES resources_cache(id),
			suggestion_type VARCHAR(30) NOT NULL,
			title VARCHAR(200) NOT NULL,
			description TEXT,
			estimated_savings DECIMAL(12,4) DEFAULT 0,
			currency VARCHAR(10) DEFAULT 'USD',
			confidence VARCHAR(10) DEFAULT 'medium',
			status VARCHAR(20) DEFAULT 'pending',
			source VARCHAR(10) DEFAULT 'ai',
			confirmed_by UUID,
			confirmed_at TIMESTAMP,
			execution_result TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS cost_optimization_rules (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(200) NOT NULL,
			description TEXT,
			enabled BOOLEAN DEFAULT false,
			requires_confirm BOOLEAN DEFAULT true,
			condition JSONB NOT NULL DEFAULT '{}',
			action JSONB NOT NULL DEFAULT '{}',
			created_by UUID REFERENCES users(id),
			last_triggered_at TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS cloud_events (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			account_id UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
			cloud_type VARCHAR(50) NOT NULL,
			event_type VARCHAR(50) NOT NULL,
			severity VARCHAR(20) NOT NULL DEFAULT 'info',
			title VARCHAR(500) NOT NULL,
			description TEXT,
			source VARCHAR(200),
			source_id VARCHAR(500),
			resource_id VARCHAR(500),
			resource_name VARCHAR(500),
			resource_type VARCHAR(100),
			region VARCHAR(100),
			metadata JSONB DEFAULT '{}',
			event_at TIMESTAMP NOT NULL,
			fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(account_id, cloud_type, source_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_events_account ON cloud_events(account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_events_type ON cloud_events(cloud_type, event_type)`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_events_severity ON cloud_events(severity)`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_events_time ON cloud_events(event_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_cloud_events_composite ON cloud_events(cloud_type, event_type, event_at DESC)`,
		`CREATE TABLE IF NOT EXISTS cloud_event_analysis (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			analysis_type VARCHAR(50) NOT NULL,
			scope VARCHAR(20) NOT NULL DEFAULT 'all',
			scope_params JSONB DEFAULT '{}',
			summary TEXT NOT NULL,
			details JSONB DEFAULT '[]',
			model VARCHAR(100),
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_analysis_type ON cloud_event_analysis(analysis_type, created_at DESC)`,
		`CREATE TABLE IF NOT EXISTS cloud_event_sync_state (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			account_id UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
			cloud_type VARCHAR(50) NOT NULL,
			event_type VARCHAR(50) NOT NULL,
			last_event_at TIMESTAMP,
			last_sync_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			sync_status VARCHAR(20) DEFAULT 'idle',
			error_message TEXT,
			UNIQUE(account_id, cloud_type, event_type)
		)`,
	}

	for i, q := range queries {
		if _, err := d.Exec(q); err != nil {
			return fmt.Errorf("PostgreSQL migration %d failed: %v", i+1, err)
		}
	}

	// Seed admin user with parameterized query
	if _, err := d.Exec(`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`, "admin", adminHash, "admin"); err != nil {
		return fmt.Errorf("admin seed migration failed: %v", err)
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

	// Redis connection pool settings
	client.Options().PoolSize = 20
	client.Options().MinIdleConns = 5
	client.Options().PoolTimeout = 10 * time.Second
	client.Options().ConnMaxIdleTime = 5 * time.Minute

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
