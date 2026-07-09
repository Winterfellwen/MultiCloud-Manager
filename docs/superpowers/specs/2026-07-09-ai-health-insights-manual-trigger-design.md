# AI Health Insights Manual Trigger

## 背景

当前 AI 健康洞察仅在 Dashboard 页面自动加载，React Query 每 5 分钟自动刷新一次。用户无法手动触发即时洞察，也无法查看历史记录。

## 目标

1. Dashboard Insight 卡片增加一键刷新按钮
2. 新增独立 AI 运维页面（`/ai-ops`），包含 Insight + Token 用量 + 历史记录
3. 每次手动触发的结果持久化到 `insight_history` 表，支持历史回溯

## 后端设计

### 1. `GET /monitor/dashboard/ai-insight?refresh=true`

在 `monitor-service/src/routes/dashboard.ts` 中，现有 `/ai-insight` 端点新增可选 query 参数 `refresh`：

- `refresh=true` → 跳过缓存，强制收集 context 并调用 ai-gateway 生成新洞察
- 无参数或 `refresh=false` → 走现有缓存逻辑（5 分钟 TTL）

无论是否 refresh，生成的洞察都写入缓存并存入 `insight_history` 表。

### 2. `GET /monitor/dashboard/ai-insight/history`

新增端点，返回最近 20 条历史记录，按 `createdAt` 降序排列。

### 3. 新表 `insight_history`

Drizzle schema：

```typescript
export const insightHistory = createTable('insight_history', {
  id: serial('id').primaryKey(),
  schema: text('schema').notNull(),            // 多租户隔离
  healthScore: integer('health_score').notNull(),
  risks: text('risks'),                        // JSON array 字符串
  suggestions: text('suggestions'),            // JSON array 字符串
  raw: text('raw'),                            // LLM 原始响应
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## 前端设计

### 1. Dashboard 刷新按钮

Insight 卡片标题旁加 `RefreshCw` 按钮，调用 `useAiInsight` 返回的 `refetch()`（不加 `?refresh=true`，走缓存）。按钮在加载时旋转。

### 2. 独立页面 `/ai-ops`

新增页面，包含：

- **AI 健康洞察卡片** — 与 Dashboard 共用 `AiInsightCard` 组件，但刷新按钮强制加 `?refresh=true` 跳过缓存
- **Token 用量统计** — 复用现有 `useTokenStats` hook 和展示逻辑
- **历史记录列表** — 调用 `GET /monitor/dashboard/ai-insight/history`，展示每次手动触发的评分 + 时间 + 风险预览

### 3. 组件复用

抽取 `AiInsightCard` 共享组件（`web-console/src/components/dashboard/AiInsightCard.tsx`），接收 `onRefresh` 回调 prop，Dashboard 和 /ai-ops 各自传入不同刷新逻辑。

## 路由 & 导航

- `App.tsx`: 新增受保护路由 `/ai-ops`
- `Sidebar.tsx`: 新增导航项 `AI 运维`，图标 `Brain`

## i18n 新增键

| Key | en | zh |
|-----|----|----|
| `nav.aiOps` | AI Ops | AI 运维 |
| `aiOps.title` | AI Operations | AI 运维 |
| `aiOps.insightHistory` | Insight History | 洞察历史 |
| `aiOps.triggerNow` | Refresh | 立即刷新 |
| `aiOps.refreshing` | Refreshing... | 刷新中... |
| `common.refresh` | Refresh | 刷新 |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `monitor-service/src/routes/dashboard.ts` | 加 `?refresh` 参数 + `/history` 端点 |
| `shared/src/schema/insightHistory.ts` | 新建 `insight_history` 表 schema |
| `web-console/src/api/aiInsights.ts` | 加 `getInsightHistory()` 方法 |
| `web-console/src/hooks/useAiInsights.ts` | 加 `useInsightHistory()` hook |
| `web-console/src/components/dashboard/AiInsightCard.tsx` | 新建共享组件 |
| `web-console/src/pages/Dashboard.tsx` | 替换 Insight 卡片为共享组件 + 刷新按钮 |
| `web-console/src/pages/AiOps.tsx` | 新建页面 |
| `web-console/src/App.tsx` | 加 `/ai-ops` 路由 |
| `web-console/src/components/Sidebar.tsx` | 加导航项 |
| `web-console/src/i18n/locales/en.json` | 加 i18n 键 |
| `web-console/src/i18n/locales/zh.json` | 加 i18n 键 |
