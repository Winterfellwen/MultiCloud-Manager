# 工具目录拓展设计

## 概述

扩展现有"工具目录"页面，从只读目录升级为包含云厂商标注、AI Agent 执行记录展示、以及 CI/CD 兼容性验证的完整工具管理体系。

## 数据模型

### audit_logs 表扩展

表 `audit_logs`（auth-service）新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `duration_ms` | `integer` | 工具执行耗时 |
| `session_id` | `varchar` | AI 会话 ID，关联同一会话的多次调用 |

现有字段复用：
- `params`（JSONB）：存工具输入参数 + sessionId
- `result`：执行结果摘要（成功时为 `success`，失败时为错误信息）
- `action`：使用 `ai.tool_call` 标识 AI 工具执行（改在执行完成后记录）

### ToolDefinition 扩展

`ai-gateway/src/agent/tools.ts` 的 `ToolDefinition` 新增：

```typescript
/** 支持的云厂商列表，空数组表示通用工具 */
supportedProviders?: string[];
```

### CatalogToolItem 扩展

`ai-gateway/src/methods/tools-catalog.ts` 返回数据中包含 `supportedProviders`。

## 架构与数据流

### 执行记录流程

```
AI Agent 执行工具
    │
    ▼
HookRunner.afterToolCall (ai-agent)
    │  ctx: toolName, args, result, success, durationMs, userId, sessionId, provider
    │
    ▼
audit-handler.ts → recordAudit() → POST /internal/audit (fire-and-forget)
    │
    ▼
audit_logs (auth-service)
```

改动点：
1. `ai-gateway/src/methods/chat.ts` 的 `onToolCall` 不再写 audit，改为 `onToolResult` 时写
2. `ai-agent/src/hooks/handlers/audit-handler.ts` 从 `console.log` 改为调用 `recordAudit()`
3. `ai-agent` 需能访问 `auth-service/internal/audit` 端点

### 工具目录数据流

```
tools.ts (工具定义 + supportedProviders)
    │ getToolCatalog()
    ▼
tools.catalog RPC → 前端 ToolsCatalog
    │
    ├─ 显示：云标签、风险级别、搜索、云厂商筛选
    │
    └─ 用户查看执行记录 → GET /audit?action=ai.tool_call&resourceId={toolName}
```

## 前端 UI

### 工具卡片增强

卡片增加一行云厂商标签（圆角小标签，显示 AWS / Azure / Aliyun 等缩写，用不同颜色区分）。

### 云厂商筛选器

在搜索栏与风险筛选之间增加一个云厂商下拉筛选框，选项从当前目录数据中动态提取。

### 执行历史（每个工具）

每个工具卡片底部增加"执行记录"区域，默认折叠，展开后显示该工具最近执行记录列表：
- 时间、用户、结果（成功/失败图标）、操作对象、耗时

### 全局执行时间线

页面底部增加"最近执行"区域，展示所有工具最近的执行记录（按时间倒序），与目录区的筛选联动。

## CI/CD 兼容性验证

新增 npm script `test:tool-compat`：

1. 遍历 `tools.ts` 中标记了 `supportedProviders` 的工具
2. 对每个工具+云厂商组合，调用一次只读操作（如 `list` 系列）
3. 输出兼容性矩阵（markdown 表格格式）
4. CI pipeline 中运行此脚本，失败则阻断 PR 合并

## 边界情况与错误处理

- **执行记录缺失**：工具目录页展示执行历史时若 API 返回空，显示"暂无执行记录"状态
- **WebSocket 未连接**：保留现有连接提示，工具目录仍可展示（仅执行历史不可用）
- **云厂商标注为空**：工具无 `supportedProviders` 时视为通用工具，显示"通用"标签
- **recordAudit 失败**：fire-and-forget 模式，不阻塞工具执行
- **CI/CD 测试跳过**：工具无 `supportedProviders` 或只有只读工具时跳过兼容性测试

## 涉及文件

### Backend
- `ai-gateway/src/agent/tools.ts` — ToolDefinition + supportedProviders
- `ai-gateway/src/methods/tools-catalog.ts` — 返回 supportedProviders
- `ai-gateway/src/methods/chat.ts` — onToolCall → onToolResult 写 audit
- `ai-agent/src/hooks/handlers/audit-handler.ts` — console.log → recordAudit()
- `auth-service/src/db/schema.ts` — audit_logs 加 duration_ms, session_id
- `auth-service/migrations/` — 新增 migration

### Frontend
- `web-console/src/pages/ToolsCatalog.tsx` — 卡片增强、云厂商筛选、执行历史
- `web-console/src/hooks/useToolsCatalog.ts` — 类型扩展
- `web-console/src/i18n/locales/zh.json` — 新增翻译
- `web-console/src/i18n/locales/en.json` — 新增翻译

### CI/CD
- `package.json` — test:tool-compat script
- `.github/workflows/` — CI workflow 集成
