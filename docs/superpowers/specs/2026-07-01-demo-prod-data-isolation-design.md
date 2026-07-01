# Demo 与生产数据物理隔离设计

> **状态**：已批准，待写实施计划
> **日期**：2026-07-01
> **背景**：现有 demo 模式靠前端 mock（CRUD 页面）+ 后端真实表（AI 功能）两条通路。AI 功能要"活 demo"必须往 public 真实表塞 demo 数据，导致污染生产。本设计通过 PostgreSQL schema 物理隔离彻底解决。

---

## 1. 总体架构

### 核心矛盾

现有 demo 模式有两条数据通路：前端 mock（CRUD 页面）和后端真实表（AI 功能）。要"活 demo"必须让后端 AI 功能也读 demo 数据——但目前后端没有 demo/真实的区分能力，唯一办法是往 `public.*` 真实表里塞 demo 数据，导致污染。

### 解决思路

在后端引入 scope（作用域）概念：每个请求携带 scope 信息（`public` 或 `demo`），后端按 scope 路由到对应 schema 的表。真实用户走 `public.*`，demo 访客走 `demo.*`，物理隔离永不交叉。

### 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│ 前端 (web-console)                                            │
│  isDemoMode → 所有 API 请求带 X-Demo-Mode: true header       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ API Gateway (Koa)                                            │
│  中间件读 X-Demo-Mode → 注入 ctx.state.scope = {            │
│    schema: 'demo'|'public', isDemo: boolean,                 │
│    userId: 'demo-u-1' | realUserId                           │
│  }                                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 业务服务 (cloud/monitor/ai-gateway)                          │
│  数据访问层：scopedDb(scope) → 返回对应 schema 的 Drizzle 表 │
│  所有 db.select().from(instances) → scopedDb(scope).instances│
└─────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────┬──────────────────────────────┐
│ public schema (真实数据)      │ demo schema (演示数据)        │
│ cloud_accounts, instances...  │ demo.cloud_accounts,         │
│ 真实 Render/AWS 资源          │ demo.instances...            │
│ 由 cloud-service 同步写入      │ 由 demo-data.sql 写入        │
│ 预测/自愈引擎读这里            │ demo 模式下 AI 功能读这里     │
└──────────────────────────────┴──────────────────────────────┘
```

### scope 信号流

1. 前端 `isDemoMode=true` → axios 拦截器给所有请求加 `X-Demo-Mode: true`
2. API Gateway 中间件读 header → 注入 `ctx.state.scope`
3. Gateway 转发给业务服务时透传 header
4. 业务服务中间件读 header → 注入 `request.scope`
5. 数据访问层用 `request.scope.schema` 选表

### 定时任务双跑

预测引擎、自愈引擎、成本采集这些后台任务对两个 schema 各跑一遍。demo schema 数据量小（8 实例），额外开销可忽略。告警触发时带 `scope=demo` 标记，写回 demo 表。

### 关键边界

- **配置类表不分 demo/真实**：`users`、`llm_providers`、`cloud_accounts` 只在 `public`。demo 用户不写 users 表，用 JWT 里的固定 `demo-u-1`。demo 模式下 `cloud_accounts` 读 public 表展示真实账号配置（只读，不能改）。
- **业务数据表分 demo/真实**：`instances`、`cloud_resources`、`alerts`、`alert_rules`、`metrics`、`cost_records`、`token_usage`、`remediation_runs`、`knowledge_base`、`metric_predictions` 都有 demo 镜像。
- **审计日志表不分**：`audit_logs` 统一在 public，demo 操作也记审计（标记 `scope=demo`），便于追溯谁在 demo 做了什么。

---

## 2. 数据访问层抽象（scopedDb）

### Scope 类型定义

```typescript
// shared/src/db/scope.ts
export type DbSchema = 'public' | 'demo';

export interface RequestScope {
  schema: DbSchema;
  isDemo: boolean;
  userId: string;  // 'demo-u-1' 或真实 userId
}

export const PUBLIC_SCOPE: RequestScope = { schema: 'public', isDemo: false, userId: '' };
```

### Drizzle 表定义复用

当前 schema.ts 用 `pgTable('instances', {...})` 硬编码到 public。改为工厂函数，同一个表定义按 schema 生成两份：

```typescript
// shared/src/db/schema-factory.ts
import { pgSchema, pgTable, uuid, varchar, ... } from 'drizzle-orm/pg-core';

const publicSchema = pgSchema('public');
const demoSchema = pgSchema('demo');

export function createTables(schema: PgSchema) {
  const instances = schema.table('instances', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    // ... 与现有定义完全一致
  });

  const alerts = schema.table('alerts', { ... });
  // ... 其他业务表

  return { instances, alerts, alertRules, metrics, costRecords, ... };
}

export const publicTables = createTables(publicSchema);
export const demoTables = createTables(demoSchema);
```

### scopedDb 工厂

```typescript
// shared/src/db/scoped-db.ts
import { publicTables, demoTables } from './schema-factory';

export interface ScopedTables {
  instances: PgTableWithColumns<...>;
  alerts: PgTableWithColumns<...>;
  // ...
}

export function scopedDb(scope: RequestScope): ScopedTables {
  return scope.schema === 'demo' ? demoTables : publicTables;
}
```

### 各服务数据访问层改造

所有 `db.select().from(instances)` 调用点加 scope 参数。现有 cloud-service / monitor-service / ai-gateway 的 service 层方法签名加 `scope: RequestScope` 首参。

```typescript
// 改造前
import { instances } from '../db/schema';
export async function listInstances() {
  return db.select().from(instances);
}

// 改造后
import { scopedDb } from '../../../shared/src/db/scoped-db';
import type { RequestScope } from '../../../shared/src/db/scope';

export async function listInstances(scope: RequestScope) {
  const t = scopedDb(scope);
  return db.select().from(t.instances);
}
```

### scope 注入位置

| 服务 | 注入位置 |
|---|---|
| api-gateway (Koa) | `ctx.state.scope = middleware(ctx)` 中间件读 header |
| cloud-service (Fastify) | `request.scope = middleware(request)` onRequest hook 读 header |
| monitor-service (Fastify) | 同上 |
| ai-gateway (Fastify) | 同上（内部端点接收 monitor-service 转发的 header） |

### cloud-service 同步任务

cloud-service 启动时同步真实资源 → 写 `public.*`。demo 模式下不同步真实资源（demo 数据是静态快照），保持 demo.instances 稳定。同步任务的 sync API 加 scope 检查：`if (scope.isDemo) return { skipped: 'demo mode' }`。

### 关键设计点

1. **类型安全**：scopedDb 返回的表对象和原 instances 类型完全一致，调用方代码改动仅是 `from(instances)` → `from(t.instances)`，IDE 重构友好
2. **编译期检查**：如果某个表忘加到 createTables 工厂，scopedDb(scope).xxx 编译报错，漏改不会上线
3. **现有 service 方法加 scope 首参**：breaking change，但调用点都集中在 route 层，可控

---

## 3. Scope 信号传递链路

### 前端：header 注入

现有 axios client 加拦截器。isDemoMode 来自 zustand persist store（已有）。

```typescript
// web-console/src/api/client.ts
import { useDemoStore } from '@/stores/demo';

client.interceptors.request.use((config) => {
  if (useDemoStore.getState().isDemoMode) {
    config.headers['X-Demo-Mode'] = 'true';
  }
  return config;
});
```

WebSocket 连接同样带信号——连接 URL 加 query param：`/ws?demo=1`。

### API Gateway（Koa）：中间件注入

```typescript
// api-gateway/src/middleware/scope.ts
export async function scopeMiddleware(ctx: KoaContext, next: Next) {
  const isDemo = ctx.headers['x-demo-mode'] === 'true';
  ctx.state.scope = {
    schema: isDemo ? 'demo' : 'public',
    isDemo,
    userId: isDemo ? 'demo-u-1' : (ctx.state.user?.id ?? ''),
  };
  await next();
}
```

**JWT 验证的特殊处理**：demo 模式的 JWT 是前端伪造的（`demo-header.payload.demo-signature`），不能走真实 JWT 校验。scope 中间件要在 auth 中间件之前执行，auth 中间件检查 `ctx.state.scope.isDemo` 时跳过 JWT 校验。

### Gateway 转发：透传 header

```typescript
const upstreamHeaders = {
  ...ctx.headers,
  'x-demo-mode': ctx.state.scope.isDemo ? 'true' : 'false',
  'x-scope-user-id': ctx.state.scope.userId,
};
```

### 业务服务（Fastify）：onRequest hook

cloud-service / monitor-service / ai-gateway 三个 Fastify 服务都加同样的 hook：

```typescript
app.addHook('onRequest', async (request) => {
  const isDemo = request.headers['x-demo-mode'] === 'true';
  request.scope = {
    schema: isDemo ? 'demo' : 'public',
    isDemo,
    userId: (request.headers['x-scope-user-id'] as string) || '',
  };
});

declare module 'fastify' {
  interface FastifyRequest {
    scope: RequestScope;
  }
}
```

### 路由层调用

```typescript
// cloud-service/src/routes/instances.ts
app.get('/', async (request) => {
  return instanceService.listInstances(request.scope);
});

app.post('/sync', async (request) => {
  if (request.scope.isDemo) {
    return [{ provider: 'demo', skipped: 'demo mode does not sync real resources' }];
  }
  return syncService.syncAll();
});
```

### ai-gateway 内部端点

monitor-service 调用时透传 X-Demo-Mode header：

```typescript
await fetch(`${config.aiGatewayUrl}/internal/insight`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Demo-Mode': scope.isDemo ? 'true' : 'false',
  },
  body: JSON.stringify({ ...payload, scope: scope.schema }),
});
```

### 定时任务的 scope

定时任务无 HTTP 请求，双跑两个 schema：

```typescript
async function runPredictionCycle() {
  await analyzePredictions(PUBLIC_SCOPE);
  await analyzePredictions({ schema: 'demo', isDemo: true, userId: 'demo-u-1' });
}
```

自愈引擎的 onAlertFired 回调用告警记录时的 scope。

### 关键边界

1. **JWT 跳过**：demo JWT 不走真实校验，scope 中间件必须在 auth 之前
2. **内部服务调用透传**：monitor-service → ai-gateway 必须透传 X-Demo-Mode
3. **定时任务无请求**：双跑两个 schema
4. **WebSocket**：demo 模式下 chat 也是 mock（现有机制），不经过后端真实 LLM 调用

---

## 4. demo schema 初始化与数据管理

### demo schema 建表

新增 `shared/src/db/migrations/000_demo_schema.sql`，一次性建 demo schema 下所有业务表，结构与 public 完全一致（去掉 cloudAccountId 外键）。

```sql
CREATE SCHEMA IF NOT EXISTS demo;

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

CREATE TABLE IF NOT EXISTS demo.alerts (...);
CREATE TABLE IF NOT EXISTS demo.alert_rules (...);
CREATE TABLE IF NOT EXISTS demo.metrics (...);
CREATE TABLE IF NOT EXISTS demo.cost_records (...);
CREATE TABLE IF NOT EXISTS demo.cloud_resources (...);
CREATE TABLE IF NOT EXISTS demo.token_usage (...);
CREATE TABLE IF NOT EXISTS demo.remediation_runs (...);
CREATE TABLE IF NOT EXISTS demo.remediation_policies (...);
CREATE TABLE IF NOT EXISTS demo.knowledge_base (...);
CREATE TABLE IF NOT EXISTS demo.metric_predictions (...);

-- demo 默认自愈策略
INSERT INTO demo.remediation_policies (name, action_type, env_tags, auto_execute) VALUES
('重启实例', 'reboot_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":true,"prod":false}'::jsonb),
('停止实例', 'stop_instance', '["dev","uat","prod"]'::jsonb, '{"dev":true,"uat":false,"prod":false}'::jsonb),
('扩容实例', 'scale_up', '["dev","uat","prod"]'::jsonb, '{"dev":false,"uat":false,"prod":false}'::jsonb)
ON CONFLICT DO NOTHING;
```

### demo-data.sql 重写

现有 `scripts/demo-data.sql` 改写——所有 INSERT 指向 `demo.*` 表，开头 TRUNCATE 只清 demo schema：

```sql
BEGIN;
TRUNCATE demo.instances, demo.alerts, demo.alert_rules,
         demo.cost_records, demo.metrics, demo.cloud_resources,
         demo.token_usage, demo.remediation_runs, demo.knowledge_base,
         demo.metric_predictions CASCADE;

INSERT INTO demo.instances (...) VALUES (...);
-- ...（所有 INSERT 指向 demo.* 表）
COMMIT;
```

护栏保留：即使误执行到生产，也只动 demo schema，public 真实数据毫发无损。

### 启动时初始化 demo 数据

docker-compose 启动时，start.sh 在 migrations 之后执行 demo-data.sql（仅本地开发环境）：

```sh
if [ "$DEMO_AUTO_SEED" = "true" ] && [ -f /app/scripts/demo-data.sql ]; then
  echo "--- Seeding demo data ---"
  PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d $POSTGRES_DB \
    -f /app/scripts/demo-data.sql 2>&1 || echo "WARNING: demo seed failed"
fi
```

- **本地开发**：`.env` 设 `DEMO_AUTO_SEED=true`，每次 `docker compose up` 自动重建 demo 数据
- **生产 Render**：`render.yaml` 不设 `DEMO_AUTO_SEED`（默认 false），生产永远不执行 demo seed

Dockerfile 增加 COPY：`COPY scripts ./scripts`。

### cleanup 脚本简化

`scripts/cleanup-demo-data.sql` 直接 TRUNCATE demo schema：

```sql
TRUNCATE demo.instances, demo.alerts, demo.alert_rules,
         demo.cost_records, demo.metrics, demo.cloud_resources,
         demo.token_usage, demo.remediation_runs, demo.knowledge_base,
         demo.metric_predictions CASCADE;
```

### demo 数据内容

与现有 demo-data.sql 一致（8 实例 + 3 告警 + 12 成本 + 6 指标 + 4 token + 48 预测指标 + 2 自愈 + 5 知识库），只是表名加 `demo.` 前缀。

### 关键边界

1. **demo schema 只本地和 demo 环境有数据**，生产 Render 的 demo schema 表存在但为空
2. **DEMO_AUTO_SEED 只在本地 .env 开启**，render.yaml 不设此变量
3. **demo-data.sql 物理隔离**：即使误执行到生产，也只清 demo schema

---

## 5. 前端整合与 demo 入口

### 前端 demo 状态管理（保留现有机制）

现有 `web-console/src/stores/demo.ts` store 不动——`isDemoMode` persist 在 localStorage。登录页"免密体验"按钮已有。

### axios 拦截器：注入 X-Demo-Mode header

```typescript
// web-console/src/api/client.ts
client.interceptors.request.use((config) => {
  if (useDemoStore.getState().isDemoMode) {
    config.headers['X-Demo-Mode'] = 'true';
  }
  return config;
});
```

### 各 hook 简化：移除 mock 分支

现有 useInstances、useResources、useDashboard 等 hook 都有 `isDemoMode ? demoXxx() : api.xxx()` 三元分支。改造后统一调真实 API：

```typescript
// 改造前
export function useInstances() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['instances', isDemoMode],
    queryFn: () => isDemoMode ? demoListInstances() : cloudApi.listInstances(),
  });
}

// 改造后
export function useInstances() {
  return useQuery({
    queryKey: ['instances'],
    queryFn: () => cloudApi.listInstances(),
  });
}
```

queryKey 不再含 isDemoMode——切换 demo/真实是登出重登的场景，不存在同一页面内切换。

### demo mock 数据移除

`web-console/src/lib/demo/demo-api.ts` 整个文件移除。各 hook 里的 `demoListXxx`、`demoGetXxx`、`demoCreateXxx`、`demoDeleteXxx` 导入一并清理。

### DemoBanner 组件

页面顶部加 demo 模式提示横幅：

```tsx
// web-console/src/components/common/DemoBanner.tsx
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

放在 App layout 顶部（Navbar 下方）。

### 写操作的处理

demo 模式下用户可以做创建/删除操作（演示 CRUD），这些操作写 demo schema。后端 service 层用 scope 写 demo 表即可。

**唯一限制**：cloud-service 的 sync 接口在 demo 模式下跳过——demo 数据是静态快照，不同步真实云资源。

### AI 功能页面

Dashboard 的 AI 洞察、Monitor 的预测/自愈/知识库页面在 demo 模式下正常工作——前端调真实 API，后端读 demo schema 数据。AI 洞察的 LLM 调用、预测引擎的分析都基于 demo 数据实时跑。

### WebSocket（AI 对话）

现有 chat store 在 demo 模式下用 mock client。这个保留不动——AI 对话是独立功能，demo 模式下继续用 mock，不消耗真实 LLM token。只有 AI 洞察/预测/自愈走真实后端。

### 关键边界

1. **前端 mock 数据移除**：demo-api.ts 和各 hook 的 mock 分支清理，统一走真实 API
2. **X-Demo-Mode header 自动注入**：axios 拦截器统一处理，各 hook 无感知
3. **WebSocket chat 保留 mock**：demo 模式下 AI 对话继续用前端 mock
4. **DemoBanner 提示**：用户清楚自己在 demo 模式

---

## 6. 后端 AI 功能的 scope 适配

### 预测引擎（prediction-engine）

双跑——对 public 和 demo 各分析一遍：

```typescript
async function runCycle() {
  await analyzeSchema(PUBLIC_SCOPE);
  await analyzeSchema({ schema: 'demo', isDemo: true, userId: 'demo-u-1' });
}

async function analyzeSchema(scope: RequestScope) {
  const t = scopedDb(scope);
  const instances = await db.select().from(t.instances)
    .where(eq(t.instances.status, 'running'));
  // 对每个实例查对应 schema 的 metrics 历史趋势
  // 线性回归 → 写入对应 schema 的 metric_predictions
}
```

demo schema 数据量固定（8 实例 + 48 条预测指标），单次分析 <1 秒，双跑开销可忽略。

### 自愈引擎（remediation-engine）

告警触发时带 scope，整条链路用该 scope：

```typescript
async function onAlertFired(alert: Alert, scope: RequestScope) {
  const t = scopedDb(scope);
  const plan = await callAnalyzeRemediation({
    alert,
    instance: await getInstance(alert.instanceId, scope),
    scope: scope.schema,
  });
  const policy = await getPolicy(plan.action, scope);
  if (scope.isDemo) {
    // demo 模式模拟执行，不真正操作云资源
    await recordDemoRun(alert, plan, policy);
    return;
  }
  // 真实执行...
}
```

**demo 模式下的特殊处理**：不真正执行 reboot/stop/scale 操作（demo 实例是假的，调云 API 会失败）。改为模拟执行——直接写 `remediation_runs` 记录为 `success`，verification_result 写预置成功信息。展示自愈闭环完整流程，不依赖真实云操作。

### AI 洞察（dashboard-insight）

接收 scope 字段，读对应 schema：

```typescript
export async function generateDashboardInsight(body: {
  scope?: 'public' | 'demo';
  ...
}) {
  const scope: RequestScope = body.scope === 'demo'
    ? { schema: 'demo', isDemo: true, userId: 'demo-u-1' }
    : PUBLIC_SCOPE;
  const t = scopedDb(scope);
  const instances = await db.select().from(t.instances)...;
  const alerts = await db.select().from(t.alerts)...;
  // LLM 分析逻辑不变
}
```

**Token 使用记录**：demo 模式下 LLM 调用的 token 记录写 `demo.token_usage`，不污染真实 token 统计。

### 知识库 RAG（knowledge-base）

搜索时按 scope 路由：

```typescript
export async function searchKnowledge(symptom: string, metric: string, scope: RequestScope) {
  const t = scopedDb(scope);
  // 向量检索 + 关键词检索，数据源是 demo.knowledge_base 或 public.knowledge_base
}
```

自愈引擎成功后记录新案例也按 scope 写对应表。

### monitor-service 调 ai-gateway 透传 scope

所有内部服务调用透传 scope 信号：

```typescript
await fetch(`${config.aiGatewayUrl}/internal/analyze-remediation`, {
  headers: {
    'X-Demo-Mode': scope.isDemo ? 'true' : 'false',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ ...payload, scope: scope.schema }),
});
```

### 关键边界

1. **预测引擎双跑**：public + demo 各分析一遍
2. **自愈引擎 demo 模拟执行**：不调真实云 API，直接记录 success
3. **Token 记录分 schema**：demo 的 LLM 消耗不计入真实统计
4. **知识库按 scope 隔离**：demo 预置案例 vs 真实历史案例

---

## 7. Migration 策略与回滚预案

### Migration 文件组织

**新增**：
- `shared/src/db/migrations/000_demo_schema.sql` — 一次性建 demo schema + 所有业务表 + 默认策略（幂等，`CREATE SCHEMA/TABLE IF NOT EXISTS`）

**现有 migrations 保持不变**：各服务 `001_*.sql` ~ `005_*.sql` 继续建 public 表。

### migrate.ts 改造

各服务的 migrate.ts 在执行完自己的 migrations 后，额外执行 demo-schema.sql：

```typescript
export async function runMigrationsWithDemo(serviceName: string, migrationsDir: string) {
  // 1. 执行原有 service migrations（public 表）
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    await runFile(sql, readFileSync(join(migrationsDir, file), 'utf-8'));
  }
  // 2. 执行 demo schema（幂等）
  const demoSchemaPath = join(process.cwd(), 'shared/src/db/migrations/000_demo_schema.sql');
  if (existsSync(demoSchemaPath)) {
    await runFile(sql, readFileSync(demoSchemaPath, 'utf-8'));
  }
}
```

**幂等保证**：demo-schema.sql 全部用 `IF NOT EXISTS`，多服务启动时先到先建。

### demo-data.sql 分发

Dockerfile 增加 `COPY scripts ./scripts`。start.sh 的 DEMO_AUTO_SEED 逻辑：
- 本地 `.env` 设 `DEMO_AUTO_SEED=true`
- 生产 `render.yaml` 不设此变量

### 数据迁移：现有 demo 残留处理

部署新代码前：
1. 先跑 `scripts/cleanup-demo-data.sql` 清 public 残留
2. 部署新代码（migration 自动建 demo schema）
3. 手动跑 `scripts/demo-data.sql`（新版本，写 demo schema）初始化 demo 数据

生产 Render 不执行步骤 3。

### 渲染 Schema 权限

PostgreSQL 默认 schema 权限对当前用户开放。docker-compose 的 POSTGRES_USER=multicloud 是 superuser。Render 的 PostgreSQL 用户也是数据库 owner。不需要额外 GRANT。

### 回滚预案

1. **代码回滚**：`git revert` 对应 commit，重新部署
2. **demo schema 清理**（可选）：`DROP SCHEMA demo CASCADE;` 不影响 public 真实数据
3. **public 数据安全**：整个方案对 public schema 零破坏，回滚后真实数据原样可用

### 版本兼容

- 旧前端（无 X-Demo-Mode header）→ 后端 scope 默认 public，正常走真实数据
- 新前端 + 旧后端（无 scope 中间件）→ 前端发的 X-Demo-Mode header 被忽略，demo 模式无效果（降级为真实模式）

前向兼容性保证灰度部署时不会 break。

### 关键边界

1. **demo schema 幂等创建**：多服务启动安全
2. **public 零破坏**：回滚安全，真实数据不受影响
3. **DEMO_AUTO_SEED 仅本地**：生产不会自动 seed
4. **前向兼容**：新旧版本混用不 break

---

## 实施范围总结

### 改动文件清单

**新增**：
- `shared/src/db/scope.ts` — RequestScope 类型
- `shared/src/db/schema-factory.ts` — 表定义工厂
- `shared/src/db/scoped-db.ts` — scopedDb 工厂
- `shared/src/db/migrations/000_demo_schema.sql` — demo schema 建表
- `web-console/src/components/common/DemoBanner.tsx` — demo 横幅
- `api-gateway/src/middleware/scope.ts` — scope 中间件

**修改**：
- `scripts/demo-data.sql` — 改写为 demo.* 表
- `scripts/cleanup-demo-data.sql` — 简化为 TRUNCATE demo.*
- `start.sh` — 加 DEMO_AUTO_SEED 逻辑
- `Dockerfile` — COPY scripts
- `web-console/src/api/client.ts` — axios 拦截器
- `web-console/src/hooks/*.ts` — 移除 mock 分支（10+ 文件）
- `web-console/src/lib/demo/demo-api.ts` — 移除整个文件
- `cloud-service/src/services/*.ts` — 加 scope 参数
- `cloud-service/src/routes/*.ts` — 传 request.scope
- `cloud-service/src/index.ts` — onRequest hook
- `monitor-service/src/services/*.ts` — 加 scope 参数
- `monitor-service/src/routes/*.ts` — 传 request.scope
- `monitor-service/src/index.ts` — onRequest hook
- `monitor-service/src/services/prediction-engine.ts` — 双跑
- `monitor-service/src/services/remediation-engine.ts` — demo 模拟执行
- `ai-gateway/src/index.ts` — onRequest hook
- `ai-gateway/src/internal/*.ts` — 接收 scope 字段
- `api-gateway/src/index.ts` — scope 中间件 + 透传

### YAGNI 检查

- ✅ 移除前端 mock 数据层（demo-api.ts + 各 hook mock 分支）——用后端 demo schema 替代
- ✅ 不引入额外的 demo 用户管理——demo 用户固定 `demo-u-1`
- ✅ 不引入 per-tenant 隔离——只有 public/demo 两个 schema
- ✅ 不做 demo 数据版本管理——每次重建，保持新鲜
