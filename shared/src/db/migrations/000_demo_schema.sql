-- shared/src/db/migrations/000_demo_schema.sql
-- 创建 demo schema，结构通过 LIKE public 自动镜像（INCLUDING ALL）
-- 这样 demo schema 结构永远和 public 对齐，不需要维护两份
-- 幂等：所有 CREATE 都带 IF NOT EXISTS，多服务启动安全
--
-- 说明：
-- - LIKE ... INCLUDING ALL 复制默认值、CHECK约束、NOT NULL、索引，但不复制外键
-- - demo schema 内的表间外键手动建立（指向 demo schema 内的表）
-- - cloud_account_id 列保留但不建外键（demo schema 无 cloud_accounts 表）

CREATE SCHEMA IF NOT EXISTS demo;

-- ========== 用 LIKE 复制 public 表结构 ==========
CREATE TABLE IF NOT EXISTS demo.instances (LIKE public.instances INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.metrics (LIKE public.metrics INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.cost_records (LIKE public.cost_records INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.alert_rules (LIKE public.alert_rules INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.alerts (LIKE public.alerts INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.cloud_resources (LIKE public.cloud_resources INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.token_usage (LIKE public.token_usage INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.metric_predictions (LIKE public.metric_predictions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.remediation_policies (LIKE public.remediation_policies INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.remediation_runs (LIKE public.remediation_runs INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.knowledge_base (LIKE public.knowledge_base INCLUDING ALL);

-- ========== demo schema 内部表间外键 ==========
-- 这些外键指向 demo schema 内的表（不复制 public 的外键）
DO $$
BEGIN
  -- metrics → instances
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_metrics_instance') THEN
    ALTER TABLE demo.metrics ADD CONSTRAINT fk_demo_metrics_instance
      FOREIGN KEY (instance_id) REFERENCES demo.instances(id) ON DELETE CASCADE;
  END IF;

  -- alerts → alert_rules
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_alerts_rule') THEN
    ALTER TABLE demo.alerts ADD CONSTRAINT fk_demo_alerts_rule
      FOREIGN KEY (rule_id) REFERENCES demo.alert_rules(id) ON DELETE CASCADE;
  END IF;

  -- alerts → instances
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_alerts_instance') THEN
    ALTER TABLE demo.alerts ADD CONSTRAINT fk_demo_alerts_instance
      FOREIGN KEY (instance_id) REFERENCES demo.instances(id) ON DELETE CASCADE;
  END IF;

  -- metric_predictions → instances
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_predictions_instance') THEN
    ALTER TABLE demo.metric_predictions ADD CONSTRAINT fk_demo_predictions_instance
      FOREIGN KEY (instance_id) REFERENCES demo.instances(id) ON DELETE CASCADE;
  END IF;

  -- remediation_runs → alerts
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_remediation_runs_alert') THEN
    ALTER TABLE demo.remediation_runs ADD CONSTRAINT fk_demo_remediation_runs_alert
      FOREIGN KEY (alert_id) REFERENCES demo.alerts(id) ON DELETE CASCADE;
  END IF;

  -- remediation_runs → instances
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_remediation_runs_instance') THEN
    ALTER TABLE demo.remediation_runs ADD CONSTRAINT fk_demo_remediation_runs_instance
      FOREIGN KEY (instance_id) REFERENCES demo.instances(id) ON DELETE CASCADE;
  END IF;

  -- knowledge_base → alerts
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_kb_alert') THEN
    ALTER TABLE demo.knowledge_base ADD CONSTRAINT fk_demo_kb_alert
      FOREIGN KEY (alert_id) REFERENCES demo.alerts(id) ON DELETE SET NULL;
  END IF;

  -- knowledge_base → remediation_runs
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_demo_kb_remediation_run') THEN
    ALTER TABLE demo.knowledge_base ADD CONSTRAINT fk_demo_kb_remediation_run
      FOREIGN KEY (remediation_run_id) REFERENCES demo.remediation_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ========== demo 默认自愈策略 ==========
-- Clean up duplicates first
DELETE FROM demo.remediation_policies
WHERE id NOT IN (
  SELECT DISTINCT ON (action_type) id
  FROM demo.remediation_policies
  ORDER BY action_type, created_at ASC
);

INSERT INTO demo.remediation_policies (name, action_type, env_tags, auto_execute) VALUES
('重启实例', 'reboot_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('停止实例', 'stop_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('扩容实例', 'scale_up', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb),
('重启服务', 'restart_service', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('清理缓存', 'clear_cache', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('故障转移', 'failover', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb)
ON CONFLICT (action_type) DO NOTHING;
