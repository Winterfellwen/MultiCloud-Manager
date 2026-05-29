package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type Database struct {
	*sql.DB
	driver string
}

type RedisClient struct {
	*redis.Client
}

func NewDatabase(dsn string) (*Database, error) {
	if dsn == "" {
		return initSQLite()
	}
	return initPostgres(dsn)
}

func initSQLite() (*Database, error) {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "multicloud.db"
	}

	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	d := &Database{db, "sqlite"}
	if err := d.Migrate(); err != nil {
		return nil, err
	}

	log.Println("SQLite database initialized")
	return d, nil
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

	d := &Database{db, "postgres"}
	if err := d.Migrate(); err != nil {
		log.Printf("WARNING: Migration failed: %v", err)
	}

	log.Println("PostgreSQL database initialized")
	return d, nil
}

func (d *Database) IsPostgres() bool {
	return d.driver == "postgres"
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

	if d.IsPostgres() {
		return d.migratePostgres(adminHash)
	}
	return d.migrateSQLite(adminHash)
}

func (d *Database) migrateSQLite(adminHash string) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT DEFAULT 'admin',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			title TEXT,
			status TEXT DEFAULT 'idle',
			mode TEXT DEFAULT 'plan',
			parent_id TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			archived_at DATETIME,
			share_url TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS parts (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL,
			type TEXT NOT NULL,
			content TEXT,
			metadata TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS tool_calls (
			id TEXT PRIMARY KEY,
			part_id TEXT NOT NULL,
			tool_name TEXT NOT NULL,
			params TEXT,
			status TEXT DEFAULT 'pending',
			output TEXT,
			requires_confirm INTEGER DEFAULT 0,
			confirmed_by TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS file_changes (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			message_id TEXT,
			path TEXT NOT NULL,
			action TEXT NOT NULL,
			diff TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS credentials (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			credential TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT,
			action TEXT NOT NULL,
			details TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS ai_config (
			id INTEGER PRIMARY KEY,
			api_endpoint TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
			model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
			api_key TEXT NOT NULL DEFAULT '',
			enable_reasoning INTEGER DEFAULT 0,
			reasoning_effort TEXT DEFAULT 'medium',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`INSERT OR IGNORE INTO ai_config (id, api_endpoint, model) VALUES (1, 'https://api.openai.com/v1', 'gpt-4o-mini')`,
		`INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES ('admin', 'admin', '` + adminHash + `', 'admin')`,
		`CREATE TABLE IF NOT EXISTS cloud_accounts (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			cloud_type TEXT NOT NULL,
			credentials TEXT NOT NULL DEFAULT '',
			is_active INTEGER DEFAULT 1,
			last_sync_at DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS resources_cache (
			id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
			account_id TEXT NOT NULL,
			cloud_resource_id TEXT NOT NULL,
			resource_type TEXT,
			cloud_region TEXT,
			name TEXT,
			status TEXT DEFAULT 'unknown',
			spec TEXT,
			tags TEXT,
			last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
			UNIQUE(account_id, cloud_resource_id)
		)`,
	}

	for _, q := range queries {
		if _, err := d.Exec(q); err != nil {
			return fmt.Errorf("SQLite migration failed: %v\nSQL: %s", err, q)
		}
	}

	log.Println("SQLite migrations completed")
	return nil
}

func (d *Database) migratePostgres(adminHash string) error {
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
		`ALTER TABLE cloud_accounts DROP COLUMN IF EXISTS encrypted_credentials`,
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
		fmt.Sprintf(`INSERT INTO users (username, password_hash, role) VALUES ('admin', '%s', 'admin') ON CONFLICT (username) DO UPDATE SET password_hash = '%s'`, adminHash, adminHash),
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
