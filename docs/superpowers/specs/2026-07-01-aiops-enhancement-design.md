# AIOps 平台增强设计

> 定位：AI 驱动的云管理和 DevOps——展示未来云运维趋势
>
> 面试叙事：这不是一个带聊天功能的云管理工具，而是一个以 AI Agent 为核心驱动引擎的 AIOps 平台。

## 总体架构

```
                    ┌──────────────────────────────────────┐
                    │           GitHub Actions CI/CD       │
                    │  push → typecheck → build → test    │
                    └───────────┬──────────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │    Render (Pro)       │
                    │  nginx → PM2 (6 svc)  │
                    └───────────┬──────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
    ┌────▼─────┐         ┌──────▼──────┐        ┌──────▼──────┐
    │  审计日志  │         │  AI Agent   │        │  监控告警    │
    │  全链路    │◄────────│  根因分析    │◄───────│  Prometheus │
    │  记录      │         │  自动修复    │        │  /metrics   │
    └───────────┘         └─────────────┘        └─────────────┘
         │                      │                      │
         └──────────┬───────────┘                      │
                    │                                   │
              ┌─────▼─────┐                      ┌─────▼─────┐
              │ Dashboard  │                      │  K8s      │
              │ AI 洞察面板 │                      │  生产化    │
              │ Token 统计 │                      │  HPA/TLS  │
              └───────────┘                      └───────────┘
```

**数据流闭环**：
1. Prometheus 采集 → 告警触发
2. 告警事件 → AI Agent 自动接收，分析根因
3. AI Agent 调用云管理工具，建议/执行修复
4. 全过程写入审计日志
5. Dashboard AI 面板展示洞察 + Token 消耗

---

## Phase 1: 基础盘

### 1.1 审计日志全链路接通

**问题**：`auditService.log()` 从未被调用，审计库为空。

**方案**：在关键操作点接入审计写入，形成"谁在什么时候对什么资源做了什么操作"的完整记录。

#### 接入点

| 层 | 文件 | 操作 | 审计 action |
|---|------|------|------------|
| auth-service | `routes/auth.ts` | 登录成功/失败 | `auth.login` / `auth.login_failed` |
| cloud-service | `routes/instances.ts` | 启动/停止/重启/删除实例 | `instance.start` / `instance.stop` / `instance.reboot` / `instance.delete` |
| cloud-service | `routes/instances.ts` | 创建实例 | `instance.create` |
| cloud-service | `routes/resources.ts` | 删除资源 | `resource.delete` |
| cloud-service | `routes/providers.ts` | 添加/编辑/删除云账号 | `account.create` / `account.update` / `account.delete` |
| ai-gateway | `methods/chat.ts` | AI 发起工具调用 | `ai.tool_call` |
| ai-gateway | `methods/chat.ts` | 用户创建会话 | `ai.session.create` |
| monitor-service | `routes/alerts.ts` | 手动 resolve 告警 | `alert.resolve` |

#### 实现方式

- auth-service 新增 `POST /audit` 内部写入端点（复用已有 `auditService.log()`）
- 各服务通过 HTTP 调用该端点，fire-and-forget 模式（写入失败不阻断业务）
- IP 从请求头 `x-forwarded-for` 获取
- traceId 复用 api-gateway 已有的请求 traceId
- ai-gateway 在 `methods/exec-approval.ts` 的工具执行前后写入审计

```typescript
// 统一调用方式（各服务）
async function recordAudit(params: {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  provider?: string;
  region?: string;
  result: 'success' | 'failed';
  params?: Record<string, unknown>;
  ip?: string;
}) {
  await fetch(`${AUTH_SERVICE_URL}/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {}); // 审计写入失败不阻断业务
}
```

### 1.2 GitHub Actions CI/CD

**问题**：唯一的 GitHub Actions 只是 keepalive 心跳，无 build/test/typecheck。

**方案**：聚焦本地开发质量的 CI 流水线，不触发 Render 部署（Render 配额有限，更新在本地 docker 测试好后手动推送）。

#### 流水线

```
push / PR (任意分支)
  │
  ├─ job: typecheck
  │   └─ tsc --noEmit (shared + 6 后端 + 前端)
  │
  ├─ job: build
  │   └─ pnpm build (确保可编译)
  │
  └─ job: test
      └─ vitest run (ai-gateway 现有 15 个测试)
```

#### 设计决策

- 不触发 Render 部署
- 不构建 Docker（本地 docker compose 测试）
- keepalive workflow 保持不动
- 不加 lint（项目无 eslint 配置，强行加 lint 会报大量 error）

#### 文件

新增 `.github/workflows/ci.yml`

---

## Phase 2: AI 驱动

### 2.1 告警→AI 自动根因分析

**核心亮点**：告警触发后，AI Agent 自动分析根因并给出修复建议，形成 AIOps 闭环。

#### 数据流

```
告警触发 (alert-engine.ts)
  │
  ├─ 1. 正常流程：写入 alert_events 表 + 通知渠道
  │
  └─ 2. 新增：异步调用 ai-gateway 内部端点
        │
        ▼
   ai-gateway POST /internal/analyze-alert
        │
        ├─ 收集上下文：告警详情 + 实例信息 + 最近 5 条指标数据
        ├─ 构造 system prompt："你是云运维专家，分析以下告警的根因"
        ├─ 调用 LLM（Plan 模式，只读分析）
        │
        └─ 结果写入 alert_events 的 ai_analysis 字段
              │
              ▼
         前端 Monitor 页面展示 AI 分析结果
```

#### 实现

- **monitor-service**：`alert-engine.ts` 触发告警时，额外调用 `POST /internal/analyze-alert`，异步不阻断
- **ai-gateway**：新增 `POST /internal/analyze-alert` 端点（仅内部访问），Plan 模式调用 LLM
- **数据库**：`alert_events` 表新增 `ai_analysis` (TEXT) 和 `ai_analyzed_at` (TIMESTAMP) 字段
- **前端**：Monitor 页面告警事件列表，已分析的事件显示 "AI 分析" 徽章，点击展开查看

#### 设计决策

- Plan 模式：只读分析，不执行工具
- 异步分析：不等待 AI 返回，完成后异步写入
- 降级策略：AI 分析失败不影响告警本身
- 不做自动修复：只做分析建议

### 2.2 Dashboard AI 洞察面板

**核心叙事**：Dashboard 不只是数字卡片，而是 AI 驱动的云资源健康概览。

#### 设计

在现有 Dashboard 下方新增两个区块：

**区块 1 - AI 健康洞察**：
- `GET /dashboard/ai-insight` 端点
- 收集：实例状态分布、最近告警、成本趋势、异常实例
- 调用 LLM 生成结构化洞察（JSON：health_score + risks[] + suggestions[]）
- 结果缓存 5 分钟

**区块 2 - Token 使用统计**：
- ai-gateway 的 `callLLM` 返回值已包含 `usage`
- 新增 `token_usage` 表记录每次 LLM 调用
- `GET /ai/token-stats` 端点返回今日/本周统计
- 前端展示趋势迷你图

#### 数据库变更

```sql
CREATE TABLE token_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  session_key VARCHAR,
  provider VARCHAR,
  model VARCHAR,
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 设计决策

- LLM 结果缓存 5 分钟：降低成本
- 洞察结构化 JSON：前端可控渲染
- Token 表与 session 关联：可按用户/会话维度统计
- 前端用 Card 组件：与现有 Dashboard 风格一致

---

## Phase 3: 可观测性与生产化

### 3.1 Prometheus /metrics 端点

**核心叙事**：云原生监控标准——面试官看到 `/metrics` 就知道你懂 Prometheus 生态。

#### 设计

monitor-service 新增 `GET /metrics` 端点，输出 Prometheus exposition format：

```
# HELP cloudops_instances_total Total instances by provider and status
# TYPE cloudops_instances_total gauge
cloudops_instances_total{provider="aws",status="running"} 5

# HELP cloudops_alerts_firing Current firing alerts
# TYPE cloudops_alerts_firing gauge
cloudops_alerts_firing{severity="critical"} 1

# HELP cloudops_ai_tokens_total Total AI tokens consumed
# TYPE cloudops_ai_tokens_total counter
cloudops_ai_tokens_total{provider="openai"} 1234567

# HELP cloudops_http_request_duration_seconds HTTP request duration
# TYPE cloudops_http_request_duration_seconds histogram
cloudops_http_request_duration_seconds_bucket{le="0.1"} 823
```

#### 实现

- monitor-service 新增 `routes/metrics.ts`：查询实例统计、firing 告警、token_usage 汇总
- nginx 路由 `/metrics` → monitor-service:3004
- 手写 Prometheus text format，不引入 prom-client 库

#### 设计决策

- 只读，不做 JWT 鉴权（遵循 Prometheus 惯例）
- 不搭 Prometheus + Grafana：只提供端点，README 说明可对接

### 3.2 K8s 生产化加固

**核心叙事**：K8s 清单从"能跑"变成"生产就绪"。

#### 改善项

| 问题 | 现状 | 改善 |
|------|------|------|
| Secret 明文 | stringData 写死凭据 | 改为 Sealed Secrets 模式 + 注释指引 |
| Postgres 密码硬编码 | `cloudops123` 写在 yaml | 从 Secret 引用 |
| 单副本无 HA | replicas:1 | app 加 HPA（min 2 max 4），pg/redis 标注用托管服务 |
| 无 PDB | 无 | 新增 PDB，保证至少 1 个可用 |
| TLS 未启用 | 全注释 | 启用 cert-manager + ClusterIssuer |
| 无 NetworkPolicy | 无 | 默认 deny-all + 允许 app→pg/redis |
| 镜像占位 | `your-registry/...` | 改为 `ghcr.io/winterfellwen/cloudops-ai:latest` |

#### 文件变更

- 修改：`k8s/02-secret.yaml` → 改为空值 + Sealed Secrets 注释
- 修改：`k8s/03-postgres.yaml` → 密码从 Secret 引用
- 修改：`k8s/05-app.yaml` → 加 resources + 探针优化
- 修改：`k8s/06-ingress.yaml` → 启用 TLS + cert-manager
- 新增：`k8s/07-hpa.yaml` → HorizontalPodAutoscaler
- 新增：`k8s/08-pdb.yaml` → PodDisruptionBudget
- 新增：`k8s/09-networkpolicy.yaml` → 默认 deny-all + 放行规则

#### 设计决策

- 不搭真实 Sealed Secrets operator：只改 yaml 结构 + 注释指引
- HPA 基于 CPU：最直观
- TLS 用 cert-manager Let's Encrypt：标注 staging/production issuer

---

## 实施顺序

```
Phase 1 (基础盘):
  1.1 审计日志接通
  1.2 GitHub Actions CI/CD

Phase 2 (AI 驱动):
  2.1 告警→AI 根因分析
  2.2 Dashboard AI 洞察面板

Phase 3 (可观测性):
  3.1 Prometheus /metrics
  3.2 K8s 生产化加固
```

每个改善项完成后部署到 Render 验证，确保不破坏现有功能。
