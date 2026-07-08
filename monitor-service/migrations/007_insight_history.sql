CREATE TABLE IF NOT EXISTS insight_history (
  id SERIAL PRIMARY KEY,
  health_score INTEGER NOT NULL,
  risks TEXT,
  suggestions TEXT,
  raw TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
