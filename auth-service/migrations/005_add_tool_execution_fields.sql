-- Add AI tool execution tracking fields to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR(128);
