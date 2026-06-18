-- CloudOps Cloud Service Initial Migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 云账号配置表
CREATE TABLE IF NOT EXISTS cloud_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    config JSONB NOT NULL,
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cloud_accounts_provider ON cloud_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_cloud_accounts_status ON cloud_accounts(status);

-- 资源缓存表（实例）
CREATE TABLE IF NOT EXISTS instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,
    provider_instance_id VARCHAR(128) NOT NULL,
    name VARCHAR(256),
    region VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    cpu INT,
    memory_mb INT,
    disk_gb INT,
    public_ip INET,
    private_ip INET,
    monthly_cost DECIMAL(10, 2),
    tags JSONB,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cloud_account_id UUID REFERENCES cloud_accounts(id),
    UNIQUE(provider, provider_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_instances_provider ON instances(provider);
CREATE INDEX IF NOT EXISTS idx_instances_region ON instances(region);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_account ON instances(cloud_account_id);

-- 监控指标表（Phase 3 监控服务使用，此处预先创建）
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
    metric_name VARCHAR(64) NOT NULL,
    value DECIMAL(12, 4) NOT NULL,
    unit VARCHAR(16),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_instance_time ON metrics(instance_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);

-- 告警规则表（Phase 3 使用）
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    condition VARCHAR(32) NOT NULL,
    duration VARCHAR(16) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    actions JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 告警事件表（Phase 3 使用）
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES alert_rules(id),
    instance_id UUID REFERENCES instances(id),
    severity VARCHAR(16) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(16) DEFAULT 'firing',
    fired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_instance ON alerts(instance_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_fired ON alerts(fired_at);

-- 费用记录表
CREATE TABLE IF NOT EXISTS cost_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,
    region VARCHAR(64) NOT NULL,
    service VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(8) DEFAULT 'USD',
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_provider_region ON cost_records(provider, region);
CREATE INDEX IF NOT EXISTS idx_cost_period ON cost_records(period_start, period_end);
