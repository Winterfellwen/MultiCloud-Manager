-- 通用资源表（支持多资源类型）
CREATE TABLE IF NOT EXISTS cloud_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  provider_resource_id VARCHAR(256) NOT NULL,
  name VARCHAR(256),
  region VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  attributes JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  UNIQUE(provider, resource_type, provider_resource_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cloud_resources_provider ON cloud_resources(provider);
CREATE INDEX IF NOT EXISTS idx_cloud_resources_type ON cloud_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_cloud_resources_region ON cloud_resources(region);
CREATE INDEX IF NOT EXISTS idx_cloud_resources_status ON cloud_resources(status);
CREATE INDEX IF NOT EXISTS idx_cloud_resources_account ON cloud_resources(cloud_account_id);

-- 迁移现有 instances 数据到 cloud_resources（instance 类型）
INSERT INTO cloud_resources (provider, resource_type, provider_resource_id, name, region, status, attributes, tags, last_synced_at, created_at, cloud_account_id)
SELECT
  provider,
  'instance'::varchar,
  provider_instance_id,
  name,
  region,
  status,
  jsonb_build_object(
    'cpu', cpu,
    'memoryMb', memory_mb,
    'diskGb', disk_gb,
    'publicIp', public_ip,
    'privateIp', private_ip,
    'monthlyCost', monthly_cost
  ),
  COALESCE(tags, '{}'::jsonb),
  last_synced_at,
  created_at,
  cloud_account_id
FROM instances
ON CONFLICT (provider, resource_type, provider_resource_id) DO NOTHING;
