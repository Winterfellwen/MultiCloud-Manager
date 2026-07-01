-- Demo 数据：模拟多云管理场景，让 AI 洞察和 Dashboard 有真实数据展示
-- 使用方法：docker compose exec -T postgres psql -U multicloud -d multicloud < scripts/demo-data.sql

BEGIN;

-- 清空旧 demo 数据（保留 cloud_accounts 和 llm_providers 等用户配置）
TRUNCATE instances, alerts, alert_rules, cost_records, metrics CASCADE;
DELETE FROM token_usage;

-- ========== 实例数据（跨 3 个云厂商，多种状态） ==========
INSERT INTO instances (id, provider, provider_instance_id, name, region, status, cpu, memory_mb, disk_gb, public_ip, private_ip, monthly_cost, tags, last_synced_at, created_at) VALUES
-- AWS（3 实例：1 running + 1 stopped + 1 pending）
('a1b2c3d4-0001-4000-8000-000000000001', 'aws', 'i-0abc1234def56789', 'web-prod-01', 'us-east-1', 'running', 2, 4096, 50, '54.221.10.5', '10.0.1.5', 38.50, '{"env":"prod","app":"web"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '7 day'),
('a1b2c3d4-0001-4000-8000-000000000002', 'aws', 'i-0abc1234def56790', 'api-worker-02', 'us-east-1', 'stopped', 4, 8192, 100, NULL, '10.0.1.6', 78.20, '{"env":"prod","app":"api"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '14 day'),
('a1b2c3d4-0001-4000-8000-000000000003', 'aws', 'i-0abc1234def56791', 'db-staging-01', 'ap-southeast-1', 'pending', 8, 16384, 200, NULL, '10.0.2.10', 156.80, '{"env":"staging","app":"db"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day'),

-- 阿里云（3 实例：2 running + 1 stopped）
('a1b2c3d4-0001-4000-8000-000000000004', 'aliyun', 'i-bp1abc123xyz', 'nginx-gateway', 'cn-hangzhou', 'running', 2, 4096, 40, '47.116.20.33', '172.16.0.5', 25.30, '{"env":"prod","app":"gateway"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0001-4000-8000-000000000005', 'aliyun', 'i-bp1abc124xyz', 'redis-cache', 'cn-hangzhou', 'running', 4, 8192, 60, NULL, '172.16.0.6', 42.10, '{"env":"prod","app":"cache"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0001-4000-8000-000000000006', 'aliyun', 'i-bp1abc125xyz', 'analytics-worker', 'cn-shanghai', 'stopped', 16, 32768, 500, NULL, '172.17.0.8', 210.50, '{"env":"prod","app":"analytics"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day'),

-- Azure（2 实例：1 running + 1 warning 状态）
('a1b2c3d4-0001-4000-8000-000000000007', 'azure', 'azure-vm-001', 'ml-training-gpu', 'eastus', 'running', 8, 65536, 1000, '20.115.5.22', '10.1.0.5', 480.00, '{"env":"prod","app":"ml"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day'),
('a1b2c3d4-0001-4000-8000-000000000008', 'azure', 'azure-vm-002', 'backup-server', 'westeurope', 'stopped', 4, 16384, 200, NULL, '10.1.0.6', 95.20, '{"env":"prod","app":"backup"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day');

-- ========== 告警规则 ==========
INSERT INTO alert_rules (id, name, metric, condition, duration, severity, actions, enabled, created_at) VALUES
('b2c3d4e5-0001-4000-8000-000000000001', 'CPU 使用率 > 80%', 'cpu_utilization', '> 80', '5m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000002', '内存使用率 > 90%', 'memory_utilization', '> 90', '5m', 'critical', '{"notify":["webhook","email"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000003', '实例停止', 'instance_status', '= stopped', '1m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day');

-- ========== 告警事件（2 个 firing + 1 resolved） ==========
INSERT INTO alerts (id, rule_id, instance_id, severity, message, status, fired_at, resolved_at, ai_analysis, ai_analyzed_at) VALUES
('c3d4e5f6-0001-4000-8000-000000000001', 'b2c3d4e5-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'warning', 'web-prod-01 CPU 使用率持续 85.3%，超过 80% 阈值', 'firing', NOW() - INTERVAL '15 min', NULL, NULL, NULL),
('c3d4e5f6-0001-4000-8000-000000000002', 'b2c3d4e5-0001-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000008', 'critical', 'backup-server 内存使用率 92.1%，超过 90% 阈值', 'firing', NOW() - INTERVAL '8 min', NULL, NULL, NULL),
('c3d4e5f6-0001-4000-8000-000000000003', 'b2c3d4e5-0001-4000-8000-000000000003', 'a1b2c3d4-0001-4000-8000-000000000006', 'warning', 'analytics-worker 实例已停止', 'resolved', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour', NULL, NULL);

-- ========== 成本记录（本月） ==========
INSERT INTO cost_records (provider, region, service, resource_id, amount, currency, period_start, period_end, created_at) VALUES
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56789', 38.50, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56790', 78.20, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'ap-southeast-1', 'ec2', 'i-0abc1234def56791', 156.80, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 's3', NULL, 12.30, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'rds', NULL, 45.60, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc123xyz', 25.30, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc124xyz', 42.10, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-shanghai', 'ecs', 'i-bp1abc125xyz', 210.50, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'oss', NULL, 8.50, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'virtual-machines', 'azure-vm-001', 480.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'westeurope', 'virtual-machines', 'azure-vm-002', 95.20, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'storage', NULL, 15.40, 'USD', date_trunc('month', NOW()), NOW(), NOW());

-- ========== 指标数据（实例的 CPU/内存） ==========
INSERT INTO metrics (instance_id, metric_name, value, unit, recorded_at, created_at) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'cpu_utilization', 85.30, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000001', 'memory_utilization', 72.50, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000004', 'cpu_utilization', 45.20, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000005', 'cpu_utilization', 62.80, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000007', 'cpu_utilization', 78.90, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000008', 'memory_utilization', 92.10, '%', NOW() - INTERVAL '1 min', NOW());

-- ========== Token 使用量（模拟 AI 调用） ==========
INSERT INTO token_usage (user_id, session_key, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at) VALUES
('8ef124dc-1a02-4bd5-808e-8333087ca258', 'session-demo-001', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 1250, 380, 1630, NOW() - INTERVAL '2 hour'),
('8ef124dc-1a02-4bd5-808e-8333087ca258', 'session-demo-002', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 890, 245, 1135, NOW() - INTERVAL '1 hour'),
('8ef124dc-1a02-4bd5-808e-8333087ca258', 'session-demo-003', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 2100, 520, 2620, NOW() - INTERVAL '30 min'),
('8ef124dc-1a02-4bd5-808e-8333087ca258', 'session-demo-004', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 580, 180, 760, NOW() - INTERVAL '10 min');

COMMIT;

-- 验证
SELECT 'instances' as tbl, count(*) FROM instances
UNION ALL SELECT 'alert_rules', count(*) FROM alert_rules
UNION ALL SELECT 'alerts (firing)', count(*) FROM alerts WHERE status = 'firing'
UNION ALL SELECT 'cost_records', count(*) FROM cost_records
UNION ALL SELECT 'metrics', count(*) FROM metrics
UNION ALL SELECT 'token_usage', count(*) FROM token_usage;
