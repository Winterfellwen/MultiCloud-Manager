-- scripts/demo-data.sql
-- Demo 数据：~120 云资源 across AWS/Aliyun/Azure，物理隔离 public 真实数据
-- 使用方法：docker compose exec -T postgres psql -U multicloud -d multicloud < scripts/demo-data.sql

BEGIN;

-- 仅清 demo schema
TRUNCATE demo.instances, demo.alerts, demo.alert_rules,
         demo.cost_records, demo.metrics, demo.cloud_resources,
         demo.token_usage, demo.remediation_runs, demo.knowledge_base,
         demo.metric_predictions, demo.cloud_accounts CASCADE;

-- ========== 云账户 ==========
INSERT INTO demo.cloud_accounts (id, provider, name, status, config, created_at, updated_at) VALUES
('a0000001-0000-4000-8000-000000000001', 'aws', 'AWS Production', 'active', '{"accessKey":"AKIA****DEMO","region":"us-east-1"}'::jsonb, NOW() - INTERVAL '60 day', NOW()),
('a0000002-0000-4000-8000-000000000002', 'aliyun', 'Aliyun Production', 'active', '{"accessKey":"LTAI****DEMO","region":"cn-hangzhou"}'::jsonb, NOW() - INTERVAL '60 day', NOW()),
('a0000003-0000-4000-8000-000000000003', 'azure', 'Azure Production', 'active', '{"subscriptionId":"****DEMO","tenantId":"****DEMO"}'::jsonb, NOW() - INTERVAL '60 day', NOW());

-- ========== 实例数据（24 个） ==========
INSERT INTO demo.instances (id, provider, provider_instance_id, name, region, status, cpu, memory_mb, disk_gb, public_ip, private_ip, monthly_cost, tags, last_synced_at, created_at) VALUES
-- AWS (8)
('a1b2c3d4-0001-4000-8000-000000000001', 'aws', 'i-0abc1234def56789', 'web-prod-01', 'us-east-1', 'running', 2, 4096, 50, '54.221.10.5', '10.0.1.5', 38.50, '{"env":"prod","app":"web"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '7 day'),
('a1b2c3d4-0001-4000-8000-000000000002', 'aws', 'i-0abc1234def56790', 'api-worker-02', 'us-east-1', 'running', 4, 8192, 100, NULL, '10.0.1.6', 78.20, '{"env":"prod","app":"api"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '14 day'),
('a1b2c3d4-0001-4000-8000-000000000003', 'aws', 'i-0abc1234def56791', 'db-staging-01', 'ap-southeast-1', 'running', 8, 16384, 200, NULL, '10.0.2.10', 156.80, '{"env":"staging","app":"db"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day'),
('a1b2c3d4-0001-4000-8000-000000000004', 'aws', 'i-0abc1234def56792', 'cache-prod-01', 'us-east-1', 'running', 2, 4096, 50, NULL, '10.0.1.10', 45.00, '{"env":"prod","app":"cache"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day'),
('a1b2c3d4-0001-4000-8000-000000000005', 'aws', 'i-0abc1234def56793', 'worker-batch-01', 'us-east-1', 'stopped', 4, 8192, 100, NULL, '10.0.1.11', 62.00, '{"env":"prod","app":"batch"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day'),
('a1b2c3d4-0001-4000-8000-000000000006', 'aws', 'i-0abc1234def56794', 'ml-inference-01', 'us-west-2', 'running', 8, 32768, 200, '52.33.10.100', '10.0.3.5', 320.00, '{"env":"prod","app":"ml"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0001-4000-8000-000000000007', 'aws', 'i-0abc1234def56795', 'monitoring-01', 'us-east-1', 'running', 2, 4096, 50, '34.200.10.10', '10.0.1.20', 35.00, '{"env":"prod","app":"monitoring"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day'),
('a1b2c3d4-0001-4000-8000-000000000008', 'aws', 'i-0abc1234def56796', 'dev-sandbox-01', 'us-east-1', 'running', 2, 2048, 30, NULL, '10.0.1.30', 18.00, '{"env":"dev","app":"sandbox"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '3 day'),

-- Aliyun (8)
('a1b2c3d4-0002-4000-8000-000000000001', 'aliyun', 'i-bp1abc123xyz', 'nginx-gateway', 'cn-hangzhou', 'running', 2, 4096, 40, '47.116.20.33', '172.16.0.5', 25.30, '{"env":"prod","app":"gateway"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0002-4000-8000-000000000002', 'aliyun', 'i-bp1abc124xyz', 'redis-cache', 'cn-hangzhou', 'running', 4, 8192, 60, NULL, '172.16.0.6', 42.10, '{"env":"prod","app":"cache"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day'),
('a1b2c3d4-0002-4000-8000-000000000003', 'aliyun', 'i-bp1abc125xyz', 'analytics-worker', 'cn-shanghai', 'running', 16, 32768, 500, NULL, '172.17.0.8', 210.50, '{"env":"prod","app":"analytics"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day'),
('a1b2c3d4-0002-4000-8000-000000000004', 'aliyun', 'i-bp1abc126xyz', 'web-prod-hz-01', 'cn-hangzhou', 'running', 2, 4096, 50, '47.116.20.50', '172.16.0.10', 28.00, '{"env":"prod","app":"web"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day'),
('a1b2c3d4-0002-4000-8000-000000000005', 'aliyun', 'i-bp1abc127xyz', 'api-gateway-sh-01', 'cn-shanghai', 'running', 4, 8192, 100, '47.108.50.20', '172.17.0.5', 65.00, '{"env":"prod","app":"api"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '12 day'),
('a1b2c3d4-0002-4000-8000-000000000006', 'aliyun', 'i-bp1abc128xyz', 'db-master-hz', 'cn-hangzhou', 'running', 8, 16384, 200, NULL, '172.16.0.20', 180.00, '{"env":"prod","app":"db"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day'),
('a1b2c3d4-0002-4000-8000-000000000007', 'aliyun', 'i-bp1abc129xyz', 'log-collector', 'cn-hangzhou', 'running', 2, 4096, 100, NULL, '172.16.0.25', 22.00, '{"env":"prod","app":"logging"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '40 day'),
('a1b2c3d4-0002-4000-8000-000000000008', 'aliyun', 'i-bp1abc130xyz', 'dev-test-01', 'cn-hangzhou', 'stopped', 2, 2048, 30, NULL, '172.16.0.30', 15.00, '{"env":"dev","app":"test"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day'),

-- Azure (8)
('a1b2c3d4-0003-4000-8000-000000000001', 'azure', 'azure-vm-001', 'ml-training-gpu', 'eastus', 'running', 8, 65536, 1000, '20.115.5.22', '10.1.0.5', 480.00, '{"env":"prod","app":"ml"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day'),
('a1b2c3d4-0003-4000-8000-000000000002', 'azure', 'azure-vm-002', 'backup-server', 'westeurope', 'stopped', 4, 16384, 200, NULL, '10.1.0.6', 95.20, '{"env":"prod","app":"backup"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day'),
('a1b2c3d4-0003-4000-8000-000000000003', 'azure', 'azure-vm-003', 'web-prod-eus-01', 'eastus', 'running', 2, 4096, 50, '20.115.5.30', '10.1.0.10', 42.00, '{"env":"prod","app":"web"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '8 day'),
('a1b2c3d4-0003-4000-8000-000000000004', 'azure', 'azure-vm-004', 'api-backend-01', 'eastus', 'running', 4, 8192, 100, NULL, '10.1.0.11', 85.00, '{"env":"prod","app":"api"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '12 day'),
('a1b2c3d4-0003-4000-8000-000000000005', 'azure', 'azure-vm-005', 'db-replica-01', 'westeurope', 'running', 8, 32768, 500, NULL, '10.2.0.10', 280.00, '{"env":"prod","app":"db"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '18 day'),
('a1b2c3d4-0003-4000-8000-000000000006', 'azure', 'azure-vm-006', 'cache-we-01', 'westeurope', 'running', 2, 16384, 100, NULL, '10.2.0.15', 68.00, '{"env":"prod","app":"cache"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '22 day'),
('a1b2c3d4-0003-4000-8000-000000000007', 'azure', 'azure-vm-007', 'worker-queue-01', 'eastus', 'running', 4, 8192, 100, NULL, '10.1.0.20', 55.00, '{"env":"prod","app":"queue"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '35 day'),
('a1b2c3d4-0003-4000-8000-000000000008', 'azure', 'azure-vm-008', 'dev-sandbox-az', 'eastus', 'running', 2, 4096, 30, NULL, '10.1.0.30', 20.00, '{"env":"dev","app":"sandbox"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day');

-- ========== 告警规则 ==========
INSERT INTO demo.alert_rules (id, name, metric, condition, duration, severity, actions, enabled, created_at) VALUES
('b2c3d4e5-0001-4000-8000-000000000001', 'CPU 使用率 > 80%', 'cpu_utilization', '> 80', '5m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000002', '内存使用率 > 90%', 'memory_utilization', '> 90', '5m', 'critical', '{"notify":["webhook","email"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000003', '磁盘使用率 > 85%', 'disk_utilization', '> 85', '10m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000004', '实例停止', 'instance_status', '= stopped', '1m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('b2c3d4e5-0001-4000-8000-000000000005', '网络延迟 > 200ms', 'network_latency', '> 200', '5m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day');

-- ========== 告警事件 ==========
INSERT INTO demo.alerts (id, rule_id, instance_id, severity, message, status, fired_at, resolved_at) VALUES
('c3d4e5f6-0001-4000-8000-000000000001', 'b2c3d4e5-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'warning', 'web-prod-01 CPU 使用率持续 85.3%，超过 80% 阈值', 'firing', NOW() - INTERVAL '15 min', NULL),
('c3d4e5f6-0001-4000-8000-000000000002', 'b2c3d4e5-0001-4000-8000-000000000002', 'a1b2c3d4-0003-4000-8000-000000000002', 'critical', 'backup-server 内存使用率 92.1%，超过 90% 阈值', 'firing', NOW() - INTERVAL '8 min', NULL),
('c3d4e5f6-0001-4000-8000-000000000003', 'b2c3d4e5-0001-4000-8000-000000000004', 'a1b2c3d4-0001-4000-8000-000000000005', 'warning', 'worker-batch-01 实例已停止', 'firing', NOW() - INTERVAL '2 hour', NULL),
('c3d4e5f6-0001-4000-8000-000000000004', 'b2c3d4e5-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000003', 'warning', 'analytics-worker CPU 使用率 82.5%', 'resolved', NOW() - INTERVAL '3 hour', NOW() - INTERVAL '2 hour'),
('c3d4e5f6-0001-4000-8000-000000000005', 'b2c3d4e5-0001-4000-8000-000000000003', 'a1b2c3d4-0002-4000-8000-000000000007', 'warning', 'log-collector 磁盘使用率 87%', 'firing', NOW() - INTERVAL '30 min', NULL),
('c3d4e5f6-0001-4000-8000-000000000006', 'b2c3d4e5-0001-4000-8000-000000000002', 'a1b2c3d4-0003-4000-8000-000000000006', 'critical', 'cache-we-01 内存使用率 91.5%', 'firing', NOW() - INTERVAL '5 min', NULL);

-- ========== 成本记录 ==========
INSERT INTO demo.cost_records (provider, region, service, resource_id, amount, currency, period_start, period_end, created_at) VALUES
-- AWS
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56789', 38.50, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56790', 78.20, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'ap-southeast-1', 'ec2', 'i-0abc1234def56791', 156.80, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56792', 45.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56793', 62.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-west-2', 'ec2', 'i-0abc1234def56794', 320.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56795', 35.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ec2', 'i-0abc1234def56796', 18.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 's3', NULL, 45.60, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'rds', NULL, 128.50, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'elasticache', NULL, 52.30, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'elb', NULL, 32.10, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'ebs', NULL, 28.40, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('aws', 'us-east-1', 'cloudfront', NULL, 18.90, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
-- Aliyun
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc123xyz', 25.30, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc124xyz', 42.10, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-shanghai', 'ecs', 'i-bp1abc125xyz', 210.50, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc126xyz', 28.00, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-shanghai', 'ecs', 'i-bp1abc127xyz', 65.00, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc128xyz', 180.00, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc129xyz', 22.00, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'ecs', 'i-bp1abc130xyz', 15.00, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'oss', NULL, 18.50, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'rds', NULL, 95.20, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'redis', NULL, 38.60, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'slb', NULL, 22.80, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'disk', NULL, 15.30, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
('aliyun', 'cn-hangzhou', 'cdn', NULL, 12.40, 'CNY', date_trunc('month', NOW()), NOW(), NOW()),
-- Azure
('azure', 'eastus', 'virtual-machines', 'azure-vm-001', 480.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'westeurope', 'virtual-machines', 'azure-vm-002', 95.20, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'virtual-machines', 'azure-vm-003', 42.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'virtual-machines', 'azure-vm-004', 85.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'westeurope', 'virtual-machines', 'azure-vm-005', 280.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'westeurope', 'virtual-machines', 'azure-vm-006', 68.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'virtual-machines', 'azure-vm-007', 55.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'virtual-machines', 'azure-vm-008', 20.00, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'storage', NULL, 32.50, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'westeurope', 'sql-database', NULL, 165.80, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'westeurope', 'redis-cache', NULL, 48.20, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'load-balancer', NULL, 25.60, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'managed-disks', NULL, 22.30, 'USD', date_trunc('month', NOW()), NOW(), NOW()),
('azure', 'eastus', 'azure-cdn', NULL, 15.80, 'USD', date_trunc('month', NOW()), NOW(), NOW());

-- ========== 指标数据 ==========
INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'cpu_utilization', 85.30, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000001', 'memory_utilization', 72.50, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000001', 'disk_utilization', 65.20, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000002', 'cpu_utilization', 45.20, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0001-4000-8000-000000000002', 'memory_utilization', 58.30, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0002-4000-8000-000000000001', 'cpu_utilization', 62.80, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0002-4000-8000-000000000001', 'memory_utilization', 45.60, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0002-4000-8000-000000000003', 'cpu_utilization', 78.90, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0002-4000-8000-000000000003', 'memory_utilization', 82.10, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0003-4000-8000-000000000001', 'cpu_utilization', 72.50, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0003-4000-8000-000000000001', 'memory_utilization', 68.40, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0003-4000-8000-000000000002', 'cpu_utilization', 15.20, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0003-4000-8000-000000000002', 'memory_utilization', 92.10, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0003-4000-8000-000000000006', 'cpu_utilization', 55.30, '%', NOW() - INTERVAL '1 min', NOW()),
('a1b2c3d4-0003-4000-8000-000000000006', 'memory_utilization', 91.50, '%', NOW() - INTERVAL '1 min', NOW());

-- 24h 趋势数据
INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at)
SELECT 'a1b2c3d4-0001-4000-8000-000000000001', 'disk_utilization',
       70.0 + (n * 0.5), '%',
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL,
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL
FROM generate_series(0, 23) AS n;

INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at)
SELECT 'a1b2c3d4-0002-4000-8000-000000000001', 'memory_utilization',
       60.0 + (n * 0.8), '%',
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL,
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL
FROM generate_series(0, 23) AS n;

INSERT INTO demo.metrics (instance_id, metric_name, value, unit, recorded_at, created_at)
SELECT 'a1b2c3d4-0003-4000-8000-000000000001', 'cpu_utilization',
       65.0 + (n * 0.3), '%',
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL,
       NOW() - INTERVAL '24 hours' + (n || ' hours')::INTERVAL
FROM generate_series(0, 23) AS n;

-- ========== Token 使用量 ==========
INSERT INTO demo.token_usage (user_id, session_key, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at) VALUES
('demo-u-1', 'session-demo-001', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 1250, 380, 1630, NOW() - INTERVAL '2 hour'),
('demo-u-1', 'session-demo-002', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 890, 245, 1135, NOW() - INTERVAL '1 hour'),
('demo-u-1', 'session-demo-003', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 2100, 520, 2620, NOW() - INTERVAL '30 min'),
('demo-u-1', 'session-demo-004', 'https://integrate.api.nvidia.com/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 580, 180, 760, NOW() - INTERVAL '10 min');

-- ========== 云资源数据（供拓扑/资源总览） ==========
-- AWS 资源 (40)
INSERT INTO demo.cloud_resources (id, provider, resource_type, provider_resource_id, name, region, status, attributes, tags, topology, last_synced_at, created_at, updated_at) VALUES
-- VPCs
('b0000001-0001-4000-8000-000000000001', 'aws', 'vpc', 'vpc-0abc1234', 'prod-vpc-us-east', 'us-east-1', 'available', '{"cidrBlock":"10.0.0.0/16","subnetCount":4,"isDefault":false,"state":"available"}'::jsonb, '{"env":"prod"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000001-0002-4000-8000-000000000002', 'aws', 'vpc', 'vpc-0def5678', 'staging-vpc-ap', 'ap-southeast-1', 'available', '{"cidrBlock":"10.1.0.0/16","subnetCount":2,"isDefault":false,"state":"available"}'::jsonb, '{"env":"staging"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('b0000001-0003-4000-8000-000000000003', 'aws', 'vpc', 'vpc-0ghi9012', 'ml-vpc-us-west', 'us-west-2', 'available', '{"cidrBlock":"10.2.0.0/16","subnetCount":3,"isDefault":false,"state":"available"}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
-- Security Groups
('b0000002-0001-4000-8000-000000000001', 'aws', 'securitygroup', 'sg-0abc1234', 'web-sg', 'us-east-1', 'active', '{"vpcId":"vpc-0abc1234","ruleCount":6,"ingressRules":3,"egressRules":3,"description":"Web server security group"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"vpcId":"vpc-0abc1234"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000002-0002-4000-8000-000000000002', 'aws', 'securitygroup', 'sg-0def5678', 'api-sg', 'us-east-1', 'active', '{"vpcId":"vpc-0abc1234","ruleCount":4,"ingressRules":2,"egressRules":2,"description":"API server security group"}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"vpcId":"vpc-0abc1234"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000002-0003-4000-8000-000000000003', 'aws', 'securitygroup', 'sg-0ghi9012', 'db-sg', 'us-east-1', 'active', '{"vpcId":"vpc-0abc1234","ruleCount":3,"ingressRules":1,"egressRules":2,"description":"Database security group"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vpc-0abc1234"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
-- Instances
('b0000003-0001-4000-8000-000000000001', 'aws', 'instance', 'i-0abc1234def56789', 'web-prod-01', 'us-east-1', 'running', '{"instanceType":"t3.medium","ami":"ami-0abcdef1234567890","privateIp":"10.0.1.5"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '7 day', NOW()),
('b0000003-0002-4000-8000-000000000002', 'aws', 'instance', 'i-0abc1234def56790', 'api-worker-02', 'us-east-1', 'running', '{"instanceType":"t3.xlarge","ami":"ami-0abcdef1234567890","privateIp":"10.0.1.6"}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0def5678"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '14 day', NOW()),
('b0000003-0003-4000-8000-000000000003', 'aws', 'instance', 'i-0abc1234def56791', 'db-staging-01', 'ap-southeast-1', 'running', '{"instanceType":"m5.2xlarge","ami":"ami-0abcdef1234567890","privateIp":"10.0.2.10"}'::jsonb, '{"env":"staging","app":"db"}'::jsonb, '{"vpcId":"vpc-0def5678","securityGroupIds":["sg-0ghi9012"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day', NOW()),
('b0000003-0004-4000-8000-000000000004', 'aws', 'instance', 'i-0abc1234def56792', 'cache-prod-01', 'us-east-1', 'running', '{"instanceType":"t3.medium","ami":"ami-0abcdef1234567890","privateIp":"10.0.1.10"}'::jsonb, '{"env":"prod","app":"cache"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('b0000003-0005-4000-8000-000000000005', 'aws', 'instance', 'i-0abc1234def56793', 'worker-batch-01', 'us-east-1', 'stopped', '{"instanceType":"t3.xlarge","ami":"ami-0abcdef1234567890","privateIp":"10.0.1.11"}'::jsonb, '{"env":"prod","app":"batch"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0def5678"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('b0000003-0006-4000-8000-000000000006', 'aws', 'instance', 'i-0abc1234def56794', 'ml-inference-01', 'us-west-2', 'running', '{"instanceType":"p3.2xlarge","ami":"ami-0abcdef1234567890","privateIp":"10.0.3.5"}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vpc-0ghi9012","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('b0000003-0007-4000-8000-000000000007', 'aws', 'instance', 'i-0abc1234def56795', 'monitoring-01', 'us-east-1', 'running', '{"instanceType":"t3.small","ami":"ami-0abcdef1234567890","privateIp":"10.0.1.20"}'::jsonb, '{"env":"prod","app":"monitoring"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('b0000003-0008-4000-8000-000000000008', 'aws', 'instance', 'i-0abc1234def56796', 'dev-sandbox-01', 'us-east-1', 'running', '{"instanceType":"t3.micro","ami":"ami-0abcdef1234567890","privateIp":"10.0.1.30"}'::jsonb, '{"env":"dev","app":"sandbox"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '3 day', NOW()),
-- Load Balancers
('b0000004-0001-4000-8000-000000000001', 'aws', 'loadbalancer', 'alb-0abc1234', 'web-alb', 'us-east-1', 'active', '{"type":"application","scheme":"internet-facing","dnsName":"web-alb-123456.us-east-1.elb.amazonaws.com","vpcId":"vpc-0abc1234","listenerCount":2,"targetCount":3,"targetInstanceIds":["i-0abc1234def56789","i-0abc1234def56790","i-0abc1234def56792"]}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"targetInstanceIds":["i-0abc1234def56789","i-0abc1234def56790","i-0abc1234def56792"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000004-0002-4000-8000-000000000002', 'aws', 'loadbalancer', 'nlb-0def5678', 'api-nlb', 'us-east-1', 'active', '{"type":"network","scheme":"internal","dnsName":"api-nlb-123456.us-east-1.elb.amazonaws.com","vpcId":"vpc-0abc1234","listenerCount":1,"targetCount":2,"targetInstanceIds":["i-0abc1234def56790","i-0abc1234def56793"]}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"targetInstanceIds":["i-0abc1234def56790","i-0abc1234def56793"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
-- Buckets
('b0000005-0001-4000-8000-000000000001', 'aws', 'bucket', 'my-app-bucket', 'my-app-bucket', 'us-east-1', 'available', '{"storageClass":"STANDARD","objectCount":15234,"sizeBytes":5368709120,"versioning":true,"publicAccess":false,"lifecycleRules":2}'::jsonb, '{"env":"prod","app":"storage"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('b0000005-0002-4000-8000-000000000002', 'aws', 'bucket', 'ml-training-data', 'ml-training-data', 'us-west-2', 'available', '{"storageClass":"STANDARD","objectCount":892,"sizeBytes":107374182400,"versioning":true,"publicAccess":false,"lifecycleRules":1}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('b0000005-0003-4000-8000-000000000003', 'aws', 'bucket', 'backup-archive', 'backup-archive', 'us-east-1', 'available', '{"storageClass":"GLACIER","objectCount":4521,"sizeBytes":53687091200,"versioning":false,"publicAccess":false,"lifecycleRules":3}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('b0000005-0004-4000-8000-000000000004', 'aws', 'bucket', 'staging-assets', 'staging-assets', 'ap-southeast-1', 'available', '{"storageClass":"STANDARD_IA","objectCount":2340,"sizeBytes":10737418240,"versioning":false,"publicAccess":false,"lifecycleRules":1}'::jsonb, '{"env":"staging","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW()),
('b0000005-0005-4000-8000-000000000005', 'aws', 'bucket', 'log-archive', 'log-archive', 'us-east-1', 'available', '{"storageClass":"GLACIER","objectCount":89234,"sizeBytes":214748364800,"versioning":false,"publicAccess":false,"lifecycleRules":4}'::jsonb, '{"env":"prod","app":"logging"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '90 day', NOW()),
-- Databases
('b0000006-0001-4000-8000-000000000001', 'aws', 'database', 'mydb-prod', 'mydb-prod', 'us-east-1', 'available', '{"engine":"postgres","engineVersion":"15.4","instanceClass":"db.t3.medium","storageGb":100,"multiAz":true,"endpoint":"mydb-prod.abc123.us-east-1.rds.amazonaws.com","port":5432}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0ghi9012"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000006-0002-4000-8000-000000000002', 'aws', 'database', 'mydb-replica', 'mydb-replica', 'us-east-1', 'available', '{"engine":"postgres","engineVersion":"15.4","instanceClass":"db.t3.small","storageGb":50,"multiAz":false,"endpoint":"mydb-replica.abc123.us-east-1.rds.amazonaws.com","port":5432}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0ghi9012"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('b0000006-0003-4000-8000-000000000003', 'aws', 'database', 'analytics-db', 'analytics-db', 'us-east-1', 'available', '{"engine":"mysql","engineVersion":"8.0","instanceClass":"db.r5.large","storageGb":200,"multiAz":true,"endpoint":"analytics-db.abc123.us-east-1.rds.amazonaws.com","port":3306}'::jsonb, '{"env":"prod","app":"analytics"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0ghi9012"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
('b0000006-0004-4000-8000-000000000004', 'aws', 'database', 'staging-db', 'staging-db', 'ap-southeast-1', 'available', '{"engine":"postgres","engineVersion":"15.4","instanceClass":"db.t3.medium","storageGb":50,"multiAz":false,"endpoint":"staging-db.abc123.ap-southeast-1.rds.amazonaws.com","port":5432}'::jsonb, '{"env":"staging","app":"db"}'::jsonb, '{"vpcId":"vpc-0def5678","securityGroupIds":["sg-0ghi9012"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('b0000006-0005-4000-8000-000000000005', 'aws', 'database', 'ml-metadata-db', 'ml-metadata-db', 'us-west-2', 'available', '{"engine":"postgres","engineVersion":"15.4","instanceClass":"db.t3.medium","storageGb":50,"multiAz":false,"endpoint":"ml-metadata-db.abc123.us-west-2.rds.amazonaws.com","port":5432}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vpc-0ghi9012","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW()),
-- Caches
('b0000007-0001-4000-8000-000000000001', 'aws', 'cache', 'cache-prod-01', 'redis-prod', 'us-east-1', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"cache.t3.medium","memoryMb":4096,"nodeType":"cache.t3.medium","shardCount":1,"endpoint":"cache-prod-01.abc123.0001.use1.cache.amazonaws.com","port":6379}'::jsonb, '{"env":"prod","app":"cache"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000007-0002-4000-8000-000000000002', 'aws', 'cache', 'cache-session', 'redis-session', 'us-east-1', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"cache.t3.small","memoryMb":2048,"nodeType":"cache.t3.small","shardCount":1,"endpoint":"cache-session.abc123.0001.use1.cache.amazonaws.com","port":6379}'::jsonb, '{"env":"prod","app":"session"}'::jsonb, '{"vpcId":"vpc-0abc1234","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('b0000007-0003-4000-8000-000000000003', 'aws', 'cache', 'cache-ml-feature', 'redis-ml-feature', 'us-west-2', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"cache.r5.large","memoryMb":16384,"nodeType":"cache.r5.large","shardCount":2,"endpoint":"cache-ml-feature.abc123.0001.usw2.cache.amazonaws.com","port":6379}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vpc-0ghi9012","securityGroupIds":["sg-0abc1234"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
-- Disks
('b0000008-0001-4000-8000-000000000001', 'aws', 'disk', 'vol-0abc1234', 'web-prod-01-root', 'us-east-1', 'in-use', '{"sizeGb":50,"diskType":"gp3","iops":3000,"throughput":125,"encrypted":true,"attachedInstanceId":"i-0abc1234def56789","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '7 day', NOW()),
('b0000008-0002-4000-8000-000000000002', 'aws', 'disk', 'vol-0def5678', 'api-worker-02-root', 'us-east-1', 'in-use', '{"sizeGb":100,"diskType":"gp3","iops":5000,"throughput":250,"encrypted":true,"attachedInstanceId":"i-0abc1234def56790","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '14 day', NOW()),
('b0000008-0003-4000-8000-000000000003', 'aws', 'disk', 'vol-0ghi9012', 'ml-data-vol', 'us-west-2', 'in-use', '{"sizeGb":500,"diskType":"io2","iops":10000,"throughput":500,"encrypted":true,"attachedInstanceId":"i-0abc1234def56794","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('b0000008-0004-4000-8000-000000000004', 'aws', 'disk', 'vol-0jkl3456', 'backup-vol', 'us-east-1', 'available', '{"sizeGb":200,"diskType":"gp3","iops":3000,"throughput":125,"encrypted":true,"attachedInstanceId":null,"attachmentStatus":null}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('b0000008-0005-4000-8000-000000000005', 'aws', 'disk', 'vol-0mno7890', 'staging-db-data', 'ap-southeast-1', 'in-use', '{"sizeGb":200,"diskType":"gp3","iops":5000,"throughput":250,"encrypted":true,"attachedInstanceId":"i-0abc1234def56791","attachmentStatus":"attached"}'::jsonb, '{"env":"staging","app":"db"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day', NOW()),
-- CDN
('b0000009-0001-4000-8000-000000000001', 'aws', 'cdn', 'E1234567890', 'web-cdn', 'us-east-1', 'deployed', '{"domainName":"cdn.example.com","originDomain":"web-alb-123456.us-east-1.elb.amazonaws.com","originType":"alb","enabled":true,"priceClass":"PriceClass_100","sslCertificate":"arn:aws:acm:us-east-1:123456:certificate/abc"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('b0000009-0002-4000-8000-000000000002', 'aws', 'cdn', 'E0987654321', 'assets-cdn', 'us-east-1', 'deployed', '{"domainName":"assets.example.com","originDomain":"my-app-bucket.s3.amazonaws.com","originType":"s3","enabled":true,"priceClass":"PriceClass_All","sslCertificate":"arn:aws:acm:us-east-1:123456:certificate/def"}'::jsonb, '{"env":"prod","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
-- Cluster
('b0000010-0001-4000-8000-000000000001', 'aws', 'cluster', 'eks-prod-cluster', 'eks-prod', 'us-east-1', 'active', '{"clusterType":"eks","kubernetesVersion":"1.28","nodeCount":6,"status":"active","endpoint":"https://ABC123.gr7.us-east-1.eks.amazonaws.com","vpcId":"vpc-0abc1234"}'::jsonb, '{"env":"prod","app":"k8s"}'::jsonb, '{"vpcId":"vpc-0abc1234"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('b0000010-0002-4000-8000-000000000002', 'aws', 'cluster', 'eks-dev-cluster', 'eks-dev', 'us-east-1', 'active', '{"clusterType":"eks","kubernetesVersion":"1.28","nodeCount":2,"status":"active","endpoint":"https://DEF456.gr7.us-east-1.eks.amazonaws.com","vpcId":"vpc-0abc1234"}'::jsonb, '{"env":"dev","app":"k8s"}'::jsonb, '{"vpcId":"vpc-0abc1234"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW());

-- Aliyun 资源 (40)
INSERT INTO demo.cloud_resources (id, provider, resource_type, provider_resource_id, name, region, status, attributes, tags, topology, last_synced_at, created_at, updated_at) VALUES
-- VPCs
('c0000001-0001-4000-8000-000000000001', 'aliyun', 'vpc', 'vpc-bp1abc123', 'prod-vpc-hz', 'cn-hangzhou', 'available', '{"cidrBlock":"172.16.0.0/12","subnetCount":4,"isDefault":false,"state":"available"}'::jsonb, '{"env":"prod"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000001-0002-4000-8000-000000000002', 'aliyun', 'vpc', 'vpc-bp1def456', 'prod-vpc-sh', 'cn-shanghai', 'available', '{"cidrBlock":"172.17.0.0/12","subnetCount":3,"isDefault":false,"state":"available"}'::jsonb, '{"env":"prod"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('c0000001-0003-4000-8000-000000000003', 'aliyun', 'vpc', 'vpc-bp1ghi789', 'dev-vpc-hz', 'cn-hangzhou', 'available', '{"cidrBlock":"172.18.0.0/12","subnetCount":2,"isDefault":false,"state":"available"}'::jsonb, '{"env":"dev"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
-- Security Groups
('c0000002-0001-4000-8000-000000000001', 'aliyun', 'securitygroup', 'sg-bp1abc123', 'web-sg-hz', 'cn-hangzhou', 'active', '{"vpcId":"vpc-bp1abc123","ruleCount":5,"ingressRules":3,"egressRules":2,"description":"Web server security group"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"vpcId":"vpc-bp1abc123"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000002-0002-4000-8000-000000000002', 'aliyun', 'securitygroup', 'sg-bp1def456', 'api-sg-sh', 'cn-shanghai', 'active', '{"vpcId":"vpc-bp1def456","ruleCount":4,"ingressRules":2,"egressRules":2,"description":"API server security group"}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"vpcId":"vpc-bp1def456"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('c0000002-0003-4000-8000-000000000003', 'aliyun', 'securitygroup', 'sg-bp1ghi789', 'db-sg-hz', 'cn-hangzhou', 'active', '{"vpcId":"vpc-bp1abc123","ruleCount":3,"ingressRules":1,"egressRules":2,"description":"Database security group"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vpc-bp1abc123"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
-- Instances
('c0000003-0001-4000-8000-000000000001', 'aliyun', 'instance', 'i-bp1abc123xyz', 'nginx-gateway', 'cn-hangzhou', 'running', '{"instanceType":"ecs.t6-c1m1.large","privateIp":"172.16.0.5"}'::jsonb, '{"env":"prod","app":"gateway"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('c0000003-0002-4000-8000-000000000002', 'aliyun', 'instance', 'i-bp1abc124xyz', 'redis-cache', 'cn-hangzhou', 'running', '{"instanceType":"ecs.t6-c1m2.large","privateIp":"172.16.0.6"}'::jsonb, '{"env":"prod","app":"cache"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('c0000003-0003-4000-8000-000000000003', 'aliyun', 'instance', 'i-bp1abc125xyz', 'analytics-worker', 'cn-shanghai', 'running', '{"instanceType":"ecs.g7.4xlarge","privateIp":"172.17.0.8"}'::jsonb, '{"env":"prod","app":"analytics"}'::jsonb, '{"vpcId":"vpc-bp1def456","securityGroupIds":["sg-bp1def456"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('c0000003-0004-4000-8000-000000000004', 'aliyun', 'instance', 'i-bp1abc126xyz', 'web-prod-hz-01', 'cn-hangzhou', 'running', '{"instanceType":"ecs.t6-c1m1.large","privateIp":"172.16.0.10"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW()),
('c0000003-0005-4000-8000-000000000005', 'aliyun', 'instance', 'i-bp1abc127xyz', 'api-gateway-sh-01', 'cn-shanghai', 'running', '{"instanceType":"ecs.c7.xlarge","privateIp":"172.17.0.5"}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"vpcId":"vpc-bp1def456","securityGroupIds":["sg-bp1def456"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '12 day', NOW()),
('c0000003-0006-4000-8000-000000000006', 'aliyun', 'instance', 'i-bp1abc128xyz', 'db-master-hz', 'cn-hangzhou', 'running', '{"instanceType":"ecs.g7.2xlarge","privateIp":"172.16.0.20"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1ghi789"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
('c0000003-0007-4000-8000-000000000007', 'aliyun', 'instance', 'i-bp1abc129xyz', 'log-collector', 'cn-hangzhou', 'running', '{"instanceType":"ecs.t6-c1m1.large","privateIp":"172.16.0.25"}'::jsonb, '{"env":"prod","app":"logging"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '40 day', NOW()),
('c0000003-0008-4000-8000-000000000008', 'aliyun', 'instance', 'i-bp1abc130xyz', 'dev-test-01', 'cn-hangzhou', 'stopped', '{"instanceType":"ecs.t6-c1m1.large","privateIp":"172.16.0.30"}'::jsonb, '{"env":"dev","app":"test"}'::jsonb, '{"vpcId":"vpc-bp1ghi789","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day', NOW()),
-- Load Balancers
('c0000004-0001-4000-8000-000000000001', 'aliyun', 'loadbalancer', 'lb-bp1abc123', 'web-slb-hz', 'cn-hangzhou', 'active', '{"type":"application","scheme":"internet-facing","dnsName":"web-slb-hz.babyalb.cn","vpcId":"vpc-bp1abc123","listenerCount":2,"targetCount":3,"targetInstanceIds":["i-bp1abc123xyz","i-bp1abc126xyz","i-bp1abc129xyz"]}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"targetInstanceIds":["i-bp1abc123xyz","i-bp1abc126xyz","i-bp1abc129xyz"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000004-0002-4000-8000-000000000002', 'aliyun', 'loadbalancer', 'lb-bp1def456', 'api-slb-sh', 'cn-shanghai', 'active', '{"type":"application","scheme":"internal","dnsName":"api-slb-sh.babyalb.cn","vpcId":"vpc-bp1def456","listenerCount":1,"targetCount":2,"targetInstanceIds":["i-bp1abc125xyz","i-bp1abc127xyz"]}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"targetInstanceIds":["i-bp1abc125xyz","i-bp1abc127xyz"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
-- Buckets
('c0000005-0001-4000-8000-000000000001', 'aliyun', 'bucket', 'prod-assets-hz', 'prod-assets-hz', 'cn-hangzhou', 'available', '{"storageClass":"Standard","objectCount":8923,"sizeBytes":8589934592,"versioning":true,"publicAccess":false,"lifecycleRules":1}'::jsonb, '{"env":"prod","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('c0000005-0002-4000-8000-000000000002', 'aliyun', 'bucket', 'ml-training-data-ali', 'ml-training-data-ali', 'cn-shanghai', 'available', '{"storageClass":"Standard","objectCount":567,"sizeBytes":53687091200,"versioning":true,"publicAccess":false,"lifecycleRules":2}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('c0000005-0003-4000-8000-000000000003', 'aliyun', 'bucket', 'backup-archive-ali', 'backup-archive-ali', 'cn-hangzhou', 'available', '{"storageClass":"Archive","objectCount":3456,"sizeBytes":32212254720,"versioning":false,"publicAccess":false,"lifecycleRules":3}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000005-0004-4000-8000-000000000004', 'aliyun', 'bucket', 'staging-assets-ali', 'staging-assets-ali', 'cn-hangzhou', 'available', '{"storageClass":"IA","objectCount":1234,"sizeBytes":5368709120,"versioning":false,"publicAccess":false,"lifecycleRules":1}'::jsonb, '{"env":"staging","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW()),
('c0000005-0005-4000-8000-000000000005', 'aliyun', 'bucket', 'log-archive-ali', 'log-archive-ali', 'cn-hangzhou', 'available', '{"storageClass":"Archive","objectCount":45678,"sizeBytes":107374182400,"versioning":false,"publicAccess":false,"lifecycleRules":4}'::jsonb, '{"env":"prod","app":"logging"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '90 day', NOW()),
-- Databases
('c0000006-0001-4000-8000-000000000001', 'aliyun', 'database', 'rm-bp1abc123', 'rds-prod-hz', 'cn-hangzhou', 'available', '{"engine":"postgres","engineVersion":"14.8","instanceClass":"rds.mysql.s2.large","storageGb":100,"multiAz":true,"endpoint":"rm-bp1abc123.mysql.rds.aliyuncs.com","port":3306}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1ghi789"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000006-0002-4000-8000-000000000002', 'aliyun', 'database', 'rm-bp1def456', 'rds-prod-sh', 'cn-shanghai', 'available', '{"engine":"mysql","engineVersion":"8.0","instanceClass":"rds.mysql.s3.large","storageGb":200,"multiAz":true,"endpoint":"rm-bp1def456.mysql.rds.aliyuncs.com","port":3306}'::jsonb, '{"env":"prod","app":"analytics"}'::jsonb, '{"vpcId":"vpc-bp1def456","securityGroupIds":["sg-bp1def456"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('c0000006-0003-4000-8000-000000000003', 'aliyun', 'database', 'rm-bp1ghi789', 'rds-staging-hz', 'cn-hangzhou', 'available', '{"engine":"postgres","engineVersion":"14.8","instanceClass":"rds.mysql.s2.medium","storageGb":50,"multiAz":false,"endpoint":"rm-bp1ghi789.mysql.rds.aliyuncs.com","port":3306}'::jsonb, '{"env":"staging","app":"db"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1ghi789"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('c0000006-0004-4000-8000-000000000004', 'aliyun', 'database', 'rm-bp1jkl012', 'rds-dev-hz', 'cn-hangzhou', 'available', '{"engine":"mysql","engineVersion":"8.0","instanceClass":"rds.mysql.s1.small","storageGb":20,"multiAz":false,"endpoint":"rm-bp1jkl012.mysql.rds.aliyuncs.com","port":3306}'::jsonb, '{"env":"dev","app":"db"}'::jsonb, '{"vpcId":"vpc-bp1ghi789","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('c0000006-0005-4000-8000-000000000005', 'aliyun', 'database', 'rm-bp1mno345', 'rds-ml-hz', 'cn-hangzhou', 'available', '{"engine":"postgres","engineVersion":"14.8","instanceClass":"rds.mysql.s2.large","storageGb":100,"multiAz":false,"endpoint":"rm-bp1mno345.mysql.rds.aliyuncs.com","port":3306}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1ghi789"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
-- Caches
('c0000007-0001-4000-8000-000000000001', 'aliyun', 'cache', 'r-bp1abc123', 'redis-prod-hz', 'cn-hangzhou', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"redis.master.small.default","memoryMb":4096,"nodeType":"redis.master.small.default","shardCount":1,"endpoint":"r-bp1abc123.redis.rds.aliyuncs.com","port":6379}'::jsonb, '{"env":"prod","app":"cache"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000007-0002-4000-8000-000000000002', 'aliyun', 'cache', 'r-bp1def456', 'redis-session-hz', 'cn-hangzhou', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"redis.master.small.default","memoryMb":2048,"nodeType":"redis.master.small.default","shardCount":1,"endpoint":"r-bp1def456.redis.rds.aliyuncs.com","port":6379}'::jsonb, '{"env":"prod","app":"session"}'::jsonb, '{"vpcId":"vpc-bp1abc123","securityGroupIds":["sg-bp1abc123"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '40 day', NOW()),
('c0000007-0003-4000-8000-000000000003', 'aliyun', 'cache', 'r-bp1ghi789', 'redis-ml-sh', 'cn-shanghai', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"redis.master.large.default","memoryMb":8192,"nodeType":"redis.master.large.default","shardCount":2,"endpoint":"r-bp1ghi789.redis.rds.aliyuncs.com","port":6379}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vpc-bp1def456","securityGroupIds":["sg-bp1def456"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
-- Disks
('c0000008-0001-4000-8000-000000000001', 'aliyun', 'disk', 'd-bp1abc123', 'nginx-root-hz', 'cn-hangzhou', 'in-use', '{"sizeGb":40,"diskType":"cloud_essd","iops":10000,"throughput":500,"encrypted":false,"attachedInstanceId":"i-bp1abc123xyz","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"gateway"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('c0000008-0002-4000-8000-000000000002', 'aliyun', 'disk', 'd-bp1def456', 'analytics-data-sh', 'cn-shanghai', 'in-use', '{"sizeGb":500,"diskType":"cloud_essd","iops":50000,"throughput":4000,"encrypted":false,"attachedInstanceId":"i-bp1abc125xyz","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"analytics"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('c0000008-0003-4000-8000-000000000003', 'aliyun', 'disk', 'd-bp1ghi789', 'db-data-hz', 'cn-hangzhou', 'in-use', '{"sizeGb":200,"diskType":"cloud_essd","iops":20000,"throughput":1000,"encrypted":false,"attachedInstanceId":"i-bp1abc128xyz","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
('c0000008-0004-4000-8000-000000000004', 'aliyun', 'disk', 'd-bp1jkl012', 'backup-vol-hz', 'cn-hangzhou', 'available', '{"sizeGb":200,"diskType":"cloud_essd","iops":10000,"throughput":500,"encrypted":false,"attachedInstanceId":null,"attachmentStatus":null}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('c0000008-0005-4000-8000-000000000005', 'aliyun', 'disk', 'd-bp1mno345', 'staging-db-data', 'cn-hangzhou', 'in-use', '{"sizeGb":100,"diskType":"cloud_essd","iops":10000,"throughput":500,"encrypted":false,"attachedInstanceId":"i-bp1abc130xyz","attachmentStatus":"attached"}'::jsonb, '{"env":"staging","app":"db"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day', NOW()),
-- CDN
('c0000009-0001-4000-8000-000000000001', 'aliyun', 'cdn', 'cdn-abc123', 'web-cdn-hz', 'cn-hangzhou', 'deployed', '{"domainName":"cdn.example.cn","originDomain":"web-slb-hz.babyalb.cn","originType":"slb","enabled":true,"priceClass":"standard","sslCertificate":"https://cas.aliyuncs.com/cert/abc"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '40 day', NOW()),
('c0000009-0002-4000-8000-000000000002', 'aliyun', 'cdn', 'cdn-def456', 'assets-cdn-hz', 'cn-hangzhou', 'deployed', '{"domainName":"assets.example.cn","originDomain":"prod-assets-hz.oss-cn-hangzhou.aliyuncs.com","originType":"oss","enabled":true,"priceClass":"all","sslCertificate":"https://cas.aliyuncs.com/cert/def"}'::jsonb, '{"env":"prod","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '35 day', NOW()),
-- Cluster
('c0000010-0001-4000-8000-000000000001', 'aliyun', 'cluster', 'ack-prod-cluster', 'ack-prod-hz', 'cn-hangzhou', 'active', '{"clusterType":"ack","kubernetesVersion":"1.28","nodeCount":6,"status":"active","endpoint":"https://api.ack-prod-hz.c375859107e8c4e2b96e6c12e46c.cn-hangzhou.ack.aliyuncs.com:6443","vpcId":"vpc-bp1abc123"}'::jsonb, '{"env":"prod","app":"k8s"}'::jsonb, '{"vpcId":"vpc-bp1abc123"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('c0000010-0002-4000-8000-000000000002', 'aliyun', 'cluster', 'ack-dev-cluster', 'ack-dev-hz', 'cn-hangzhou', 'active', '{"clusterType":"ack","kubernetesVersion":"1.28","nodeCount":2,"status":"active","endpoint":"https://api.ack-dev-hz.c375859107e8c4e2b96e6c12e46c.cn-hangzhou.ack.aliyuncs.com:6443","vpcId":"vpc-bp1ghi789"}'::jsonb, '{"env":"dev","app":"k8s"}'::jsonb, '{"vpcId":"vpc-bp1ghi789"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW());

-- Azure 资源 (40)
INSERT INTO demo.cloud_resources (id, provider, resource_type, provider_resource_id, name, region, status, attributes, tags, topology, last_synced_at, created_at, updated_at) VALUES
-- VPCs (VNets)
('d0000001-0001-4000-8000-000000000001', 'azure', 'vpc', 'vnet-prod-east', 'prod-vnet-eastus', 'eastus', 'available', '{"cidrBlock":"10.1.0.0/16","subnetCount":4,"isDefault":false,"state":"available"}'::jsonb, '{"env":"prod"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000001-0002-4000-8000-000000000002', 'azure', 'vpc', 'vnet-prod-west', 'prod-vnet-westeurope', 'westeurope', 'available', '{"cidrBlock":"10.2.0.0/16","subnetCount":3,"isDefault":false,"state":"available"}'::jsonb, '{"env":"prod"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('d0000001-0003-4000-8000-000000000003', 'azure', 'vpc', 'vnet-dev-east', 'dev-vnet-eastus', 'eastus', 'available', '{"cidrBlock":"10.3.0.0/16","subnetCount":2,"isDefault":false,"state":"available"}'::jsonb, '{"env":"dev"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
-- Security Groups (NSGs)
('d0000002-0001-4000-8000-000000000001', 'azure', 'securitygroup', 'nsg-prod-east', 'web-nsg-east', 'eastus', 'active', '{"vpcId":"vnet-prod-east","ruleCount":6,"ingressRules":3,"egressRules":3,"description":"Web server NSG"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"vpcId":"vnet-prod-east"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000002-0002-4000-8000-000000000002', 'azure', 'securitygroup', 'nsg-prod-west', 'db-nsg-west', 'westeurope', 'active', '{"vpcId":"vnet-prod-west","ruleCount":4,"ingressRules":2,"egressRules":2,"description":"Database NSG"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vnet-prod-west"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('d0000002-0003-4000-8000-000000000003', 'azure', 'securitygroup', 'nsg-dev-east', 'dev-nsg-east', 'eastus', 'active', '{"vpcId":"vnet-dev-east","ruleCount":3,"ingressRules":1,"egressRules":2,"description":"Dev environment NSG"}'::jsonb, '{"env":"dev","app":"sandbox"}'::jsonb, '{"vpcId":"vnet-dev-east"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
-- Instances (VMs)
('d0000003-0001-4000-8000-000000000001', 'azure', 'instance', 'azure-vm-001', 'ml-training-gpu', 'eastus', 'running', '{"vmSize":"Standard_NC6","privateIp":"10.1.0.5"}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day', NOW()),
('d0000003-0002-4000-8000-000000000002', 'azure', 'instance', 'azure-vm-002', 'backup-server', 'westeurope', 'stopped', '{"vmSize":"Standard_D4s_v3","privateIp":"10.2.0.6"}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, '{"vpcId":"vnet-prod-west","securityGroupIds":["nsg-prod-west"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('d0000003-0003-4000-8000-000000000003', 'azure', 'instance', 'azure-vm-003', 'web-prod-eus-01', 'eastus', 'running', '{"vmSize":"Standard_B2s","privateIp":"10.1.0.10"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '8 day', NOW()),
('d0000003-0004-4000-8000-000000000004', 'azure', 'instance', 'azure-vm-004', 'api-backend-01', 'eastus', 'running', '{"vmSize":"Standard_D2s_v3","privateIp":"10.1.0.11"}'::jsonb, '{"env":"prod","app":"api"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '12 day', NOW()),
('d0000003-0005-4000-8000-000000000005', 'azure', 'instance', 'azure-vm-005', 'db-replica-01', 'westeurope', 'running', '{"vmSize":"Standard_E4s_v3","privateIp":"10.2.0.10"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vnet-prod-west","securityGroupIds":["nsg-prod-west"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '18 day', NOW()),
('d0000003-0006-4000-8000-000000000006', 'azure', 'instance', 'azure-vm-006', 'cache-we-01', 'westeurope', 'running', '{"vmSize":"Standard_D2s_v3","privateIp":"10.2.0.15"}'::jsonb, '{"env":"prod","app":"cache"}'::jsonb, '{"vpcId":"vnet-prod-west","securityGroupIds":["nsg-prod-west"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '22 day', NOW()),
('d0000003-0007-4000-8000-000000000007', 'azure', 'instance', 'azure-vm-007', 'worker-queue-01', 'eastus', 'running', '{"vmSize":"Standard_D2s_v3","privateIp":"10.1.0.20"}'::jsonb, '{"env":"prod","app":"queue"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '35 day', NOW()),
('d0000003-0008-4000-8000-000000000008', 'azure', 'instance', 'azure-vm-008', 'dev-sandbox-az', 'eastus', 'running', '{"vmSize":"Standard_B1s","privateIp":"10.1.0.30"}'::jsonb, '{"env":"dev","app":"sandbox"}'::jsonb, '{"vpcId":"vnet-dev-east","securityGroupIds":["nsg-dev-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '2 day', NOW()),
-- Load Balancers
('d0000004-0001-4000-8000-000000000001', 'azure', 'loadbalancer', 'lb-prod-east', 'web-lb-east', 'eastus', 'active', '{"type":"public","scheme":"internet-facing","dnsName":"web-lb-east.eastus.cloudapp.azure.com","vpcId":"vnet-prod-east","listenerCount":2,"targetCount":3,"targetInstanceIds":["azure-vm-001","azure-vm-003","azure-vm-004"]}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, '{"targetInstanceIds":["azure-vm-001","azure-vm-003","azure-vm-004"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000004-0002-4000-8000-000000000002', 'azure', 'loadbalancer', 'lb-prod-west', 'db-lb-west', 'westeurope', 'active', '{"type":"internal","scheme":"internal","dnsName":"db-lb-west.internal.westeurope.cloudapp.azure.com","vpcId":"vnet-prod-west","listenerCount":1,"targetCount":2,"targetInstanceIds":["azure-vm-005","azure-vm-006"]}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"targetInstanceIds":["azure-vm-005","azure-vm-006"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
-- Buckets (Storage Accounts)
('d0000005-0001-4000-8000-000000000001', 'azure', 'bucket', 'prodstorageeast', 'prodstorageeast', 'eastus', 'available', '{"storageClass":"Standard_LRS","objectCount":12345,"sizeBytes":10737418240,"versioning":true,"publicAccess":false,"lifecycleRules":2}'::jsonb, '{"env":"prod","app":"storage"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '50 day', NOW()),
('d0000005-0002-4000-8000-000000000002', 'azure', 'bucket', 'mlblobeastus', 'mlblobeastus', 'eastus', 'available', '{"storageClass":"Premium_LRS","objectCount":234,"sizeBytes":214748364800,"versioning":true,"publicAccess":false,"lifecycleRules":1}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
('d0000005-0003-4000-8000-000000000003', 'azure', 'bucket', 'backuparchivewest', 'backuparchivewest', 'westeurope', 'available', '{"storageClass":"Standard_GRS","objectCount":5678,"sizeBytes":53687091200,"versioning":false,"publicAccess":false,"lifecycleRules":3}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000005-0004-4000-8000-000000000004', 'azure', 'bucket', 'stagingblobseast', 'stagingblobseast', 'eastus', 'available', '{"storageClass":"Standard_LRS","objectCount":890,"sizeBytes":5368709120,"versioning":false,"publicAccess":false,"lifecycleRules":1}'::jsonb, '{"env":"staging","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
('d0000005-0005-4000-8000-000000000005', 'azure', 'bucket', 'logarchiveeast', 'logarchiveeast', 'eastus', 'available', '{"storageClass":"Standard_GRS","objectCount":67890,"sizeBytes":214748364800,"versioning":false,"publicAccess":false,"lifecycleRules":4}'::jsonb, '{"env":"prod","app":"logging"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '90 day', NOW()),
-- Databases
('d0000006-0001-4000-8000-000000000001', 'azure', 'database', 'sqldb-prod-east', 'sqldb-prod-east', 'eastus', 'available', '{"engine":"sqlserver","engineVersion":"15.0","instanceClass":"Standard_D4s_v3","storageGb":100,"multiAz":true,"endpoint":"sqldb-prod-east.database.windows.net","port":1433}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000006-0002-4000-8000-000000000002', 'azure', 'database', 'pgsql-prod-west', 'pgsql-prod-west', 'westeurope', 'available', '{"engine":"postgres","engineVersion":"15.4","instanceClass":"Standard_D2s_v3","storageGb":200,"multiAz":true,"endpoint":"pgsql-prod-west.postgres.database.azure.com","port":5432}'::jsonb, '{"env":"prod","app":"analytics"}'::jsonb, '{"vpcId":"vnet-prod-west","securityGroupIds":["nsg-prod-west"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '45 day', NOW()),
('d0000006-0003-4000-8000-000000000003', 'azure', 'database', 'mysql-staging-west', 'mysql-staging-west', 'westeurope', 'available', '{"engine":"mysql","engineVersion":"8.0","instanceClass":"Standard_D2s_v3","storageGb":50,"multiAz":false,"endpoint":"mysql-staging-west.mysql.database.azure.com","port":3306}'::jsonb, '{"env":"staging","app":"db"}'::jsonb, '{"vpcId":"vnet-prod-west","securityGroupIds":["nsg-prod-west"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('d0000006-0004-4000-8000-000000000004', 'azure', 'database', 'sqldb-dev-east', 'sqldb-dev-east', 'eastus', 'available', '{"engine":"sqlserver","engineVersion":"15.0","instanceClass":"Standard_B2s","storageGb":20,"multiAz":false,"endpoint":"sqldb-dev-east.database.windows.net","port":1433}'::jsonb, '{"env":"dev","app":"db"}'::jsonb, '{"vpcId":"vnet-dev-east","securityGroupIds":["nsg-dev-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '10 day', NOW()),
('d0000006-0005-4000-8000-000000000005', 'azure', 'database', 'pgsql-ml-east', 'pgsql-ml-east', 'eastus', 'available', '{"engine":"postgres","engineVersion":"15.4","instanceClass":"Standard_D4s_v3","storageGb":100,"multiAz":false,"endpoint":"pgsql-ml-east.postgres.database.azure.com","port":5432}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
-- Caches
('d0000007-0001-4000-8000-000000000001', 'azure', 'cache', 'redis-prod-east', 'redis-prod-east', 'eastus', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"Standard_C2","memoryMb":4096,"nodeType":"Standard_C2","shardCount":1,"endpoint":"redis-prod-east.redis.cache.windows.net","port":6380}'::jsonb, '{"env":"prod","app":"cache"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000007-0002-4000-8000-000000000002', 'azure', 'cache', 'redis-session-west', 'redis-session-west', 'westeurope', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"Standard_C1","memoryMb":2048,"nodeType":"Standard_C1","shardCount":1,"endpoint":"redis-session-west.redis.cache.windows.net","port":6380}'::jsonb, '{"env":"prod","app":"session"}'::jsonb, '{"vpcId":"vnet-prod-west","securityGroupIds":["nsg-prod-west"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '40 day', NOW()),
('d0000007-0003-4000-8000-000000000003', 'azure', 'cache', 'redis-ml-east', 'redis-ml-east', 'eastus', 'available', '{"engine":"redis","engineVersion":"7.0","instanceClass":"Standard_E4","memoryMb":8192,"nodeType":"Standard_E4","shardCount":2,"endpoint":"redis-ml-east.redis.cache.windows.net","port":6380}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, '{"vpcId":"vnet-prod-east","securityGroupIds":["nsg-prod-east"]}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW()),
-- Disks
('d0000008-0001-4000-8000-000000000001', 'azure', 'disk', 'disk-vm001-os', 'ml-gpu-os-disk', 'eastus', 'in-use', '{"sizeGb":128,"diskType":"Premium_LRS","iops":5000,"throughput":200,"encrypted":true,"attachedInstanceId":"azure-vm-001","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"ml"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '5 day', NOW()),
('d0000008-0002-4000-8000-000000000002', 'azure', 'disk', 'disk-vm003-os', 'web-eus-os-disk', 'eastus', 'in-use', '{"sizeGb":64,"diskType":"StandardSSD_LRS","iops":2000,"throughput":100,"encrypted":true,"attachedInstanceId":"azure-vm-003","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '8 day', NOW()),
('d0000008-0003-4000-8000-000000000003', 'azure', 'disk', 'disk-vm005-os', 'db-west-os-disk', 'westeurope', 'in-use', '{"sizeGb":128,"diskType":"Premium_LRS","iops":5000,"throughput":200,"encrypted":true,"attachedInstanceId":"azure-vm-005","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '18 day', NOW()),
('d0000008-0004-4000-8000-000000000004', 'azure', 'disk', 'disk-data-west', 'db-west-data-disk', 'westeurope', 'in-use', '{"sizeGb":500,"diskType":"Premium_LRS","iops":16000,"throughput":500,"encrypted":true,"attachedInstanceId":"azure-vm-005","attachmentStatus":"attached"}'::jsonb, '{"env":"prod","app":"db"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '18 day', NOW()),
('d0000008-0005-4000-8000-000000000005', 'azure', 'disk', 'disk-backup', 'backup-snapshot-disk', 'westeurope', 'available', '{"sizeGb":200,"diskType":"Standard_LRS","iops":500,"throughput":60,"encrypted":true,"attachedInstanceId":null,"attachmentStatus":null}'::jsonb, '{"env":"prod","app":"backup"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '20 day', NOW()),
-- CDN
('d0000009-0001-4000-8000-000000000001', 'azure', 'cdn', 'cdn-prod-east', 'web-cdn-east', 'eastus', 'deployed', '{"domainName":"cdn.example.com","originDomain":"web-lb-east.eastus.cloudapp.azure.com","originType":"loadbalancer","enabled":true,"priceClass":"Standard_Microsoft","sslCertificate":"managed"}'::jsonb, '{"env":"prod","app":"web"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '40 day', NOW()),
('d0000009-0002-4000-8000-000000000002', 'azure', 'cdn', 'cdn-assets-east', 'assets-cdn-east', 'eastus', 'deployed', '{"domainName":"assets.example.com","originDomain":"prodstorageeast.blob.core.windows.net","originType":"blob","enabled":true,"priceClass":"Standard_Microsoft","sslCertificate":"managed"}'::jsonb, '{"env":"prod","app":"assets"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '35 day', NOW()),
-- Clusters (AKS)
('d0000010-0001-4000-8000-000000000001', 'azure', 'cluster', 'aks-prod-east', 'aks-prod-east', 'eastus', 'active', '{"clusterType":"aks","kubernetesVersion":"1.28","nodeCount":6,"status":"active","endpoint":"https://aks-prod-east-abc123.hcp.eastus.azmk8s.io:443","vpcId":"vnet-prod-east"}'::jsonb, '{"env":"prod","app":"k8s"}'::jsonb, '{"vpcId":"vnet-prod-east"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '60 day', NOW()),
('d0000010-0002-4000-8000-000000000002', 'azure', 'cluster', 'aks-dev-east', 'aks-dev-east', 'eastus', 'active', '{"clusterType":"aks","kubernetesVersion":"1.28","nodeCount":2,"status":"active","endpoint":"https://aks-dev-east-def456.hcp.eastus.azmk8s.io:443","vpcId":"vnet-dev-east"}'::jsonb, '{"env":"dev","app":"k8s"}'::jsonb, '{"vpcId":"vnet-dev-east"}'::jsonb, NOW() - INTERVAL '5 min', NOW() - INTERVAL '15 day', NOW()),
-- AI Services
('d0000011-0001-4000-8000-000000000001', 'azure', 'aiservice', 'cogsvc-prod-east', 'cognitive-services-east', 'eastus', 'available', '{"serviceKind":"cognitiveServices","skuName":"S0","endpoint":"https://cogsvc-prod-east.cognitiveservices.azure.com","kind":"OpenAI","provisioningState":"Succeeded"}'::jsonb, '{"env":"prod","app":"ai"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '30 day', NOW()),
('d0000011-0002-4000-8000-000000000002', 'azure', 'aiservice', 'aisearch-east', 'ai-search-east', 'eastus', 'available', '{"serviceKind":"search","skuName":"Standard","endpoint":"https://aisearch-east.search.windows.net","kind":"SearchService","provisioningState":"Succeeded"}'::jsonb, '{"env":"prod","app":"search"}'::jsonb, NULL, NOW() - INTERVAL '5 min', NOW() - INTERVAL '25 day', NOW());

-- ========== 自愈 demo 数据 ==========
INSERT INTO demo.remediation_runs (id, alert_id, instance_id, root_cause, action_plan, action_executed, status, env, triggered_at, approved_at, executed_at, verified_at, verification_result) VALUES
('d4e5f6a7-0001-4000-8000-000000000001', 'c3d4e5f6-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001',
 'web-prod-01 CPU 持续高于 80%，疑似内存泄漏导致进程 CPU 占用异常',
 '{"rootCause":"内存泄漏","recommendedAction":"reboot_instance","reasoning":"重启释放累积内存","riskLevel":"moderate","expectedEffect":"CPU 降至 40-50%","verificationMetric":"cpu_utilization","verificationTimeout":60}'::jsonb,
 'reboot_instance', 'success', 'prod',
 NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour 58 min',
 '验证成功：cpu_utilization 已降至 45.2%（阈值 80%），修复有效'),
('d4e5f6a7-0001-4000-8000-000000000002', 'c3d4e5f6-0001-4000-8000-000000000002', 'a1b2c3d4-0003-4000-8000-000000000002',
 'backup-server 内存使用率 92%，超过 90% 阈值',
 '{"rootCause":"缓存未释放","recommendedAction":"reboot_instance","reasoning":"重启清理缓存","riskLevel":"moderate","expectedEffect":"内存降至 50%","verificationMetric":"memory_utilization","verificationTimeout":60}'::jsonb,
 'reboot_instance', 'pending', 'prod',
 NOW() - INTERVAL '8 min', NULL, NULL, NULL, NULL),
('d4e5f6a7-0001-4000-8000-000000000003', 'c3d4e5f6-0001-4000-8000-000000000005', 'a1b2c3d4-0002-4000-8000-000000000007',
 'log-collector 磁盘使用率 87%，超过 85% 阈值',
 '{"rootCause":"日志文件未轮转","recommendedAction":"reboot_instance","reasoning":"重启触发日志清理","riskLevel":"low","expectedEffect":"磁盘降至 60%","verificationMetric":"disk_utilization","verificationTimeout":30}'::jsonb,
 'reboot_instance', 'executing', 'prod',
 NOW() - INTERVAL '30 min', NOW() - INTERVAL '29 min', NOW() - INTERVAL '28 min', NULL, NULL);

-- ========== 知识库 demo 数据 ==========
INSERT INTO demo.knowledge_base (id, symptom, metric_name, instance_provider, instance_env, root_cause, action_taken, outcome, resolution_time_minutes, helpful_count, created_at) VALUES
('e5f6a7b8-0001-4000-8000-000000000001', 'api-worker-02 (aws) CPU 持续 >85%，疑似内存泄漏', 'cpu_utilization', 'aws', 'prod', '应用层内存泄漏，长时间运行导致 GC 压力增大', 'reboot_instance', 'success', 15, 3, NOW() - INTERVAL '15 day'),
('e5f6a7b8-0001-4000-8000-000000000002', 'db-staging-01 (aws) 内存使用率 91%，超过阈值', 'memory_utilization', 'aws', 'staging', '数据库连接池配置过大，导致内存占用高', 'reboot_instance', 'failed', 0, 1, NOW() - INTERVAL '10 day'),
('e5f6a7b8-0001-4000-8000-000000000003', 'nginx-gateway (aliyun) 磁盘使用率持续上升', 'disk_utilization', 'aliyun', 'prod', '日志文件未轮转，占用大量磁盘空间', 'reboot_instance', 'success', 5, 2, NOW() - INTERVAL '5 day'),
('e5f6a7b8-0001-4000-8000-000000000004', 'redis-cache (aliyun) 内存使用率 88%', 'memory_utilization', 'aliyun', 'prod', 'Redis 缓存未设置淘汰策略，内存持续增长', 'reboot_instance', 'success', 8, 0, NOW() - INTERVAL '3 day'),
('e5f6a7b8-0001-4000-8000-000000000005', 'ml-training-gpu (azure) CPU 95%，GPU 任务堆积', 'cpu_utilization', 'azure', 'prod', '训练任务并发数过高，导致 GPU 和 CPU 双重过载', 'stop_instance', 'success', 2, 1, NOW() - INTERVAL '1 day'),
('e5f6a7b8-0001-4000-8000-000000000006', 'cache-we-01 (azure) 内存使用率 91.5%', 'memory_utilization', 'azure', 'prod', 'Redis 缓存未设置淘汰策略，热数据堆积', 'reboot_instance', 'success', 10, 2, NOW() - INTERVAL '2 day'),
('e5f6a7b8-0001-4000-8000-000000000007', 'web-prod-01 (aws) 网络延迟 >200ms', 'network_latency', 'aws', 'prod', 'ENI 限流导致网络延迟升高', 'reboot_instance', 'success', 12, 1, NOW() - INTERVAL '7 day');

COMMIT;

-- 验证
SELECT 'demo.cloud_accounts' as tbl, count(*) FROM demo.cloud_accounts
UNION ALL SELECT 'demo.instances', count(*) FROM demo.instances
UNION ALL SELECT 'demo.cloud_resources', count(*) FROM demo.cloud_resources
UNION ALL SELECT 'demo.cloud_resources (has topology)', count(*) FROM demo.cloud_resources WHERE topology IS NOT NULL
UNION ALL SELECT 'demo.alert_rules', count(*) FROM demo.alert_rules
UNION ALL SELECT 'demo.alerts (firing)', count(*) FROM demo.alerts WHERE status = 'firing'
UNION ALL SELECT 'demo.cost_records', count(*) FROM demo.cost_records
UNION ALL SELECT 'demo.metrics', count(*) FROM demo.metrics
UNION ALL SELECT 'demo.token_usage', count(*) FROM demo.token_usage
UNION ALL SELECT 'demo.remediation_runs', count(*) FROM demo.remediation_runs
UNION ALL SELECT 'demo.knowledge_base', count(*) FROM demo.knowledge_base;
