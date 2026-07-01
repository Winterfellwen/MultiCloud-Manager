-- scripts/cleanup-demo-data.sql
-- 清理 demo schema 数据（不影响 public 真实数据）
-- 用法：psql "$DATABASE_URL" -f scripts/cleanup-demo-data.sql

BEGIN;

-- 清空 demo schema 所有业务数据（保留 remediation_policies 默认策略）
TRUNCATE demo.instances, demo.alerts, demo.alert_rules,
         demo.cost_records, demo.metrics, demo.cloud_resources,
         demo.token_usage, demo.remediation_runs, demo.knowledge_base,
         demo.metric_predictions CASCADE;

-- 验证清空
SELECT 'demo.instances' AS tbl, count(*) FROM demo.instances
UNION ALL SELECT 'demo.alerts', count(*) FROM demo.alerts
UNION ALL SELECT 'demo.metrics', count(*) FROM demo.metrics
UNION ALL SELECT 'demo.token_usage', count(*) FROM demo.token_usage
UNION ALL SELECT 'demo.remediation_runs', count(*) FROM demo.remediation_runs
UNION ALL SELECT 'demo.knowledge_base', count(*) FROM demo.knowledge_base;

COMMIT;
