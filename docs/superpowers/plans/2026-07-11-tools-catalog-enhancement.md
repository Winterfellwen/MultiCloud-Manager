# 工具目录拓展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强工具目录页面：云厂商标注、AI Agent 执行记录持久化、全局/按工具查看执行历史、CI/CD 兼容性测试

**Architecture:** 复用现有 `audit_logs` 表（加 duration_ms, session_id 字段），工具定义加 `supportedProviders`，ai-agent 的 audit handler 从 console.log 改为调用 recordAudit()。前端工具目录页增加云标签显示、云厂商筛选器和执行记录区域。

**Tech Stack:** drizzle-orm/pg-core, Node.js fetch, React + TanStack Query, shadcn/ui

---

### Task 1: DB Migration — audit_logs 新增字段

**Files:**
- Create: `auth-service/migrations/002_add_tool_execution_fields.sql`
- Modify: `auth-service/src/db/schema.ts:22-39`

- [ ] **Step 1: 创建 migration SQL**

```sql
-- 002_add_tool_execution_fields.sql
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR(128);
```

- [ ] **Step 2: 更新 drizzle schema**

```typescript
// schema.ts
export const auditLogs = pgTable('audit_logs', {
  // ... existing columns ...
  durationMs: integer('duration_ms'),
  sessionId: varchar('session_id', { length: 128 }),
});
```

- [ ] **Step 3: 验证 migration**

Run the auth-service and check logs: `Applying migration: 002_add_tool_execution_fields.sql`

- [ ] **Step 4: Commit**

```bash
git add auth-service/migrations/002_add_tool_execution_fields.sql auth-service/src/db/schema.ts
git commit -m "feat: add duration_ms and session_id to audit_logs for AI tool execution tracking"
```

---

### Task 2: 工具定义 — supportedProviders

**Files:**
- Modify: `ai-gateway/src/agent/tools.ts:33-46`
- Modify: `ai-gateway/src/methods/tools-catalog.ts:7-16`

- [ ] **Step 1: ToolDefinition 加 supportedProviders 字段**

```typescript
export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  dangerLevel: DangerLevel;
  group: string;
  /** 支持的云厂商列表，空数组或 undefined 表示通用工具 */
  supportedProviders?: string[];
}
```

- [ ] **Step 2: 为现有工具标注 supportedProviders**

对每个工具检查 description（包含 `支持厂商: aws | aliyun | azure | ...` 等提示），标注合适值：

```typescript
// cloud 组（实例管理）- 大部分跨云
{
  name: 'cloud_list_instances',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle', 'render'],
},
{
  name: 'cloud_get_instance',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle', 'render'],
},
{
  name: 'cloud_start_instance',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
{
  name: 'cloud_stop_instance',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
{
  name: 'cloud_reboot_instance',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
{
  name: 'cloud_create_instance',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
{
  name: 'cloud_delete_instance',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
// cloud-resources 组（资源管理）
{
  name: 'cloud_list_resources',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle', 'render'],
},
{
  name: 'cloud_get_resource',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle', 'render'],
},
{
  name: 'cloud_delete_resource',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
{
  name: 'cloud_sync_resources',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
{
  name: 'cloud_service_call',
  supportedProviders: ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'oracle'],
},
// monitor 组（监控）- 所有监控通用
{
  name: 'monitor_get_metrics',
},
{
  name: 'monitor_list_alerts',
},
{
  name: 'monitor_get_cost',
},
// system 组
{
  name: 'shell_execute',
},
```

- [ ] **Step 3: CatalogToolItem 和 CatalogGroup 接口加 supportedProviders**

```typescript
// tools-catalog.ts
export interface CatalogToolItem {
  id: string;
  label: string;
  description: string;
  risk?: DangerLevel;
  supportedProviders?: string[];
}

export interface CatalogGroup {
  id: string;
  label: string;
  tools: CatalogToolItem[];
  /** 该组下所有工具的云厂商并集，用于前端筛选器 */
  providerSet?: string[];
}
```

- [ ] **Step 4: getToolCatalog 返回 supportedProviders**

```typescript
// tools.ts
export function getToolCatalog(): ToolGroup[] {
  return TOOL_GROUPS.map(group => ({
    ...group,
    tools: group.tools.map(tool => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      dangerLevel: tool.dangerLevel,
      parameters: { ...tool.parameters },
      supportedProviders: tool.supportedProviders,
    })),
  }));
}
```

- [ ] **Step 5: handleToolsCatalog 传递 supportedProviders**

```typescript
// tools-catalog.ts
export function handleToolsCatalog(respond: (ok: boolean, payload: unknown) => void): void {
  const catalog = getToolCatalog();
  const groups: CatalogGroup[] = catalog.map(group => ({
    id: group.id,
    label: group.label,
    tools: group.tools.map(tool => ({
      id: tool.name,
      label: tool.label,
      description: tool.description,
      risk: tool.dangerLevel,
      supportedProviders: tool.supportedProviders,
    })),
    providerSet: [...new Set(group.tools.flatMap(t => t.supportedProviders ?? []))],
  }));
  respond(true, { groups });
}
```

- [ ] **Step 6: Commit**

```bash
git add ai-gateway/src/agent/tools.ts ai-gateway/src/methods/tools-catalog.ts
git commit -m "feat: add supportedProviders to tool definitions and catalog"
```

---

### Task 3: Backend — AI 工具执行写入 audit_logs

**Files:**
- Modify: `ai-agent/src/hooks/handlers/audit-handler.ts` (全部，13 行)
- Modify: `ai-gateway/src/methods/chat.ts:207-232`

- [ ] **Step 1: 扩展 shared 类型定义**

```typescript
// shared/src/types/audit.ts — CreateAuditLogInput 加 durationMs 和 sessionId
export interface CreateAuditLogInput {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  provider?: string;
  region?: string;
  params?: Record<string, unknown>;
  result: 'success' | 'failure';
  ip?: string;
  traceId?: string;
  durationMs?: number;
  sessionId?: string;
}

// shared/src/types/audit.ts — AuditLog 加 durationMs 和 sessionId
export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  provider: string | null;
  region: string | null;
  params: Record<string, unknown> | null;
  result: 'success' | 'failure';
  ip: string | null;
  traceId: string | null;
  durationMs: number | null;
  sessionId: string | null;
}

// shared/src/utils/audit-client.ts — AuditEntry 加 durationMs 和 sessionId
export interface AuditEntry {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  provider?: string;
  region?: string;
  result: 'success' | 'failure';
  params?: Record<string, unknown>;
  ip?: string;
  traceId?: string;
  durationMs?: number;
  sessionId?: string;
}
```

- [ ] **Step 2: 更新 auth-service audit service 和 route**

```typescript
// auth-service/src/services/audit.service.ts
async log(input: CreateAuditLogInput): Promise<void> {
  await db.insert(auditLogs).values({
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    provider: input.provider,
    region: input.region,
    params: input.params,
    result: input.result,
    ip: input.ip,
    traceId: input.traceId,
    durationMs: input.durationMs,
    sessionId: input.sessionId,
  });
}
```

```typescript
// auth-service/src/routes/internal-audit.ts
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
    result: body.result ?? 'success',
    ip: body.ip,
    traceId: body.traceId,
    durationMs: body.durationMs,
    sessionId: body.sessionId,
  });
  return reply.status(201).send({ ok: true });
});
```

- [ ] **Step 3: ai-agent audit handler 改为调用 recordAudit**

```typescript
// audit-handler.ts
import { hookRunner } from '../runner.js';
import { recordAudit } from '@cloudops/shared';
import { config } from '../../config.js';

hookRunner.registerAfterToolCall(
  (ctx) => {
    recordAudit(config.authServiceUrl, {
      userId: ctx.userId,
      action: 'ai.tool_call',
      resourceType: 'ai_tool',
      resourceId: ctx.toolName,
      provider: ctx.args?.provider as string | undefined,
      result: ctx.success ? 'success' : 'failure',
      params: { args: ctx.args, sessionId: ctx.sessionId },
      durationMs: ctx.durationMs,
      sessionId: ctx.sessionId,
    });
  },
  { priority: 50 }
);
```

> 注意：需要在 ai-agent 的 Dockerfile 或 package.json 中确保 `@cloudops/shared` 包可用（build 时 reference）。

- [ ] **Step 3: ai-gateway chat.ts — 从 onToolCall 移除 audit，移到 onToolResult**

```typescript
// chat.ts — 删除 onToolCall 中的 recordAudit 调用（lines 215-223）
onToolCall: (toolCall) => {
  queuedRecordEvent(sessionKey, 'tool_call', { runId, toolCall });
  broadcastEvent(context.clients, {
    event: 'chat',
    targetSessionKey: sessionKey,
    payload: { runId, type: 'tool_call', toolCall },
  });
  // <-- 删除此处的 recordAudit
},

// chat.ts — 在 onToolResult 中添加 recordAudit
onToolResult: (result) => {
  queuedRecordEvent(sessionKey, 'tool_result', { runId, toolCallId: result.toolCallId, result });
  broadcastEvent(context.clients, {
    event: 'chat',
    targetSessionKey: sessionKey,
    payload: { runId, type: 'tool_result', toolCallId: result.toolCallId, result },
  });

  // 审计：AI 工具执行完成
  recordAudit(config.authServiceUrl, {
    userId: client.userId,
    action: 'ai.tool_call',
    resourceType: 'ai_tool',
    resourceId: result.name,
    result: result.success ? 'success' : 'failure',
    params: { sessionKey },
  });
},
```

- [ ] **Step 4: Commit**

```bash
git add ai-agent/src/hooks/handlers/audit-handler.ts ai-gateway/src/methods/chat.ts shared/src/utils/audit-client.ts
git commit -m "feat: write AI tool execution results to audit_logs via recordAudit"
```

---

### Task 4: Frontend — useToolsCatalog 类型扩展

**Files:**
- Modify: `web-console/src/hooks/useToolsCatalog.ts:6-17`

- [ ] **Step 1: 更新 TypeScript 类型**

```typescript
export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  risk?: 'low' | 'medium' | 'high';
  supportedProviders?: string[];
}

export interface ToolCatalogGroup {
  id: string;
  label: string;
  tools: ToolCatalogEntry[];
  providerSet?: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add web-console/src/hooks/useToolsCatalog.ts
git commit -m "feat: add supportedProviders and providerSet to tool catalog types"
```

---

### Task 5: Frontend — 工具目录云厂商标注 + 筛选器

**Files:**
- Modify: `web-console/src/pages/ToolsCatalog.tsx` (177 行)
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: 添加 i18n 翻译**

```json
// zh.json
{
  "tools": {
    "title": "工具目录",
    "total": "共 {{count}} 个可用工具",
    "searchPlaceholder": "搜索工具名称或描述...",
    "allRisk": "全部风险级别",
    "allProviders": "全部云厂商",
    "riskLow": "低风险",
    "riskMedium": "中风险",
    "riskHigh": "高风险",
    "connecting": "正在连接服务（{{status}}）...",
    "loadFailed": "加载失败",
    "noMatch": "暂无匹配的工具",
    "genericProvider": "通用",
    "execHistory": "执行记录",
    "noExecutions": "暂无执行记录",
    "recentExecutions": "最近执行",
    "execTime": "执行时间",
    "execUser": "用户",
    "execResult": "结果",
    "execDuration": "耗时"
  }
}
```

```json
// en.json
{
  "tools": {
    "title": "Tools",
    "total": "{{count}} tools available",
    "searchPlaceholder": "Search tools...",
    "allRisk": "All risk levels",
    "allProviders": "All providers",
    "riskLow": "Low Risk",
    "riskMedium": "Medium Risk",
    "riskHigh": "High Risk",
    "connecting": "Connecting ({{status}})...",
    "loadFailed": "Failed to load",
    "noMatch": "No matching tools",
    "genericProvider": "Generic",
    "execHistory": "Execution History",
    "noExecutions": "No executions yet",
    "recentExecutions": "Recent Executions",
    "execTime": "Time",
    "execUser": "User",
    "execResult": "Result",
    "execDuration": "Duration"
  }
}
```

- [ ] **Step 2: 云厂商筛选器 state + 提取所有 provider 列表**

```typescript
// ToolsCatalog.tsx
const [providerFilter, setProviderFilter] = useState<string>('all');

// 提取所有 unique 云厂商
const allProviders = useMemo(() => {
  if (!data?.groups) return [];
  const set = new Set<string>();
  data.groups.forEach(g => g.providerSet?.forEach(p => set.add(p)));
  return [...set].sort();
}, [data]);
```

- [ ] **Step 3: 添加云厂商筛选器 Select 到搜索栏**

在风险筛选 `<Select>` 前面或后面加入：

```tsx
<Select
  value={providerFilter}
  onChange={(e) => setProviderFilter(e.target.value)}
  className="w-full sm:w-[160px]"
>
  <option value="all">{t('tools.allProviders')}</option>
  {allProviders.map(p => (
    <option key={p} value={p}>{p}</option>
  ))}
</Select>
```

- [ ] **Step 4: 在过滤逻辑中增加云厂商过滤**

```typescript
const filteredGroups = useMemo(() => {
  if (!data?.groups) return [];
  const keyword = search.trim().toLowerCase();

  return data.groups
    .map((group) => ({
      ...group,
      tools: group.tools.filter((tool) => {
        if (riskFilter !== 'all' && tool.risk !== riskFilter) return false;
        if (providerFilter !== 'all' && (!tool.supportedProviders || !tool.supportedProviders.includes(providerFilter))) return false;
        if (!keyword) return true;
        return (
          tool.label.toLowerCase().includes(keyword) ||
          tool.description.toLowerCase().includes(keyword) ||
          tool.id.toLowerCase().includes(keyword)
        );
      }),
    }))
    .filter((group) => group.tools.length > 0);
}, [data, search, riskFilter, providerFilter]);
```

- [ ] **Step 5: 工具卡片显示云厂商标签**

在 `ToolCard` 组件中，description 下方添加：

```tsx
{/* 云厂商标签 */}
{tool.supportedProviders && tool.supportedProviders.length > 0 ? (
  <div className="mt-2 flex flex-wrap gap-1">
    {tool.supportedProviders.map(p => (
      <span key={p} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {p}
      </span>
    ))}
  </div>
) : (
  <span className="mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground/60">
    {t('tools.genericProvider')}
  </span>
)}
```

- [ ] **Step 6: Commit**

```bash
git add web-console/src/pages/ToolsCatalog.tsx web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat: add cloud provider tags and filter to tool catalog page"
```

---

### Task 6: Frontend — 执行历史展示

**Files:**
- Modify: `web-console/src/pages/ToolsCatalog.tsx`
- Modify: `shared/src/utils/audit-client.ts` (已改)
- (可能需要读取 audit 数据的新 hook)

- [ ] **Step 1: 创建 useToolExecutions hook**

```typescript
// web-console/src/hooks/useToolExecutions.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ToolExecution {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceId: string;
  provider?: string;
  result: string;
  params?: { args?: Record<string, unknown>; sessionId?: string };
  durationMs?: number;
}

export function useToolExecutions(toolName?: string, limit = 20) {
  const params = new URLSearchParams({ action: 'ai.tool_call', limit: String(limit) });
  if (toolName) params.set('resourceId', toolName);

  return useQuery({
    queryKey: ['tool-executions', toolName, limit],
    queryFn: async () => {
      const res = await api.get<ToolExecution[]>(`/audit?${params}`);
      return res;
    },
  });
}
```

> Note: 需要检查前端 API 客户端 `/audit` 端点的访问方式。如果 `api` 实例指向 api-gateway 而非 auth-service，可能需要通过 api-gateway 代理或直接调用 auth-service。

- [ ] **Step 2: 检查前端 API 客户端配置**

查看 `web-console/src/lib/api.ts` 或类似文件，确认 `/audit` 路由是否已代理。如果不存在，在 api-gateway 添加代理或在 frontend 直接调用 auth-service。这一步需要先确认现有架构。

- [ ] **Step 3: 每个工具卡片的执行记录区域（折叠）**

在 `ToolCard` 中添加展开/折叠的执行记录区域：

```tsx
function ToolCard({ tool }: { tool: ToolCatalogEntry }) {
  const { t } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);
  const { data: executions } = useToolExecutions(showHistory ? tool.id : undefined, 10);

  return (
    <Card>
      {/* 现有内容 */}
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3">{tool.description}</p>
        
        {/* 云厂商标签 */}
        {/* ... */}

        {/* 执行记录按钮 */}
        <button
          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowHistory(!showHistory)}
        >
          {t('tools.execHistory')} ({executions?.length ?? 0})
        </button>

        {/* 执行记录列表 */}
        {showHistory && (
          <div className="mt-2 space-y-1 border-t pt-2">
            {executions?.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('tools.noExecutions')}</p>
            )}
            {executions?.map(ex => (
              <div key={ex.id} className="flex items-center justify-between text-xs">
                <span>{new Date(ex.timestamp).toLocaleString()}</span>
                <span className={ex.result === 'success' ? 'text-green-600' : 'text-red-600'}>
                  {ex.result === 'success' ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: 页面底部的全局最近执行区域**

在工具目录列表下方，添加最近执行区域：

```tsx
{!isLoading && !error && (
  <div className="mt-8">
    <h2 className="text-lg font-semibold mb-3">{t('tools.recentExecutions')}</h2>
    <Card>
      <CardContent className="pt-4">
        <RecentExecutions providerFilter={providerFilter} />
      </CardContent>
    </Card>
  </div>
)}
```

`RecentExecutions` 组件：

```tsx
function RecentExecutions({ providerFilter }: { providerFilter: string }) {
  const { t } = useTranslation();
  const { data } = useToolExecutions(undefined, 50);

  if (!data) return <Loader2 className="h-4 w-4 animate-spin" />;

  const filtered = providerFilter === 'all'
    ? data
    : data.filter(ex => ex.provider === providerFilter);

  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('tools.noExecutions')}</p>;
  }

  return (
    <div className="space-y-2">
      {filtered.map(ex => (
        <div key={ex.id} className="flex items-center justify-between border-b pb-1 last:border-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs">{ex.resourceId}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{ex.userId}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {ex.durationMs && <span>{ex.durationMs}ms</span>}
            <span className={ex.result === 'success' ? 'text-green-600' : 'text-red-600'}>
              {ex.result === 'success' ? '✓' : '✗'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add web-console/src/hooks/useToolExecutions.ts web-console/src/pages/ToolsCatalog.tsx
git commit -m "feat: add execution history per tool and global recent executions timeline"
```

---

### Task 7: CI/CD — 工具云厂商兼容性测试

**Files:**
- Create: `scripts/test-tool-compat.mjs`
- Modify: `package.json` (root)

- [ ] **Step 1: 创建兼容性测试脚本**

```javascript
// scripts/test-tool-compat.mjs
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse tools.ts to extract tool definitions with supportedProviders
// This is a static analysis — we read the source file directly
const toolsPath = join(__dirname, '..', 'ai-gateway', 'src', 'agent', 'tools.ts');
const content = readFileSync(toolsPath, 'utf-8');

// Simple extraction of tool name + supportedProviders pairs
// This avoids needing to compile/run TypeScript
const toolRegex = /name:\s*['"]([^'"]+)['"][\s\S]*?supportedProviders:\s*(\[[^\]]*\])/g;
let match;
const results = [];

while ((match = toolRegex.exec(content)) !== null) {
  const name = match[1];
  const providers = JSON.parse(match[2].replace(/'/g, '"'));
  results.push({ name, providers });
}

// Output compatibility matrix
console.log('# Tool-Cloud Compatibility Matrix\n');
console.log('| Tool | ' + [...new Set(results.flatMap(r => r.providers))].join(' | ') + ' |');
console.log('|' + ['---', ...new Set(results.flatMap(r => r.providers))].map(() => '---').join('|') + '|');

for (const tool of results) {
  const allProviders = [...new Set(results.flatMap(r => r.providers))];
  const row = allProviders.map(p => tool.providers.includes(p) ? '✓' : '-');
  console.log(`| ${tool.name} | ${row.join(' | ')} |`);
}

// Check for tools that declare providers but are missing tests
// (This is a placeholder — real validation requires actual API calls)
console.log(`\nTotal tools with declared providers: ${results.length}`);

// Exit with error if any tool has empty supportedProviders that should have them
// (For now, just generate the matrix)
process.exit(0);
```

- [ ] **Step 2: 在根 package.json 添加 script**

```json
{
  "scripts": {
    "test:tool-compat": "node scripts/test-tool-compat.mjs"
  }
}
```

- [ ] **Step 3: 运行验证**

```bash
node scripts/test-tool-compat.mjs
```

Expected output: markdown compatibility matrix table.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-tool-compat.mjs package.json
git commit -m "feat: add tool-cloud compatibility test script"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 构建并启动**

```bash
docker compose build app && docker compose up -d app
```

- [ ] **Step 2: 验证 migration**

```bash
docker logs multicloud-manager-app-1 2>&1 | grep -i migration
```
Expected: `Applying migration: 002_add_tool_execution_fields.sql`

- [ ] **Step 3: 验证前端工具目录**

打开 `http://localhost/tools`，确认：
- 工具卡片显示云厂商标签
- 云厂商筛选器正常工作
- 搜索和风险筛选仍正常

- [ ] **Step 4: 验证 AI Agent 执行记录**

通过 AI Agent 触发一个工具调用（例如在聊天中问"列出所有实例"），然后：
- 检查工具目录页的执行记录区域是否有新记录
- 检查 `audit_logs` 表是否有对应记录
- 验证 duration_ms 和 session_id 已写入

```bash
docker exec multicloud-manager-postgres-1 psql -U postgres -d cloudops -c "SELECT action, resource_id, result, duration_ms, session_id FROM audit_logs WHERE action='ai.tool_call' ORDER BY timestamp DESC LIMIT 5;"
```

- [ ] **Step 5: 修复发现的问题**

如有问题，修复并重新构建。重复 Step 1-4 直至全部通过。

- [ ] **Step 6: Push**

```bash
git push
```
