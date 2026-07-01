-- scripts/demo-data.sql（重写后）
-- Demo 数据：仅操作 demo schema，物理隔离 public 真实数据
-- 使用方法：docker compose exec -T postgres psql -U multicloud -d multicloud < scripts/demo-data.sql

BEGIN;

-- 仅清 demo schema（不影响 public 真实数据）
TRUNCATE demo.instances, demo.alerts, demo.alert_rules,
         demo.cost_records, demo.metrics, demo.cloud_resources,
         demo.token_usage, demo.remediation_runs, demo.knowledge_base,
         demo.metric_predictions CASCADE;

-- ========== 实例数据 ==========
INSERT INTO demo.instances (id, provider, provider_instance_id, name, region, status, cpu, memory_mb, disk_gb, public_ip, private_ip, monthly_cost, tags, last_synced_at, created_at) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'aws', 'i-0abc1234def56789', 'web-prod-01', 'us-east-1', 'running', 2, 4096, 50, '54.221.10.5', '10.0.1.5', 38.50, '{"env":"prod","app":"web"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '7 day'),
('a1b2c3d4-0001-4000-8000-000000000002', 'aws', 'i-0abc1234def56790', 'api-worker-02', 'us-east-1', 'stopped', 4, 8192, 100, NULL, '10.0.1.6', 78.20, '{"env":"prod","app":"api"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '14 day'),
('a1b2c3d4-0001-4000-8000-000000000003', 'aws', 'i-0abc1234def56791', 'db-staging-01', 'ap-southeast-1', 'pending', 8, 16384, 200, NULL, '10.0.2.10', 156.80, '{"env":"staging","app":"db"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day'),
('a1b2c3d4-0001-4000-8000-000000000004', 'aliyun', 'i-bp1abc123xyz', 'nginx-gateway', 'cn-hangzhou', 'running', 2, 4096, 40, '47.116.20.33', '172.16.0.5', 25.30, '{"env":"prod","app":"gateway"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0001-4000-8000-000000000005', 'aliyun', 'i-bp1abc124xyz', 'redis-cache', 'cn-hangzhou', 'running', 4, 8192, 60, NULL, '172.16.0.6', 42.10, '{"env":"prod","app":"cache"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0001-4000-8000-000000000006', 'aliyun', 'i-bp1abc125xyz', 'analytics-worker', 'cn-shanghai', 'stopped', 16, 32768, 500, NULL, '172.17.0.8', 210.50, '{"env":"prod","app":"analytics"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day'),
('a1b2c3d4-0001-4000-8000-000000000007', 'azure', 'azure-vm-001', 'ml-training-gpu', 'eastus', 'running', 8, 65536, 1000, '20.115.5.22', '10.1.0.5', 480.00, '{"env":"prod","app":"ml"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day'),
('a1b2c3d4-0001-4000-8000-000000000008', 'azure', 'azure-vm-002', 'backup-server', 'westeurope', 'stopped', 4, 16384, 200, NULL, '10.1.0.6', 95.20, '{"env":"prod","app":"backup"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day');

-- ========== 告警规则 ==========
INSERT INTO demo.alert_rules (id, name, metric, condition, duration, severity, actions, enabled, created_at) VALUES
('b2c3d4e5-0001-4000-8000-000000000001', 'CPU 使用率 > 80%', 'cpu_utilization', '> 80', '5m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000002', '内存使用率 > 90%', 'memory_utilization', '> 90', '5m', 'critical', '{"notify":["webhook","email"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000003', '实例停止', 'instance_status', '= stopped', '1m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day');

-- ========== 告警事件 ==========
INSERT INTO demo.alerts (id, rule_id, instance_id, severity, message, status, fired_at, resolved_at) VALUES
('c3d4e5f6-0001-4000-8000-000000000001', 'b2c3d4e5-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'warning', 'web-prod-01 CPU 使用率持续 85.3%，超过 80% 阈值', 'firing', NOW() - INTERVAL '15 min', NULL),
('c3d4e5f6-0001-4000-8000-000000000002', 'b2c3d4e5-0001-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000008', 'critical', 'backup-server 内存使用率 92.1%，超过 90% 阈值', 'firing', NOW() - INTERVAL '8 min', NULL),
('c3d4e5f6-0001-4000-8000-000000000003', 'b2c3d4e5-0001-4000-8000-000000000003', 'a1b2c3d4-0001-4000-8000-000000000006', 'warning', 'analytics-worker 实例已停止', 'resolved', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour');

-- ========== 成本记录 ==========
INSERT INTO demo.cost_records (provider, region, service, resource_id, amount, currency, period_start, period_end, created_at) VALUES
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

-- ========== 指标数据 ==========
INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'cpu_utilization', 85.30, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000001', 'memory_utilization', 72.50, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000004', 'cpu_utilization', 45.20, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000005', 'cpu_utilization', 62.80, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000007', 'cpu_utilization', 78.90, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000008', 'memory_utilization', 92.10, '%', NOW() - INTERVAL '1 min', NOW());

-- ========== Token 使用量 ==========
INSERT INTO demo.token_usage (user_id, session_key, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at) VALUES
('demo-u-1', 'session-demo-001', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 1250, 380, 1630, NOW() - INTERVAL '2 hour'),
('demo-u-1', 'session-demo-002', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 890, 245, 1135, NOW() - INTERVAL '1 hour'),
('demo-u-1', 'session-demo-003', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 2100, 520, 2620, NOW() - INTERVAL '30 min'),
('demo-u-1', 'session-demo-004', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 580, 180, 760, NOW() - INTERVAL '10 min');

-- ========== 预测指标 demo 数据（24 小时磁盘递增趋势） ==========
INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at)
SELECT 'a1b2c3d4-0001-4000-8000-000000000001', 'disk_utilization',
       70.0 + (n * 0.5), '%',
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL,
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL
FROM generate_series(0, 23) AS n;

INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at)
SELECT 'a1b2c3d4-0001-4000-8000-000000000004', 'memory_utilization',
       60.0 + (n * 0.8), '%',
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL,
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL
FROM generate_series(0, 23) AS n;

-- ========== 自愈 demo 数据 ==========
INSERT INTO demo.remediation_runs (id, alert_id, instance_id, root_cause, action_plan, action_executed, status, env, triggered_at, approved_at, executed_at, verified_at, verification_result) VALUES
('d4e5f6a7-0001-4000-8000-000000000001', 'c3d4e5f6-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001',
 'web-prod-01 CPU 持续高于 80%，疑似内存泄漏导致进程 CPU 占用异常',
 '{"rootCause":"内存泄漏","recommendedAction":"reboot_instance","reasoning":"重启释放累积内存","riskLevel":"moderate","expectedEffect":"CPU 降至 40-50%","verificationMetric":"cpu_utilization","verificationTimeout":60}'::jsonb,
 'reboot_instance', 'success', 'prod',
 NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour 58 min',
 '验证成功：cpu_utilization 已降至 45.2%（阈值 80%），修复有效'),
('d4e5f6a7-0001-4000-8000-000000000002', 'c3d4e5f6-0001-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000008',
 'backup-server 内存使用率 92%，超过 90% 阈值',
 '{"rootCause":"缓存未释放","recommendedAction":"reboot_instance","reasoning":"重启清理缓存","riskLevel":"moderate","expectedEffect":"内存降至 50%","verificationMetric":"memory_utilization","verificationTimeout":60}'::jsonb,
 'reboot_instance', 'pending', 'prod',
 NOW() - INTERVAL '8 min', NULL, NULL, NULL, NULL);

-- ========== 知识库 demo 数据 ==========
INSERT INTO demo.knowledge_base (id, symptom, metric_name, instance_provider, instance_env, root_cause, action_taken, outcome, resolution_time_minutes, helpful_count, created_at) VALUES
('e5f6a7b8-0001-4000-8000-000000000001', 'api-worker-02 (aws) CPU 持续 >85%，疑似内存泄漏', 'cpu_utilization', 'aws', 'prod', '应用层内存泄漏，长时间运行导致 GC 压力增大', 'reboot_instance', 'success', 15, 3, NOW() - INTERVAL '15 day'),
('e5f6a7b8-0001-4000-8000-000000000002', 'db-staging-01 (aws) 内存使用率 91%，超过阈值', 'memory_utilization', 'aws', 'staging', '数据库连接池配置过大，导致内存占用高', 'reboot_instance', 'failed', 0, 1, NOW() - INTERVAL '10 day'),
('e5f6a7b8-0001-4000-8000-000000000003', 'nginx-gateway (aliyun) 磁盘使用率持续上升', 'disk_utilization', 'aliyun', 'prod', '日志文件未轮转，占用大量磁盘空间', 'reboot_instance', 'success', 5, 2, NOW() - INTERVAL '5 day'),
('e5f6a7b8-0001-4000-8000-000000000004', 'redis-cache (aliyun) 内存使用率 88%', 'memory_utilization', 'aliyun', 'prod', 'Redis 缓存未设置淘汰策略，内存持续增长', 'reboot_instance', 'success', 8, 0, NOW() - INTERVAL '3 day'),
('e5f6a7b8-0001-4000-8000-000000000005', 'ml-training-gpu (azure) CPU 95%，GPU 任务堆积', 'cpu_utilization', 'azure', 'prod', '训练任务并发数过高，导致 GPU 和 CPU 双重过载', 'stop_instance', 'success', 2, 1, NOW() - INTERVAL '1 day');

COMMIT;

-- 验证
SELECT 'demo.instances' as tbl, count(*) FROM demo.instances
UNION ALL SELECT 'demo.alert_rules', count(*) FROM demo.alert_rules
UNION ALL SELECT 'demo.alerts (firing)', count(*) FROM demo.alerts WHERE status = 'firing'
UNION ALL SELECT 'demo.cost_records', count(*) FROM demo.cost_records
UNION ALL SELECT 'demo.metrics', count(*) FROM demo.metrics
UNION ALL SELECT 'demo.token_usage', count(*) FROM demo.token_usage
UNION ALL SELECT 'demo.remediation_runs', count(*) FROM demo.remediation_runs
UNION ALL SELECT 'demo.knowledge_base', count(*) FROM demo.knowledge_base;
