-- CloudOps AI Gateway Initial Migration
-- 统一使用 PostgreSQL（与 auth/cloud/monitor/ai-agent 共享同一实例）

-- ============ ACP 事件账本（断线重连 + 历史重放） ============
CREATE TABLE IF NOT EXISTS acp_replay_sessions (
    session_key TEXT PRIMARY KEY,
    created_at BIGINT NOT NULL,
    last_seq BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS acp_replay_events (
    id BIGSERIAL PRIMARY KEY,
    session_key TEXT NOT NULL,
    seq BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    FOREIGN KEY (session_key) REFERENCES acp_replay_sessions(session_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_acp_events_session_seq
    ON acp_replay_events(session_key, seq);

-- ============ LLM Provider 配置（运行时 CRUD） ============
CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_models (
    id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    name TEXT NOT NULL,
    context_window INTEGER,
    reasoning BOOLEAN NOT NULL DEFAULT FALSE,
    input_types TEXT,
    PRIMARY KEY (id, provider_id),
    FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE
);
