CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  session_key VARCHAR,
  provider VARCHAR,
  model VARCHAR,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage (user_id);
