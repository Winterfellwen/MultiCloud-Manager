# CloudOps AI Phase 3 — Monitor Service + 告警引擎 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Monitor Service，提供指标采集、告警引擎、成本分析与实时事件推送。

**Architecture:** Monitor Service 是独立 Fastify 服务（端口 3002），与 cloud-service 共享 PostgreSQL 数据库（metrics/alerts/alertRules/costRecords 表已在 Phase 2 创建）。通过 HTTP 调用 cloud-service 获取实例列表与云指标，定时采集后写入 DB；告警引擎定时扫描指标触发告警；通过 Redis Pub/Sub 推送实时事件（alert.fired/alert.resolved/cost.updated）。

**Tech Stack:** TypeScript (ESM) / Fastify 4 / Drizzle ORM / PostgreSQL / Redis (ioredis) / Zod / Node 22 内置 fetch

**与 OpenClaw 的关系：** Phase 3 不依赖 OpenClaw 源码（OpenClaw 主要影响 Phase 4 AI Agent）。实时推送协议参考设计文档的 WS 事件定义，但使用独立实现，不引入 OpenClaw 标识。

---

## 文件结构

```
monitor-service/
├── package.json                  # 依赖与脚本
├── tsconfig.json                 # TS 配置（复用 cloud-service 模式）
├── drizzle.config.ts             # Drizzle Kit 配置
├── Dockerfile                    # 容器构建（复用 pnpm 模式）
├── migrations/
│   └── 001_init.sql              # notification_channels 表（其余表 Phase 2 已建）
└── src/
    ├── index.ts                  # 服务入口：注册路由、启动采集器、告警引擎、定时任务
    ├── config.ts                 # 环境变量配置
    ├── db/
    │   ├── index.ts              # Drizzle 连接（共享 DB）
    │   ├── schema.ts             # 复用 Phase 2 表定义 + notification_channels
    │   └── migrate.ts            # 迁移执行
    ├── services/
    │   ├── metric.service.ts     # 指标查询（从 DB 读历史指标）
    │   ├── alert.service.ts      # 告警规则 CRUD + 告警事件管理
    │   ├── alert-engine.ts       # 告警引擎：定时扫描指标，评估规则，触发告警
    │   ├── cost.service.ts       # 成本采集（调 cloud-service）+ 分析查询
    │   └── notify.service.ts     # 通知发送：Webhook / 邮件 / 系统内
    ├── collectors/
    │   └── metric-collector.ts   # 定时指标采集器：拉实例列表→调 cloud-service→写 DB
    ├── routes/
    │   ├── metrics.ts            # GET /monitor/metrics/:instanceId
    │   ├── alerts.ts             # 告警规则 CRUD + 告警事件查询
    │   └── costs.ts              # 成本查询路由
    └── events/
        └── publisher.ts          # Redis Pub/Sub 事件发布

cloud-service/src/routes/instances.ts  # 修改：新增 GET /:id/metrics 端点
```

---

## Task 1: monitor-service 项目初始化

**Files:**
- Create: `monitor-service/package.json`
- Create: `monitor-service/tsconfig.json`
- Create: `monitor-service/drizzle.config.ts`
- Create: `monitor-service/src/config.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@cloudops/monitor-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@cloudops/shared": "workspace:*",
    "drizzle-orm": "^0.32.0",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0",
    "ioredis": "^5.4.0",
    "nodemailer": "^6.9.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/nodemailer": "^6.4.0",
    "drizzle-kit": "^0.24.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**（复用 cloud-service 模式）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: 创建 drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: 创建 src/config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // cloud-service 内部地址（docker 网络内服务间调用，不走 gateway）
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://cloud-service:3001',

  // 采集间隔（秒）
  metricCollectIntervalSec: parseInt(process.env.METRIC_COLLECT_INTERVAL || '300', 10),
  // 告警检查间隔（秒）
  alertCheckIntervalSec: parseInt(process.env.ALERT_CHECK_INTERVAL || '60', 10),
  // 成本采集间隔（秒，默认每日）
  costCollectIntervalSec: parseInt(process.env.COST_COLLECT_INTERVAL || '86400', 10),

  // 邮件通知（可选）
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'cloudops@noreply.com',
  },
};
```

- [ ] **Step 5: 验证依赖安装与类型检查**

Run: `pnpm install --no-frozen-lockfile`
Expected: monitor-service 依赖安装成功

- [ ] **Step 6: Commit**

```bash
git add monitor-service/package.json monitor-service/tsconfig.json monitor-service/drizzle.config.ts monitor-service/src/config.ts pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(monitor): initialize monitor-service project scaffold"
```

---

## Task 2: DB schema 与迁移

**Files:**
- Create: `monitor-service/src/db/index.ts`
- Create: `monitor-service/src/db/schema.ts`
- Create: `monitor-service/src/db/migrate.ts`
- Create: `monitor-service/migrations/001_init.sql`

**说明：** metrics/alerts/alert_rules/cost_records/instances 表已在 Phase 2 的 cloud-service migrations 中创建。本任务只需新增 `notification_channels` 表（存储 Webhook URL / 邮件收件人等通知渠道配置），并复用已有表定义供 Drizzle 查询。

- [ ] **Step 1: 创建 src/db/schema.ts**

复用 Phase 2 已有表定义 + 新增 notification_channels 表。instances/metrics/alertRules/alerts/costRecords 定义与 cloud-service 保持一致。

```typescript
import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, decimal, uniqueIndex, index } from 'drizzle-orm/pg-core';

// 复用 Phase 2 已有表（与 cloud-service/schema.ts 一致，供本服务查询）
export const instances = pgTable('instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerInstanceId: varchar('provider_instance_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 256 }),
  region: varchar('region', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  cpu: integer('cpu'),
  memoryMb: integer('memory_mb'),
  diskGb: integer('disk_gb'),
  publicIp: varchar('public_ip'),
  privateIp: varchar('private_ip'),
  monthlyCost: decimal('monthly_cost', { precision: 10, scale: 2 }),
  tags: jsonb('tags'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  cloudAccountId: uuid('cloud_account_id'),
});

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => instances.id, { onDelete: 'cascade' }),
  metricName: varchar('metric_name', { length: 64 }).notNull(),
  value: decimal('value', { precision: 12, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 16 }),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  metric: varchar('metric', { length: 64 }).notNull(),
  condition: varchar('condition', { length: 32 }).notNull(),
  duration: varchar('duration', { length: 16 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  actions: jsonb('actions').notNull(),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').references(() => alertRules.id),
  instanceId: uuid('instance_id').references(() => instances.id),
  severity: varchar('severity', { length: 16 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 16 }).default('firing'),
  firedAt: timestamp('fired_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

export const costRecords = pgTable('cost_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 32 }).notNull(),
  region: varchar('region', { length: 64 }).notNull(),
  service: varchar('service', { length: 64 }).notNull(),
  resourceId: varchar('resource_id', { length: 128 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).default('USD'),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase 3 新增：通知渠道配置表
export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // webhook | email | slack
  config: jsonb('config').notNull(),               // {url, secret?} | {recipients[]} | {webhookUrl}
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 2: 创建 src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: 创建 migrations/001_init.sql**

只创建 notification_channels 表（其余表 Phase 2 已建）。

```sql
-- Monitor Service Phase 3 — 通知渠道配置表
CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL,
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(type);
CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON notification_channels(enabled);
```

- [ ] **Step 4: 创建 src/db/migrate.ts**

```typescript
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from '../config.js';

async function migrate() {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const migrationsDir = join(process.cwd(), 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    await sql.unsafe(content);
  }

  console.log('Migrations complete.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 5: 验证构建**

Run: `pnpm --filter @cloudops/monitor-service build`
Expected: 编译成功，无类型错误

- [ ] **Step 6: Commit**

```bash
git add monitor-service/src/db/ monitor-service/migrations/
git commit -m "feat(monitor): add db schema and notification_channels migration"
```

---

## Task 3: cloud-service 新增指标查询端点

**Files:**
- Modify: `cloud-service/src/routes/instances.ts`

**说明：** monitor-service 需要通过 HTTP 调用 cloud-service 获取实例的云指标。在 instances 路由中新增 `GET /:id/metrics` 端点，内部根据实例 id 查出 provider + providerInstanceId，调用 `provider.getMetrics()`。

- [ ] **Step 1: 在 instances.ts 顶部新增 import**

在 `cloud-service/src/routes/instances.ts` 的 import 区域添加：

```typescript
import { getProvider } from "../providers/registry.js";
```

- [ ] **Step 2: 在 instanceRoutes 函数内新增指标查询端点**

在 `app.post("/sync", ...)` 路由之前插入：

```typescript
  // 查询实例指标（供 monitor-service 调用）
  app.get("/:id/metrics", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { start?: string; end?: string };
    const row = await instanceService.getById(id);
    const provider = getProvider(row.provider);

    const end = query.end ? new Date(query.end) : new Date();
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 60 * 60 * 1000); // 默认最近 1 小时

    return provider.getMetrics(row.providerInstanceId, { start, end });
  });
```

- [ ] **Step 3: 验证 cloud-service 构建**

Run: `pnpm --filter @cloudops/cloud-service build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add cloud-service/src/routes/instances.ts
git commit -m "feat(cloud): add GET /instances/:id/metrics endpoint for monitor-service"
```

---

## Task 4: 指标采集器 + metric service

**Files:**
- Create: `monitor-service/src/collectors/metric-collector.ts`
- Create: `monitor-service/src/services/metric.service.ts`

**说明：** metric-collector 定时拉取实例列表，对每个 running 实例调用 cloud-service 的 `/cloud/instances/:id/metrics` 获取指标，写入 metrics 表。metric.service 负责从 DB 查询历史指标供 API 返回。

- [ ] **Step 1: 创建 src/services/metric.service.ts**

```typescript
import { db } from '../db/index.js';
import { metrics } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { NotFoundError } from '@cloudops/shared';

export interface MetricQuery {
  instanceId: string;
  metricName?: string;
  start?: Date;
  end?: Date;
  limit?: number;
}

export class MetricService {
  async query(query: MetricQuery) {
    const conditions = [eq(metrics.instanceId, query.instanceId)];
    if (query.metricName) conditions.push(eq(metrics.metricName, query.metricName));
    if (query.start) conditions.push(gte(metrics.recordedAt, query.start));
    if (query.end) conditions.push(lte(metrics.recordedAt, query.end));

    const limit = query.limit || 1000;
    return db
      .select()
      .from(metrics)
      .where(and(...conditions))
      .orderBy(desc(metrics.recordedAt))
      .limit(limit);
  }

  async insert(data: {
    instanceId: string;
    metricName: string;
    value: number;
    unit?: string;
    recordedAt: Date;
  }) {
    await db.insert(metrics).values({
      instanceId: data.instanceId,
      metricName: data.metricName,
      value: data.value.toString(),
      unit: data.unit,
      recordedAt: data.recordedAt,
    });
  }
}

export const metricService = new MetricService();
```

- [ ] **Step 2: 创建 src/collectors/metric-collector.ts**

```typescript
import { db } from '../db/index.js';
import { instances } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { metricService } from '../services/metric.service.js';

interface CloudInstance {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string | null;
  status: string;
  region: string;
}

interface MetricPoint {
  timestamp: Date | string;
  value: number;
  unit?: string;
}

export class MetricCollector {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.metricCollectIntervalSec * 1000;
    this.timer = setInterval(() => this.collect().catch(console.error), intervalMs);
    // 启动后立即采集一次
    this.collect().catch(console.error);
    console.log(`Metric collector started (interval: ${config.metricCollectIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async collect() {
    // 从共享 DB 读取所有 running 实例
    const runningInstances = await db
      .select()
      .from(instances)
      .where(eq(instances.status, 'running'));

    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);
    let collected = 0;

    for (const inst of runningInstances) {
      try {
        const points = await this.fetchMetricsFromCloud(inst.id, start, end);
        for (const point of points) {
          await metricService.insert({
            instanceId: inst.id,
            metricName: 'cpu_usage_percent',
            value: point.value,
            unit: point.unit || 'Percent',
            recordedAt: new Date(point.timestamp),
          });
        }
        collected += points.length;
      } catch (err) {
        console.error(`Failed to collect metrics for ${inst.id}:`, (err as Error).message);
      }
    }

    console.log(`Metric collection done: ${collected} points from ${runningInstances.length} instances`);
  }

  private async fetchMetricsFromCloud(
    instanceId: string,
    start: Date,
    end: Date
  ): Promise<MetricPoint[]> {
    const url = `${config.cloudServiceUrl}/cloud/instances/${instanceId}/metrics?start=${start.toISOString()}&end=${end.toISOString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`cloud-service responded ${res.status}`);
    }
    return (await res.json()) as MetricPoint[];
  }
}

export const metricCollector = new MetricCollector();
```

- [ ] **Step 3: 验证构建**

Run: `pnpm --filter @cloudops/monitor-service build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add monitor-service/src/collectors/ monitor-service/src/services/metric.service.ts
git commit -m "feat(monitor): add metric collector and metric query service"
```

---

## Task 5: 告警规则管理 + alert service

**Files:**
- Create: `monitor-service/src/services/alert.service.ts`

**说明：** alert.service 负责告警规则的 CRUD 和告警事件的管理（创建/查询/解决）。

- [ ] **Step 1: 创建 src/services/alert.service.ts**

```typescript
import { db } from '../db/index.js';
import { alertRules, alerts } from '../db/schema.js';
import { eq, and, desc, ne } from 'drizzle-orm';
import { NotFoundError } from '@cloudops/shared';
import type { AlertSeverity, AlertStatus } from '@cloudops/shared';

export interface CreateRuleInput {
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: { type: string; targets: string[] }[];
  enabled?: boolean;
}

export class AlertService {
  // ---- 告警规则 CRUD ----

  async listRules() {
    return db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
  }

  async getRule(id: string) {
    const result = await db.select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
    if (result.length === 0) throw new NotFoundError('AlertRule', id);
    return result[0];
  }

  async createRule(input: CreateRuleInput) {
    const result = await db
      .insert(alertRules)
      .values({
        name: input.name,
        metric: input.metric,
        condition: input.condition,
        duration: input.duration,
        severity: input.severity,
        actions: input.actions,
        enabled: input.enabled ?? true,
      })
      .returning();
    return result[0];
  }

  async updateRule(id: string, input: Partial<CreateRuleInput>) {
    await this.getRule(id);
    const result = await db
      .update(alertRules)
      .set(input)
      .where(eq(alertRules.id, id))
      .returning();
    return result[0];
  }

  async deleteRule(id: string) {
    await this.getRule(id);
    await db.delete(alertRules).where(eq(alertRules.id, id));
  }

  // ---- 告警事件管理 ----

  async listAlerts(filters: { status?: AlertStatus; severity?: AlertSeverity; limit?: number } = {}) {
    const conditions = [];
    if (filters.status) conditions.push(eq(alerts.status, filters.status));
    if (filters.severity) conditions.push(eq(alerts.severity, filters.severity));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 100;
    return db.select().from(alerts).where(where).orderBy(desc(alerts.firedAt)).limit(limit);
  }

  async createAlert(input: {
    ruleId: string;
    instanceId: string | null;
    severity: AlertSeverity;
    message: string;
  }) {
    const result = await db
      .insert(alerts)
      .values({
        ruleId: input.ruleId,
        instanceId: input.instanceId,
        severity: input.severity,
        message: input.message,
        status: 'firing',
      })
      .returning();
    return result[0];
  }

  async resolveAlert(id: string) {
    await db
      .update(alerts)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(eq(alerts.id, id));
  }

  /**
   * 查询某规则某实例是否已有 firing 状态的告警（避免重复触发）
   */
  async findFiringAlert(ruleId: string, instanceId: string | null) {
    const conditions = [eq(alerts.ruleId, ruleId), eq(alerts.status, 'firing')];
    if (instanceId) {
      conditions.push(eq(alerts.instanceId, instanceId));
    }
    const result = await db.select().from(alerts).where(and(...conditions)).limit(1);
    return result[0] || null;
  }
}

export const alertService = new AlertService();
```

- [ ] **Step 2: 验证构建**

Run: `pnpm --filter @cloudops/monitor-service build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/services/alert.service.ts
git commit -m "feat(monitor): add alert rule CRUD and alert event management"
```

---

## Task 6: 告警引擎（定时检查）

**Files:**
- Create: `monitor-service/src/services/alert-engine.ts`

**说明：** 告警引擎定时扫描启用的告警规则，对每条规则查询最近时间窗口内的指标，评估条件是否满足，满足则触发告警（创建 alert 事件 + 发送通知 + 发布事件）。条件恢复时自动 resolve。

- [ ] **Step 1: 创建 src/services/alert-engine.ts**

```typescript
import { db } from '../db/index.js';
import { alertRules, alerts, metrics, instances } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { config } from '../config.js';
import { alertService } from './alert.service.js';
import { notifyService } from './notify.service.js';
import { eventPublisher } from '../events/publisher.js';
import type { AlertSeverity } from '@cloudops/shared';

interface RuleRow {
  id: string;
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: string;
  actions: unknown;
  enabled: boolean | null;
}

export class AlertEngine {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.alertCheckIntervalSec * 1000;
    this.timer = setInterval(() => this.checkAll().catch(console.error), intervalMs);
    console.log(`Alert engine started (interval: ${config.alertCheckIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async checkAll() {
    const rules = await db.select().from(alertRules).where(eq(alertRules.enabled, true));
    for (const rule of rules) {
      await this.evaluateRule(rule as RuleRow).catch((err) =>
        console.error(`Rule ${rule.name} evaluation failed:`, err)
      );
    }
  }

  private async evaluateRule(rule: RuleRow) {
    const durationMs = this.parseDuration(rule.duration);
    const since = new Date(Date.now() - durationMs);

    // 查询该 metric 在 duration 窗口内的所有数据点
    const points = await db
      .select()
      .from(metrics)
      .where(and(eq(metrics.metricName, rule.metric), gte(metrics.recordedAt, since)))
      .orderBy(desc(metrics.recordedAt));

    if (points.length === 0) return;

    // 按 instanceId 分组评估
    const byInstance = new Map<string, typeof points>();
    for (const p of points) {
      if (!p.instanceId) continue;
      const arr = byInstance.get(p.instanceId) || [];
      arr.push(p);
      byInstance.set(p.instanceId, arr);
    }

    for (const [instanceId, instancePoints] of byInstance) {
      const triggered = instancePoints.some((p) => this.evaluateCondition(rule.condition, parseFloat(p.value)));
      const existing = await alertService.findFiringAlert(rule.id, instanceId);

      if (triggered && !existing) {
        // 触发新告警
        const inst = await db.select().from(instances).where(eq(instances.id, instanceId)).limit(1);
        const instName = inst[0]?.name || instanceId;
        const alert = await alertService.createAlert({
          ruleId: rule.id,
          instanceId,
          severity: rule.severity as AlertSeverity,
          message: `告警「${rule.name}」：实例 ${instName} 的 ${rule.metric} ${rule.condition}（当前值 ${instancePoints[0].value}）`,
        });

        // 发送通知
        await notifyService.notify(rule.actions as any, alert.message, rule.severity as AlertSeverity);

        // 发布事件
        await eventPublisher.publish('alert.fired', { alertId: alert.id, ruleId: rule.id, instanceId, severity: rule.severity });
      } else if (!triggered && existing) {
        // 条件恢复，自动解决
        await alertService.resolveAlert(existing.id);
        await eventPublisher.publish('alert.resolved', { alertId: existing.id, ruleId: rule.id, instanceId });
      }
    }
  }

  /**
   * 评估条件，支持 "> 85%" / "< 10" / "> 100" 等格式
   */
  private evaluateCondition(condition: string, value: number): boolean {
    const match = condition.match(/^(>=|<=|>|<|==)\s*([\d.]+)/);
    if (!match) return false;
    const op = match[1];
    const threshold = parseFloat(match[2]);
    switch (op) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      default: return false;
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(min|h|s|d)$/);
    if (!match) return 10 * 60 * 1000; // 默认 10 分钟
    const num = parseInt(match[1]);
    switch (match[2]) {
      case 's': return num * 1000;
      case 'min': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: return 10 * 60 * 1000;
    }
  }
}

export const alertEngine = new AlertEngine();
```

- [ ] **Step 2: 验证构建**

Run: `pnpm --filter @cloudops/monitor-service build`
Expected: 编译成功（注意：notify.service 和 eventPublisher 尚未创建，本步骤会报错。先创建占位文件或调整 import 顺序——见 Task 7/8。实际执行时先完成 Task 7、8 再回来构建验证。）

> **执行顺序提示：** Task 6 依赖 Task 7（notify.service）和 Task 8（eventPublisher）。建议先创建 Task 7、8 的文件，再统一构建验证。

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/services/alert-engine.ts
git commit -m "feat(monitor): add alert engine with scheduled rule evaluation"
```

---

## Task 7: 通知服务

**Files:**
- Create: `monitor-service/src/services/notify.service.ts`

**说明：** 通知服务支持 Webhook（企业微信/钉钉/飞书）、邮件、系统内通知三种渠道。告警规则的 actions 字段指定通知目标（channel name），notify.service 从 notification_channels 表查配置发送。

- [ ] **Step 1: 创建 src/services/notify.service.ts**

```typescript
import { db } from '../db/index.js';
import { notificationChannels } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import type { AlertSeverity } from '@cloudops/shared';

interface AlertAction {
  type: 'notify' | 'suggest' | 'auto';
  targets: string[];
}

export class NotifyService {
  async notify(actions: AlertAction[], message: string, severity: AlertSeverity) {
    for (const action of actions) {
      if (action.type !== 'notify') continue;
      for (const target of action.targets) {
        await this.sendToTarget(target, message, severity).catch((err) =>
          console.error(`Notify ${target} failed:`, err)
        );
      }
    }
  }

  private async sendToTarget(channelName: string, message: string, severity: AlertSeverity) {
    // target 可以是 channel name 或内置渠道名
    if (channelName === 'system') {
      console.log(`[System Notification] [${severity}] ${message}`);
      return;
    }

    const channel = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.name, channelName))
      .limit(1);

    if (channel.length === 0) {
      console.warn(`Notification channel "${channelName}" not found`);
      return;
    }

    const ch = channel[0];
    if (!ch.enabled) return;

    switch (ch.type) {
      case 'webhook':
        await this.sendWebhook(ch.config as { url: string; secret?: string }, message, severity);
        break;
      case 'email':
        await this.sendEmail(ch.config as { recipients: string[] }, message, severity);
        break;
      case 'slack':
        await this.sendSlack(ch.config as { webhookUrl: string }, message, severity);
        break;
    }
  }

  private async sendWebhook(
    cfg: { url: string; secret?: string },
    message: string,
    severity: AlertSeverity
  ) {
    await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[${severity.toUpperCase()}] ${message}`,
        severity,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  private async sendEmail(
    cfg: { recipients: string[] },
    message: string,
    severity: AlertSeverity
  ) {
    if (!config.smtp.host) {
      console.warn('SMTP not configured, skipping email notification');
      return;
    }
    // 动态 import nodemailer 避免未配置时加载
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    await transporter.sendMail({
      from: config.smtp.from,
      to: cfg.recipients.join(','),
      subject: `[CloudOps 告警][${severity.toUpperCase()}] ${message.slice(0, 50)}`,
      text: message,
    });
  }

  private async sendSlack(
    cfg: { webhookUrl: string },
    message: string,
    severity: AlertSeverity
  ) {
    await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*[${severity.toUpperCase()}]* ${message}`,
      }),
    });
  }
}

export const notifyService = new NotifyService();
```

- [ ] **Step 2: Commit**

```bash
git add monitor-service/src/services/notify.service.ts
git commit -m "feat(monitor): add notification service (webhook/email/slack/system)"
```

---

## Task 8: 事件发布（Redis Pub/Sub）

**Files:**
- Create: `monitor-service/src/events/publisher.ts`

**说明：** 通过 Redis Pub/Sub 发布实时事件，供 Web Console（Phase 5）和 AI Agent（Phase 4）订阅。事件类型：alert.fired / alert.resolved / cost.updated。

- [ ] **Step 1: 创建 src/events/publisher.ts**

```typescript
import Redis from 'ioredis';
import { config } from '../config.js';

class EventPublisher {
  private redis: Redis | null = null;

  private getClient(): Redis {
    if (!this.redis) {
      this.redis = new Redis(config.redisUrl);
    }
    return this.redis;
  }

  async publish(event: string, payload: unknown) {
    const channel = `cloudops:${event}`;
    try {
      await this.getClient().publish(channel, JSON.stringify(payload));
      console.log(`Event published: ${channel}`);
    } catch (err) {
      console.error(`Failed to publish event ${channel}:`, err);
    }
  }
}

export const eventPublisher = new EventPublisher();
```

- [ ] **Step 2: Commit**

```bash
git add monitor-service/src/events/publisher.ts
git commit -m "feat(monitor): add redis pub/sub event publisher"
```

---

## Task 9: 成本采集与分析 service

**Files:**
- Create: `monitor-service/src/services/cost.service.ts`

**说明：** cost.service 定时调用 cloud-service 各 provider 的 getCostSummary，写入 cost_records 表；提供成本查询 API（按 provider/时间范围汇总）。

- [ ] **Step 1: 创建 src/services/cost.service.ts**

```typescript
import { db } from '../db/index.js';
import { costRecords, instances } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { eventPublisher } from '../events/publisher.js';

interface CostQuery {
  provider?: string;
  start?: Date;
  end?: Date;
}

interface CostSummaryResponse {
  provider: string;
  totalAmount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  breakdown: { service: string; amount: number }[];
}

export class CostService {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.costCollectIntervalSec * 1000;
    this.timer = setInterval(() => this.collect().catch(console.error), intervalMs);
    console.log(`Cost collector started (interval: ${config.costCollectIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * 从 cloud-service 拉取各 provider 的成本汇总，写入 cost_records
   */
  async collect() {
    const providers = await this.getRegisteredProviders();
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // 最近 24 小时

    for (const provider of providers) {
      try {
        const summary = await this.fetchCostFromCloud(provider, start, end);
        for (const item of summary.breakdown) {
          await db.insert(costRecords).values({
            provider: summary.provider,
            region: 'all',
            service: item.service,
            amount: item.amount,
            currency: summary.currency,
            periodStart: start,
            periodEnd: end,
          });
        }
        await eventPublisher.publish('cost.updated', {
          provider: summary.provider,
          totalAmount: summary.totalAmount,
          currency: summary.currency,
        });
      } catch (err) {
        console.error(`Cost collection for ${provider} failed:`, (err as Error).message);
      }
    }
  }

  /**
   * 查询成本汇总（从 cost_records 聚合）
   */
  async getSummary(query: CostQuery) {
    const conditions = [];
    if (query.provider) conditions.push(eq(costRecords.provider, query.provider));
    if (query.start) conditions.push(gte(costRecords.periodStart, query.start));
    if (query.end) conditions.push(lte(costRecords.periodEnd, query.end));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        provider: costRecords.provider,
        service: costRecords.service,
        totalAmount: sql<number>`sum(${costRecords.amount}::numeric)`,
        currency: costRecords.currency,
      })
      .from(costRecords)
      .where(where)
      .groupBy(costRecords.provider, costRecords.service, costRecords.currency);

    return rows;
  }

  /**
   * 查询所有实例的月度成本估算（从 instances.monthlyCost 汇总）
   */
  async getInstanceCosts() {
    return db
      .select({
        id: instances.id,
        name: instances.name,
        provider: instances.provider,
        region: instances.region,
        monthlyCost: instances.monthlyCost,
      })
      .from(instances);
  }

  private async getRegisteredProviders(): Promise<string[]> {
    const res = await fetch(`${config.cloudServiceUrl}/cloud/providers`);
    if (!res.ok) throw new Error(`cloud-service responded ${res.status}`);
    const data = (await res.json()) as { providers: string[] };
    return data.providers;
  }

  private async fetchCostFromCloud(
    provider: string,
    start: Date,
    end: Date
  ): Promise<CostSummaryResponse> {
    // cloud-service 暂无 cost 端点，这里通过 provider 直接调用的替代方案：
    // 实际调用 cloud-service 的内部接口。MVP 阶段先返回占位数据。
    // Phase 6 会完善 cloud-service 的 cost 端点。
    return {
      provider,
      totalAmount: 0,
      currency: provider === 'aliyun' ? 'CNY' : 'USD',
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      breakdown: [],
    };
  }
}

export const costService = new CostService();
```

- [ ] **Step 2: 验证构建（此时 Task 6/7/8/9 均已创建，统一构建）**

Run: `pnpm --filter @cloudops/monitor-service build`
Expected: 编译成功，无类型错误

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/services/cost.service.ts
git commit -m "feat(monitor): add cost collection and analysis service"
```

---

## Task 10: 路由层

**Files:**
- Create: `monitor-service/src/routes/metrics.ts`
- Create: `monitor-service/src/routes/alerts.ts`
- Create: `monitor-service/src/routes/costs.ts`

- [ ] **Step 1: 创建 src/routes/metrics.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { metricService } from '../services/metric.service.js';

export async function metricRoutes(app: FastifyInstance) {
  // 查询实例指标
  app.get('/:instanceId', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const query = request.query as { metric?: string; start?: string; end?: string; limit?: string };
    return metricService.query({
      instanceId,
      metricName: query.metric,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });
  });
}
```

- [ ] **Step 2: 创建 src/routes/alerts.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { alertService } from '../services/alert.service.js';
import { db } from '../db/index.js';
import { notificationChannels } from '../db/schema.js';

const createRuleSchema = z.object({
  name: z.string().min(1).max(128),
  metric: z.string().min(1),
  condition: z.string().min(1),
  duration: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  actions: z.array(z.object({ type: z.enum(['notify', 'suggest', 'auto']), targets: z.array(z.string()) })),
  enabled: z.boolean().optional(),
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(['webhook', 'email', 'slack']),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

export async function alertRoutes(app: FastifyInstance) {
  // ---- 告警规则 ----
  app.get('/rules', async () => alertService.listRules());

  app.get('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    return alertService.getRule(id);
  });

  app.post('/rules', async (request, reply) => {
    const input = createRuleSchema.parse(request.body);
    return reply.status(201).send(await alertService.createRule(input));
  });

  app.put('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    return alertService.updateRule(id, request.body as any);
  });

  app.delete('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    await alertService.deleteRule(id);
    return { ok: true, id };
  });

  // ---- 告警事件 ----
  app.get('/events', async (request) => {
    const query = request.query as { status?: string; severity?: string; limit?: string };
    return alertService.listAlerts({
      status: query.status as any,
      severity: query.severity as any,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });
  });

  app.post('/events/:id/resolve', async (request) => {
    const { id } = request.params as { id: string };
    await alertService.resolveAlert(id);
    return { ok: true, id, status: 'resolved' };
  });

  // ---- 通知渠道 ----
  app.get('/channels', async () => db.select().from(notificationChannels));

  app.post('/channels', async (request, reply) => {
    const input = createChannelSchema.parse(request.body);
    const result = await db.insert(notificationChannels).values(input).returning();
    return reply.status(201).send(result[0]);
  });

  app.delete('/channels/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(notificationChannels).where(eq(notificationChannels.id, id));
    return { ok: true, id };
  });
}
```

- [ ] **Step 3: 创建 src/routes/costs.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { costService } from '../services/cost.service.js';

export async function costRoutes(app: FastifyInstance) {
  // 成本汇总（按 provider/service 聚合）
  app.get('/summary', async (request) => {
    const query = request.query as { provider?: string; start?: string; end?: string };
    return costService.getSummary({
      provider: query.provider,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
    });
  });

  // 实例月度成本
  app.get('/instances', async () => costService.getInstanceCosts());

  // 手动触发成本采集
  app.post('/collect', async () => {
    await costService.collect();
    return { ok: true, message: 'Cost collection triggered' };
  });
}
```

- [ ] **Step 4: 验证构建**

Run: `pnpm --filter @cloudops/monitor-service build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add monitor-service/src/routes/
git commit -m "feat(monitor): add metrics/alerts/costs route handlers"
```

---

## Task 11: 服务入口 + Dockerfile + docker-compose 集成

**Files:**
- Create: `monitor-service/src/index.ts`
- Create: `monitor-service/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `api-gateway/src/routes/proxy.ts`

- [ ] **Step 1: 创建 src/index.ts**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { metricCollector } from './collectors/metric-collector.js';
import { alertEngine } from './services/alert-engine.js';
import { costService } from './services/cost.service.js';
import { metricRoutes } from './routes/metrics.js';
import { alertRoutes } from './routes/alerts.js';
import { costRoutes } from './routes/costs.js';
import { AppError } from '@cloudops/shared';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }
  if (error.validation) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: error.message });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
});

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  service: 'monitor-service',
  timestamp: new Date().toISOString(),
}));

// 注册路由（API Gateway 转发 /monitor/* 到本服务）
await app.register(metricRoutes, { prefix: '/monitor/metrics' });
await app.register(alertRoutes, { prefix: '/monitor/alerts' });
await app.register(costRoutes, { prefix: '/monitor/costs' });

// 启动后台任务
metricCollector.start();
alertEngine.start();
costService.start();

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down monitor-service...');
  metricCollector.stop();
  alertEngine.stop();
  costService.stop();
  app.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Monitor service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 2: 创建 Dockerfile**（复用 cloud-service 模式，含 pnpm 策略禁用）

```dockerfile
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY monitor-service/package.json monitor-service/tsconfig.json monitor-service/drizzle.config.ts ./monitor-service/
COPY monitor-service/migrations ./monitor-service/migrations/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/monitor-service --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY shared/ ./shared/
COPY monitor-service/ ./monitor-service/

RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd monitor-service && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

RUN cp -r monitor-service/migrations monitor-service/dist/migrations

WORKDIR /app/monitor-service

CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: 修改 docker-compose.yml 添加 monitor-service**

在 `cloud-service` 服务块之后添加：

```yaml
  monitor-service:
    build:
      context: .
      dockerfile: monitor-service/Dockerfile
    ports:
      - "3002:3002"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      PORT: 3002
      CLOUD_SERVICE_URL: http://cloud-service:3001
      METRIC_COLLECT_INTERVAL: 300
      ALERT_CHECK_INTERVAL: 60
      COST_COLLECT_INTERVAL: 86400
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      SMTP_FROM: ${SMTP_FROM:-cloudops@noreply.com}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      cloud-service:
        condition: service_started
```

- [ ] **Step 4: 修改 .env.example 添加 monitor-service 配置**

在文件末尾追加：

```bash
# Monitor Service (Phase 3)
METRIC_COLLECT_INTERVAL=300
ALERT_CHECK_INTERVAL=60
COST_COLLECT_INTERVAL=86400

# SMTP (可选，邮件通知)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=cloudops@noreply.com
```

- [ ] **Step 5: 修改 api-gateway 代理路由，添加 /monitor 转发**

检查 `api-gateway/src/routes/proxy.ts`，确保 `/monitor` 路径转发到 `MONITOR_SERVICE_URL`。如果 proxy.ts 使用配置映射，确认 `MONITOR_SERVICE_URL=http://monitor-service:3002` 已在 api-gateway 的环境变量中（docker-compose 已有 `MONITOR_SERVICE_URL` 默认值）。

- [ ] **Step 6: 验证整体构建**

Run: `pnpm -r run build`
Expected: 全部 workspace 项目编译成功

- [ ] **Step 7: Commit**

```bash
git add monitor-service/src/index.ts monitor-service/Dockerfile docker-compose.yml .env.example api-gateway/
git commit -m "feat(monitor): add service entrypoint, Dockerfile, docker-compose integration"
```

---

## Task 12: 端到端验证

**Files:** 无（验证任务）

- [ ] **Step 1: 构建并启动全部服务**

Run: `docker compose up -d --build postgres redis auth-service api-gateway cloud-service monitor-service`
Expected: 6 个容器全部 running

- [ ] **Step 2: 执行 monitor-service 数据库迁移**

Run: `docker compose exec monitor-service node dist/db/migrate.js`
Expected: "Migrations complete."（notification_channels 表创建成功）

- [ ] **Step 3: 验证健康检查**

Run: `curl -s http://localhost:3002/health`
Expected: `{"status":"ok","service":"monitor-service","timestamp":"..."}`

- [ ] **Step 4: 通过 Gateway 验证 monitor 路由可达**

Run: `curl -s http://localhost:3000/monitor/alerts/rules`
Expected: 返回空数组 `[]`（无规则）

- [ ] **Step 5: 创建告警规则**

```bash
curl -s -X POST http://localhost:3000/monitor/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CPU 过高",
    "metric": "cpu_usage_percent",
    "condition": "> 85",
    "duration": "10min",
    "severity": "warning",
    "actions": [{"type": "notify", "targets": ["system"]}]
  }'
```
Expected: 返回创建的规则，含 id

- [ ] **Step 6: 查询告警规则列表**

Run: `curl -s http://localhost:3000/monitor/alerts/rules`
Expected: 返回包含刚创建规则的数组

- [ ] **Step 7: 创建通知渠道**

```bash
curl -s -X POST http://localhost:3000/monitor/alerts/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"test-webhook","type":"webhook","config":{"url":"https://example.com/hook"}}'
```
Expected: 返回创建的渠道

- [ ] **Step 8: 查询成本汇总**

Run: `curl -s http://localhost:3000/monitor/costs/summary`
Expected: 返回空数组（无 cost_records 数据）

- [ ] **Step 9: 验证指标查询端点**

Run: `curl -s http://localhost:3000/monitor/metrics/00000000-0000-0000-0000-000000000000`
Expected: 返回空数组（无指标数据，实例不存在但路由正常）

- [ ] **Step 10: 检查服务日志确认后台任务启动**

Run: `docker compose logs monitor-service --tail 20`
Expected: 日志包含 "Metric collector started"、"Alert engine started"、"Cost collector started"

- [ ] **Step 11: Commit 验证结果**

```bash
git add -A
git commit -m "test(monitor): phase 3 end-to-end verification passed"
```

---

## 自审清单

**Spec 覆盖：**
- [x] 4.1 指标采集（CPU/内存/磁盘/网络/IOPS/费用/运行时长）→ Task 4 metric-collector（5 分钟采集，MVP 先采集 CPU，其余指标扩展通过 metricName 字段支持）
- [x] 4.2 告警引擎（规则配置/4 级严重级别/多通知渠道）→ Task 5/6/7
- [x] 4.3 成本分析（费用数据模型/查询）→ Task 9（AI 优化建议留待 Phase 6）
- [x] 实时推送（alert.fired/alert.resolved/cost.updated）→ Task 8
- [x] 通知渠道（Webhook/邮件/Slack/系统内）→ Task 7
- [x] Monitor Service → Cloud Service 调用 → Task 3/4/9

**类型一致性：**
- AlertSeverity / AlertStatus 复用 shared 包定义
- metric.service / alert.service / cost.service 方法签名在各 task 间一致
- eventPublisher.publish(event, payload) 签名统一
- notifyService.notify(actions, message, severity) 签名统一

**已知简化（留待后续 Phase）：**
- 指标采集 MVP 仅采集 CPU 使用率，其余指标（内存/磁盘/网络）通过 metricName 扩展
- 成本采集 MVP 返回占位数据，真实费用 API 在 Phase 6 完善
- AI 驱动优化建议在 Phase 6 实现
