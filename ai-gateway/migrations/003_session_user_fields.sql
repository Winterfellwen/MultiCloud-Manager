-- Add user ownership fields to acp_replay_sessions
ALTER TABLE acp_replay_sessions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE acp_replay_sessions ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '';
ALTER TABLE acp_replay_sessions ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_acp_sessions_user ON acp_replay_sessions(user_id);

-- Backfill existing sessions from session_key format: chat:{userId}:{ts}:{rand}
UPDATE acp_replay_sessions
SET user_id = SPLIT_PART(session_key, ':', 2)
WHERE session_key LIKE 'chat:%:%:%'
  AND user_id = '';

-- Backfill title from first user_message event
UPDATE acp_replay_sessions s
SET title = LEFT(
  (SELECT (payload::jsonb)->>'message'
   FROM acp_replay_events e
   WHERE e.session_key = s.session_key
     AND e.event_type = 'user_message'
   ORDER BY e.seq ASC LIMIT 1),
  50
)
WHERE (s.title IS NULL OR s.title = '')
  AND EXISTS (
    SELECT 1 FROM acp_replay_events e
    WHERE e.session_key = s.session_key AND e.event_type = 'user_message'
  );

-- Set default title for sessions without user messages
UPDATE acp_replay_sessions
SET title = '新对话'
WHERE title IS NULL OR title = '';