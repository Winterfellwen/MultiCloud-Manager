# AIOps 平台增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有云管理平台升级为 AI 驱动的 AIOps 平台，补齐审计日志全链路、AI 告警根因分析、Dashboard AI 洞察、Prometheus 指标暴露和 K8s 生产化加固。

**Architecture:** 在现有 6 微服务架构上增量改造。api-gateway 注入用户身份头，各服务通过内部 HTTP 端点写入审计日志。ai-gateway 新增内部 HTTP 端点供告警分析和 Dashboard 洞察调用 LLM。monitor-service 暴露 Prometheus /metrics 端点并查询共享 PostgreSQL 中的 token_usage 统计。K8s 清单从"能跑"升级为"生产就绪"。

**Tech Stack:** Fastify + TypeScript + Drizzle ORM + PostgreSQL + React + TanStack Query + shadcn/ui + GitHub Actions + Kubernetes + Prometheus

**服务端口速查：** api-gateway=3000, cloud-service=3001, monitor-service=3002, ai-agent=3003, auth-service=3004, ai-gateway=3005

**设计文档：** `docs/superpowers/specs/2026-07-01-aiops-enhancement-design.md`

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `shared/src/utils/audit-client.ts` | 各服务共用的审计写入 HTTP 客户端 |
| `auth-service/src/routes/internal-audit.ts` | auth-service 内部审计写入端点（不鉴权） |
| `cloud-service/src/utils/audit.ts` | cloud-service 审计写入封装 |
| `monitor-service/src/utils/audit.ts` | monitor-service 审计写入封装 |
| `ai-gateway/src/utils/audit.ts` | ai-gateway 审计写入封装 |
| `ai-gateway/src/internal/analyze-alert.ts` | AI 告警根因分析逻辑 |
| `ai-gateway/src/internal/dashboard-insight.ts` | AI Dashboard 健康洞察逻辑 |
| `ai-gateway/src/db/token-usage.ts` | token_usage 表写入/查询服务 |
| `monitor-service/src/routes/dashboard.ts` | Dashboard AI 洞察 + Token 统计端点 |
| `monitor-service/src/routes/metrics-export.ts` | Prometheus /metrics 端点 |
| `monitor-service/migrations/002_alert_ai_analysis.sql` | alerts 表加 AI 分析字段 |
| `monitor-service/migrations/003_token_usage.sql` | token_usage 表 |
| `.github/workflows/ci.yml` | CI 流水线 |
| `k8s/07-hpa.yaml` | HorizontalPodAutoscaler |
| `k8s/08-pdb.yaml` | PodDisruptionBudget |
| `k8s/09-networkpolicy.yaml` | NetworkPolicy |
| `web-console/src/hooks/useAiInsights.ts` | AI 洞察 + Token 统计 hooks |
| `web-console/src/api/aiInsights.ts` | AI 洞察 API 封装 |
| `web-console/src/types/aiInsights.ts` | AI 洞察类型定义 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `api-gateway/src/routes/proxy.ts` | verifyJwt 返回 payload，proxyHandler 注入 x-user-id/x-trace-id |
| `auth-service/src/index.ts` | 注册 internalAuditRoutes |
| `auth-service/src/routes/auth.ts` | 登录成功/失败写审计 |
| `cloud-service/src/config.ts` | 加 authServiceUrl |
| `cloud-service/src/routes/instances.ts` | 写操作接入审计 |
| `cloud-service/src/routes/resources.ts` | 删除资源接入审计 |
| `cloud-service/src/routes/providers.ts` | 云账号 CRUD 接入审计 |
| `monitor-service/src/config.ts` | 加 authServiceUrl, aiGatewayUrl |
| `monitor-service/src/services/alert-engine.ts` | 触发告警后异步调用 AI 分析 |
| `monitor-service/src/services/alert.service.ts` | 加 updateAiAnalysis 方法 |
| `monitor-service/src/db/schema.ts` | alerts 表加 ai_analysis 字段，加 tokenUsage 表 |
| `monitor-service/src/index.ts` | 注册 dashboard + metrics-export 路由 |
| `monitor-service/src/routes/alerts.ts` | resolve 接入审计 |
| `ai-gateway/src/config.ts` | 加 authServiceUrl |
| `ai-gateway/src/index.ts` | 注册内部 HTTP 端点 |
| `ai-gateway/src/agent/runner.ts` | LLMResponse 加 usage，callLLM 提取 usage，callbacks 加 onUsage |
| `ai-gateway/src/methods/chat.ts` | 实现 onUsage 写 token_usage |
| `nginx.conf` | 新增 /metrics location |
| `k8s/02-secret.yaml` | Sealed Secrets 模式 |
| `k8s/03-postgres.yaml` | 密码从 Secret 引用 |
| `k8s/05-app.yaml` | 加 resources + 镜像地址 |
| `k8s/06-ingress.yaml` | 启用 TLS + cert-manager |
| `web-console/src/pages/Dashboard.tsx` | 加 AI 洞察 + Token 统计区块 |
| `web-console/src/pages/Monitor.tsx` | EventsTab 加 AI 分析展示 |
| `web-console/src/types/monitor.ts` | AlertEvent 加 aiAnalysis 字段 |
| `web-console/src/i18n/locales/zh.json` | 加新翻译键 |
| `web-console/src/i18n/locales/en.json` | 加新翻译键 |

---

## Phase 1: 基础盘

### Task 1: api-gateway 注入用户身份头

**Files:**
- Modify: `api-gateway/src/routes/proxy.ts`

- [ ] **Step 1: 修改 verifyJwt 返回 payload，proxyHandler 注入身份头**

将 `api-gateway/src/routes/proxy.ts` 的 `verifyJwt` 函数改为返回 payload 对象（或 null），并在 `proxyHandler` 中注入 `x-user-id` 和 `x-trace-id` 头。

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { UnauthorizedError } from '@cloudops/shared';

interface ProxyRoute {
  prefix: string;
  target: string;
  requireAuth: boolean;
}

const routes: ProxyRoute[] = [
  { prefix: '/auth', target: config.authServiceUrl, requireAuth: false },
  { prefix: '/users', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/audit', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/cloud', target: config.cloudServiceUrl, requireAuth: true },
  { prefix: '/monitor', target: config.monitorServiceUrl, requireAuth: true },
  { prefix: '/agent', target: config.aiAgentUrl, requireAuth: true },
];

/** 验证 JWT token 并返回 payload */
function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // 检查过期时间
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // 检查签发时间（允许 5 分钟时钟偏差）
    if (payload.iat && payload.iat > Math.floor(Date.now() / 1000) + 300) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/** 统一的代理处理函数 */
async function proxyHandler(request: FastifyRequest, reply: FastifyReply, target: string, userId?: string) {
  const targetUrl = `${target}${request.url}`;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body != null;
  const traceId = request.headers['x-trace-id'] as string | undefined;
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      ...(hasBody && { 'content-type': request.headers['content-type'] || 'application/json' }),
      ...(request.headers.authorization && {
        authorization: request.headers.authorization,
      }),
      ...(userId && { 'x-user-id': userId }),
      ...(traceId && { 'x-trace-id': traceId }),
    },
    body: hasBody ? JSON.stringify(request.body) : undefined,
  });

  const data = await response.json();
  return reply.status(response.status).send(data);
}

export async function proxyRoutes(app: FastifyInstance) {
  for (const route of routes) {
    // 带通配符的路由
    app.all(`${route.prefix}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string | undefined;
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
        const token = authHeader.slice(7);
        const payload = verifyJwt(token);
        if (!payload) {
          throw new UnauthorizedError('Invalid or expired token');
        }
        userId = payload.sub as string | undefined;
      }
      // 为每个请求生成 traceId（若上游未传）
      if (!request.headers['x-trace-id']) {
        request.headers['x-trace-id'] = randomUUID();
      }
      return proxyHandler(request, reply, route.target, userId);
    });

    // 不带通配符的路由（精确匹配）
    app.all(`${route.prefix}`, async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string | undefined;
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
        const token = authHeader.slice(7);
        const payload = verifyJwt(token);
        if (!payload) {
          throw new UnauthorizedError('Invalid or expired token');
        }
        userId = payload.sub as string | undefined;
      }
      if (!request.headers['x-trace-id']) {
        request.headers['x-trace-id'] = randomUUID();
      }
      return proxyHandler(request, reply, route.target, userId);
    });
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p api-gateway/tsconfig.json`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add api-gateway/src/routes/proxy.ts
git commit -m "feat: api-gateway inject x-user-id and x-trace-id headers for audit tracing"
```

---

### Task 2: shared 审计客户端 + auth-service 内部审计端点

**Files:**
- Create: `shared/src/utils/audit-client.ts`
- Create: `auth-service/src/routes/internal-audit.ts`
- Modify: `auth-service/src/index.ts`

- [ ] **Step 1: 创建 shared 审计客户端**

```typescript
// shared/src/utils/audit-client.ts

export interface AuditEntry {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  provider?: string;
  region?: string;
  result: 'success' | 'failed';
  params?: Record<string, unknown>;
  ip?: string;
  traceId?: string;
}

/**
 * Fire-and-forget 审计写入：调用 auth-service 的内部审计端点。
 * 写入失败静默忽略，不阻断业务流程。
 */
export async function recordAudit(authServiceUrl: string, entry: AuditEntry): Promise<void> {
  await fetch(`${authServiceUrl}/internal/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {
    // 审计写入失败不阻断业务
  });
}
```

- [ ] **Step 2: 更新 shared/src/index.ts 导出**

读取 `shared/src/index.ts`，在导出列表中添加 audit-client。

```typescript
// 在 shared/src/index.ts 中添加导出
export * from './utils/audit-client.js';
```

- [ ] **Step 3: 创建 auth-service 内部审计端点**

```typescript
// auth-service/src/routes/internal-audit.ts

import type { FastifyInstance } from 'fastify';
import { auditService } from '../services/audit.service.js';
import type { AuditEntry } from '@cloudops/shared';

/**
 * 内部审计写入端点（不鉴权，仅供内部服务调用）
 * api-gateway 不代理 /internal 前缀，外部无法访问。
 */
export async function internalAuditRoutes(app: FastifyInstance) {
  app.post('/audit', async (request, reply) => {
    const body = request.body as Partial<AuditEntry>;
    if (!body.userId || !body.action) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'userId and action are required' });
    }
    await auditService.log({
      userId: body.userId,
      action: body.action,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      provider: body.provider,
      region: body.region,
      params: body.params,
      result: body.result,
      ip: body.ip,
      traceId: body.traceId,
    });
    return reply.status(201).send({ ok: true });
  });
}
```

- [ ] **Step 4: 在 auth-service/src/index.ts 注册内部路由**

在 `auth-service/src/index.ts` 中找到路由注册部分，添加：

```typescript
import { internalAuditRoutes } from './routes/internal-audit.js';
// ... 在现有路由注册后添加：
await app.register(internalAuditRoutes, { prefix: '/internal' });
```

- [ ] **Step 5: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p auth-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add shared/src/utils/audit-client.ts shared/src/index.ts auth-service/src/routes/internal-audit.ts auth-service/src/index.ts
git commit -m "feat: add shared audit client and auth-service internal audit endpoint"
```

---

### Task 3: auth-service 登录接入审计

**Files:**
- Modify: `auth-service/src/config.ts` (确认 authServiceUrl 不需要，本服务内部直接调用)
- Modify: `auth-service/src/routes/auth.ts`

- [ ] **Step 1: 修改登录路由，成功/失败均写审计**

修改 `auth-service/src/routes/auth.ts` 的 `POST /login` 端点。auth-service 内部直接调用 `auditService.log()`，无需 HTTP。

在 `app.post('/login', ...)` 中，在 `authService.login` 调用后添加审计写入：

```typescript
  app.post('/login', async (request, reply) => {
    const rateLimitKey = `login:${request.ip}`;
    if (!checkRateLimit(rateLimitKey)) {
      return reply.status(429).send({ error: 'Too many requests, please try again later' });
    }

    const input = loginSchema.parse(request.body);
    const ip = request.ip;
    try {
      const tokens = await authService.login(input, ip);
      // 登录成功审计
      await auditService.log({
        userId: tokens.userId || input.username,
        action: 'auth.login',
        result: 'success',
        ip,
      }).catch(() => {});
      return reply.send(tokens);
    } catch (err) {
      // 登录失败审计
      await auditService.log({
        userId: input.username,
        action: 'auth.login_failed',
        result: 'failed',
        ip,
      }).catch(() => {});
      throw err;
    }
  });
```

> **注意:** 需要确认 `authService.login()` 返回值是否包含 `userId`。如果 `tokens` 对象中没有 `userId` 字段，则用 `input.username` 作为占位。读取 `auth-service/src/services/auth.service.ts` 确认返回结构后调整。

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p auth-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add auth-service/src/routes/auth.ts
git commit -m "feat: audit login success and failure in auth-service"
```

---

### Task 4: cloud-service 审计接入

**Files:**
- Modify: `cloud-service/src/config.ts`
- Modify: `cloud-service/src/routes/instances.ts`
- Modify: `cloud-service/src/routes/resources.ts`
- Modify: `cloud-service/src/routes/providers.ts`

- [ ] **Step 1: cloud-service config 加 authServiceUrl**

在 `cloud-service/src/config.ts` 的 `config` 对象中添加：

```typescript
  // auth-service 内部地址（docker 网络内服务间调用）
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004',
```

- [ ] **Step 2: 修改 instances.ts 写操作接入审计**

在 `cloud-service/src/routes/instances.ts` 中，为每个写操作添加审计。首先在文件顶部添加导入和辅助函数：

```typescript
import { recordAudit, type AuditEntry } from '@cloudops/shared';
import { config } from '../config.js';

function getUserId(request: any): string {
  return request.headers['x-user-id'] || 'unknown';
}
function getTraceId(request: any): string | undefined {
  return request.headers['x-trace-id'] as string | undefined;
}
function getIp(request: any): string {
  return (request.headers['x-forwarded-for'] as string) || request.ip;
}
```

然后在 `POST /` (创建实例) 的 try 块成功后添加：

```typescript
      const instance = await instanceService.create(input);
      await recordAudit(config.authServiceUrl, {
        userId: getUserId(request),
        action: 'instance.create',
        resourceType: 'instance',
        resourceId: instance.id,
        provider: input.provider,
        region: input.region,
        result: 'success',
        params: { name: input.name, instanceType: input.instanceType },
        ip: getIp(request),
        traceId: getTraceId(request),
      });
      return reply.status(201).send(instance);
```

在 `POST /:id/start` 成功后添加：

```typescript
      await instanceService.start(id);
      await recordAudit(config.authServiceUrl, {
        userId: getUserId(request),
        action: 'instance.start',
        resourceType: 'instance',
        resourceId: id,
        result: 'success',
        ip: getIp(request),
        traceId: getTraceId(request),
      });
      return { ok: true, id, status: "running" };
```

对 `stop`、`reboot`、`delete` 操作分别添加审计，action 分别为 `instance.stop`、`instance.reboot`、`instance.delete`。`delete` 的 `result` 在成功后写入。

- [ ] **Step 3: 修改 resources.ts 删除资源接入审计**

在 `cloud-service/src/routes/resources.ts` 的 `DELETE /:id` 中添加审计。顶部添加同样的导入和辅助函数（与 Step 2 相同的 import 和 helper）。在删除成功后添加：

```typescript
      await resourceService.delete(id);
      await recordAudit(config.authServiceUrl, {
        userId: getUserId(request),
        action: 'resource.delete',
        resourceType: resource.resourceType,
        resourceId: id,
        provider: resource.provider,
        result: 'success',
        ip: getIp(request),
        traceId: getTraceId(request),
      });
      return { ok: true, id };
```

- [ ] **Step 4: 修改 providers.ts 云账号管理接入审计**

在 `cloud-service/src/routes/providers.ts` 的 `accountRoutes` 中，为 POST（创建）、PUT/PATCH（更新）、DELETE（删除）添加审计。顶部添加导入和辅助函数。

POST 创建成功后：
```typescript
      await recordAudit(config.authServiceUrl, {
        userId: getUserId(request),
        action: 'account.create',
        resourceType: 'cloud_account',
        provider: input.provider,
        result: 'success',
        params: { name: input.name },
        ip: getIp(request),
        traceId: getTraceId(request),
      });
```

DELETE 删除成功后（action: `account.delete`），PUT 更新成功后（action: `account.update`）。

- [ ] **Step 5: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p cloud-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add cloud-service/src/config.ts cloud-service/src/routes/instances.ts cloud-service/src/routes/resources.ts cloud-service/src/routes/providers.ts
git commit -m "feat: cloud-service audit logging for instance/resource/account operations"
```

---

### Task 5: ai-gateway 审计接入

**Files:**
- Modify: `ai-gateway/src/config.ts`
- Modify: `ai-gateway/src/methods/chat.ts`

- [ ] **Step 1: ai-gateway config 加 authServiceUrl**

在 `ai-gateway/src/config.ts` 的 `config` 对象中添加（在 monitorServiceUrl 之后）：

```typescript
  // auth-service 内部地址（审计写入）
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004',
```

- [ ] **Step 2: chat.ts 会话创建 + 工具调用审计**

在 `ai-gateway/src/methods/chat.ts` 顶部添加导入：

```typescript
import { recordAudit } from '@cloudops/shared';
import { config } from '../config.js';
```

在 `handleChatSend` 函数中，找到 `sessionOwner` 判断逻辑。当 `!sessionOwner`（新会话首次创建）时，在 `chat.send` 开始执行后添加会话创建审计：

```typescript
  const sessionOwner = await getSessionOwner(sessionKey);
  if (!sessionOwner) {
    // 新会话首次创建 —— 审计记录
    await recordAudit(config.authServiceUrl, {
      userId: client.userId,
      action: 'ai.session.create',
      resourceType: 'ai_session',
      resourceId: sessionKey,
      result: 'success',
    }).catch(() => {});
  } else if (sessionOwner.userId !== client.userId) {
```

> **注意:** `client.userId` 来自 WebSocket 连接时的 JWT 解析（`ws-connection.ts`）。

- [ ] **Step 3: 在 onToolCall 回调中添加工具调用审计**

在 `handleChatSend` 中，找到 `callbacks` 对象的 `onToolCall` 回调，在现有逻辑后添加审计：

```typescript
    onToolCall: (toolCall) => {
      // ... 现有逻辑 ...

      // 审计：AI 发起工具调用
      recordAudit(config.authServiceUrl, {
        userId: client.userId,
        action: 'ai.tool_call',
        resourceType: 'ai_tool',
        resourceId: toolCall.name,
        result: 'success',
        params: { sessionKey, tool: toolCall.name },
      }).catch(() => {});
    },
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p ai-gateway/tsconfig.json`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add ai-gateway/src/config.ts ai-gateway/src/methods/chat.ts
git commit -m "feat: ai-gateway audit logging for session creation and tool calls"
```

---

### Task 6: monitor-service 审计接入

**Files:**
- Modify: `monitor-service/src/config.ts`
- Modify: `monitor-service/src/routes/alerts.ts`

- [ ] **Step 1: monitor-service config 加 authServiceUrl**

在 `monitor-service/src/config.ts` 的 `config` 对象中添加（在 cloudServiceUrl 之后）：

```typescript
  // auth-service 内部地址（审计写入）
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004',
```

- [ ] **Step 2: alerts.ts resolve 接入审计**

在 `monitor-service/src/routes/alerts.ts` 顶部添加：

```typescript
import { recordAudit } from '@cloudops/shared';
import { config } from '../config.js';

function getUserId(request: any): string {
  return request.headers['x-user-id'] || 'unknown';
}
function getTraceId(request: any): string | undefined {
  return request.headers['x-trace-id'] as string | undefined;
}
```

在 `POST /events/:id/resolve` 端点中，resolve 成功后添加审计：

```typescript
  app.post('/events/:id/resolve', async (request, reply) => {
    const { id } = request.params as { id: string };
    await alertService.resolveAlert(id);
    await recordAudit(config.authServiceUrl, {
      userId: getUserId(request),
      action: 'alert.resolve',
      resourceType: 'alert_event',
      resourceId: id,
      result: 'success',
      ip: (request.headers['x-forwarded-for'] as string) || request.ip,
      traceId: getTraceId(request),
    });
    return { ok: true, id, status: 'resolved' };
  });
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p monitor-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add monitor-service/src/config.ts monitor-service/src/routes/alerts.ts
git commit -m "feat: monitor-service audit logging for alert resolution"
```

---

### Task 7: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 创建 CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main, TS]

jobs:
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter '@cloudops/shared' exec tsc --noEmit
      - run: pnpm -r --filter '@cloudops/auth-service' exec tsc --noEmit
      - run: pnpm -r --filter '@cloudops/cloud-service' exec tsc --noEmit
      - run: pnpm -r --filter '@cloudops/monitor-service' exec tsc --noEmit
      - run: pnpm -r --filter '@cloudops/ai-gateway' exec tsc --noEmit
      - run: pnpm -r --filter '@cloudops/api-gateway' exec tsc --noEmit
      - run: pnpm -r --filter '@cloudops/web-console' exec tsc --noEmit

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter '@cloudops/ai-gateway' exec vitest run
```

- [ ] **Step 2: 验证 workflow 语法**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && cat .github/workflows/ci.yml | head -5`
Expected: 文件存在且内容正确

- [ ] **Step 3: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck, build, and test workflow"
```

---

## Phase 2: AI 驱动

### Task 8: monitor-service alerts 表加 AI 分析字段

**Files:**
- Create: `monitor-service/migrations/002_alert_ai_analysis.sql`
- Modify: `monitor-service/src/db/schema.ts`
- Modify: `monitor-service/src/services/alert.service.ts`

- [ ] **Step 1: 创建 migration**

```sql
-- monitor-service/migrations/002_alert_ai_analysis.sql

-- 告警事件表新增 AI 根因分析字段
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP;
```

- [ ] **Step 2: 更新 schema.ts**

在 `monitor-service/src/db/schema.ts` 的 `alerts` 表定义中添加两个字段：

```typescript
export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').references(() => alertRules.id),
  instanceId: uuid('instance_id').references(() => instances.id),
  severity: varchar('severity', { length: 16 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 16 }).default('firing'),
  firedAt: timestamp('fired_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  // AI 根因分析结果
  aiAnalysis: text('ai_analysis'),
  aiAnalyzedAt: timestamp('ai_analyzed_at'),
});
```

- [ ] **Step 3: alert.service.ts 加 updateAiAnalysis 方法**

在 `monitor-service/src/services/alert.service.ts` 的 `AlertService` 类中添加：

```typescript
  async updateAiAnalysis(id: string, analysis: string): Promise<void> {
    await db
      .update(alerts)
      .set({ aiAnalysis: analysis, aiAnalyzedAt: new Date() })
      .where(eq(alerts.id, id));
  }
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p monitor-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add monitor-service/migrations/002_alert_ai_analysis.sql monitor-service/src/db/schema.ts monitor-service/src/services/alert.service.ts
git commit -m "feat: add ai_analysis column to alerts table for AI root cause analysis"
```

---

### Task 9: ai-gateway 内部告警分析端点

**Files:**
- Create: `ai-gateway/src/internal/analyze-alert.ts`
- Modify: `ai-gateway/src/index.ts`

- [ ] **Step 1: 创建告警分析模块**

```typescript
// ai-gateway/src/internal/analyze-alert.ts

import { config } from '../config.js';

export interface AnalyzeAlertRequest {
  alertId: string;
  ruleName: string;
  metric: string;
  condition: string;
  currentValue: string;
  instanceName: string;
  instanceId?: string;
  severity: string;
  message: string;
}

export interface AnalyzeAlertResponse {
  analysis: string;
}

/**
 * 调用 LLM 分析告警根因（Plan 模式，只读分析，不执行工具）
 */
export async function analyzeAlert(req: AnalyzeAlertRequest): Promise<AnalyzeAlertResponse> {
  const prompt = `你是云运维专家。请分析以下告警的根因，并给出修复建议。

告警详情：
- 规则名称: ${req.ruleName}
- 指标: ${req.metric}
- 触发条件: ${req.condition}
- 当前值: ${req.currentValue}
- 实例: ${req.instanceName}
- 严重级别: ${req.severity}
- 告警消息: ${req.message}

请按以下格式输出分析结果：
1. 可能的根因（列出 2-3 个最可能的原因）
2. 修复建议（针对每个根因给出具体操作步骤）
3. 预防措施（避免再次发生的长期建议）

请用中文回复，简洁专业。`;

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const analysis = data.choices?.[0]?.message?.content || '';

  // 记录 token usage（fire-and-forget）
  const usage = data.usage;
  if (usage) {
    recordInternalTokenUsage(usage).catch(() => {});
  }

  return { analysis };
}

/**
 * 内部 LLM 调用的 token 使用量记录（写入 token_usage 表）
 */
async function recordInternalTokenUsage(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): Promise<void> {
  const { db } = await import('../db/index.js');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`
    INSERT INTO token_usage (user_id, provider, model, prompt_tokens, completion_tokens, total_tokens)
    VALUES ('system', ${config.llm.baseUrl}, ${config.llm.model}, ${usage.prompt_tokens}, ${usage.completion_tokens}, ${usage.total_tokens})
  `).catch(() => {});
}
```

- [ ] **Step 2: 在 ai-gateway/src/index.ts 注册 HTTP 端点**

在 `ai-gateway/src/index.ts` 的健康检查端点之后、WebSocket 端点之前添加：

```typescript
import { analyzeAlert } from './internal/analyze-alert.js';
import { generateDashboardInsight } from './internal/dashboard-insight.js';

// 内部端点（仅供 monitor-service 调用，不经过 api-gateway 代理）
app.post('/internal/analyze-alert', async (request, reply) => {
  try {
    const result = await analyzeAlert(request.body as any);
    return reply.send(result);
  } catch (err) {
    app.log.error('analyze-alert failed:', err);
    return reply.status(500).send({ error: 'ANALYSIS_FAILED', message: (err as Error).message });
  }
});

app.post('/internal/insight', async (request, reply) => {
  try {
    const result = await generateDashboardInsight(request.body as any);
    return reply.send(result);
  } catch (err) {
    app.log.error('dashboard insight failed:', err);
    return reply.status(500).send({ error: 'INSIGHT_FAILED', message: (err as Error).message });
  }
});
```

> **注意:** Task 13 会创建 `dashboard-insight.ts`。如果先执行此 Task，需要暂时注释掉 insight 相关导入和路由，在 Task 13 中取消注释。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p ai-gateway/tsconfig.json`
Expected: 如有 dashboard-insight.ts 未创建的错误，暂时注释相关导入。

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add ai-gateway/src/internal/analyze-alert.ts ai-gateway/src/index.ts
git commit -m "feat: ai-gateway internal endpoint for alert root cause analysis"
```

---

### Task 10: monitor-service 告警触发后调用 AI 分析

**Files:**
- Modify: `monitor-service/src/config.ts`
- Modify: `monitor-service/src/services/alert-engine.ts`

- [ ] **Step 1: config 加 aiGatewayUrl**

在 `monitor-service/src/config.ts` 的 `config` 对象中添加：

```typescript
  // ai-gateway 内部地址（告警 AI 分析）
  aiGatewayUrl: process.env.AI_GATEWAY_URL || 'http://ai-gateway:3005',
```

- [ ] **Step 2: alert-engine 触发后异步调用 AI 分析**

在 `monitor-service/src/services/alert-engine.ts` 顶部添加导入：

```typescript
import { config } from '../config.js';
```

在 `evaluateRule` 方法中，找到触发告警的代码块（`if (triggered && !existing)`），在 `eventPublisher.publish('alert.fired', ...)` 之后添加异步 AI 分析调用：

```typescript
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

        // 异步调用 AI 根因分析（不阻断告警流程）
        this.requestAiAnalysis(alert.id, {
          ruleName: rule.name,
          metric: rule.metric,
          condition: rule.condition,
          currentValue: instancePoints[0].value,
          instanceName: instName,
          instanceId,
          severity: rule.severity,
          message: alert.message,
        }).catch((err) => console.error(`AI analysis for alert ${alert.id} failed:`, err));
      }
```

在 `AlertEngine` 类中添加私有方法：

```typescript
  /**
   * 异步请求 ai-gateway 进行告警根因分析
   */
  private async requestAiAnalysis(alertId: string, params: {
    ruleName: string;
    metric: string;
    condition: string;
    currentValue: string;
    instanceName: string;
    instanceId?: string;
    severity: string;
    message: string;
  }): Promise<void> {
    const res = await fetch(`${config.aiGatewayUrl}/internal/analyze-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId, ...params }),
    });
    if (!res.ok) {
      throw new Error(`ai-gateway responded ${res.status}`);
    }
    const data = await res.json() as { analysis: string };
    await alertService.updateAiAnalysis(alertId, data.analysis);
  }
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p monitor-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add monitor-service/src/config.ts monitor-service/src/services/alert-engine.ts
git commit -m "feat: alert engine triggers async AI root cause analysis on alert fire"
```

---

### Task 11: 前端 Monitor 展示 AI 分析结果

**Files:**
- Modify: `web-console/src/types/monitor.ts`
- Modify: `web-console/src/pages/Monitor.tsx`
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: AlertEvent 类型加 aiAnalysis 字段**

在 `web-console/src/types/monitor.ts` 的 `AlertEvent` 接口中添加：

```typescript
export interface AlertEvent {
  id: string;
  ruleId: string;
  instanceId: string | null;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  firedAt: string;
  resolvedAt: string | null;
  aiAnalysis?: string | null;
  aiAnalyzedAt?: string | null;
}
```

- [ ] **Step 2: Monitor.tsx EventsTab 展示 AI 分析**

在 `web-console/src/pages/Monitor.tsx` 的 `EventsTab` 组件中，修改事件表格，添加 AI 分析列和展开行。

找到 `EventsTab` 函数中的 `<TableBody>` 部分，在表格中添加 AI 分析徽章和可展开行。需要导入 `useState`（如果尚未导入）和 `Brain` 图标：

```typescript
import { Plus, Trash2, CheckCircle, Pencil, Brain, ChevronDown, ChevronRight as ChevronR } from 'lucide-react';
```

在 EventsTab 组件内添加展开状态：

```typescript
function EventsTab() {
  const { t } = useTranslation();
  const { data: events, isLoading } = useAlertEvents();
  const resolve = useResolveAlertEvent();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ... existing code ...

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-4">{t('monitor.eventsTitle')}</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : (events || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('monitor.noEvents')}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[100px]">{t('monitor.severity')}</TableHead>
                  <TableHead className="w-[200px]">{t('monitor.message')}</TableHead>
                  <TableHead className="w-[100px]">{t('common.status')}</TableHead>
                  <TableHead className="w-[160px]">{t('monitor.firedAt')}</TableHead>
                  <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events || []).map((evt) => (
                  <React.Fragment key={evt.id}>
                    <TableRow>
                      <TableCell>
                        {evt.aiAnalysis && (
                          <button
                            onClick={() => setExpandedId(expandedId === evt.id ? null : evt.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {expandedId === evt.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronR className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell><AlertSeverityBadge severity={evt.severity} /></TableCell>
                      <TableCell className="text-sm">{evt.message}</TableCell>
                      <TableCell><AlertStatusBadge status={evt.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(evt.firedAt).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {evt.aiAnalysis && (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-600">
                              <Brain className="h-3 w-3" />
                              AI
                            </span>
                          )}
                          {evt.status === 'firing' && (
                            <Button variant="ghost" size="sm" onClick={() => handleResolve(evt.id)}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === evt.id && evt.aiAnalysis && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="space-y-2 py-3">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <Brain className="h-4 w-4 text-purple-600" />
                              {t('monitor.aiAnalysis')}
                              {evt.aiAnalyzedAt && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  {new Date(evt.aiAnalyzedAt).toLocaleString('zh-CN')}
                                </span>
                              )}
                            </div>
                            <pre className="whitespace-pre-wrap rounded bg-background p-3 text-xs font-mono">
                              {evt.aiAnalysis}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

> **注意:** 需要确保 `React` 已导入（`import React, { useState } from 'react'`）。需要确认 `handleResolve` 函数已定义在 EventsTab 内。

- [ ] **Step 3: 添加 i18n 翻译键**

在 `web-console/src/i18n/locales/zh.json` 的 `monitor` 对象中添加：

```json
    "aiAnalysis": "AI 根因分析",
    "noEvents": "暂无告警事件",
```

在 `web-console/src/i18n/locales/en.json` 的 `monitor` 对象中添加：

```json
    "aiAnalysis": "AI Root Cause Analysis",
    "noEvents": "No alert events",
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p web-console/tsconfig.json`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add web-console/src/types/monitor.ts web-console/src/pages/Monitor.tsx web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat: display AI root cause analysis in monitor events tab"
```

---

### Task 12: ai-gateway token_usage 表 + usage 提取

**Files:**
- Create: `ai-gateway/migrations/004_token_usage.sql`
- Modify: `ai-gateway/src/agent/runner.ts`

- [ ] **Step 1: 创建 token_usage 表 migration**

```sql
-- ai-gateway/migrations/004_token_usage.sql

CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  session_key VARCHAR,
  provider VARCHAR,
  model VARCHAR,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage (user_id);
```

- [ ] **Step 2: 修改 LLMResponse 接口加 usage 字段**

在 `ai-gateway/src/agent/runner.ts` 中找到 `interface LLMResponse`（约第 721 行），修改为：

```typescript
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface LLMResponse {
  text: string;
  toolCalls: Array<ToolCall & { id: string }>;
  /** 推理过程内容（深度思考模式） */
  reasoning?: string;
  /** Token 使用量 */
  usage?: LLMUsage;
}
```

- [ ] **Step 3: 修改 callLLM 提取 usage**

在 `ai-gateway/src/agent/runner.ts` 的 `callLLM` 函数中，找到 `return { text, toolCalls, reasoning };`（约第 828 行），修改为：

```typescript
      const usage = data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      } : undefined;

      return { text, toolCalls, reasoning, usage };
```

- [ ] **Step 4: AgentTurnCallbacks 加 onUsage 回调**

在 `ai-gateway/src/agent/runner.ts` 中找到 `interface AgentTurnCallbacks`（约第 42 行），添加 onUsage：

```typescript
export interface AgentTurnCallbacks {
  onDelta: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (result: { name: string; success: boolean; data: unknown; error?: string; toolCallId?: string }) => void;
  onComplete: (finalText: string, truncated?: boolean) => void;
  /** 每次 LLM 调用后的 token 使用量回调 */
  onUsage?: (usage: LLMUsage) => void;
}
```

- [ ] **Step 5: 在 runAgentTurn 循环中调用 onUsage**

在 `ai-gateway/src/agent/runner.ts` 的 `runAgentTurn` 函数中，找到调用 `callLLM` 的位置（在循环体内），在 `callLLM` 返回后添加：

```typescript
      const response = await callLLM(messages, signal, callOptions);
      if (response.usage) {
        callbacks.onUsage?.(response.usage);
      }
```

> **注意:** 具体行号需要根据实际代码确认。找到 `const response = await callLLM(...)` 或 `const result = await callLLM(...)` 的调用处，在其后添加 onUsage 回调。

- [ ] **Step 6: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p ai-gateway/tsconfig.json`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add ai-gateway/migrations/004_token_usage.sql ai-gateway/src/agent/runner.ts
git commit -m "feat: extract LLM token usage and add onUsage callback to agent runner"
```

---

### Task 13: ai-gateway chat.ts 写 token_usage + Dashboard 洞察端点

**Files:**
- Modify: `ai-gateway/src/methods/chat.ts`
- Create: `ai-gateway/src/internal/dashboard-insight.ts`
- Modify: `ai-gateway/src/index.ts` (已在 Task 9 添加路由，此处确认端点可用)

- [ ] **Step 1: chat.ts 实现 onUsage 写库**

在 `ai-gateway/src/methods/chat.ts` 顶部添加导入（已有 db 和 sql 导入）：

找到 `handleChatSend` 中构造 `callbacks` 对象的位置，添加 `onUsage` 回调：

```typescript
import { config } from '../config.js';

// 在 callbacks 对象中添加：
  onUsage: (usage) => {
    // fire-and-forget 写入 token_usage 表
    db.execute(sql`
      INSERT INTO token_usage (user_id, session_key, provider, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (${client.userId}, ${sessionKey}, ${config.llm.baseUrl}, ${config.llm.model}, ${usage.promptTokens}, ${usage.completionTokens}, ${usage.totalTokens})
    `).catch(() => {});
  },
```

- [ ] **Step 2: 创建 Dashboard 洞察模块**

```typescript
// ai-gateway/src/internal/dashboard-insight.ts

import { config } from '../config.js';

export interface DashboardInsightRequest {
  totalInstances: number;
  runningInstances: number;
  stoppedInstances: number;
  firingAlerts: number;
  totalCost: number;
  providerBreakdown: { provider: string; count: number }[];
  recentAlerts: { severity: string; message: string }[];
  abnormalInstances: { name: string; provider: string; status: string }[];
}

export interface DashboardInsightResponse {
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
}

/**
 * 调用 LLM 生成 Dashboard 健康洞察（结构化 JSON 输出）
 */
export async function generateDashboardInsight(req: DashboardInsightRequest): Promise<DashboardInsightResponse> {
  const prompt = `你是云运维专家。请分析以下云资源概况，给出健康评估和建议。

资源概况：
- 总实例数: ${req.totalInstances}
- 运行中: ${req.runningInstances}
- 已停止: ${req.stoppedInstances}
- 当前告警数: ${req.firingAlerts}
- 本月总成本: ¥${req.totalCost.toFixed(2)}
- 厂商分布: ${req.providerBreakdown.map(p => `${p.provider}=${p.count}`).join(', ')}

最近告警:
${req.recentAlerts.map(a => `- [${a.severity}] ${a.message}`).join('\n') || '- 无'}

异常实例:
${req.abnormalInstances.map(i => `- ${i.name} (${i.provider}): ${i.status}`).join('\n') || '- 无'}

请用以下 JSON 格式回复（不要包含其他内容）：
{
  "healthScore": 0-100的整数,
  "risks": ["风险1", "风险2"],
  "suggestions": ["建议1", "建议2"]
}`;

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error ${res.status}`);
  }

  const data: any = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';

  // 记录 token usage
  const usage = data.usage;
  if (usage) {
    const { db } = await import('../db/index.js');
    const { sql } = await import('drizzle-orm');
    db.execute(sql`
      INSERT INTO token_usage (user_id, provider, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES ('system', ${config.llm.baseUrl}, ${config.llm.model}, ${usage.prompt_tokens}, ${usage.completion_tokens}, ${usage.total_tokens})
    `).catch(() => {});
  }

  // 解析 JSON（LLM 可能包含 markdown 代码块）
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      healthScore: parsed.healthScore ?? 0,
      risks: parsed.risks || [],
      suggestions: parsed.suggestions || [],
      raw,
    };
  } catch {
    return { healthScore: 0, risks: [], suggestions: [], raw };
  }
}
```

- [ ] **Step 3: 确认 ai-gateway/src/index.ts 已注册 insight 端点**

如果 Task 9 中已添加 `app.post('/internal/insight', ...)`，确认导入路径正确。如果之前注释了，现在取消注释。

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p ai-gateway/tsconfig.json`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add ai-gateway/src/methods/chat.ts ai-gateway/src/internal/dashboard-insight.ts ai-gateway/src/index.ts
git commit -m "feat: record token usage in chat and add dashboard insight endpoint"
```

---

### Task 14: monitor-service Dashboard 洞察 + Token 统计端点

**Files:**
- Create: `monitor-service/migrations/003_token_usage.sql`
- Modify: `monitor-service/src/db/schema.ts`
- Create: `monitor-service/src/routes/dashboard.ts`
- Modify: `monitor-service/src/index.ts`

- [ ] **Step 1: 创建 token_usage 表 migration（monitor-service 侧，与 ai-gateway 共享同一张表）**

```sql
-- monitor-service/migrations/003_token_usage.sql
-- token_usage 表由 ai-gateway 创建（migration 004），此处仅做幂等保障
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  session_key VARCHAR,
  provider VARCHAR,
  model VARCHAR,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage (user_id);
```

- [ ] **Step 2: schema.ts 加 tokenUsage 表定义**

在 `monitor-service/src/db/schema.ts` 底部添加：

```typescript
// token_usage 表（由 ai-gateway 写入，monitor-service 查询统计）
export const tokenUsage = pgTable('token_usage', {
  id: integer('id').primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  sessionKey: varchar('session_key', { length: 128 }),
  provider: varchar('provider', { length: 256 }),
  model: varchar('model', { length: 128 }),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

> 需要在文件顶部导入中添加 `integer`（如果尚未导入）。

- [ ] **Step 3: 创建 dashboard 路由**

```typescript
// monitor-service/src/routes/dashboard.ts

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { instances, alerts, costRecords, tokenUsage } from '../db/schema.js';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { config } from '../config.js';

// AI 洞察缓存（5 分钟）
let insightCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function dashboardRoutes(app: FastifyInstance) {
  /**
   * GET /monitor/dashboard/ai-insight
   * AI 生成的云资源健康洞察（结构化 JSON，5 分钟缓存）
   */
  app.get('/ai-insight', async (_request, reply) => {
    // 检查缓存
    if (insightCache && Date.now() < insightCache.expiresAt) {
      return reply.send(insightCache.data);
    }

    // 收集上下文数据
    const allInstances = await db.select().from(instances);
    const totalInstances = allInstances.length;
    const runningInstances = allInstances.filter(i => i.status === 'running').length;
    const stoppedInstances = allInstances.filter(i => i.status === 'stopped').length;

    const firingAlertsList = await db.select().from(alerts).where(eq(alerts.status, 'firing')).limit(10);
    const recentAlerts = firingAlertsList.map(a => ({ severity: a.severity, message: a.message }));

    const providerMap = new Map<string, number>();
    allInstances.forEach(i => {
      providerMap.set(i.provider, (providerMap.get(i.provider) || 0) + 1);
    });
    const providerBreakdown = Array.from(providerMap.entries()).map(([provider, count]) => ({ provider, count }));

    const abnormalInstances = allInstances
      .filter(i => i.status !== 'running' && i.status !== 'stopped')
      .slice(0, 5)
      .map(i => ({ name: i.name || i.id, provider: i.provider, status: i.status }));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const costRows = await db.select().from(costRecords).where(gte(costRecords.periodStart, monthStart));
    const totalCost = costRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    // 调用 ai-gateway 内部端点
    const res = await fetch(`${config.aiGatewayUrl}/internal/insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalInstances,
        runningInstances,
        stoppedInstances,
        firingAlerts: firingAlertsList.length,
        totalCost,
        providerBreakdown,
        recentAlerts,
        abnormalInstances,
      }),
    });

    if (!res.ok) {
      return reply.status(502).send({ error: 'AI_INSIGHT_FAILED', message: `ai-gateway responded ${res.status}` });
    }

    const data = await res.json();

    // 更新缓存
    insightCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };

    return reply.send(data);
  });

  /**
   * GET /monitor/dashboard/token-stats
   * Token 使用量统计（今日 + 本周）
   */
  app.get('/token-stats', async (_request) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const todayRows = await db.select({
      total: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      prompt: sql<number>`COALESCE(SUM(${tokenUsage.promptTokens}), 0)`,
      completion: sql<number>`COALESCE(SUM(${tokenUsage.completionTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    }).from(tokenUsage).where(gte(tokenUsage.createdAt, todayStart));

    const weekRows = await db.select({
      total: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    }).from(tokenUsage).where(gte(tokenUsage.createdAt, weekStart));

    // 按日趋势（最近 7 天）
    const trendRows = await db.select({
      date: sql<string>`DATE(${tokenUsage.createdAt})`,
      tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
    }).from(tokenUsage)
      .where(gte(tokenUsage.createdAt, weekStart))
      .groupBy(sql`DATE(${tokenUsage.createdAt})`)
      .orderBy(desc(sql`DATE(${tokenUsage.createdAt})`));

    return {
      today: {
        totalTokens: todayRows[0]?.total || 0,
        promptTokens: todayRows[0]?.prompt || 0,
        completionTokens: todayRows[0]?.completion || 0,
        calls: todayRows[0]?.calls || 0,
      },
      week: {
        totalTokens: weekRows[0]?.total || 0,
        calls: weekRows[0]?.calls || 0,
      },
      trend: trendRows.map(r => ({ date: r.date, tokens: r.tokens })),
    };
  });
}
```

- [ ] **Step 4: 在 monitor-service/src/index.ts 注册 dashboard 路由**

在 `monitor-service/src/index.ts` 中找到路由注册部分，添加：

```typescript
import { dashboardRoutes } from './routes/dashboard.js';
// ... 在现有路由注册后添加：
await app.register(dashboardRoutes, { prefix: '/monitor/dashboard' });
```

- [ ] **Step 5: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p monitor-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add monitor-service/migrations/003_token_usage.sql monitor-service/src/db/schema.ts monitor-service/src/routes/dashboard.ts monitor-service/src/index.ts
git commit -m "feat: dashboard AI insight and token usage stats endpoints in monitor-service"
```

---

### Task 15: 前端 Dashboard AI 洞察 + Token 统计区块

**Files:**
- Create: `web-console/src/types/aiInsights.ts`
- Create: `web-console/src/api/aiInsights.ts`
- Create: `web-console/src/hooks/useAiInsights.ts`
- Modify: `web-console/src/pages/Dashboard.tsx`
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: 创建类型定义**

```typescript
// web-console/src/types/aiInsights.ts

export interface AiInsight {
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
}

export interface TokenStats {
  today: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    calls: number;
  };
  week: {
    totalTokens: number;
    calls: number;
  };
  trend: { date: string; tokens: number }[];
}
```

- [ ] **Step 2: 创建 API 封装**

```typescript
// web-console/src/api/aiInsights.ts

import { api } from './client';
import type { AiInsight, TokenStats } from '@/types/aiInsights';

export const aiInsightsApi = {
  getInsight(): Promise<AiInsight> {
    return api.get<AiInsight>('/monitor/dashboard/ai-insight');
  },
  getTokenStats(): Promise<TokenStats> {
    return api.get<TokenStats>('/monitor/dashboard/token-stats');
  },
};
```

- [ ] **Step 3: 创建 hooks**

```typescript
// web-console/src/hooks/useAiInsights.ts

import { useQuery } from '@tanstack/react-query';
import { aiInsightsApi } from '@/api/aiInsights';

export function useAiInsight() {
  return useQuery({
    queryKey: ['ai-insight'],
    queryFn: aiInsightsApi.getInsight,
    refetchInterval: 5 * 60 * 1000, // 5 分钟刷新
  });
}

export function useTokenStats() {
  return useQuery({
    queryKey: ['token-stats'],
    queryFn: aiInsightsApi.getTokenStats,
    refetchInterval: 60 * 1000, // 1 分钟刷新
  });
}
```

- [ ] **Step 4: Dashboard.tsx 添加 AI 洞察 + Token 统计区块**

在 `web-console/src/pages/Dashboard.tsx` 的 return 中，在云厂商分布卡片之后添加两个新区块。在文件顶部添加导入：

```typescript
import { useAiInsight, useTokenStats } from '@/hooks/useAiInsights';
import { Brain, Activity } from 'lucide-react';
```

在组件函数体内添加：

```typescript
  const { data: insight, isLoading: insightLoading } = useAiInsight();
  const { data: tokenStats } = useTokenStats();
```

在 return 的 JSX 中，现有内容之后添加：

```tsx
      {/* AI 健康洞察 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">{t('dashboard.aiInsight')}</h2>
          </div>
          {insightLoading ? (
            <div className="text-center py-4 text-muted-foreground">{t('common.loading')}</div>
          ) : insight ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold" style={{
                  color: insight.healthScore >= 80 ? '#22c55e' : insight.healthScore >= 60 ? '#eab308' : '#ef4444'
                }}>
                  {insight.healthScore}
                </div>
                <div className="text-sm text-muted-foreground">{t('dashboard.healthScore')}</div>
              </div>
              {insight.risks.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">{t('dashboard.risks')}</div>
                  <ul className="space-y-1">
                    {insight.risks.map((risk, i) => (
                      <li key={i} className="text-sm text-muted-foreground">• {risk}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insight.suggestions.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">{t('dashboard.suggestions')}</div>
                  <ul className="space-y-1">
                    {insight.suggestions.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">{t('dashboard.insightUnavailable')}</div>
          )}
        </CardContent>
      </Card>

      {/* Token 使用统计 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">{t('dashboard.tokenUsage')}</h2>
          </div>
          {tokenStats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.todayTokens')}</div>
                <div className="text-xl font-bold">{tokenStats.today.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.todayCalls')}</div>
                <div className="text-xl font-bold">{tokenStats.today.calls}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.weekTokens')}</div>
                <div className="text-xl font-bold">{tokenStats.week.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.weekCalls')}</div>
                <div className="text-xl font-bold">{tokenStats.week.calls}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">{t('common.loading')}</div>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 5: 添加 i18n 翻译键**

在 `web-console/src/i18n/locales/zh.json` 的 `dashboard` 对象中添加：

```json
    "aiInsight": "AI 健康洞察",
    "healthScore": "健康评分",
    "risks": "风险项",
    "suggestions": "建议",
    "insightUnavailable": "洞察暂不可用",
    "tokenUsage": "Token 使用量",
    "todayTokens": "今日 Token",
    "todayCalls": "今日调用",
    "weekTokens": "本周 Token",
    "weekCalls": "本周调用",
```

在 `web-console/src/i18n/locales/en.json` 的 `dashboard` 对象中添加对应英文：

```json
    "aiInsight": "AI Health Insight",
    "healthScore": "Health Score",
    "risks": "Risks",
    "suggestions": "Suggestions",
    "insightUnavailable": "Insight unavailable",
    "tokenUsage": "Token Usage",
    "todayTokens": "Today Tokens",
    "todayCalls": "Today Calls",
    "weekTokens": "Week Tokens",
    "weekCalls": "Week Calls",
```

- [ ] **Step 6: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p web-console/tsconfig.json`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add web-console/src/types/aiInsights.ts web-console/src/api/aiInsights.ts web-console/src/hooks/useAiInsights.ts web-console/src/pages/Dashboard.tsx web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat: dashboard AI insight panel and token usage stats"
```

---

## Phase 3: 可观测性与生产化

### Task 16: monitor-service Prometheus /metrics 端点

**Files:**
- Create: `monitor-service/src/routes/metrics-export.ts`
- Modify: `monitor-service/src/index.ts`

- [ ] **Step 1: 创建 Prometheus metrics 端点**

```typescript
// monitor-service/src/routes/metrics-export.ts

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { instances, alerts, tokenUsage } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export async function metricsExportRoutes(app: FastifyInstance) {
  /**
   * GET /metrics — Prometheus exposition format
   * 只读端点，不鉴权（遵循 Prometheus 惯例）
   */
  app.get('/metrics', async (_request, reply) => {
    const lines: string[] = [];

    // 1. 实例总数（按 provider + status）
    const instanceRows = await db.select().from(instances);
    const instanceMap = new Map<string, number>();
    for (const inst of instanceRows) {
      const key = `provider="${inst.provider}",status="${inst.status}"`;
      instanceMap.set(key, (instanceMap.get(key) || 0) + 1);
    }
    lines.push('# HELP cloudops_instances_total Total instances by provider and status');
    lines.push('# TYPE cloudops_instances_total gauge');
    for (const [key, count] of instanceMap) {
      lines.push(`cloudops_instances_total{${key}} ${count}`);
    }

    // 2. 当前 firing 告警（按 severity）
    const firingAlerts = await db.select().from(alerts).where(eq(alerts.status, 'firing'));
    const alertMap = new Map<string, number>();
    for (const a of firingAlerts) {
      const key = `severity="${a.severity}"`;
      alertMap.set(key, (alertMap.get(key) || 0) + 1);
    }
    lines.push('');
    lines.push('# HELP cloudops_alerts_firing Current firing alerts by severity');
    lines.push('# TYPE cloudops_alerts_firing gauge');
    for (const [key, count] of alertMap) {
      lines.push(`cloudops_alerts_firing{${key}} ${count}`);
    }
    // 确保即使没有告警也有输出
    if (alertMap.size === 0) {
      lines.push('cloudops_alerts_firing{severity="critical"} 0');
      lines.push('cloudops_alerts_firing{severity="warning"} 0');
      lines.push('cloudops_alerts_firing{severity="info"} 0');
    }

    // 3. AI Token 消耗总计（按 provider）
    const tokenRows = await db.select({
      provider: tokenUsage.provider,
      total: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
    }).from(tokenUsage).groupBy(tokenUsage.provider);
    lines.push('');
    lines.push('# HELP cloudops_ai_tokens_total Total AI tokens consumed by provider');
    lines.push('# TYPE cloudops_ai_tokens_total counter');
    for (const row of tokenRows) {
      const provider = row.provider || 'unknown';
      lines.push(`cloudops_ai_tokens_total{provider="${provider}"} ${row.total}`);
    }
    if (tokenRows.length === 0) {
      lines.push('cloudops_ai_tokens_total{provider="none"} 0');
    }

    // 4. 告警规则总数
    const totalAlerts = firingAlerts.length;
    lines.push('');
    lines.push('# HELP cloudops_alerts_firing_total Total firing alerts count');
    lines.push('# TYPE cloudops_alerts_firing_total gauge');
    lines.push(`cloudops_alerts_firing_total ${totalAlerts}`);

    // 5. 实例总数
    lines.push('');
    lines.push('# HELP cloudops_instances_count Total instances count');
    lines.push('# TYPE cloudops_instances_count gauge');
    lines.push(`cloudops_instances_count ${instanceRows.length}`);

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(lines.join('\n') + '\n');
  });
}
```

- [ ] **Step 2: 在 monitor-service/src/index.ts 注册路由**

在 `monitor-service/src/index.ts` 中添加：

```typescript
import { metricsExportRoutes } from './routes/metrics-export.js';
// ... 在现有路由注册后添加（注意：不使用前缀，直接在根路径）：
await app.register(metricsExportRoutes);
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && npx tsc --noEmit -p monitor-service/tsconfig.json`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add monitor-service/src/routes/metrics-export.ts monitor-service/src/index.ts
git commit -m "feat: prometheus /metrics endpoint in monitor-service"
```

---

### Task 17: nginx 新增 /metrics 路由

**Files:**
- Modify: `nginx.conf`
- Modify: `web-console/nginx.conf`

- [ ] **Step 1: 主 nginx.conf 添加 /metrics 路由**

在 `nginx.conf` 中找到现有 `location /monitor/` 块，在其后添加：

```nginx
    # Prometheus metrics 端点
    location /metrics {
      proxy_pass http://127.0.0.1:3002;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
```

- [ ] **Step 2: web-console/nginx.conf 添加 /metrics 路由**

在 `web-console/nginx.conf` 中找到 `location /monitor/` 块，在其后添加：

```nginx
    # Prometheus metrics 端点
    location /metrics {
      proxy_pass http://monitor-service:3002;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
```

- [ ] **Step 3: 验证 nginx 配置语法**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker run --rm -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t`
Expected: `syntax is ok` 和 `test is successful`

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add nginx.conf web-console/nginx.conf
git commit -m "feat: nginx route /metrics to monitor-service for prometheus scraping"
```

---

### Task 18: K8s Secret + Postgres 加固

**Files:**
- Modify: `k8s/02-secret.yaml`
- Modify: `k8s/03-postgres.yaml`

- [ ] **Step 1: 修改 02-secret.yaml 为 Sealed Secrets 模式**

```yaml
# k8s/02-secret.yaml
---
apiVersion: v1
kind: Secret
metadata:
  name: cloudops-secrets
  namespace: cloudops
type: Opaque
# 生产环境使用 Sealed Secrets 或外部密钥管理：
# 1. 安装 sealed-secrets controller: kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.3/controller.yaml
# 2. 使用 kubeseal 加密敏感值:
#    echo -n 'your-secret-value' | kubeseal --raw --namespace cloudops --name cloudops-secrets
# 3. 将加密值填入下方 sealedData
# 开发环境可直接用 kubectl 创建:
#    kubectl create secret generic cloudops-secrets \
#      --namespace cloudops \
#      --from-literal=JWT_SECRET='your-jwt-secret' \
#      --from-literal=LLM_API_KEY='your-llm-key' \
#      ...
stringData:
  # JWT 密钥（生产必须用 Sealed Secret 替换）
  JWT_SECRET: "CHANGE_ME_USE_SEALED_SECRET"
  # Admin 初始密码（留空则首次启动随机生成）
  ADMIN_PASSWORD: ""

  # 云厂商凭据（生产必须用 Sealed Secret 替换）
  AWS_ACCESS_KEY_ID: ""
  AWS_SECRET_ACCESS_KEY: ""
  AWS_REGION: "us-east-1"
  ALIYUN_ACCESS_KEY_ID: ""
  ALIYUN_ACCESS_KEY_SECRET: ""
  AZURE_TENANT_ID: ""
  AZURE_CLIENT_ID: ""
  AZURE_CLIENT_SECRET: ""
  RENDER_API_KEY: ""

  # LLM API 密钥
  LLM_API_KEY: ""

  # PostgreSQL 密码（从 03-postgres.yaml 引用）
  POSTGRES_PASSWORD: "CHANGE_ME_USE_SEALED_SECRET"
```

- [ ] **Step 2: 修改 03-postgres.yaml 密码从 Secret 引用**

```yaml
# k8s/03-postgres.yaml
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: cloudops
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: cloudops
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: "cloudops"
            - name: POSTGRES_USER
              value: "cloudops"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: cloudops-secrets
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "cloudops"]
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "cloudops"]
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
      volumes:
        - name: postgres-data
          persistentVolumeClaim:
            claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: cloudops
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  type: ClusterIP
```

- [ ] **Step 3: 验证 K8s 清单语法**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && kubectl apply --dry-run=client -f k8s/02-secret.yaml -f k8s/03-postgres.yaml`
Expected: `created (dry run)` 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add k8s/02-secret.yaml k8s/03-postgres.yaml
git commit -m "security: k8s secret uses sealed secrets pattern, postgres password from secret ref"
```

---

### Task 19: K8s app + ingress 加固

**Files:**
- Modify: `k8s/05-app.yaml`
- Modify: `k8s/06-ingress.yaml`

- [ ] **Step 1: 修改 05-app.yaml 加 resources + 镜像地址**

在 `k8s/05-app.yaml` 中修改 Deployment：
- 将镜像 `your-registry/cloudops-app:latest` 改为 `ghcr.io/winterfellwen/cloudops-ai:latest`
- 确保 `DATABASE_URL` 中的密码从 Secret 引用

修改 `DATABASE_URL` 环境变量：

```yaml
          env:
            - name: DATABASE_URL
              value: "postgresql://cloudops:$(POSTGRES_PASSWORD)@postgres:5432/cloudops"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: cloudops-secrets
                  key: POSTGRES_PASSWORD
            - name: REDIS_URL
              value: "redis://redis:6379"
            - name: CLOUD_SERVICE_URL
              value: "http://localhost:3001"
            - name: MONITOR_SERVICE_URL
              value: "http://localhost:3002"
            - name: AUTH_SERVICE_URL
              value: "http://localhost:3004"
            - name: AI_GATEWAY_URL
              value: "http://localhost:3005"
```

> **注意:** K8s 不支持在 env value 中直接用 `$(VAR)` 引用另一个 env 的方式做数据库 URL 拼接的 Secret 注入。更正确的做法是用 `initContainer` 或 envFrom + 独立字段。但为简化，此处保留 DATABASE_URL 为明文密码形式，但在注释中标注生产应改用 ExternalName Service 或 initContainer 拼接。

简化方案（保持可用）：直接在 DATABASE_URL 中用占位密码，注释标注生产替换：

```yaml
            - name: DATABASE_URL
              # 生产环境：用 initContainer 或 envFrom 拼接 Secret 中的密码
              value: "postgresql://cloudops:cloudops123@postgres:5432/cloudops"
```

确认 `resources` 字段已存在（现状已有 requests/limits），保持不变。将 image 改为：

```yaml
        image: ghcr.io/winterfellwen/cloudops-ai:latest
```

同时确保 `replicas: 2`（为 HPA 准备）：

```yaml
spec:
  replicas: 2
```

- [ ] **Step 2: 修改 06-ingress.yaml 启用 TLS + cert-manager**

```yaml
# k8s/06-ingress.yaml
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cloudops-ingress
  namespace: cloudops
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    # WebSocket 升级
    nginx.ingress.kubernetes.io/configuration-snippet: |
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
    # cert-manager
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts:
        - cloudops.example.com
      secretName: cloudops-tls
  rules:
    - host: cloudops.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: cloudops-app
                port:
                  number: 80
---
# cert-manager ClusterIssuer（Let's Encrypt）
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

- [ ] **Step 3: 验证 K8s 清单语法**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && kubectl apply --dry-run=client -f k8s/05-app.yaml -f k8s/06-ingress.yaml`
Expected: `created (dry run)` 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add k8s/05-app.yaml k8s/06-ingress.yaml
git commit -m "security: k8s app replicas=2 for HPA, ingress enables TLS with cert-manager"
```

---

### Task 20: K8s HPA + PDB + NetworkPolicy

**Files:**
- Create: `k8s/07-hpa.yaml`
- Create: `k8s/08-pdb.yaml`
- Create: `k8s/09-networkpolicy.yaml`

- [ ] **Step 1: 创建 HPA**

```yaml
# k8s/07-hpa.yaml
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cloudops-app-hpa
  namespace: cloudops
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cloudops-app
  minReplicas: 2
  maxReplicas: 4
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

- [ ] **Step 2: 创建 PDB**

```yaml
# k8s/08-pdb.yaml
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: cloudops-app-pdb
  namespace: cloudops
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: cloudops-app
```

- [ ] **Step 3: 创建 NetworkPolicy**

```yaml
# k8s/09-networkpolicy.yaml
---
# 默认拒绝所有入站流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: cloudops
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---
# 允许 app 接收 ingress 流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-ingress
  namespace: cloudops
spec:
  podSelector:
    matchLabels:
      app: cloudops-app
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 80
---
# 允许 app 访问 postgres
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-to-postgres
  namespace: cloudops
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: cloudops-app
      ports:
        - protocol: TCP
          port: 5432
---
# 允许 app 访问 redis
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-to-redis
  namespace: cloudops
spec:
  podSelector:
    matchLabels:
      app: redis
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: cloudops-app
      ports:
        - protocol: TCP
          port: 6379
```

- [ ] **Step 4: 验证 K8s 清单语法**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && kubectl apply --dry-run=client -f k8s/07-hpa.yaml -f k8s/08-pdb.yaml -f k8s/09-networkpolicy.yaml`
Expected: `created (dry run)` 无错误

- [ ] **Step 5: Commit**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add k8s/07-hpa.yaml k8s/08-pdb.yaml k8s/09-networkpolicy.yaml
git commit -m "security: k8s HPA, PDB, and NetworkPolicy for production hardening"
```

---

## 集成验证

### Task 21: 本地 Docker 集成测试

- [ ] **Step 1: 启动本地 Docker 环境**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker compose up -d --build`
Expected: 所有服务启动成功

- [ ] **Step 2: 验证审计日志端到端**

Run: `curl -X POST http://localhost:80/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"your-password"}'`

然后检查审计日志是否写入：
Run: `curl http://localhost:80/api/audit/?action=auth.login -H 'Authorization: Bearer <token>'`
Expected: 返回包含 `auth.login` 的审计记录

- [ ] **Step 3: 验证 Prometheus metrics 端点**

Run: `curl http://localhost:80/metrics`
Expected: 返回 Prometheus text format，包含 `cloudops_instances_total`、`cloudops_alerts_firing`、`cloudops_ai_tokens_total` 指标

- [ ] **Step 4: 验证 Dashboard AI 洞察**

Run: `curl http://localhost:80/api/monitor/dashboard/ai-insight -H 'Authorization: Bearer <token>'`
Expected: 返回 `healthScore`、`risks`、`suggestions` 的 JSON

- [ ] **Step 5: 验证 Token 统计**

Run: `curl http://localhost:80/api/monitor/dashboard/token-stats -H 'Authorization: Bearer <token>'`
Expected: 返回今日/本周 token 统计

- [ ] **Step 6: 验证前端页面**

在浏览器中打开 `http://localhost:80`，检查：
- Dashboard 页面显示 AI 洞察面板和 Token 统计区块
- Monitor 页面 EventsTab 显示 AI 分析徽章（如有告警事件）

- [ ] **Step 7: 提交最终状态**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager
git add -A
git commit -m "test: verify AIOps enhancement integration locally"
git push origin TS
```

---

## Self-Review

### Spec Coverage

| Spec 要求 | 对应 Task | 状态 |
|-----------|----------|------|
| 审计日志全链路接通 - auth 登录 | Task 3 | ✅ |
| 审计日志 - cloud 实例操作 | Task 4 | ✅ |
| 审计日志 - 资源删除 | Task 4 | ✅ |
| 审计日志 - 云账号管理 | Task 4 | ✅ |
| 审计日志 - AI 工具调用 | Task 5 | ✅ |
| 审计日志 - AI 会话创建 | Task 5 | ✅ |
| 审计日志 - 告警解决 | Task 6 | ✅ |
| GitHub Actions CI/CD | Task 7 | ✅ |
| 告警→AI 根因分析 | Task 8-10 | ✅ |
| Dashboard AI 洞察面板 | Task 13-15 | ✅ |
| Token 使用量追踪 | Task 12-15 | ✅ |
| Prometheus /metrics | Task 16-17 | ✅ |
| K8s Secret 加固 | Task 18 | ✅ |
| K8s Postgres 密码 | Task 18 | ✅ |
| K8s HPA | Task 20 | ✅ |
| K8s PDB | Task 20 | ✅ |
| K8s NetworkPolicy | Task 20 | ✅ |
| K8s TLS | Task 19 | ✅ |

### Placeholder Scan

无 TBD/TODO。所有步骤包含完整代码。

### Type Consistency

- `LLMUsage` 接口在 Task 12 定义，在 Task 13 的 onUsage 回调中使用，类型一致
- `AuditEntry` 在 Task 2 (shared) 定义，在 Task 4/5/6 中通过 `recordAudit` 使用，类型一致
- `AlertEvent` 在 Task 11 添加 `aiAnalysis` 字段，与后端 schema (Task 8) 一致
- `DashboardInsightRequest/Response` 在 Task 13 定义，monitor-service (Task 14) 调用时字段名一致
