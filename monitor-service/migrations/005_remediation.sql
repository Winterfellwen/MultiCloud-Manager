-- monitor-service/migrations/005_remediation.sql
CREATE TABLE IF NOT EXISTS remediation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  env_tags JSONB NOT NULL DEFAULT '["dev","uat","prod"]'::jsonb,
  auto_execute JSONB NOT NULL DEFAULT '{"dev":true,"uat":true,"prod":false}'::jsonb,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS remediation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  root_cause TEXT,
  action_plan JSONB,
  action_executed VARCHAR(64),
  status VARCHAR(32) DEFAULT 'pending',
  env VARCHAR(32),
  triggered_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by UUID,
  executed_at TIMESTAMP,
  verified_at TIMESTAMP,
  verification_result TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_remediation_runs_status ON remediation_runs(status);
CREATE INDEX IF NOT EXISTS idx_remediation_runs_alert ON remediation_runs(alert_id);

-- 插入默认策略
INSERT INTO remediation_policies (name, action_type, env_tags, auto_execute) VALUES
('重启实例', 'reboot_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('停止实例', 'stop_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('扩容实例', 'scale_up', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb)
ON CONFLICT DO NOTHING;
