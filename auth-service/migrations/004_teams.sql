-- Create teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add team_id foreign key to users table
ALTER TABLE users ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Create index for faster team lookups
CREATE INDEX idx_users_team_id ON users(team_id);
