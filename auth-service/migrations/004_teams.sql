-- Create teams table (idempotent)
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add team_id foreign key to users table (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Create index for faster team lookups (idempotent)
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
