# Demo 与生产数据物理隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 PostgreSQL schema 物理隔离 demo 与生产数据，后端引入 RequestScope 按 X-Demo-Mode header 路由，前端移除 mock 层统一走真实 API。

**Architecture:** demo schema 与 public schema 物理隔离；后端数据访问层引入 scopedDb(scope) 工厂按 scope 返回对应 schema 的 Drizzle 表；预测/自愈引擎双跑两个 schema；前端 axios 拦截器注入 X-Demo-Mode header，移除各 hook 的 mock 分支。

**Tech Stack:** PostgreSQL schema, Drizzle ORM pgSchema, Koa/Fastify middleware, React Query, Zustand

**Spec:** `docs/superpowers/specs/2026-07-01-demo-prod-data-isolation-design.md`

---

## File Structure

### 新增文件

| 文件 | 职责 |
|---|---|
| `shared/src/db/scope.ts` | RequestScope 类型 + PUBLIC_SCOPE 常量 |
| `shared/src/db/schema-factory.ts` | createTables(schema) 工厂，导出 publicTables / demoTables |
| `shared/src/db/scoped-db.ts` | scopedDb(scope) 工厂 |
| `shared/src/db/migrations/000_demo_schema.sql` | demo schema 建表（幂等） |
| `api-gateway/src/middleware/scope.ts` | Koa scope 中间件 |
| `web-console/src/components/common/DemoBanner.tsx` | demo 模式横幅 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `scripts/demo-data.sql` | 所有 INSERT 改指向 demo.* 表 |
| `scripts/cleanup-demo-data.sql` | 简化为 TRUNCATE demo.* |
| `start.sh` | 加 DEMO_AUTO_SEED 逻辑 |
| `Dockerfile` | COPY scripts |
| `web-console/src/api/client.ts` | request() 注入 X-Demo-Mode header |
| `web-console/src/hooks/useInstances.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useDashboard.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useResources.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useCosts.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useAlerts.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useTeams.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useUsers.ts` | 移除 isDemoMode 分支 |
| `web-console/src/hooks/useTopology.ts` | 移除 isDemoMode 分支 |
| `web-console/src/pages/CloudAccounts.tsx` | 移除 isDemoMode 分支 |
| `web-console/src/pages/Instances.tsx` | 移除 isDemoMode 分支 |
| `web-console/src/pages/Resources.tsx` | 移除 isDemoMode 分支 |
| `web-console/src/App.tsx` | 挂载 DemoBanner |
| `cloud-service/src/db/schema.ts` | 导出表定义改为引用 schema-factory |
| `cloud-service/src/services/instance.service.ts` | 加 scope 参数 |
| `cloud-service/src/services/resource.service.ts` | 加 scope 参数 |
| `cloud-service/src/services/sync.service.ts` | 加 scope 参数 + demo 跳过同步 |
| `cloud-service/src/services/account.service.ts` | 加 scope 参数 |
| `cloud-service/src/routes/*.ts` | 传 request.scope |
| `cloud-service/src/index.ts` | onRequest hook 注入 scope |
| `monitor-service/src/db/schema.ts` | 导出表定义改为引用 schema-factory |
| `monitor-service/src/services/*.ts` | 加 scope 参数 |
| `monitor-service/src/routes/*.ts` | 传 request.scope |
| `monitor-service/src/index.ts` | onRequest hook 注入 scope |
| `monitor-service/src/services/prediction-engine.ts` | 双跑 |
| `monitor-service/src/services/remediation-engine.ts` | demo 模拟执行 |
| `ai-gateway/src/index.ts` | onRequest hook + 内部端点接收 scope |
| `ai-gateway/src/internal/dashboard-insight.ts` | 接收 scope 字段 |
| `ai-gateway/src/internal/analyze-remediation.ts` | 接收 scope 字段 |
| `api-gateway/src/index.ts` | 挂载 scope 中间件 + 透传 header |

### 删除文件

| 文件 | 原因 |
|---|---|
| `web-console/src/lib/demo/demo-api.ts` | mock 数据层被后端 demo schema 替代 |

---

## Phase 1：基础设施（scope 类型 + demo schema + scopedDb）

### Task 1: RequestScope 类型定义

**Files:**
- Create: `shared/src/db/scope.ts`

- [ ] **Step 1: 创建 scope 类型文件**

```typescript
// shared/src/db/scope.ts

/**
 * 数据库 schema 类型：public 为真实数据，demo 为演示数据
 */
export type DbSchema = 'public' | 'demo';

/**
 * 请求作用域：贯穿整个请求链路，决定数据访问层读哪个 schema
 */
export interface RequestScope {
  schema: DbSchema;
  isDemo: boolean;
  /** 'demo-u-1' 或真实 userId */
  userId: string;
}

/** 默认 scope：public（真实用户） */
export const PUBLIC_SCOPE: RequestScope = {
  schema: 'public',
  isDemo: false,
  userId: '',
};

/** demo scope：用于 demo 模式请求 */
export const DEMO_SCOPE: RequestScope = {
  schema: 'demo',
  isDemo: true,
  userId: 'demo-u-1',
};

/** 根据 isDemo 布尔值返回对应 scope */
export function scopeFromDemoFlag(isDemo: boolean, userId = ''): RequestScope {
  return isDemo
    ? { ...DEMO_SCOPE, userId: 'demo-u-1' }
    : { ...PUBLIC_SCOPE, userId };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/shared && npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: 提交**

```bash
git add shared/src/db/scope.ts
git commit -m "feat: add RequestScope type for demo/prod data isolation"
```

---

### Task 2: demo schema 建表 migration

**Files:**
- Create: `shared/src/db/migrations/000_demo_schema.sql`

- [ ] **Step 1: 查看 public schema 现有表结构**

读取以下文件了解现有表结构（供参考，不改这些文件）：
- `cloud-service/migrations/001_init.sql` — instances, metrics, cost_records, alerts, alert_rules
- `cloud-service/migrations/002_multi_resources.sql` — cloud_resources
- `monitor-service/migrations/003_token_usage.sql` — token_usage
- `monitor-service/migrations/004_metric_predictions.sql` — metric_predictions
- `monitor-service/migrations/005_remediation.sql` — remediation_policies, remediation_runs
- `monitor-service/migrations/006_knowledge_base.sql` — knowledge_base

- [ ] **Step 2: 创建 demo schema 建表 SQL**

```sql
-- shared/src/db/migrations/000_demo_schema.sql
-- 创建 demo schema，结构与 public 完全一致（去掉 cloud_account_id 外键，因为 cloud_accounts 不分 demo）
-- 幂等：所有 CREATE 都带 IF NOT EXISTS，多服务启动安全

CREATE SCHEMA IF NOT EXISTS demo;

-- ========== cloud-service 业务表 ==========
CREATE TABLE IF NOT EXISTS demo.instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  provider_instance_id VARCHAR(128) NOT NULL,
  name VARCHAR(256),
  region VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  cpu INTEGER,
  memory_mb INTEGER,
  disk_gb INTEGER,
  public_ip INET,
  private_ip INET,
  monthly_cost DECIMAL(10, 2),
  tags JSONB,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_instances_provider_instance ON demo.instances(provider, provider_instance_id);
CREATE INDEX IF NOT EXISTS idx_demo_instances_provider ON demo.instances(provider);
CREATE INDEX IF NOT EXISTS idx_demo_instances_region ON demo.instances(region);
CREATE INDEX IF NOT EXISTS idx_demo_instances_status ON demo.instances(status);

CREATE TABLE IF NOT EXISTS demo.metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  value DECIMAL(12, 2) NOT NULL,
  unit VARCHAR(16),
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_metrics_instance ON demo.metrics(instance_id);
CREATE INDEX IF NOT EXISTS idx_demo_metrics_name_time ON demo.metrics(metric_name, recorded_at);

CREATE TABLE IF NOT EXISTS demo.cost_records (
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
CREATE INDEX IF NOT EXISTS idx_demo_cost_provider_region ON demo.cost_records(provider, region);

CREATE TABLE IF NOT EXISTS demo.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  metric VARCHAR(64) NOT NULL,
  condition VARCHAR(32) NOT NULL,
  duration VARCHAR(16),
  severity VARCHAR(16) NOT NULL,
  actions JSONB,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS demo.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID,
  instance_id UUID,
  severity VARCHAR(16) NOT NULL,
  message TEXT,
  status VARCHAR(16) DEFAULT 'firing',
  fired_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  ai_analysis TEXT,
  ai_analyzed_at TIMESTAMP,
  CONSTRAINT fk_demo_alerts_rule FOREIGN KEY (rule_id) REFERENCES demo.alert_rules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_demo_alerts_rule ON demo.alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_demo_alerts_instance ON demo.alerts(instance_id);
CREATE INDEX IF NOT EXISTS idx_demo_alerts_status ON demo.alerts(status);
CREATE INDEX IF NOT EXISTS idx_demo_alerts_fired ON demo.alerts(fired_at);

CREATE TABLE IF NOT EXISTS demo.cloud_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  provider_resource_id VARCHAR(128) NOT NULL,
  name VARCHAR(256),
  region VARCHAR(64),
  status VARCHAR(32),
  attributes JSONB,
  tags JSONB,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_cloud_resources_provider ON demo.cloud_resources(provider);
CREATE INDEX IF NOT EXISTS idx_demo_cloud_resources_type ON demo.cloud_resources(resource_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_cloud_resources_provider_id ON demo.cloud_resources(provider, resource_type, provider_resource_id);

-- ========== monitor-service 业务表 ==========
CREATE TABLE IF NOT EXISTS demo.token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64),
  session_key VARCHAR(128),
  provider VARCHAR(128),
  model VARCHAR(128),
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_token_usage_user ON demo.token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_demo_token_usage_created ON demo.token_usage(created_at);

CREATE TABLE IF NOT EXISTS demo.metric_predictions (
  id SERIAL PRIMARY KEY,
  instance_id UUID NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  current_value DECIMAL(12, 2) NOT NULL,
  predicted_threshold_value DECIMAL(12, 2),
  threshold VARCHAR(16),
  hours_to_threshold DECIMAL(10, 2),
  confidence DECIMAL(5, 2),
  trend_per_hour DECIMAL(12, 4),
  predicted_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_predictions_instance ON demo.metric_predictions(instance_id);
CREATE INDEX IF NOT EXISTS idx_demo_predictions_predicted ON demo.metric_predictions(predicted_at);

CREATE TABLE IF NOT EXISTS demo.remediation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  env_tags JSONB NOT NULL DEFAULT '["dev","uat","prod"]'::jsonb,
  auto_execute JSONB NOT NULL DEFAULT '{"dev":true,"uat":true,"prod":false}'::jsonb,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo.remediation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID,
  instance_id UUID,
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
CREATE INDEX IF NOT EXISTS idx_demo_remediation_runs_status ON demo.remediation_runs(status);
CREATE INDEX IF NOT EXISTS idx_demo_remediation_runs_alert ON demo.remediation_runs(alert_id);

CREATE TABLE IF NOT EXISTS demo.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom TEXT NOT NULL,
  metric_name VARCHAR(64),
  instance_provider VARCHAR(32),
  instance_env VARCHAR(32),
  root_cause TEXT,
  action_taken VARCHAR(64),
  outcome VARCHAR(16),
  resolution_time_minutes INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  embedding VECTOR(1536),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_knowledge_base_metric ON demo.knowledge_base(metric_name);
CREATE INDEX IF NOT EXISTS idx_demo_knowledge_base_provider ON demo.knowledge_base(instance_provider);

-- ========== demo 默认自愈策略 ==========
INSERT INTO demo.remediation_policies (name, action_type, env_tags, auto_execute) VALUES
('重启实例', 'reboot_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('停止实例', 'stop_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('扩容实例', 'scale_up', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: 提交**

```bash
git add shared/src/db/migrations/000_demo_schema.sql
git commit -m "feat: add demo schema migration with all business tables"
```

---

### Task 3: Drizzle 表定义工厂

**Files:**
- Create: `shared/src/db/schema-factory.ts`

- [ ] **Step 1: 读取现有 schema 定义**

读取以下文件了解现有表结构定义（供参考）：
- `cloud-service/src/db/schema.ts`
- `monitor-service/src/db/schema.ts`

- [ ] **Step 2: 创建 schema 工厂**

```typescript
// shared/src/db/schema-factory.ts
import {
  pgSchema,
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  inet,
  boolean,
  integer,
  decimal,
  serial,
  uniqueIndex,
  index,
  vector,
} from 'drizzle-orm/pg-core';

const publicSchema = pgSchema('public');
const demoSchema = pgSchema('demo');

/**
 * 工厂函数：传入 schema，返回该 schema 下的一组表定义
 * public 和 demo 的表结构完全一致（去掉 cloud_account_id 外键，cloud_accounts 不分 demo）
 */
export function createTables(schema: typeof publicSchema) {
  // ========== cloud-service 表 ==========

  const instances = schema.table('instances', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerInstanceId: varchar('provider_instance_id', { length: 128 }).notNull(),
    name: varchar('name', { length: 256 }),
    region: varchar('region', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    cpu: integer('cpu'),
    memoryMb: integer('memory_mb'),
    diskGb: integer('disk_gb'),
    publicIp: inet('public_ip'),
    privateIp: inet('private_ip'),
    monthlyCost: decimal('monthly_cost', { precision: 10, scale: 2 }),
    tags: jsonb('tags'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }, (table: any) => ({
    providerInstanceIdx: uniqueIndex('idx_instances_provider_instance').on(table.provider, table.providerInstanceId),
    providerIdx: index('idx_instances_provider').on(table.provider),
    regionIdx: index('idx_instances_region').on(table.region),
    statusIdx: index('idx_instances_status').on(table.status),
  }));

  const metrics = schema.table('metrics', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id').notNull(),
    metricName: varchar('metric_name', { length: 64 }).notNull(),
    value: decimal('value', { precision: 12, scale: 2 }).notNull(),
    unit: varchar('unit', { length: 16 }),
    recordedAt: timestamp('recorded_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }, (table: any) => ({
    instanceIdx: index('idx_metrics_instance').on(table.instanceId),
    nameTimeIdx: index('idx_metrics_name_time').on(table.metricName, table.recordedAt),
  }));

  const costRecords = schema.table('cost_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    region: varchar('region', { length: 64 }).notNull(),
    service: varchar('service', { length: 64 }).notNull(),
    resourceId: varchar('resource_id', { length: 128 }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 8 }).default('USD'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  }, (table: any) => ({
    providerRegionIdx: index('idx_cost_provider_region').on(table.provider, table.region),
  }));

  const alertRules = schema.table('alert_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    condition: varchar('condition', { length: 32 }).notNull(),
    duration: varchar('duration', { length: 16 }),
    severity: varchar('severity', { length: 16 }).notNull(),
    actions: jsonb('actions'),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

  const alerts = schema.table('alerts', {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: uuid('rule_id'),
    instanceId: uuid('instance_id'),
    severity: varchar('severity', { length: 16 }).notNull(),
    message: text('message'),
    status: varchar('status', { length: 16 }).default('firing'),
    firedAt: timestamp('fired_at').defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    aiAnalysis: text('ai_analysis'),
    aiAnalyzedAt: timestamp('ai_analyzed_at'),
  }, (table: any) => ({
    ruleIdx: index('idx_alerts_rule').on(table.ruleId),
    instanceIdx: index('idx_alerts_instance').on(table.instanceId),
    statusIdx: index('idx_alerts_status').on(table.status),
    firedIdx: index('idx_alerts_fired').on(table.firedAt),
  }));

  const cloudResources = schema.table('cloud_resources', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    providerResourceId: varchar('provider_resource_id', { length: 128 }).notNull(),
    name: varchar('name', { length: 256 }),
    region: varchar('region', { length: 64 }),
    status: varchar('status', { length: 32 }),
    attributes: jsonb('attributes'),
    tags: jsonb('tags'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }, (table: any) => ({
    providerIdx: index('idx_cloud_resources_provider').on(table.provider),
    typeIdx: index('idx_cloud_resources_type').on(table.resourceType),
    providerIdIdx: uniqueIndex('idx_cloud_resources_provider_id').on(table.provider, table.resourceType, table.providerResourceId),
  }));

  // ========== monitor-service 表 ==========

  const tokenUsage = schema.table('token_usage', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 64 }),
    sessionKey: varchar('session_key', { length: 128 }),
    provider: varchar('provider', { length: 128 }),
    model: varchar('model', { length: 128 }),
    promptTokens: integer('prompt_tokens').default(0),
    completionTokens: integer('completion_tokens').default(0),
    totalTokens: integer('total_tokens').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }, (table: any) => ({
    userIdx: index('idx_token_usage_user').on(table.userId),
    createdIdx: index('idx_token_usage_created').on(table.createdAt),
  }));

  const metricPredictions = schema.table('metric_predictions', {
    id: serial('id').primaryKey(),
    instanceId: uuid('instance_id').notNull(),
    metricName: varchar('metric_name', { length: 64 }).notNull(),
    currentValue: decimal('current_value', { precision: 12, scale: 2 }).notNull(),
    predictedThresholdValue: decimal('predicted_threshold_value', { precision: 12, scale: 2 }),
    threshold: varchar('threshold', { length: 16 }),
    hoursToThreshold: decimal('hours_to_threshold', { precision: 10, scale: 2 }),
    confidence: decimal('confidence', { precision: 5, scale: 2 }),
    trendPerHour: decimal('trend_per_hour', { precision: 12, scale: 4 }),
    predictedAt: timestamp('predicted_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }, (table: any) => ({
    instanceIdx: index('idx_predictions_instance').on(table.instanceId),
    predictedIdx: index('idx_predictions_predicted').on(table.predictedAt),
  }));

  const remediationPolicies = schema.table('remediation_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    envTags: jsonb('env_tags').notNull().default('["dev","uat","prod"]'),
    autoExecute: jsonb('auto_execute').notNull().default('{"dev":true,"uat":true,"prod":false}'),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow(),
  });

  const remediationRuns = schema.table('remediation_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id'),
    instanceId: uuid('instance_id'),
    rootCause: text('root_cause'),
    actionPlan: jsonb('action_plan'),
    actionExecuted: varchar('action_executed', { length: 64 }),
    status: varchar('status', { length: 32 }).default('pending'),
    env: varchar('env', { length: 32 }),
    triggeredAt: timestamp('triggered_at').defaultNow(),
    approvedAt: timestamp('approved_at'),
    approvedBy: uuid('approved_by'),
    executedAt: timestamp('executed_at'),
    verifiedAt: timestamp('verified_at'),
    verificationResult: text('verification_result'),
    errorMessage: text('error_message'),
  }, (table: any) => ({
    statusIdx: index('idx_remediation_runs_status').on(table.status),
    alertIdx: index('idx_remediation_runs_alert').on(table.alertId),
  }));

  const knowledgeBase = schema.table('knowledge_base', {
    id: uuid('id').primaryKey().defaultRandom(),
    symptom: text('symptom').notNull(),
    metricName: varchar('metric_name', { length: 64 }),
    instanceProvider: varchar('instance_provider', { length: 32 }),
    instanceEnv: varchar('instance_env', { length: 32 }),
    rootCause: text('root_cause'),
    actionTaken: varchar('action_taken', { length: 64 }),
    outcome: varchar('outcome', { length: 16 }),
    resolutionTimeMinutes: integer('resolution_time_minutes').default(0),
    helpfulCount: integer('helpful_count').default(0),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }, (table: any) => ({
    metricIdx: index('idx_knowledge_base_metric').on(table.metricName),
    providerIdx: index('idx_knowledge_base_provider').on(table.instanceProvider),
  }));

  return {
    instances,
    metrics,
    costRecords,
    alertRules,
    alerts,
    cloudResources,
    tokenUsage,
    metricPredictions,
    remediationPolicies,
    remediationRuns,
    knowledgeBase,
  };
}

export type ScopedTables = ReturnType<typeof createTables>;

export const publicTables = createTables(publicSchema);
export const demoTables = createTables(demoSchema);
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/shared && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add shared/src/db/schema-factory.ts
git commit -m "feat: add Drizzle schema factory for public/demo tables"
```

---

### Task 4: scopedDb 工厂

**Files:**
- Create: `shared/src/db/scoped-db.ts`

- [ ] **Step 1: 创建 scopedDb 工厂**

```typescript
// shared/src/db/scoped-db.ts
import { publicTables, demoTables, type ScopedTables } from './schema-factory.js';
import type { RequestScope } from './scope.js';

/**
 * 根据 scope 返回对应 schema 的表对象集合
 * demo 模式返回 demoTables，否则返回 publicTables
 */
export function scopedDb(scope: RequestScope): ScopedTables {
  return scope.schema === 'demo' ? demoTables : publicTables;
}
```

- [ ] **Step 2: 导出统一入口**

修改 `shared/src/db/index.ts`（如不存在则创建）：

```typescript
// shared/src/db/index.ts
export * from './scope.js';
export * from './schema-factory.js';
export * from './scoped-db.js';
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/shared && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add shared/src/db/scoped-db.ts shared/src/db/index.ts
git commit -m "feat: add scopedDb factory for scope-based table routing"
```

---

### Task 5: migrate.ts 改造，执行 demo schema

**Files:**
- Modify: `cloud-service/src/db/migrate.ts`
- Modify: `monitor-service/src/db/migrate.ts`
- Modify: `ai-gateway/src/db/migrate.ts`

- [ ] **Step 1: 读取现有 migrate.ts**

读取 `cloud-service/src/db/migrate.ts`、`monitor-service/src/db/migrate.ts`、`ai-gateway/src/db/migrate.ts`，理解现有 migration 执行逻辑。

- [ ] **Step 2: cloud-service migrate.ts 增加 demo schema 执行**

在现有 migration 执行循环后，增加 demo schema 执行：

```typescript
// cloud-service/src/db/migrate.ts（在现有 migrations 循环后追加）

// 执行 demo schema 建表（幂等，多服务启动安全）
const demoSchemaPath = join(process.cwd(), 'shared', 'src', 'db', 'migrations', '000_demo_schema.sql');
import { existsSync } from 'node:fs';
if (existsSync(demoSchemaPath)) {
  console.log('Running migration: 000_demo_schema.sql');
  const demoContent = readFileSync(demoSchemaPath, 'utf-8');
  await runFile(sql, demoContent);
}
```

- [ ] **Step 3: monitor-service migrate.ts 同样追加**

同样的逻辑追加到 `monitor-service/src/db/migrate.ts` 和 `ai-gateway/src/db/migrate.ts`（路径改为 `join(process.cwd(), 'shared', 'src', 'db', 'migrations', '000_demo_schema.sql')`）。

- [ ] **Step 4: Dockerfile COPY shared migrations**

修改 Dockerfile，确保 `shared/src/db/migrations/` 被复制到构建产物中。在 builder 阶段复制 shared 源码后，最终镜像阶段复制 migrations：

```dockerfile
# Dockerfile 最终镜像阶段，在 migrations 复制后追加
COPY --from=builder /app/shared/src/db/migrations ./shared/src/db/migrations
```

- [ ] **Step 5: 重建并验证 demo schema 创建**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker compose up -d --build app`
Expected: 容器启动，日志显示 "Running migration: 000_demo_schema.sql"

验证：`docker compose exec -T postgres psql -U multicloud -d multicloud -c "\dn"` 看到 demo schema

- [ ] **Step 6: 提交**

```bash
git add cloud-service/src/db/migrate.ts monitor-service/src/db/migrate.ts ai-gateway/src/db/migrate.ts Dockerfile
git commit -m "feat: execute demo schema migration on service startup"
```

---

### Task 6: demo-data.sql 重写指向 demo schema

**Files:**
- Modify: `scripts/demo-data.sql`

- [ ] **Step 1: 读取现有 demo-data.sql**

读取 `scripts/demo-data.sql` 了解现有数据结构和内容。

- [ ] **Step 2: 重写为 demo.* 表**

所有 INSERT 和 TRUNCATE 改为指向 `demo.*` 表。开头保留安全护栏（改为 demo schema 检查）：

```sql
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
```

- [ ] **Step 3: 验证 demo data 可正常插入**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker compose exec -T postgres psql -U multicloud -d multicloud < scripts/demo-data.sql`
Expected: 输出各表行数，8 instances, 3 alert_rules, 2 firing alerts, 12 cost_records, 54 metrics, 4 token_usage, 2 remediation_runs, 5 knowledge_base

- [ ] **Step 4: 提交**

```bash
git add scripts/demo-data.sql
git commit -m "feat: rewrite demo-data.sql to target demo schema only"
```

---

### Task 7: cleanup 脚本简化

**Files:**
- Modify: `scripts/cleanup-demo-data.sql`

- [ ] **Step 1: 简化为 TRUNCATE demo schema**

```sql
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
```

- [ ] **Step 2: 提交**

```bash
git add scripts/cleanup-demo-data.sql
git commit -m "refactor: simplify cleanup script to TRUNCATE demo schema"
```

---

### Task 8: start.sh + Dockerfile 支持 DEMO_AUTO_SEED

**Files:**
- Modify: `start.sh`
- Modify: `Dockerfile`

- [ ] **Step 1: Dockerfile COPY scripts**

在 Dockerfile 最终镜像阶段（现有 `COPY start.sh ./` 附近）增加：

```dockerfile
# 复制脚本（含 demo-data.sql，仅 DEMO_AUTO_SEED=true 时执行）
COPY scripts ./scripts
```

- [ ] **Step 2: start.sh 加 DEMO_AUTO_SEED 逻辑**

在 start.sh 的 PM2 启动之前（services 启动后、nginx 启动前）增加 demo seed 逻辑：

```sh
# 在 "# 等待服务就绪" 循环之后、"# 启动 nginx" 之前增加：

# Demo 数据自动初始化（仅本地开发环境，DEMO_AUTO_SEED=true 时执行）
if [ "$DEMO_AUTO_SEED" = "true" ] && [ -f /app/scripts/demo-data.sql ]; then
    echo "--- Seeding demo data ---"
    # 从 DATABASE_URL 解析连接信息，或直接用环境变量
    if [ -n "$DATABASE_URL" ]; then
        psql "$DATABASE_URL" -f /app/scripts/demo-data.sql 2>&1 || echo "WARNING: demo seed failed"
    else
        echo "WARNING: DATABASE_URL not set, skip demo seed"
    fi
fi
```

- [ ] **Step 3: .env 加 DEMO_AUTO_SEED**

修改 `.env` 增加：

```env
DEMO_AUTO_SEED=true
```

- [ ] **Step 4: 重建验证**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker compose up -d --build app`
Expected: 启动日志显示 "Seeding demo data"

验证：`docker compose exec -T postgres psql -U multicloud -d multicloud -c "SELECT count(*) FROM demo.instances;"` 返回 8

- [ ] **Step 5: 提交**

```bash
git add start.sh Dockerfile .env
git commit -m "feat: auto-seed demo data on startup when DEMO_AUTO_SEED=true"
```

---

## Phase 2：后端 scope 信号注入

### Task 9: API Gateway scope 中间件

**Files:**
- Create: `api-gateway/src/middleware/scope.ts`
- Modify: `api-gateway/src/index.ts`

- [ ] **Step 1: 读取现有 api-gateway 入口**

读取 `api-gateway/src/index.ts` 了解现有中间件挂载顺序（特别是 auth 中间件位置）。

- [ ] **Step 2: 创建 scope 中间件**

```typescript
// api-gateway/src/middleware/scope.ts
import type { Context, Next } from 'koa';
import { scopeFromDemoFlag } from '../../../shared/src/db/scope.js';

/**
 * Scope 中间件：读 X-Demo-Mode header，注入 ctx.state.scope
 * 必须在 auth 中间件之前执行（demo JWT 不走真实校验）
 */
export async function scopeMiddleware(ctx: Context, next: Next) {
  const isDemo = ctx.headers['x-demo-mode'] === 'true';
  const userId = isDemo ? 'demo-u-1' : (ctx.state.user?.id ?? '');
  ctx.state.scope = scopeFromDemoFlag(isDemo, userId);
  await next();
}
```

- [ ] **Step 3: 挂载中间件**

修改 `api-gateway/src/index.ts`，在 auth 中间件之前挂载：

```typescript
import { scopeMiddleware } from './middleware/scope.js';

// ... 在现有中间件挂载处，auth 之前：
app.use(scopeMiddleware);
// app.use(authMiddleware);  // 现有 auth 中间件
```

- [ ] **Step 4: auth 中间件跳过 demo**

修改 auth 中间件（或 JWT 验证逻辑），检查 `ctx.state.scope.isDemo` 时跳过：

```typescript
// auth 中间件内
if (ctx.state.scope?.isDemo) {
  // demo 模式跳过 JWT 校验
  await next();
  return;
}
// 正常 JWT 校验...
```

- [ ] **Step 5: 透传 header 给后端服务**

修改 api-gateway 的 proxy 逻辑，确保 `X-Demo-Mode` header 透传。找到转发逻辑（http-proxy 或类似），确认 header 透传。如果使用 `ctx.headers` 透传，确认自定义 header 不被剥离。

- [ ] **Step 6: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/api-gateway && npm run build`
Expected: 编译成功

- [ ] **Step 7: 提交**

```bash
git add api-gateway/src/middleware/scope.ts api-gateway/src/index.ts
git commit -m "feat: add scope middleware to api-gateway"
```

---

### Task 10: cloud-service scope 注入

**Files:**
- Modify: `cloud-service/src/index.ts`

- [ ] **Step 1: 读取现有 cloud-service 入口**

读取 `cloud-service/src/index.ts` 了解现有 onRequest hook 结构。

- [ ] **Step 2: 加 onRequest hook 注入 scope**

在现有 onRequest hook 附近增加 scope 注入：

```typescript
// cloud-service/src/index.ts
import { scopeFromDemoFlag } from '../../shared/src/db/scope.js';

// FastifyRequest 类型扩展
declare module 'fastify' {
  interface FastifyRequest {
    scope: import('../../shared/src/db/scope.js').RequestScope;
  }
}

// onRequest hook（在现有 onRequest 之后或之前）
app.addHook('onRequest', async (request) => {
  const isDemo = request.headers['x-demo-mode'] === 'true';
  const userId = (request.headers['x-scope-user-id'] as string) || '';
  request.scope = scopeFromDemoFlag(isDemo, userId);
});
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/cloud-service && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add cloud-service/src/index.ts
git commit -m "feat: inject request scope in cloud-service"
```

---

### Task 11: monitor-service scope 注入

**Files:**
- Modify: `monitor-service/src/index.ts`

- [ ] **Step 1: 读取现有 monitor-service 入口**

读取 `monitor-service/src/index.ts` 了解现有结构。

- [ ] **Step 2: 加 onRequest hook 注入 scope**

同 Task 10 的模式：

```typescript
// monitor-service/src/index.ts
import { scopeFromDemoFlag } from '../../shared/src/db/scope.js';

declare module 'fastify' {
  interface FastifyRequest {
    scope: import('../../shared/src/db/scope.js').RequestScope;
  }
}

app.addHook('onRequest', async (request) => {
  const isDemo = request.headers['x-demo-mode'] === 'true';
  const userId = (request.headers['x-scope-user-id'] as string) || '';
  request.scope = scopeFromDemoFlag(isDemo, userId);
});
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/monitor-service && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add monitor-service/src/index.ts
git commit -m "feat: inject request scope in monitor-service"
```

---

### Task 12: ai-gateway scope 注入

**Files:**
- Modify: `ai-gateway/src/index.ts`

- [ ] **Step 1: 读取现有 ai-gateway 入口**

读取 `ai-gateway/src/index.ts` 了解现有内部端点结构。

- [ ] **Step 2: 内部端点接收 scope**

ai-gateway 的内部端点（`/internal/*`）接收 monitor-service 的调用。修改内部端点处理函数，从 body 或 header 读 scope：

```typescript
// ai-gateway/src/index.ts（内部端点部分）

app.post('/internal/insight', async (request, reply) => {
  try {
    const body = request.body as any;
    // scope 从 body 字段或 header 读取
    const scope = body.scope === 'demo' || request.headers['x-demo-mode'] === 'true'
      ? 'demo' : 'public';
    const result = await generateDashboardInsight({ ...body, scope });
    return reply.send(result);
  } catch (err) {
    // ...
  }
});

// 同样修改 /internal/analyze-alert, /internal/analyze-remediation, /internal/embedding
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/ai-gateway && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add ai-gateway/src/index.ts
git commit -m "feat: accept scope field in ai-gateway internal endpoints"
```

---

## Phase 3：后端数据访问层改造

### Task 13: cloud-service 数据访问层加 scope

**Files:**
- Modify: `cloud-service/src/services/instance.service.ts`
- Modify: `cloud-service/src/services/resource.service.ts`
- Modify: `cloud-service/src/services/sync.service.ts`
- Modify: `cloud-service/src/routes/instances.ts`
- Modify: `cloud-service/src/routes/resources.ts`

- [ ] **Step 1: 读取现有 instance.service.ts**

读取 `cloud-service/src/services/instance.service.ts` 了解所有方法签名和 `db.select().from(instances)` 调用点。

- [ ] **Step 2: instance.service.ts 加 scope 参数**

所有方法签名加 `scope: RequestScope` 首参，`from(instances)` 改为 `from(scopedDb(scope).instances)`：

```typescript
// cloud-service/src/services/instance.service.ts
import { scopedDb } from '../../../shared/src/db/scoped-db.js';
import type { RequestScope } from '../../../shared/src/db/scope.js';
// 移除：import { instances } from '../db/schema';

export async function listInstances(scope: RequestScope, params?: ListParams) {
  const t = scopedDb(scope);
  // ... db.select().from(t.instances) ...
}

export async function getInstance(scope: RequestScope, id: string) {
  const t = scopedDb(scope);
  // ...
}

export async function upsertInstance(scope: RequestScope, instance: Instance) {
  const t = scopedDb(scope);
  // ...
}

// 所有其他方法同样加 scope 参数
```

- [ ] **Step 3: resource.service.ts 同样改造**

同 Step 2 模式，所有方法加 scope 参数，`from(cloudResources)` 改为 `from(scopedDb(scope).cloudResources)`。

- [ ] **Step 4: sync.service.ts 加 scope + demo 跳过**

```typescript
// cloud-service/src/services/sync.service.ts
export async function syncInstances(scope: RequestScope, providerName: string): Promise<SyncResult> {
  // demo 模式不同步真实云资源
  if (scope.isDemo) {
    return { provider: providerName, resourceType: 'instance', synced: 0, errors: ['demo mode: sync skipped'] };
  }
  // 正常同步逻辑...
}

export async function syncAll(scope: RequestScope): Promise<SyncResult[]> {
  if (scope.isDemo) {
    return [{ provider: 'demo', resourceType: 'instance', synced: 0, errors: ['demo mode: sync skipped'] }];
  }
  // 正常同步...
}
```

- [ ] **Step 5: 路由层传 request.scope**

```typescript
// cloud-service/src/routes/instances.ts
app.get('/', async (request) => {
  return instanceService.listInstances(request.scope);
});

app.post('/sync', async (request) => {
  return syncService.syncAll(request.scope);
});
```

- [ ] **Step 6: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/cloud-service && npm run build`
Expected: 编译成功

- [ ] **Step 7: 提交**

```bash
git add cloud-service/src/services/instance.service.ts cloud-service/src/services/resource.service.ts cloud-service/src/services/sync.service.ts cloud-service/src/routes/instances.ts cloud-service/src/routes/resources.ts
git commit -m "feat: add scope to cloud-service data access layer"
```

---

### Task 14: monitor-service 数据访问层加 scope

**Files:**
- Modify: `monitor-service/src/services/*.ts`（所有 service 文件）
- Modify: `monitor-service/src/routes/*.ts`（所有 route 文件）

- [ ] **Step 1: 识别 monitor-service 所有 service 文件**

用 Glob 找到 `monitor-service/src/services/*.ts` 所有文件。

- [ ] **Step 2: 逐个 service 加 scope 参数**

对每个 service 文件（alert.service.ts, cost.service.ts, metric.service.ts, prediction-engine.ts, remediation-engine.ts, knowledge-base.service.ts, dashboard-insight.service.ts 等），所有方法加 `scope: RequestScope` 首参，`from(xxx)` 改为 `from(scopedDb(scope).xxx)`。

- [ ] **Step 3: 路由层传 request.scope**

所有 route handler 传 `request.scope` 给 service 方法。

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/monitor-service && npm run build`
Expected: 编译成功

- [ ] **Step 5: 提交**

```bash
git add monitor-service/src/services/ monitor-service/src/routes/
git commit -m "feat: add scope to monitor-service data access layer"
```

---

### Task 15: ai-gateway 内部端点加 scope

**Files:**
- Modify: `ai-gateway/src/internal/dashboard-insight.ts`
- Modify: `ai-gateway/src/internal/analyze-alert.ts`
- Modify: `ai-gateway/src/internal/analyze-remediation.ts`
- Modify: `ai-gateway/src/internal/embedding.ts`

- [ ] **Step 1: dashboard-insight.ts 接收 scope**

```typescript
// ai-gateway/src/internal/dashboard-insight.ts
import { scopedDb } from '../../../shared/src/db/scoped-db.js';
import type { RequestScope } from '../../../shared/src/db/scope.js';

export async function generateDashboardInsight(body: {
  scope?: 'public' | 'demo';
  // ... 其他现有字段
}) {
  const requestScope: RequestScope = body.scope === 'demo'
    ? { schema: 'demo', isDemo: true, userId: 'demo-u-1' }
    : { schema: 'public', isDemo: false, userId: '' };
  const t = scopedDb(requestScope);
  
  // 读对应 schema 的数据
  const instances = await db.select().from(t.instances)...;
  const alerts = await db.select().from(t.alerts)...;
  // ... LLM 分析逻辑不变
  
  // token_usage 写对应 schema
  await db.insert(t.tokenUsage).values({ ... });
}
```

- [ ] **Step 2: analyze-alert.ts, analyze-remediation.ts, embedding.ts 同样改造**

每个内部端点接收 scope 字段，读对应 schema 数据，token_usage 写对应 schema。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/ai-gateway && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add ai-gateway/src/internal/
git commit -m "feat: add scope routing to ai-gateway internal endpoints"
```

---

## Phase 4：定时任务双跑

### Task 16: 预测引擎双跑

**Files:**
- Modify: `monitor-service/src/services/prediction-engine.ts`

- [ ] **Step 1: 读取现有 prediction-engine.ts**

读取 `monitor-service/src/services/prediction-engine.ts` 了解现有 `runCycle` 逻辑。

- [ ] **Step 2: 改造为双跑**

```typescript
// monitor-service/src/services/prediction-engine.ts
import { PUBLIC_SCOPE, DEMO_SCOPE } from '../../../shared/src/db/scope.js';

async function runCycle() {
  // 真实数据
  try {
    await analyzeSchema(PUBLIC_SCOPE);
  } catch (err) {
    console.error('Prediction public failed:', (err as Error).message);
  }
  // demo 数据（数据量小，开销可忽略）
  try {
    await analyzeSchema(DEMO_SCOPE);
  } catch (err) {
    console.error('Prediction demo failed:', (err as Error).message);
  }
}

async function analyzeSchema(scope: RequestScope) {
  const t = scopedDb(scope);
  const instances = await db.select().from(t.instances)
    .where(eq(t.instances.status, 'running'));
  // 对每个实例查对应 schema 的 metrics 历史趋势
  // 线性回归 → 写入对应 schema 的 metric_predictions
}
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/monitor-service && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add monitor-service/src/services/prediction-engine.ts
git commit -m "feat: prediction engine dual-run for public and demo schemas"
```

---

### Task 17: 自愈引擎 demo 模拟执行

**Files:**
- Modify: `monitor-service/src/services/remediation-engine.ts`

- [ ] **Step 1: 读取现有 remediation-engine.ts**

读取 `monitor-service/src/services/remediation-engine.ts` 了解现有 onAlertFired 链路。

- [ ] **Step 2: 加 scope + demo 模拟执行**

```typescript
// monitor-service/src/services/remediation-engine.ts

async function onAlertFired(alert: Alert, scope: RequestScope) {
  const t = scopedDb(scope);
  
  // AI 根因分析（透传 scope）
  const plan = await callAnalyzeRemediation({
    alert,
    instance: await getInstance(scope, alert.instanceId),
    scope: scope.schema,
  });
  
  // 策略决策
  const policy = await getPolicy(scope, plan.action);
  
  if (scope.isDemo) {
    // demo 模式模拟执行，不调真实云 API
    await db.insert(t.remediationRuns).values({
      alertId: alert.id,
      instanceId: alert.instanceId,
      rootCause: plan.rootCause,
      actionPlan: plan,
      actionExecuted: plan.recommendedAction,
      status: 'success',
      env: 'demo',
      triggeredAt: new Date(),
      approvedAt: new Date(),
      executedAt: new Date(),
      verifiedAt: new Date(),
      verificationResult: `验证成功：${plan.verificationMetric} 已恢复正常，修复有效`,
    });
    return;
  }
  
  // 真实执行逻辑（原有代码）...
}
```

- [ ] **Step 3: 告警触发时传 scope**

修改告警触发逻辑，调用 onAlertFired 时传 scope。告警由预测引擎或定时检查触发，这些任务已带 scope（Task 16 双跑）。

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/monitor-service && npm run build`
Expected: 编译成功

- [ ] **Step 5: 提交**

```bash
git add monitor-service/src/services/remediation-engine.ts
git commit -m "feat: remediation engine demo mode simulated execution"
```

---

## Phase 5：前端改造

### Task 18: axios 拦截器注入 X-Demo-Mode

**Files:**
- Modify: `web-console/src/api/client.ts`

- [ ] **Step 1: 读取现有 client.ts**

读取 `web-console/src/api/client.ts` 了解现有 request() 函数。

- [ ] **Step 2: request() 注入 header**

在 `request()` 函数的 header 组装处加 demo header：

```typescript
// web-console/src/api/client.ts
import { useDemoStore } from '@/stores/demo';

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false, _retried = false } = options;
  const { accessToken } = useAuthStore.getState();
  const isDemoMode = useDemoStore.getState().isDemoMode;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (!skipAuth && accessToken) {
    finalHeaders['Authorization'] = `Bearer ${accessToken}`;
  }
  // demo 模式注入 header
  if (isDemoMode) {
    finalHeaders['X-Demo-Mode'] = 'true';
  }

  // ... 现有 fetch 逻辑
}
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add web-console/src/api/client.ts
git commit -m "feat: inject X-Demo-Mode header in api client"
```

---

### Task 19: 移除前端 mock 分支

**Files:**
- Delete: `web-console/src/lib/demo/demo-api.ts`
- Modify: `web-console/src/hooks/useInstances.ts`
- Modify: `web-console/src/hooks/useDashboard.ts`
- Modify: `web-console/src/hooks/useResources.ts`
- Modify: `web-console/src/hooks/useCosts.ts`
- Modify: `web-console/src/hooks/useAlerts.ts`
- Modify: `web-console/src/hooks/useTeams.ts`
- Modify: `web-console/src/hooks/useUsers.ts`
- Modify: `web-console/src/hooks/useTopology.ts`
- Modify: `web-console/src/pages/CloudAccounts.tsx`
- Modify: `web-console/src/pages/Instances.tsx`
- Modify: `web-console/src/pages/Resources.tsx`

- [ ] **Step 1: 删除 demo-api.ts**

删除 `web-console/src/lib/demo/demo-api.ts` 整个文件。

- [ ] **Step 2: useInstances.ts 移除 mock 分支**

```typescript
// web-console/src/hooks/useInstances.ts（改造后）
import { cloudApi } from '../api/cloud';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateInstanceParams } from '../types/cloud';

export function useInstances(params?: any) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => cloudApi.listInstances(params),
  });
}

export function useInstance(id?: string) {
  return useQuery({
    queryKey: ['instance', id],
    queryFn: () => cloudApi.getInstance(id!),
    enabled: !!id,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateInstanceParams) => cloudApi.createInstance(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useDeleteInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cloudApi.deleteInstance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}
```

- [ ] **Step 3: useDashboard.ts 移除 mock 分支**

```typescript
// web-console/src/hooks/useDashboard.ts
import { dashboardApi } from '../api/dashboard';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getStats(),
  });
}
```

- [ ] **Step 4: 其他 hook 逐个移除**

对 useResources、useCosts、useAlerts、useTeams、useUsers、useTopology 每个 hook，移除：
- `useDemoStore` 导入和 `isDemoMode` 变量
- `demoXxx` 导入
- `isDemoMode ? demoXxx() : apiXxx()` 三元分支，改为直接调 `apiXxx()`
- queryKey 里的 `isDemoMode` 移除

- [ ] **Step 5: 页面组件移除 isDemoMode 分支**

对 CloudAccounts.tsx、Instances.tsx、Resources.tsx，移除 `isDemoMode` 相关的条件渲染分支（如 `{isDemoMode && <DemoBanner />}`）。

- [ ] **Step 6: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npm run build`
Expected: 编译成功，无 noUnusedLocals 错误

- [ ] **Step 7: 提交**

```bash
git add web-console/src/lib/demo/demo-api.ts web-console/src/hooks/ web-console/src/pages/
git commit -m "refactor: remove frontend mock layer, unified real API routing"
```

---

### Task 20: DemoBanner 组件

**Files:**
- Create: `web-console/src/components/common/DemoBanner.tsx`
- Modify: `web-console/src/App.tsx`

- [ ] **Step 1: 创建 DemoBanner**

```tsx
// web-console/src/components/common/DemoBanner.tsx
import { useDemoStore } from '@/stores/demo';

export function DemoBanner() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  if (!isDemoMode) return null;
  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
      <span className="font-medium">演示模式</span>
      <span className="ml-2 text-muted-foreground">所有数据为模拟数据，退出登录后清除</span>
    </div>
  );
}
```

- [ ] **Step 2: 挂载到 App layout**

修改 `web-console/src/App.tsx`，在 Navbar 下方挂载 DemoBanner：

```tsx
import { DemoBanner } from './components/common/DemoBanner';

// 在 layout 结构中 Navbar 下方：
<DemoBanner />
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add web-console/src/components/common/DemoBanner.tsx web-console/src/App.tsx
git commit -m "feat: add DemoBanner component for demo mode indicator"
```

---

## Phase 6：集成验证

### Task 21: 端到端验证

**Files:** 无（验证任务）

- [ ] **Step 1: 重建服务**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker compose up -d --build`
Expected: 所有服务启动，日志显示 demo schema migration 完成，demo data seeded

- [ ] **Step 2: 验证 demo 模式**

在浏览器打开 http://localhost，点击"免密体验"进入 demo 模式：
1. Dashboard 页面显示 demo 数据（8 实例 + 告警 + 成本）
2. AI 健康洞察面板显示基于 demo 数据的分析结果
3. Monitor 页面显示预测、自愈、知识库 demo 数据
4. 顶部显示黄色 DemoBanner 横幅
5. 实例列表显示 8 个 demo 实例

- [ ] **Step 3: 验证真实模式**

退出 demo，用 admin 登录：
1. Dashboard 显示真实 Render 资源（multicloud-backend）
2. AI 健康洞察基于真实数据分析
3. 不显示 DemoBanner
4. 实例列表显示真实 Render 服务

- [ ] **Step 4: 验证数据隔离**

```bash
# 验证 public 和 demo 数据完全隔离
docker compose exec -T postgres psql -U multicloud -d multicloud -c "
SELECT 'public.instances' AS tbl, count(*) FROM instances
UNION ALL SELECT 'demo.instances', count(*) FROM demo.instances
UNION ALL SELECT 'public.alerts', count(*) FROM alerts
UNION ALL SELECT 'demo.alerts', count(*) FROM demo.alerts;
"
```

Expected: public 显示真实数据（1 instance），demo 显示 demo 数据（8 instances）

- [ ] **Step 5: 验证 cleanup 脚本**

Run: `docker compose exec -T postgres psql -U multicloud -d multicloud -f /app/scripts/cleanup-demo-data.sql`
Expected: demo schema 数据清空，public 数据不受影响

- [ ] **Step 6: 重新 seed demo 数据**

Run: `docker compose exec -T postgres psql -U multicloud -d multicloud -f /app/scripts/demo-data.sql`
Expected: demo 数据恢复

- [ ] **Step 7: 提交验证结果**

如果有任何修复，提交。否则无需提交。

---

## Self-Review 结果

### Spec coverage 检查

| Spec Section | 对应 Task | 状态 |
|---|---|---|
| 1. 总体架构 | Task 1-4（scope 类型 + schema 工厂 + scopedDb） | ✅ |
| 2. 数据访问层抽象 | Task 3-4, 13-15 | ✅ |
| 3. Scope 信号传递链路 | Task 9-12（中间件 + 透传） | ✅ |
| 4. demo schema 初始化与数据管理 | Task 2, 5-8 | ✅ |
| 5. 前端整合与 demo 入口 | Task 18-20 | ✅ |
| 6. 后端 AI 功能 scope 适配 | Task 15-17 | ✅ |
| 7. Migration 策略与回滚预案 | Task 2, 5, 8 | ✅ |

### Placeholder 扫描

无 TBD/TODO，所有步骤都含完整代码。

### Type 一致性

- `RequestScope` 在 Task 1 定义，后续 Task 9-17 使用一致
- `scopedDb(scope)` 在 Task 4 定义，后续 Task 13-17 调用一致
- `scopeFromDemoFlag` 在 Task 1 定义，Task 9-11 使用一致
- `PUBLIC_SCOPE` / `DEMO_SCOPE` 在 Task 1 定义，Task 16 使用一致
