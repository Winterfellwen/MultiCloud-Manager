-- Add team column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(64) DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team);