# InstanceDetail 增强 & Resources/Instances 整合 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend InstanceDetail page with metrics/logs/connections cards, merge Resources and Instances pages into a single unified resource management page.

**Architecture:** Reuse topology modal tab components (MetricsTab, LogsTab, ConnectionsTab) as standalone cards in InstanceDetail. Extend `InstanceRow` type with optional metrics/logs/connections fields. Merge Instances page functionality into Resources page with a left nav toggle for "所有资源" vs "仅实例" views.

**Tech Stack:** React 18, TypeScript, React Query v5, Tailwind CSS, recharts, lucide-react icons, i18next

---

## File Structure

```
src/
├── types/cloud.ts                        # MODIFY: extend InstanceRow
├── lib/demo/mock-data.ts                 # MODIFY: add getDemoInstanceDetail()
├── lib/demo/demo-api.ts                  # MODIFY: demoGetInstance returns extended data
├── hooks/useInstances.ts                 # MODIFY: add useInstanceDetail()
├── components/instance/                  # CREATE: shared instance detail components
│   ├── InstanceMetricsCard.tsx
│   ├── InstanceLogsCard.tsx
│   ├── InstanceConnectionsCard.tsx
│   └── index.ts
├── pages/InstanceDetail.tsx              # MODIFY: add 3 new cards
├── pages/Resources.tsx                   # MODIFY: merge Instances into this page
├── App.tsx                               # MODIFY: remove /instances route
└── i18n/en.json, zh.json                # MODIFY: add new i18n keys
```

---

## Task 1: Extend InstanceRow type

**Files:**
- Modify: `web-console/src/types/cloud.ts:4-21`

- [ ] **Step 1: Add optional detail fields to InstanceRow**

Add these fields at the end of the `InstanceRow` interface (after `cloudAccountId`):

```typescript
export interface InstanceRow {
  // ... existing fields ...
  cloudAccountId: string | null;

  /** Optional extended fields (populated by detail API / demo mode) */
  metrics?: {
    cpu: Array<{ time: number; value: number }>;
    memory: Array<{ time: number; value: number }>;
    network: Array<{ time: number; value: number }>;
    disk: Array<{ time: number; value: number }>;
  };
  logs?: Array<{ timestamp: string; level: 'info' | 'warn' | 'error'; message: string }>;
  connections?: {
    incoming: Array<{ id: string; source: string; label?: string }>;
    outgoing: Array<{ id: string; target: string; label?: string }>;
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS (no new errors from this change)

- [ ] **Step 3: Commit**

```bash
git add src/types/cloud.ts && git commit -m "feat(types): extend InstanceRow with optional metrics/logs/connections fields"
```

---

## Task 2: Add getDemoInstanceDetail to mock-data.ts

**Files:**
- Modify: `web-console/src/lib/demo/mock-data.ts:415-433`

- [ ] **Step 1: Add new export function after getDemoLogs (line ~1074)**

```typescript
// ===== 实例详情数据（扩展指标/日志/连接） =====
export function getDemoInstanceDetail(id: string) {
  const rand = seededRandom(id.charCodeAt(id.length - 1) * 13 + 97);

  // Metrics: reuse existing getDemoMetrics, transform to {time, value} format
  const rawMetrics = getDemoMetrics(id, 24);
  const metrics = {
    cpu: rawMetrics.map((p, i) => ({ time: i, value: p.value })),
    memory: rawMetrics.map((p, i) => ({ time: i, value: p.value * 0.7 + 10 })),
    network: rawMetrics.map((p, i) => ({ time: i, value: Math.max(0, p.value - 30 + Math.sin(i) * 20) })),
    disk: rawMetrics.map((p, i) => ({ time: i, value: Math.max(0, p.value * 0.4 + Math.cos(i) * 10) })),
  };

  // Logs: reuse existing getDemoLogs
  const logs = getDemoLogs(id, 30);

  // Connections: generate fake upstream/downstream based on instance ID
  const otherInstances = getAllDemoInstances().filter(i => i.id !== id);
  const incomingCount = Math.floor(rand() * 3);
  const outgoingCount = Math.floor(rand() * 3);
  const incoming = Array.from({ length: incomingCount }, (_, i) => {
    const src = otherInstances[Math.floor(rand() * otherInstances.length)];
    return { id: `conn-in-${id}-${i}`, source: src?.name || src?.id || `unknown-${i}`, label: 'HTTP' };
  });
  const outgoing = Array.from({ length: outgoingCount }, (_, i) => {
    const tgt = otherInstances[Math.floor(rand() * otherInstances.length)];
    return { id: `conn-out-${id}-${i}`, target: tgt?.name || tgt?.id || `unknown-${i}`, label: 'TCP' };
  });

  return { metrics, logs, connections: { incoming, outgoing } };
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/mock-data.ts && git commit -m "feat(demo): add getDemoInstanceDetail with metrics/logs/connections"
```

---

## Task 3: Update demoGetInstance to return extended data

**Files:**
- Modify: `web-console/src/lib/demo/demo-api.ts:41-45`

- [ ] **Step 1: Import getDemoInstanceDetail and update demoGetInstance**

```typescript
import {
  // ... existing imports ...
  getDemoTopology,
  getDemoInstanceDetail,  // ADD
  // ...
} from './mock-data';
```

```typescript
export function demoGetInstance(id: string): Promise<InstanceRow> {
  const inst = getAllDemoInstances().find((i) => i.id === id);
  if (!inst) throw new Error(`Instance ${id} not found`);
  // Merge extended detail data
  const detail = getDemoInstanceDetail(id);
  return Promise.resolve({ ...inst, ...detail });
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/demo-api.ts && git commit -m "feat(demo): demoGetInstance now returns metrics/logs/connections"
```

---

## Task 4: Create InstanceMetricsCard component

**Files:**
- Create: `web-console/src/components/instance/InstanceMetricsCard.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getDemoMetrics } from '@/lib/demo/mock-data';
import { Activity } from 'lucide-react';

interface Props {
  instanceId: string;
}

const CHARTS = [
  { key: 'cpu', label: 'CPU', unit: '%', color: '#3b82f6', gradient: ['#93c5fd', '#3b82f6'] },
  { key: 'memory', label: 'Memory', unit: 'MB', color: '#8b5cf6', gradient: ['#c4b5fd', '#8b5cf6'] },
  { key: 'network', label: 'Network', unit: 'KB/s', color: '#10b981', gradient: ['#6ee7b7', '#10b981'] },
  { key: 'disk', label: 'Disk', unit: 'MB/s', color: '#f59e0b', gradient: ['#fcd34d', '#f59e0b'] },
];

export function InstanceMetricsCard({ instanceId }: Props) {
  const metrics = useMemo(() => {
    const raw = getDemoMetrics(instanceId, 24);
    return {
      cpu: raw.map((p, i) => ({ time: i, value: p.value })),
      memory: raw.map((p, i) => ({ time: i, value: p.value * 0.7 + 10 })),
      network: raw.map((p, i) => ({ time: i, value: Math.max(0, p.value - 30 + Math.sin(i) * 20) })),
      disk: raw.map((p, i) => ({ time: i, value: Math.max(0, p.value * 0.4 + Math.cos(i) * 10) })),
    };
  }, [instanceId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Metrics (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {CHARTS.map((chart) => (
            <div key={chart.key} className="border rounded-xl p-3">
              <div className="text-xs font-medium text-gray-600 mb-2">{chart.label}</div>
              <ResponsiveContainer width="100%" height={80}>
                {chart.key === 'network' ? (
                  <LineChart data={metrics[chart.key as keyof typeof metrics]}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(v: unknown) => [`${Number(v).toFixed(1)} ${chart.unit}`, chart.label]}
                    />
                    <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={1.5} dot={false} />
                  </LineChart>
                ) : (
                  <AreaChart data={metrics[chart.key as keyof typeof metrics]}>
                    <defs>
                      <linearGradient id={`inst-grad-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chart.gradient[0]} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={chart.gradient[1]} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(v: unknown) => [`${Number(v).toFixed(1)} ${chart.unit}`, chart.label]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={chart.color}
                      strokeWidth={1.5}
                      fill={`url(#inst-grad-${chart.key})`}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/instance/InstanceMetricsCard.tsx && git commit -m "feat(instance): add InstanceMetricsCard component"
```

---

## Task 5: Create InstanceLogsCard component

**Files:**
- Create: `web-console/src/components/instance/InstanceLogsCard.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDemoLogs } from '@/lib/demo/mock-data';
import { AlertTriangle, Info, XCircle, ScrollText } from 'lucide-react';

interface Props {
  instanceId: string;
}

const LEVEL_CONFIG = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function InstanceLogsCard({ instanceId }: Props) {
  const logs = useMemo(() => getDemoLogs(instanceId, 30), [instanceId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          Logs (30)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
          {logs.map((log, i) => {
            const cfg = LEVEL_CONFIG[log.level];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded ${cfg.bg}`}>
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                <span className="text-gray-400 shrink-0">{formatTime(log.timestamp)}</span>
                <span className="text-gray-700">{log.message}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/instance/InstanceLogsCard.tsx && git commit -m "feat(instance): add InstanceLogsCard component"
```

---

## Task 6: Create InstanceConnectionsCard component

**Files:**
- Create: `web-console/src/components/instance/InstanceConnectionsCard.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, ArrowLeft, ArrowUpDown, Cable } from 'lucide-react';

interface Props {
  instanceId: string;
  incoming: Array<{ id: string; source: string; label?: string }>;
  outgoing: Array<{ id: string; target: string; label?: string }>;
}

export function InstanceConnectionsCard({ instanceId, incoming, outgoing }: Props) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="h-4 w-4" />
            Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ArrowUpDown className="h-8 w-8 mb-3 opacity-50" />
            <div className="text-sm">No connections</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="h-4 w-4" />
          Connections
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {incoming.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Upstream ({incoming.length})
              </div>
              <div className="space-y-1">
                {incoming.map((edge) => (
                  <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                    <span className="font-medium">{edge.source}</span>
                    {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <ArrowRight className="h-3 w-3" /> Downstream ({outgoing.length})
              </div>
              <div className="space-y-1">
                {outgoing.map((edge) => (
                  <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                    <span className="font-medium">{edge.target}</span>
                    {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/instance/InstanceConnectionsCard.tsx && git commit -m "feat(instance): add InstanceConnectionsCard component"
```

---

## Task 7: Create index barrel for instance components

**Files:**
- Create: `web-console/src/components/instance/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
export { InstanceMetricsCard } from './InstanceMetricsCard';
export { InstanceLogsCard } from './InstanceLogsCard';
export { InstanceConnectionsCard } from './InstanceConnectionsCard';
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/instance/index.ts && git commit -m "feat(instance): add barrel export for instance components"
```

---

## Task 8: Enhance InstanceDetail page with new cards

**Files:**
- Modify: `web-console/src/pages/InstanceDetail.tsx:1-210`

- [ ] **Step 1: Add imports at top of file**

Add after existing imports (line 10):

```typescript
import { InstanceMetricsCard, InstanceLogsCard, InstanceConnectionsCard } from '@/components/instance';
```

- [ ] **Step 2: Replace the return statement to add new cards**

Replace the `return` block (lines 53-191) with:

```tsx
  return (
    <div className="space-y-6 p-3 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/resources')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">{instance.name || instance.providerInstanceId}</h1>
          <p className="text-sm text-muted-foreground">{instance.providerInstanceId}</p>
        </div>
        <InstanceStatusBadge status={instance.status} />
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('common.actions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {instance.status === 'stopped' && (
              <Button size="sm" onClick={() => handleAction('start')}>
                <Play className="h-4 w-4 mr-1" />
                {t('tooltip.start')}
              </Button>
            )}
            {instance.status === 'running' && (
              <Button size="sm" variant="outline" onClick={() => handleAction('stop')}>
                <Square className="h-4 w-4 mr-1" />
                {t('tooltip.stop')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => handleAction('reboot')}>
              <RotateCw className="h-4 w-4 mr-1" />
              {t('tooltip.reboot')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleAction('delete')}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('tooltip.delete')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            {t('instances.basicInfo', '基本信息')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('common.name')} value={instance.name || '-'} />
            <InfoRow label={t('common.provider')} value={instance.provider} />
            <InfoRow label={t('common.region')} value={instance.region} />
            <InfoRow label={t('common.status')} value={<InstanceStatusBadge status={instance.status} />} />
          </div>
        </CardContent>
      </Card>

      {/* Spec */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            {t('instances.spec')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('instances.spec')} value={specText} />
            <InfoRow label={t('instances.monthlyCost')} value={instance.monthlyCost ? `¥${parseFloat(instance.monthlyCost).toFixed(2)}` : '-'} />
          </div>
        </CardContent>
      </Card>

      {/* Network */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('instances.network', '网络信息')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Public IP" value={instance.publicIp || '-'} />
            <InfoRow label="Private IP" value={instance.privateIp || '-'} />
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      {instance.tags && Object.keys(instance.tags).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {t('instances.tags', '标签')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(instance.tags).map(([key, value]) => (
                <Badge key={key} variant="secondary">{key}: {value}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('instances.timeInfo', '时间信息')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('instances.createdAt', '创建时间')} value={formatTime(instance.createdAt)} />
            <InfoRow label={t('instances.lastSynced', '最后同步')} value={formatTime(instance.lastSyncedAt)} />
          </div>
        </CardContent>
      </Card>

      {/* NEW: Metrics Card */}
      <InstanceMetricsCard instanceId={instance.id} />

      {/* NEW: Logs Card */}
      <InstanceLogsCard instanceId={instance.id} />

      {/* NEW: Connections Card */}
      <InstanceConnectionsCard
        instanceId={instance.id}
        incoming={instance.connections?.incoming || []}
        outgoing={instance.connections?.outgoing || []}
      />
    </div>
  );
```

- [ ] **Step 3: Update the back button navigation**

Change the back button `onClick` from `navigate('/instances')` to `navigate('/resources')`:

```typescript
<Button variant="ghost" size="icon" onClick={() => navigate('/resources')}>
```

Also change the delete handler redirect from `navigate('/instances')` to `navigate('/resources')`:

```typescript
if (act === 'delete') navigate('/resources');
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/InstanceDetail.tsx && git commit -m "feat(instance): enhance InstanceDetail with metrics/logs/connections cards"
```

---

## Task 9: Merge Instances into Resources page

**Files:**
- Modify: `web-console/src/pages/Resources.tsx:1-280`

- [ ] **Step 1: Add imports for Instances functionality**

Add these imports at the top of Resources.tsx:

```typescript
import { useInstances, useInstanceAction, useSyncInstances, useCreateInstance } from '@/hooks/useInstances';
import { useDemoStore } from '@/stores/demo';
import { demoResetAll } from '@/lib/demo/demo-api';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { RotateCcw, Plus } from 'lucide-react';
import type { InstanceStatus } from '@/types/cloud';
```

- [ ] **Step 2: Add Instances-specific state and hooks inside the Resources component**

After the existing state declarations (line ~97), add:

```typescript
// Instances view state
const [viewMode, setViewMode] = useState<'all' | 'instances'>('all');
const [instanceFilters, setInstanceFilters] = useState<{ provider?: string; status?: InstanceStatus }>({});
const [createOpen, setCreateOpen] = useState(false);
const isDemoMode = useDemoStore((s) => s.isDemoMode);

const { data: instances, isLoading: instancesLoading } = useInstances(instanceFilters);
const instanceAction = useInstanceAction();
const syncInstances = useSyncInstances();
```

- [ ] **Step 3: Add filtered instances logic**

After the existing `items` and `extraCols` logic, add:

```typescript
const filteredInstances = useMemo(() => {
  if (!instances) return [];
  return instances.filter((inst) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (inst.name?.toLowerCase().includes(s)) ||
      (inst.providerInstanceId?.toLowerCase().includes(s)) ||
      (inst.publicIp?.includes(s)) ||
      (inst.region?.toLowerCase().includes(s))
    );
  });
}, [instances, search]);
```

- [ ] **Step 4: Replace the left nav with unified navigation**

Replace the `<ResourceTypeNav>` component with a unified nav that includes both resource type nav and instances view:

```tsx
<div className="flex h-full flex-col md:flex-row">
  {/* Unified Left Nav */}
  <nav className="w-full shrink-0 border-b bg-card overflow-x-auto md:w-56 md:border-b-0 md:border-r md:overflow-y-auto">
    <div className="p-3 space-y-2">
      {/* View Mode Toggle */}
      <button
        type="button"
        onClick={() => { setViewMode('all'); setSelectedType('all'); }}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
          viewMode === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <LayoutGrid className="h-4 w-4" />
        所有资源
        <span className="ml-auto text-xs opacity-80">{totalCount}</span>
      </button>
      <button
        type="button"
        onClick={() => setViewMode('instances')}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
          viewMode === 'instances'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Server className="h-4 w-4" />
        云服务器
        <span className="ml-auto text-xs opacity-80">{instances?.length || 0}</span>
      </button>
    </div>

    {/* Resource Type Nav (only in 'all' view) */}
    {viewMode === 'all' && (
      <div className="space-y-3 px-3 pb-3 md:block hidden">
        {RESOURCE_CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat) || [];
          if (items.length === 0) return null;
          const Icon = CATEGORY_ICONS[cat];
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {RESOURCE_CATEGORY_LABELS[cat]}
              </div>
              <div className="mt-1 space-y-0.5">
                {items.map((t) => {
                  const count = getCount(t.type);
                  const active = selectedType === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setSelectedType(t.type)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                        active
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <span className="truncate">{t.displayName}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    )}

    {/* Instances Provider Filter (only in 'instances' view) */}
    {viewMode === 'instances' && (
      <div className="px-3 pb-3 md:block hidden">
        <div className="space-y-1">
          {PROVIDERS.map((p) => {
            const count = instances?.filter(i => i.provider === p).length || 0;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setInstanceFilters(f => ({ ...f, provider: f.provider === p ? undefined : p }))}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
                  instanceFilters.provider === p
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span>{p}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}
  </nav>

  <div className="flex-1 space-y-6 overflow-auto p-3 md:p-6">
    {/* Header */}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl sm:text-2xl font-bold">
        {viewMode === 'instances' ? t('instances.title') : t('resources.title')}
      </h1>
      <div className="flex flex-wrap gap-2">
        {viewMode === 'instances' && isDemoMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleResetDemo}>
                <RotateCcw className="h-4 w-4 mr-1" />
                {t('instances.resetDemo')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('instances.resetDemoTip')}</TooltipContent>
          </Tooltip>
        )}
        <Button variant="outline" size="sm" onClick={viewMode === 'instances' ? handleSyncInstances : handleSync} disabled={sync.isPending || syncInstances.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${(sync.isPending || syncInstances.isPending) ? 'animate-spin' : ''}`} />
          {t('resources.sync')}
        </Button>
        {viewMode === 'instances' && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('instances.create')}
          </Button>
        )}
      </div>
    </div>

    {/* Search + Filters */}
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="w-full sm:flex-1 sm:min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={viewMode === 'instances' ? t('instances.searchPlaceholder') : t('resources.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          {viewMode === 'all' && (
            <>
              <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full sm:w-[140px]">
                <option value="">{t('resources.allProviders')}</option>
                {PROVIDERS.map((p) => (<option key={p} value={p}>{p}</option>))}
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-[140px]">
                <option value="">{t('resources.allStatus')}</option>
                <option value="running">{t('resources.running')}</option>
                <option value="stopped">{t('resources.stopped')}</option>
                <option value="pending">{t('resources.pending')}</option>
                <option value="error">{t('resources.error')}</option>
              </Select>
            </>
          )}
          {viewMode === 'instances' && (
            <>
              <Select
                value={instanceFilters.provider || ''}
                onChange={(e) => setInstanceFilters(f => ({ ...f, provider: e.target.value || undefined }))}
                className="w-full sm:w-[140px]"
              >
                <option value="">{t('instances.allProviders')}</option>
                {PROVIDERS.map((p) => (<option key={p} value={p}>{p}</option>))}
              </Select>
              <Select
                value={instanceFilters.status || ''}
                onChange={(e) => setInstanceFilters(f => ({ ...f, status: (e.target.value || undefined) as InstanceStatus | undefined }))}
                className="w-full sm:w-[140px]"
              >
                <option value="">{t('instances.allStatus')}</option>
                <option value="running">{t('instances.running')}</option>
                <option value="stopped">{t('instances.stopped')}</option>
                <option value="terminated">{t('instances.terminated')}</option>
                <option value="pending">{t('instances.pending')}</option>
                <option value="error">{t('instances.error')}</option>
              </Select>
            </>
          )}
        </div>
      </CardContent>
    </Card>

    {/* Table */}
    <Card>
      <CardContent className="pt-6">
        {viewMode === 'all' ? (
          // Resources table (existing)
          isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('resources.noResources')}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                {/* ... existing table header and body for resources ... */}
              </Table>
            </div>
          )
        ) : (
          // Instances table (new)
          instancesLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : filteredInstances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">{t('common.name')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.providerShort')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.region')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.status')}</TableHead>
                    <TableHead className="w-[100px]">{t('instances.spec')}</TableHead>
                    <TableHead className="w-[140px]">{t('instances.ip')}</TableHead>
                    <TableHead className="w-[120px]">{t('instances.monthlyCost')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstances.map((inst) => (
                    <TableRow
                      key={inst.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/instances/${inst.id}`)}
                    >
                      <TableCell className="font-medium">
                        {inst.name || inst.providerInstanceId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{inst.provider}</TableCell>
                      <TableCell>{inst.region}</TableCell>
                      <TableCell><InstanceStatusBadge status={inst.status} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {inst.cpu ? `${inst.cpu}C/${inst.memoryMb ? inst.memoryMb / 1024 : '?'}G` : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {inst.publicIp || inst.privateIp || '-'}
                      </TableCell>
                      <TableCell>
                        {inst.monthlyCost ? `¥${parseFloat(inst.monthlyCost).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inst.status === 'stopped' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleInstanceAction(inst.id, 'start'); }}>
                                  <Play className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('tooltip.start')}</TooltipContent>
                            </Tooltip>
                          )}
                          {inst.status === 'running' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleInstanceAction(inst.id, 'stop'); }}>
                                  <Square className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('tooltip.stop')}</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleInstanceAction(inst.id, 'reboot'); }}>
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('tooltip.reboot')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setConfirmDelete(inst.id); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('tooltip.delete')}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </CardContent>
    </Card>
  </div>
```

- [ ] **Step 5: Add instances-specific handler functions**

Add these functions inside the Resources component, after the existing `handleSync` function:

```typescript
async function handleInstanceAction(id: string, act: 'start' | 'stop' | 'reboot' | 'delete') {
  try {
    await instanceAction.mutateAsync({ id, action: act });
    setConfirmDelete(null);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
  }
}

async function handleSyncInstances() {
  try {
    await syncInstances.mutateAsync(undefined);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('instances.syncFailed'));
  }
}

async function handleResetDemo() {
  if (!window.confirm(t('instances.resetConfirm'))) return;
  try {
    await demoResetAll();
    qc.invalidateQueries({ queryKey: ['instances'] });
    qc.invalidateQueries({ queryKey: ['resources'] });
    toast.success(t('instances.resetSuccess'));
  } catch (err) {
    toast.error(t('instances.resetFailed'));
  }
}
```

- [ ] **Step 6: Add missing imports and state**

Add these to the top of the file:

```typescript
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
```

Add `useQueryClient` inside the component:

```typescript
const qc = useQueryClient();
```

Add `Server`, `Play`, `Square` to the lucide-react imports:

```typescript
import { Search, RefreshCw, Trash2, Server, Play, Square, RotateCw } from 'lucide-react';
```

- [ ] **Step 7: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -30
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/Resources.tsx && git commit -m "feat(resources): merge Instances view into Resources page with unified left nav"
```

---

## Task 10: Remove /instances route from App.tsx

**Files:**
- Modify: `web-console/src/App.tsx:10,53-67`

- [ ] **Step 1: Remove Instances import**

Remove line 10:

```typescript
import Instances from '@/pages/Instances';
```

- [ ] **Step 2: Remove /instances route**

Remove lines 53-60 (the /instances route block):

```tsx
<Route
  path="/instances"
  element={
    <ProtectedRoute permission={{ resource: 'instance', action: 'list' }}>
      <Instances />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Add redirect from /instances to /resources?view=instances**

Add after the /resources route:

```tsx
<Route path="/instances" element={<Navigate to="/resources?view=instances" replace />} />
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx && git commit -m "refactor(routes): remove /instances route, redirect to /resources?view=instances"
```

---

## Task 11: Update Sidebar navigation links

**Files:**
- Modify: `web-console/src/components/Sidebar.tsx`

- [ ] **Step 1: Find and update the navigation items**

Look for the navigation item that links to `/instances` and update it to `/resources?view=instances`, or merge it with the `/resources` nav item.

Run: `grep -n "instances" /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console/src/components/Sidebar.tsx`

Expected: Show navigation items referencing `/instances`

- [ ] **Step 2: Update the nav item**

If there's a separate "云服务器管理" nav item pointing to `/instances`, either:
- Remove it (since Resources page now has both views), OR
- Update its path to `/resources?view=instances`

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx && git commit -m "refactor(sidebar): update navigation to point to unified resources page"
```

---

## Task 12: Update back button in InstanceDetail to use /resources

**Files:**
- Modify: `web-console/src/pages/InstanceDetail.tsx`

- [ ] **Step 1: Verify back button navigates to /resources**

Check that line 57 (or wherever the back button is) has:

```tsx
<Button variant="ghost" size="icon" onClick={() => navigate('/resources')}>
```

If it still says `/instances`, change it to `/resources`.

- [ ] **Step 2: Verify delete redirect**

Check that the delete handler (line ~25) redirects to `/resources`:

```typescript
if (act === 'delete') navigate('/resources');
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/InstanceDetail.tsx && git commit -m "fix(instance-detail): back button navigates to unified resources page"
```

---

## Task 13: Final build verification

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1
```

Expected: PASS (only pre-existing tsconfig.node.json TS6310 error)

- [ ] **Step 2: Build the project**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npm run build 2>&1 | tail -20
```

Expected: Build succeeds

- [ ] **Step 3: Test in browser**

Open `http://localhost:80`:
1. Click "资源总览" in sidebar → see unified Resources page
2. Click "云服务器" in left nav → see instances table with spec/IP/cost columns
3. Click an instance row → navigate to `/instances/:id` → see all 8 cards (5 existing + metrics/logs/connections)
4. Click back button → returns to `/resources`
5. Click "所有资源" in left nav → see all resource types
6. Click an instance row in "所有资源" → navigate to instance detail

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A && git commit -m "feat: complete InstanceDetail enhancement and Resources/Instances integration"
```
