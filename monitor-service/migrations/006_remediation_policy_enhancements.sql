-- monitor-service/migrations/006_remediation_policy_enhancements.sql
-- Add resource_type column and unique constraint on action_type

-- Add resource_type column (nullable = applies to all resource types)
DO $$ BEGIN
  ALTER TABLE remediation_policies ADD COLUMN IF NOT EXISTS resource_type VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add unique constraint on action_type to prevent duplicates
DO $$ BEGIN
  ALTER TABLE remediation_policies ADD CONSTRAINT uq_remediation_policies_action_type UNIQUE (action_type);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Clean up duplicate policies (keep only the oldest row per action_type)
DELETE FROM remediation_policies
WHERE id NOT IN (
  SELECT DISTINCT ON (action_type) id
  FROM remediation_policies
  ORDER BY action_type, created_at ASC
);

-- Re-seed default policies with ON CONFLICT (now works with unique constraint)
INSERT INTO remediation_policies (name, action_type, env_tags, auto_execute) VALUES
('重启实例', 'reboot_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('停止实例', 'stop_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('扩容实例', 'scale_up', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb),
('重启服务', 'restart_service', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('清理缓存', 'clear_cache', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('故障转移', 'failover', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb)
ON CONFLICT (action_type) DO NOTHING;
