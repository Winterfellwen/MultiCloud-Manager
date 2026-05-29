package db

import (
	"database/sql"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func Init(dbPath string) *sql.DB {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	runMigrations(db)
	return db
}

func runMigrations(db *sql.DB) {
	migrations := []string{
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
		`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_parts_message ON parts(message_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tool_calls_part ON tool_calls(part_id)`,
		`CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_changes(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id, created_at)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			log.Fatalf("Migration failed: %v\nSQL: %s", err, m)
		}
	}
	log.Println("Database migrations completed")
}
