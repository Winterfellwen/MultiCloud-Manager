CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  link          TEXT,
  metadata      JSONB DEFAULT '{}',
  created_by    UUID,
  user_id       UUID,
  role_required TEXT,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role_required, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at, created_at DESC) WHERE read_at IS NULL;
