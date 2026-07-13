# Execution History Detail Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple "最近执行" list with a feature-rich table showing tool name, resource object, cloud platform, time, result, user, user group; support inline expand, detail modal, column sorting, and CSV/JSON batch download.

**Architecture:** Phase 1 is pure frontend — extends the existing `ToolExecution` type, adds utility functions for export/resource-extraction, creates `ExecutionTable` and `ExecutionDetailModal` components, wires them into `ToolsCatalog.tsx` replacing `RecentExecutions`.

**Tech Stack:** React + TypeScript + TanStack Query + Tailwind + i18next + lucide-react

---

### Task 1: Extend ToolExecution type

**Files:**
- Modify: `web-console/src/hooks/useToolExecutions.ts:5-15`

- [ ] **Step 1: Replace the ToolExecution interface**

Old (lines 5-15):
```typescript
export interface ToolExecution {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceId: string;
  provider?: string;
  result: string;
  params?: { sessionId?: string };
  durationMs?: number;
}
```

New:
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

### Task 2: Create execution utility module

**Files:**
- Create: `web-console/src/lib/execution-utils.ts`

- [ ] **Step 1: Create the utility file**

```typescript
import type { ToolExecution } from '@/hooks/useToolExecutions';

/** 从 params 中提取资源标识（实例ID/名称等） */
export function extractResourceInfo(ex: ToolExecution): { id?: string; name?: string } {
  if (!ex.params) return {};
  const p = ex.params;
  // 不同工具的参数结构不同，尝试常见字段名
  const id = (p.instanceId as string) || (p.resourceId as string) || (p.id as string) || undefined;
  const name = (p.name as string) || (p.instanceName as string) || (p.displayName as string) || undefined;
  return { id, name };
}

/** 用户友好时间格式 */
export function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

/** 排序函数工厂 */
export type SortField = 'toolName' | 'time' | 'result';
export type SortDir = 'asc' | 'desc';

export function sortExecutions(data: ToolExecution[], field: SortField, dir: SortDir): ToolExecution[] {
  return [...data].sort((a, b) => {
    let cmp = 0;
    if (field === 'toolName') cmp = a.resourceId.localeCompare(b.resourceId);
    else if (field === 'time') cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    else if (field === 'result') cmp = a.result.localeCompare(b.result);
    return dir === 'asc' ? cmp : -cmp;
  });
}

/** 导出 CSV（UTF-8 BOM 确保 Excel 正确显示中文） */
export function downloadCSV(data: ToolExecution[], filename: string) {
  const headers = ['工具名称', '资源ID', '资源名称', '云平台', '时间', '结果', '用户ID', '耗时(ms)'];
  const rows = data.map(ex => {
    const info = extractResourceInfo(ex);
    return [
      ex.resourceId,
      info.id ?? '',
      info.name ?? '',
      ex.provider ?? '',
      formatTime(ex.timestamp),
      ex.result,
      ex.userId,
      ex.durationMs != null ? String(ex.durationMs) : '',
    ];
  });
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/** 导出 JSON */
export function downloadJSON(data: ToolExecution[], filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### Task 3: Create ExecutionTable component

**Files:**
- Create: `web-console/src/components/execution/ExecutionTable.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown,
  Download, Eye,
} from 'lucide-react';
import { useToolExecutions, type ToolExecution } from '@/hooks/useToolExecutions';
import { usersApi } from '@/api/users';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  extractResourceInfo, formatTime, sortExecutions, downloadCSV, downloadJSON,
  type SortField, type SortDir,
} from '@/lib/execution-utils';
import { ExecutionDetailModal } from './ExecutionDetailModal';

interface Props {
  providerFilter: string;
}

export function ExecutionTable({ providerFilter }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useToolExecutions(undefined, 200);
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
  });
  const userMap = useMemo(() => {
    if (!users) return new Map<string, { username: string; team: string }>();
    return new Map(users.map(u => [u.id, { username: u.username, team: u.team }]));
  }, [users]);

  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<ToolExecution | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'time' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3 w-3 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />;
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const f = providerFilter === 'all'
      ? data
      : data.filter(ex => ex.provider === providerFilter);
    return sortExecutions(f, sortField, sortDir);
  }, [data, providerFilter, sortField, sortDir]);

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  if (!data || filtered.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('tools.noExecutions')}</p>;
  }

  return (
    <div>
      {/* 导出工具栏 */}
      <div className="flex items-center justify-end mb-2 gap-1">
        <Button variant="outline" size="sm" onClick={() => downloadCSV(filtered, `executions-${new Date().toISOString().slice(0, 10)}.csv`)}>
          <Download className="mr-1 h-3 w-3" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadJSON(filtered, `executions-${new Date().toISOString().slice(0, 10)}.json`)}>
          <Download className="mr-1 h-3 w-3" /> JSON
        </Button>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-8 p-2"></th>
              <th className="p-2 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('toolName')}>
                {t('tools.execToolName')} <SortIcon field="toolName" />
              </th>
              <th className="p-2 text-left font-medium">{t('tools.execResource')}</th>
              <th className="p-2 text-left font-medium">{t('tools.execProvider')}</th>
              <th className="p-2 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('time')}>
                {t('tools.execTime')} <SortIcon field="time" />
              </th>
              <th className="p-2 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('result')}>
                {t('tools.execResult')} <SortIcon field="result" />
              </th>
              <th className="p-2 text-left font-medium">{t('tools.execUser')}</th>
              <th className="p-2 text-left font-medium">{t('tools.execTeam')}</th>
              <th className="p-2 text-left font-medium">{t('tools.execAction')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ex => {
              const user = userMap.get(ex.userId);
              const info = extractResourceInfo(ex);
              const isExpanded = expandedId === ex.id;
              return (
                <tr key={ex.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ex.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="p-2 font-mono text-xs">{ex.resourceId}</td>
                  <td className="p-2 text-xs">
                    {info.id && <span className="font-mono">{info.id}</span>}
                    {info.name && <span className="ml-1 text-muted-foreground">({info.name})</span>}
                    {!info.id && !info.name && <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="p-2 text-xs">{ex.provider || '-'}</td>
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatTime(ex.timestamp)}</td>
                  <td className="p-2">
                    <Badge variant={ex.result === 'success' ? 'success' : 'destructive'} className="text-[10px] px-1.5 py-0">
                      {ex.result === 'success' ? '✓' : '✗'}
                    </Badge>
                  </td>
                  <td className="p-2 text-xs">{user?.username || ex.userId.slice(0, 8) + '...'}</td>
                  <td className="p-2 text-xs text-muted-foreground">{user?.team || '-'}</td>
                  <td className="p-2">
                    <button
                      onClick={() => setModalTarget(ex)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" /> {t('tools.execDetail')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 行内展开详情 */}
      {filtered.map(ex => {
        if (expandedId !== ex.id) return null;
        return (
          <div key={`${ex.id}-detail`} className="rounded-md border bg-muted/20 p-3 mt-1 text-xs space-y-1">
            <div><span className="font-medium">{t('audit.fullUserId')}:</span> {ex.userId}</div>
            {ex.resourceType && <div><span className="font-medium">{t('audit.resourceType')}:</span> {ex.resourceType}</div>}
            {ex.region && <div><span className="font-medium">{t('audit.region')}:</span> {ex.region}</div>}
            {ex.ip && <div><span className="font-medium">{t('audit.ip')}:</span> {ex.ip}</div>}
            {ex.traceId && <div><span className="font-medium">{t('audit.traceId')}:</span> {ex.traceId}</div>}
            {ex.durationMs != null && <div><span className="font-medium">{t('tools.execDuration')}:</span> {ex.durationMs}ms</div>}
            {ex.sessionId && <div><span className="font-medium">Session:</span> {ex.sessionId}</div>}
            {ex.params && (
              <div>
                <span className="font-medium">{t('audit.params')}:</span>
                <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-xs">
                  {JSON.stringify(ex.params, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}

      {modalTarget && (
        <ExecutionDetailModal
          execution={modalTarget}
          user={modalTarget.userId ? userMap.get(modalTarget.userId) ?? null : null}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  );
}
```

### Task 4: Create ExecutionDetailModal component

**Files:**
- Create: `web-console/src/components/execution/ExecutionDetailModal.tsx`

- [ ] **Step 1: Write the modal component**

```typescript
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { ToolExecution } from '@/hooks/useToolExecutions';
import { extractResourceInfo, formatTime } from '@/lib/execution-utils';

interface Props {
  execution: ToolExecution;
  user: { username: string; team: string } | null;
  onClose: () => void;
}

export function ExecutionDetailModal({ execution: ex, user, onClose }: Props) {
  const { t } = useTranslation();
  const info = extractResourceInfo(ex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-base">{t('tools.executionDetail')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-3 text-sm">
          <Row label={t('tools.execToolName')} value={ex.resourceId} mono />
          <Row label={t('tools.execResource')} value={info.id ? `${info.id}${info.name ? ` (${info.name})` : ''}` : '-'} mono />
          <Row label={t('tools.execProvider')} value={ex.provider || '-'} />
          <Row label={t('audit.region')} value={ex.region || '-'} />
          <Row label={t('tools.execTime')} value={formatTime(ex.timestamp)} />
          <Row label={t('tools.execResult')} value={ex.result} />
          <Row label={t('tools.execDuration')} value={ex.durationMs != null ? `${ex.durationMs}ms` : '-'} />
          <Row label={t('audit.fullUserId')} value={ex.userId} mono />
          <Row label={t('tools.execUser')} value={user?.username || '-'} />
          <Row label={t('tools.execTeam')} value={user?.team || '-'} />
          <Row label={t('audit.ip')} value={ex.ip || '-'} />
          <Row label={t('audit.traceId')} value={ex.traceId || '-'} />
          <Row label="Session ID" value={ex.sessionId || '-'} />

          {ex.params && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">{t('audit.params')}</span>
              <pre className="rounded bg-muted p-3 font-mono text-xs overflow-x-auto">
                {JSON.stringify(ex.params, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs text-right max-w-[60%] break-all' : 'text-right'}>{value}</span>
    </div>
  );
}
```

### Task 5: Update i18n translations

**Files:**
- Modify: `web-console/src/i18n/locales/zh.json:447-451`
- Modify: `web-console/src/i18n/locales/en.json:447-451`

- [ ] **Step 1: Update Chinese translations**

Replace lines 447-451 in zh.json:
```json
    "execTime": "执行时间",
    "execUser": "用户",
    "execResult": "结果",
    "execDuration": "耗时"
```

With:
```json
    "execTime": "执行时间",
    "execUser": "用户",
    "execResult": "结果",
    "execDuration": "耗时",
    "execToolName": "工具名称",
    "execResource": "资源对象",
    "execProvider": "云平台",
    "execTeam": "用户组",
    "execAction": "操作",
    "execDetail": "详情",
    "executionDetail": "执行详情",
    "exportCSV": "导出 CSV",
    "exportJSON": "导出 JSON"
```

- [ ] **Step 2: Update English translations**

Replace lines 447-451 in en.json:
```json
    "execTime": "Time",
    "execUser": "User",
    "execResult": "Result",
    "execDuration": "Duration"
```

With:
```json
    "execTime": "Time",
    "execUser": "User",
    "execResult": "Result",
    "execDuration": "Duration",
    "execToolName": "Tool",
    "execResource": "Resource",
    "execProvider": "Provider",
    "execTeam": "Team",
    "execAction": "Actions",
    "execDetail": "Details",
    "executionDetail": "Execution Details",
    "exportCSV": "Export CSV",
    "exportJSON": "Export JSON"
```

### Task 6: Wire ExecutionTable into ToolsCatalog

**Files:**
- Modify: `web-console/src/pages/ToolsCatalog.tsx:4,166-174,180-213`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { Search, Loader2, AlertCircle, Wrench } from 'lucide-react';
```

With:
```typescript
import { Search, Loader2, AlertCircle, Wrench, Download } from 'lucide-react';
```

Add after line 6 (`import { useToolExecutions } from '@/hooks/useToolExecutions';`):
```typescript
import { ExecutionTable } from '@/components/execution/ExecutionTable';
```

- [ ] **Step 2: Replace RecentExecutions usage**

Replace lines 165-175:
```tsx
      {/* 全局最近执行区域 */}
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

With:
```tsx
      {/* 全局最近执行区域 */}
      {!isLoading && !error && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">{t('tools.recentExecutions')}</h2>
          <Card>
            <CardContent className="pt-4">
              <ExecutionTable providerFilter={providerFilter} />
            </CardContent>
          </Card>
        </div>
      )}
```

- [ ] **Step 3: Remove the RecentExecutions component**

Delete lines 180-213 (the entire `RecentExecutions` function):
```typescript
function RecentExecutions({ providerFilter }: { providerFilter: string }) {
  ...
}
```

### Task 7: Build and verify

- [ ] **Step 1: Build the frontend**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && docker compose build app`
Expected: Build succeeds, no TypeScript or lint errors.

- [ ] **Step 2: Deploy and verify in browser**

Run: `docker compose up -d app`
Then browse to `http://localhost/tools` (login as admin/Admin123!) and verify:
- The "最近执行" section shows a table with all columns
- Columns are sortable by clicking headers
- Export CSV/JSON buttons work
- Clicking a row expands inline details
- Clicking "详情" opens the modal
- Resource ID/name extracted from params
- Username and team shown (from users API)
