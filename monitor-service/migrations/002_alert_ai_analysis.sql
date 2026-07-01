-- 告警事件表新增 AI 根因分析字段
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP;
