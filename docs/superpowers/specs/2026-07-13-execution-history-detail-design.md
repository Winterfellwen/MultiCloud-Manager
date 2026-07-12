# 执行记录详情展示增强设计

## 概述

增强 ToolsCatalog 页面的"最近执行"区域，将简单的列表改为功能完整的表格视图，支持更多信息列、详情查看、批量下载和排序。

## 目标

- 表格展示：工具名称、资源对象、云平台、时间、结果、用户、用户组
- 行内展开查看基本详情 + 弹窗查看完整信息
- CSV / JSON 批量下载
- 列头排序

## 当前状态

- `RecentExecutions` 组件是一个简单的 div 列表，只显示 `resourceId`、`userId`、`durationMs`、`result`
- `useToolExecutions` hook 用原始 fetch 调用 `GET /audit/?action=ai.tool_call`
- `AuditLogRow` 前端类型缺少 `durationMs` 和 `sessionId`
- 实例名称未存储，只在 `params` 中有实例ID
- 用户/用户组信息未在审计查询中返回

## 阶段一：前端增强

### 表格组件

替换 `RecentExecutions` 为 `<ExecutionTable>` 组件：

| 列 | 数据来源 | 说明 |
|------|-----------|------|
| 工具名称 | `resourceId` | 如 `cloud_create_instance` |
| 资源对象 | `params` 中提取 | 显示 `instanceId` + `name`（如有） |
| 云平台 | `provider` | Badge 显示 |
| 时间 | `timestamp` | `toLocaleString()` 格式化 |
| 结果 | `result` | success/failure Badge |
| 用户 | `userId` → 映射 | 前端缓存 `/users` 列表做映射 |
| 用户组 | `userId` → `team` | 从用户列表取 team 字段 |
| 操作 | — | "详情"按钮 |

### 交互

- **列头排序**：点击工具名、时间、结果列头排序（客户端排序，当前页数据）
- **行内展开**：点击行展开详情面板，显示 `durationMs`、`region`、`ip`、`traceId`、`params` JSON
- **详情弹窗**：展开区域内有"查看完整详情"按钮 → Modal 展示全部字段的格式化信息

### 批量下载

表格上方放置"导出"下拉按钮：

- CSV 格式：逗号分隔，UTF-8 BOM（Excel 兼容），列头用中文
- JSON 格式：保留完整字段的数组
- 下载文件名：`executions-{日期}.csv` / `executions-{日期}.json`

### 用户映射

- 页面加载时调用 `GET /users` 获取全量用户列表
- 用 `Map<userId, { username, team }>` 做 O(1) 查找
- 缓存到组件级别，避免重复请求

### 数据层扩展

扩展 `ToolExecution` 接口，补充后端返回的所有字段：

```typescript
export interface ToolExecution {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceId: string;
  resourceType: string | null;
  provider: string | null;
  region: string | null;
  params: Record<string, unknown> | null;
  result: string;
  ip: string | null;
  traceId: string | null;
  durationMs: number | null;
  sessionId: string | null;
}
```

`useToolExecutions` 改用原生 `fetch`（不变），但要同步更新 URL 参数传递。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `web-console/src/pages/ToolsCatalog.tsx` | 重写 `RecentExecutions` 为 `ExecutionTable`，新增 `ExecutionModal`、下载逻辑、排序逻辑 |
| `web-console/src/hooks/useToolExecutions.ts` | 扩展 `ToolExecution` 接口，补充字段 |
| `web-console/src/hooks/useUsers.ts` | 新建 hook：`GET /users` 返回全量用户列表 |
| `web-console/src/api/users.ts` | 新建 API 客户端（如不存在） |
| `web-console/src/i18n/locales/zh.json` | 补充表格列头、下载、详情等翻译 |
| `web-console/src/i18n/locales/en.json` | 同上 |

### 潜在问题

- `/users` 接口需要 `admin` 或 `user:view` 权限
- 用户列表可能较大，考虑分页获取或仅获取必要字段
- 资源名称从 `params` 提取依赖于 tool call 的参数结构（不同工具参数名不同）

## 阶段二：后端增强

### 数据库 Migration 006

```sql
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_name VARCHAR(256);
```

### ai-agent 改动

修改 `recordAudit()` 调用，在执行工具后从结果中提取目标资源名称：

```typescript
// ai-agent 中调用 recordAudit 时
const resourceName = extractResourceName(toolResult, params);
await recordAudit({
  ...rest,
  resourceName,
});
```

不同工具的提取逻辑：
- `cloud_create_instance`：从结果中取 `instanceName` 或 `name`
- `cloud_start_instance` / `cloud_stop_instance` / `cloud_reboot_instance` / `cloud_delete_instance`：可从结果或 params 中取
- `cloud_get_instance` / `cloud_list_instances`：从结果中提取

### 审计查询增强

`audit.service.ts` 增加 JOIN：

```sql
SELECT audit_logs.*, users.username, users.team AS user_team, teams.name AS team_name
FROM audit_logs
LEFT JOIN users ON audit_logs.user_id = users.id
LEFT JOIN teams ON users.team_id = teams.id
```

同时返回 `total` 计数字段支持真分页：

```sql
SELECT COUNT(*) OVER() as total, ...
```

返回格式：

```json
{
  "data": [...],
  "total": 256
}
```

### 前端迁移（阶段二）

- 收到后端返回的 `username` / `teamName` 后，去掉阶段一中的 `/users` 映射逻辑
- 支持 `total` 实现真分页

## 非功能性需求

- 表格响应式：小屏幕隐藏部分列（资源对象、用户组）
- 下载编码：CSV 用 UTF-8 BOM 确保 Excel 正确打开中文
- 性能：用户列表和审计列表可并行加载
