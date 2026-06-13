package database

import (
	"database/sql"
	"log"
	"os"

	_ "github.com/lib/pq"
)

type Database struct {
	DB *sql.DB
}

func New(dbURL string) (*Database, error) {
	if dbURL == "" {
		dbURL = os.Getenv("OPENCODE_DATABASE_URL")
	}
	if dbURL == "" {
		// Fallback to SQLite for local development
		return NewSQLite(getDefaultDBPath())
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	log.Printf("database connected (postgresql)")
	return &Database{DB: db}, nil
}

func (d *Database) Close() error {
	return d.DB.Close()
}

func migrate(db *sql.DB) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL DEFAULT '',
			workspace_id TEXT,
			parent_id TEXT,
			slug TEXT,
			directory TEXT NOT NULL DEFAULT '',
			path TEXT,
			title TEXT NOT NULL DEFAULT '',
			version TEXT,
			agent TEXT,
			model JSONB,
			cost REAL DEFAULT 0,
			tokens_input INTEGER DEFAULT 0,
			tokens_output INTEGER DEFAULT 0,
			tokens_reasoning INTEGER DEFAULT 0,
			tokens_cache_read INTEGER DEFAULT 0,
			tokens_cache_write INTEGER DEFAULT 0,
			time_created BIGINT NOT NULL,
			time_updated BIGINT NOT NULL,
			time_compacting BIGINT,
			time_archived BIGINT
		)`,
		`CREATE TABLE IF NOT EXISTS session_message (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
			type TEXT NOT NULL,
			seq INTEGER NOT NULL,
			time_created BIGINT NOT NULL,
			time_updated BIGINT NOT NULL,
			data JSONB NOT NULL DEFAULT '{}'
		)`,
		`CREATE INDEX IF NOT EXISTS idx_session_message_session_id ON session_message(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_session_message_seq ON session_message(session_id, seq)`,
		`CREATE TABLE IF NOT EXISTS session_input (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
			prompt JSONB NOT NULL DEFAULT '{}',
			delivery TEXT NOT NULL DEFAULT 'steer',
			admitted_seq INTEGER NOT NULL,
			promoted_seq INTEGER,
			time_created BIGINT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_session_input_session_id ON session_input(session_id)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}

	log.Println("database migrations completed")
	return nil
}

func getDefaultDBPath() string {
	home, _ := os.UserHomeDir()
	return home + "/.local/share/opencode/opencode.db"
}
