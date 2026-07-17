# AI 健康洞察可靠性改进设计

## 概述

改进 AI 健康洞察功能，当不可用时提供明确的诊断链路，帮助用户快速定位问题环节。

## 数据流

```
Dashboard (AiInsightCard)
  │  useAiInsight() 轮询每 5min / 手动刷新
  ▼
GET /monitor/dashboard/ai-insight
  │
  │  Step 1: 数据采集 - DB 查询（实例、告警、费用）
  │  Step 2: AI 服务调用 - POST ai-gateway /internal/insight
  │  Step 3: LLM 响应 - 解析 JSON，提取 healthScore/risks/suggestions
  │
  ▼
返回 200 + { ok, diagnostics, healthScore?, risks?, suggestions? }
```

## 响应格式

### 成功响应

```json
{
  "ok": true,
  "healthScore": 85,
  "risks": [
    { "title": "CPU 使用率持续 >80%", "severity": "high", "suggestion": "考虑扩容" }
  ],
  "suggestions": ["建议对高负载实例进行扩容"],
  "raw": "...",
  "lastSuccessAt": "2026-07-17T03:00:00Z",
  "diagnostics": [
    { "step": "数据采集",     "status": "ok",  "detail": "6 实例, 0 告警, ¥0.00", "duration": 12 },
    { "step": "AI 服务调用",  "status": "ok",  "detail": "200ms",                 "duration": 200 },
    { "step": "LLM 响应",    "status": "ok",  "detail": "gpt-4o, 320 tokens",    "duration": 3500 }
  ]
}
```

### 失败响应

```json
{
  "ok": false,
  "lastSuccessAt": "2026-07-17T01:00:00Z",
  "diagnostics": [
    { "step": "数据采集",     "status": "ok",  "detail": "6 实例, 0 告警",                "duration": 12 },
    { "step": "AI 服务调用",  "status": "fail", "detail": "连接失败: connect ECONNREFUSED",
      "suggestion": "AI 网关服务未启动，请检查 ai-gateway 进程" },
    { "step": "LLM 响应",    "status": "skip", "detail": "上游服务不可用，未执行" }
  ]
}
```

### diagnostics 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| step | string | 环节名称：数据采集 / AI 服务调用 / LLM 响应 |
| status | string | ok / fail / skip（前置失败时后续自动 skip） |
| detail | string | 人类可读的描述 |
| suggestion | string? | 可操作的建议（仅 fail 时有） |
| duration | number? | 耗时毫秒（仅 ok 时有） |

## 前端诊断面板

### 布局

成功时（诊断信息折叠，绿色）：

```
┌─────────────────────────────────────────┐
│ AI 健康洞察                     [立即刷新] │
│  Health Score: 85/100 (绿色大号)         │
│  Risks / Suggestions 列表                │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─      │
│  ▼ 诊断信息                             │
│    ○ 数据采集    ✓ 12ms                 │
│    ○ AI 服务调用 ✓ 200ms                │
│    ○ LLM 响应   ✓ 3.5s                  │
│  上次成功: 5 分钟前                      │
└─────────────────────────────────────────┘
```

失败时（诊断信息默认展开，红色边框）：

```
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─      │
│  ▼ 诊断信息 (红色边框/背景)              │
│    ○ 数据采集    ✓ 12ms                  │
│    ○ AI 服务调用 ✗ 连接失败              │
│      建议: AI 网关服务未启动...           │
│    ○ LLM 响应   ─ 已跳过                 │
│  上次成功: 2 小时前                      │
└─────────────────────────────────────────┘
```

### 状态定义

```
status === "ok"   → 绿色 ✓ + duration
status === "fail"  → 红色 ✗ + detail + suggestion（灰色小字）
status === "skip"  → 灰色 ─ + "已跳过"
```

### 行为

- ok 时：诊断面板折叠，仅在下方显示 `▼ 诊断信息`
- fail 时：诊断面板默认展开（红色边框/背景）
- 始终显示"上次成功时间"（从 `lastSuccessAt` 读取）
- 面板可手动折叠/展开

## 后端改造

### monitor-service `GET /ai-insight`

不再抛 HTTP 5xx，始终返回 200。每一步报错时捕获异常并追加 diagnostics 记录，后续步骤标记为 skip。

```typescript
const diagnostics: DiagnosticEntry[] = [];

// Step 1: 数据采集
try {
  const start = Date.now();
  // ... 现有 DB 查询逻辑
  diagnostics.push({ step: "数据采集", status: "ok", detail: `...`, duration: Date.now() - start });
} catch (e) {
  diagnostics.push({ step: "数据采集", status: "fail", detail: e.message, suggestion: "..." });
  // 后续步骤标记 skip
}

// Step 2: AI 服务调用
if (lastStepFailed) {
  diagnostics.push({ step: "AI 服务调用", status: "skip" });
} else {
  try {
    const res = await fetch(config.aiGatewayUrl + "/internal/insight", { ... });
    // ...
  } catch (e) {
    diagnostics.push({ step: "AI 服务调用", status: "fail", detail: ..., suggestion: ... });
  }
}

// Step 3: LLM 响应
// ...
```

### ai-gateway `POST /internal/insight`

返回结构化结果，不再抛 500：

成功：
```json
{
  "ok": true,
  "healthScore": 85,
  "risks": [...],
  "suggestions": [...],
  "raw": "...",
  "llmDiagnostics": { "model": "gpt-4o", "tokens": 320, "duration": 3500 }
}
```

失败：
```json
{
  "ok": false,
  "error": "LLM_API_ERROR",
  "message": "401: invalid API key",
  "suggestion": "请检查 AI 设置中的 API Key"
}
```

### 缓存策略

| 场景 | 缓存 TTL |
|------|----------|
| 成功 | 5 分钟（现有不变） |
| 失败 | 1 分钟（快速恢复，避免重复请求） |
| lastSuccessAt | 持久化在缓存中，每次成功更新 |

## 涉及修改的文件

| 文件 | 修改内容 |
|------|----------|
| `monitor-service/src/routes/dashboard.ts` | 重构 `/ai-insight`：捕获每一步异常，构建 diagnostics 数组，返回 200 |
| `monitor-service/src/config.ts` | 已改：默认 URL 使用 `127.0.0.1` |
| `ai-gateway/src/internal/dashboard-insight.ts` | 返回结构化 `{ ok, ... }` 而非直接抛异常 |
| `ai-gateway/src/index.ts` | `/internal/insight` 根据 `generateDashboardInsight` 的 `ok` 字段决定响应 |
| `web-console/src/components/dashboard/AiInsightCard.tsx` | 新增诊断面板，根据 `ok` 字段显示不同状态 |
| `web-console/src/hooks/useAiInsights.ts` | 适配新响应格式 |
| `web-console/src/types/aiInsights.ts` | 新增 `AiInsightResponse` / `DiagnosticEntry` 类型 |
