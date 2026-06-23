# Memory & CPU Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize memory and CPU usage across frontend, backend, and deployment without affecting performance, reliability, or functionality.

**Architecture:** Add caching to demo data generators, memoize React components, tighten backend LRU limits, and add Docker/PM2 resource constraints.

**Tech Stack:** TypeScript, React, React Query, Fastify, PM2, Docker

---

## Task 1: Demo Data — Reduce Instance Count & Add Caching

**Files:**
- Modify: `web-console/src/lib/demo/mock-data.ts:49-57,111-123,154-176,199-220,242-258,288-302`
- Modify: `web-console/src/lib/demo/demo-api.ts:70-90,160-168`

- [ ] **Step 1: Reduce instance counts**

In `mock-data.ts`, change `PROVIDER_INSTANCE_COUNTS`:

```typescript
const PROVIDER_INSTANCE_COUNTS: Record<string, number> = {
  aws: 80,
  aliyun: 50,
  azure: 40,
  tencent: 30,
  huawei: 30,
  render: 20,
  oracle: 50,
};
```

- [ ] **Step 2: Add resources cache**

In `mock-data.ts`, add cache variable and wrap `getDemoResources()`:

```typescript
let _resourcesCache: CloudResource[] | null = null;

export function getDemoResources(): CloudResource[] {
  if (!_resourcesCache) {
    const rand = seededRandom(42);
    const resources: CloudResource[] = [];
    let idx = 0;
    for (const [provider, { count, type }] of Object.entries(RESOURCE_COUNTS)) {
      const regions = PROVIDER_REGIONS[provider] || ['us-east-1'];
      for (let i = 0; i < count; i++) {
        resources.push({
          id: `demo-res-${idx++}`,
          provider,
          resourceType: type,
          name: `${provider}-${type}-${i.toString().padStart(3, '0')}`,
          region: pick(regions, rand),
          status: pick(['active', 'stopped', 'pending'], rand),
          attributes: {},
          tags: { env: pick(ENVS, rand), team: pick(TEAMS, rand) },
          createdAt: randomDate(90, rand),
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
    _resourcesCache = resources;
  }
  return _resourcesCache;
}
```

- [ ] **Step 3: Add alerts cache**

In `mock-data.ts`, add cache variable and wrap `getDemoAlerts()`:

```typescript
let _alertsCache: DemoAlert[] | null = null;

export function getDemoAlerts(): DemoAlert[] {
  if (!_alertsCache) {
    const rand = seededRandom(123);
    const alerts: DemoAlert[] = [];
    let idx = 0;
    for (const tmpl of ALERT_TEMPLATES) {
      for (let i = 0; i < tmpl.count; i++) {
        const instances = getAllDemoInstances();
        const inst = pick(instances, rand);
        alerts.push({
          id: `demo-alert-${idx++}`,
          ruleId: `demo-rule-${idx}`,
          instanceId: inst.id,
          severity: tmpl.severity,
          message: `${inst.name}: ${tmpl.message}`,
          status: 'firing',
          firedAt: randomDate(7, rand),
          resolvedAt: null,
        });
      }
    }
    _alertsCache = alerts;
  }
  return _alertsCache;
}
```

- [ ] **Step 4: Add costs cache**

In `mock-data.ts`, add cache variable and wrap `getDemoCostSummary()`:

```typescript
let _costsCache: DemoCostSummary[] | null = null;

export function getDemoCostSummary(start: string, end: string): DemoCostSummary[] {
  if (!_costsCache) {
    const rand = seededRandom(456);
    _costsCache = Object.entries(COST_DATA).map(([provider, data]) => {
      const total = data.amount * (0.9 + rand() * 0.2);
      return {
        provider,
        totalAmount: Math.round(total * 100) / 100,
        currency: data.currency,
        periodStart: start,
        periodEnd: end,
        breakdown: data.services.map((service) => ({
          service,
          amount: Math.round(total * (0.1 + rand() * 0.3) * 100) / 100,
        })),
      };
    });
  }
  return _costsCache;
}
```

- [ ] **Step 5: Add metrics per-instance cache**

In `mock-data.ts`, add cache map and wrap `getDemoMetrics()`:

```typescript
const _metricsCache = new Map<string, DemoMetricPoint[]>();

export function getDemoMetrics(instanceId: string, hours: number = 24): DemoMetricPoint[] {
  const key = `${instanceId}:${hours}`;
  if (!_metricsCache.has(key)) {
    const rand = seededRandom(instanceId.charCodeAt(instanceId.length - 1) * 7);
    const points: DemoMetricPoint[] = [];
    const now = Date.now();
    for (let h = hours; h >= 0; h--) {
      const base = 40 + Math.sin(h / 4) * 20;
      const noise = (rand() - 0.5) * 15;
      points.push({
        timestamp: new Date(now - h * 3600000).toISOString(),
        value: Math.max(0, Math.min(100, base + noise)),
        unit: 'percent',
      });
    }
    _metricsCache.set(key, points);
  }
  return _metricsCache.get(key)!;
}
```

- [ ] **Step 6: Clear all caches in resetDemoInstances**

In `mock-data.ts`, update `resetDemoInstances()`:

```typescript
export function resetDemoInstances(): void {
  _instancesCache = generateAllInstances();
  _resourcesCache = null;
  _alertsCache = null;
  _costsCache = null;
  _metricsCache.clear();
}
```

- [ ] **Step 7: Cache dashboardStats**

In `demo-api.ts`, add cache and wrap `demoDashboardStats()`:

```typescript
let _dashboardStatsCache: unknown = null;

export function demoDashboardStats() {
  if (!_dashboardStatsCache) {
    const instances = getAllDemoInstances();
    const alerts = getDemoAlerts();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();
    const costs = getDemoCostSummary(monthStart, monthEnd);

    const byProvider: Record<string, number> = {};
    for (const inst of instances) {
      byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
    }

    _dashboardStatsCache = {
      totalInstances: instances.length,
      runningInstances: instances.filter((i) => i.status === 'running').length,
      alertCount: alerts.filter((a) => a.status === 'firing').length,
      monthlyCost: costs.reduce((sum, c) => sum + (c.currency === 'USD' ? c.totalAmount : c.totalAmount * 0.14), 0),
      byProvider,
      errors: { instances: false, alerts: false, costs: false },
    };
  }
  return _dashboardStatsCache;
}
```

- [ ] **Step 8: Clear dashboard cache in demoResetAll**

In `demo-api.ts`, update `demoResetAll()`:

```typescript
export function demoResetAll(): Promise<{ success: boolean }> {
  resetDemoInstances();
  _dashboardStatsCache = null;
  try {
    localStorage.removeItem('demo-chat-sessions');
    localStorage.removeItem('demo-chat-history');
  } catch { /* ignore */ }
  return Promise.resolve({ success: true });
}
```

- [ ] **Step 9: Verify in browser**

Open browser, navigate to Instances page. Confirm 300 instances render. Navigate to Resources, Dashboard, Monitor pages. Confirm no console errors. Click "还原 Demo" button, confirm data resets.

- [ ] **Step 10: Commit**

```bash
git add web-console/src/lib/demo/mock-data.ts web-console/src/lib/demo/demo-api.ts
git commit -m "perf: reduce demo instances 1700→300, add caching for resources/alerts/costs/metrics"
```

---

## Task 2: Frontend Rendering — useMemo & React.memo

**Files:**
- Modify: `web-console/src/pages/Instances.tsx:1,31-40`
- Modify: `web-console/src/pages/Resources.tsx:1,~80-100`
- Modify: `web-console/src/components/chat/MessageBubble.tsx:288`
- Modify: `web-console/src/components/chat/MessageList.tsx:1-2,14-16`
- Modify: `web-console/src/hooks/useInstances.ts:17-20`
- Modify: `web-console/src/hooks/useResources.ts:19-24`
- Modify: `web-console/src/hooks/useDashboard.ts:18-44`
- Modify: `web-console/src/hooks/useAudit.ts:7-10`

- [ ] **Step 1: Add useMemo to Instances.tsx**

In `Instances.tsx`, add `useMemo` import and wrap filter logic:

```tsx
import { useState, useMemo } from 'react';
```

Replace the `filtered` variable (lines 31-40):

```tsx
const filtered = useMemo(() => {
  return (instances || []).filter((inst) => {
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

- [ ] **Step 2: Add useMemo to Resources.tsx**

In `Resources.tsx`, find the filter logic and wrap with `useMemo`. First add import:

```tsx
import { useState, useMemo, type ReactNode } from 'react';
```

Then find the filtered resources computation and wrap it:

```tsx
const filtered = useMemo(() => {
  return (items || []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(s) ||
      r.id?.toLowerCase().includes(s) ||
      r.region?.toLowerCase().includes(s)
    );
  });
}, [items, search]);
```

- [ ] **Step 3: Wrap MessageBubble with React.memo**

At the bottom of `MessageBubble.tsx`, change the export:

```tsx
// Before
export { MessageBubble };

// After
export const MessageBubble = React.memo(MessageBubbleInner);
```

Also rename the inner function and add the memo wrapper. Find the function declaration and rename:

```tsx
// Before
export function MessageBubble({ message }: MessageBubbleProps) {

// After (inside the file, keep the function but rename it)
function MessageBubbleInner({ message }: MessageBubbleProps) {
```

Add import at top:

```tsx
import { useState, memo } from 'react';
```

- [ ] **Step 4: Optimize MessageList.tsx scroll**

In `MessageList.tsx`, add `useCallback` and optimize:

```tsx
import { useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../../types/chat';
import { MessageBubble } from './MessageBubble';
import { ScrollArea } from '../ui/scroll-area';

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        开始新的对话
      </div>
    );
  }

  return (
    <ScrollArea className="h-full overflow-y-auto">
      <div className="py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 5: Add gcTime to useInstances**

In `useInstances.ts`, add `gcTime` to the `useInstances` query:

```typescript
export function useInstances(params?: ListInstancesParams) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['instances', params, isDemoMode],
    queryFn: () => isDemoMode ? demoListInstances(params) : cloudApi.listInstances(params),
    gcTime: 5 * 60_000,
  });
}
```

- [ ] **Step 6: Add gcTime to useResources**

In `useResources.ts`, add `gcTime` to the `useResources` query:

```typescript
export function useResources(filters: ResourceFilters) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['resources', filters, isDemoMode],
    queryFn: () => isDemoMode
      ? demoListResources(filters as any).then(items => ({ items, total: items.length }))
      : resourceApi.list(filters),
    gcTime: 5 * 60_000,
  });
}
```

- [ ] **Step 7: Add gcTime to useDashboardStats**

In `useDashboard.ts`, add `gcTime`:

```typescript
export function useDashboardStats() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', isDemoMode],
    queryFn: async () => {
      // ... existing logic
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
```

- [ ] **Step 8: Add gcTime to useAuditLogs**

In `useAudit.ts`, add `gcTime`:

```typescript
export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: () => auditApi.list(query),
    gcTime: 5 * 60_000,
  });
}
```

- [ ] **Step 9: Verify in browser**

Open browser, test Instances/Resources filtering (should be smooth). Open AI chat, send messages, confirm streaming works and no visual glitches. Check React DevTools for unnecessary re-renders.

- [ ] **Step 10: Commit**

```bash
git add web-console/src/pages/Instances.tsx web-console/src/pages/Resources.tsx \
  web-console/src/components/chat/MessageBubble.tsx web-console/src/components/chat/MessageList.tsx \
  web-console/src/hooks/useInstances.ts web-console/src/hooks/useResources.ts \
  web-console/src/hooks/useDashboard.ts web-console/src/hooks/useAudit.ts
git commit -m "perf: add useMemo/React.memo, gcTime to prevent cache growth"
```

---

## Task 3: Backend Memory — LRU Limits & Queue Cleanup

**Files:**
- Modify: `ai-gateway/src/acp/event-ledger.ts:33-35,74,143-153`
- Modify: `ai-gateway/src/methods/chat.ts:23-31`

- [ ] **Step 1: Reduce LRU limits in event-ledger.ts**

In `event-ledger.ts`, change the LRU cleanup thresholds (lines 143-153):

```typescript
// LRU 清理：限制内存跟踪最多 200 个 runId，防止内存泄漏
if (completedRunIds.size > 200) {
  const entries = Array.from(completedRunIds);
  const toDelete = entries.slice(0, entries.length - 200);
  for (const id of toDelete) completedRunIds.delete(id);
}
if (lastDeltaTextByRunId.size > 200) {
  const entries = Array.from(lastDeltaTextByRunId.keys());
  const toDelete = entries.slice(0, entries.length - 200);
  for (const id of toDelete) lastDeltaTextByRunId.delete(id);
}
```

- [ ] **Step 2: Truncate delta text in event-ledger.ts**

In `event-ledger.ts`, when storing delta text, truncate to last 100 chars (line 74):

```typescript
// Before
lastDeltaTextByRunId.set(runId, delta);

// After: store only last 100 chars to prevent memory bloat
lastDeltaTextByRunId.set(runId, delta.slice(-100));
```

- [ ] **Step 3: Add recordEventQueue cleanup in chat.ts**

In `chat.ts`, after `completeChatRun` in the `finally` block (line 215), add cleanup:

```typescript
} finally {
  completeChatRun(context.chatAbortControllers, runId);
  // 清理 recordEventQueue 防止内存泄漏
  recordEventQueue.delete(sessionKey);
  // 延迟清理缓冲（供短暂断线重连恢复）
  setTimeout(() => cleanupRun(context.chatRunState, runId), 30000);
}
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd ai-gateway && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add ai-gateway/src/acp/event-ledger.ts ai-gateway/src/methods/chat.ts
git commit -m "perf: reduce LRU limits 1000→200, truncate delta text, cleanup event queue"
```

---

## Task 4: Deployment — Docker & PM2 Resource Limits

**Files:**
- Modify: `docker-compose.yml:32-81`
- Modify: `ecosystem.config.js:1-72`

- [ ] **Step 1: Add Docker memory limit**

In `docker-compose.yml`, add `deploy` section to the `app` service:

```yaml
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "${APP_PORT:-80}:80"
    deploy:
      resources:
        limits:
          memory: 2g
        reservations:
          memory: 1g
    environment:
      # ... existing env vars unchanged
```

- [ ] **Step 2: Update PM2 config with node_args and lower limits**

In `ecosystem.config.js`, update each service:

```javascript
module.exports = {
  apps: [
    {
      name: 'auth-service',
      script: './auth-service/dist/index.js',
      cwd: '/app',
      instances: 1,
      max_memory_restart: '200M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
      },
    },
    {
      name: 'api-gateway',
      script: './api-gateway/dist/index.js',
      cwd: '/app',
      instances: 1,
      max_memory_restart: '200M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'cloud-service',
      script: './cloud-service/dist/index.js',
      cwd: '/app',
      instances: 1,
      max_memory_restart: '200M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'monitor-service',
      script: './monitor-service/dist/index.js',
      cwd: '/app',
      instances: 1,
      max_memory_restart: '200M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
    {
      name: 'ai-agent',
      script: './ai-agent/dist/index.js',
      cwd: '/app',
      instances: 1,
      max_memory_restart: '300M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
    {
      name: 'ai-gateway',
      script: './ai-gateway/dist/index.js',
      cwd: '/app',
      instances: 1,
      max_memory_restart: '300M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        CLOUD_SERVICE_URL: process.env.CLOUD_SERVICE_URL || 'http://localhost:3001',
        MONITOR_SERVICE_URL: process.env.MONITOR_SERVICE_URL || 'http://localhost:3002',
      },
    },
  ],
};
```

- [ ] **Step 3: Rebuild and deploy**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
docker build --no-cache -t newcloud-app -f Dockerfile . 2>&1 | tail -5
docker compose up -d --force-recreate app
```

- [ ] **Step 4: Verify container starts**

```bash
docker ps --format '{{.Names}} {{.Status}}'
```

Expected: `newcloud-app-1 Up`

- [ ] **Step 5: Verify app loads in browser**

Open `http://localhost`, confirm dashboard loads with 300 instances. Navigate through pages, confirm no errors.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml ecosystem.config.js
git commit -m "perf: add Docker memory limit 2g, PM2 node_args --max-old-space-size=256"
```

---

## Summary

| Task | Files Modified | Risk | Impact |
|------|---------------|------|--------|
| 1. Demo data caching | mock-data.ts, demo-api.ts | Low | High |
| 2. Frontend rendering | Instances.tsx, Resources.tsx, MessageBubble.tsx, MessageList.tsx, 4 hooks | Low | Medium |
| 3. Backend memory | event-ledger.ts, chat.ts | Low | Medium |
| 4. Deployment | docker-compose.yml, ecosystem.config.js | Low | Medium |

**Total files modified:** 12
**Estimated effort:** 2-3 hours
