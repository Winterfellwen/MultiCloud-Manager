-- monitor-service/migrations/006_knowledge_base.sql
-- 启用 pgvector 扩展（如果未安装则跳过，降级为纯关键词检索）
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建表（不包含 embedding 列，确保即使 pgvector 不可用也能创建）
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  remediation_run_id UUID REFERENCES remediation_runs(id) ON DELETE SET NULL,
  symptom TEXT NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  instance_provider VARCHAR(32),
  instance_env VARCHAR(32),
  root_cause TEXT,
  action_taken VARCHAR(64),
  outcome VARCHAR(32) NOT NULL,
  resolution_time_minutes INT,
  helpful_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 尝试添加 embedding 列（pgvector 可用时用 vector，否则降级为 jsonb）
DO $$
BEGIN
  BEGIN
    ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
  EXCEPTION WHEN OTHERS THEN
    -- pgvector 不可用，降级为 jsonb 存储
    ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding JSONB;
  END;
END $$;

-- 向量索引（pgvector 已安装时创建）
DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_kb_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector index creation skipped: %', SQLERRM;
  END;
END $$;

-- 全文检索索引（chinese 配置不可用时降级为 simple）
DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_kb_symptom ON knowledge_base USING gin (to_tsvector('chinese', symptom));
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_kb_symptom ON knowledge_base USING gin (to_tsvector('simple', symptom));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'full-text index creation skipped: %', SQLERRM;
    END;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_kb_metric ON knowledge_base(metric_name);
CREATE INDEX IF NOT EXISTS idx_kb_outcome ON knowledge_base(outcome);
