# Memory & CPU Optimization Design

**Date:** 2026-06-23
**Scope:** Frontend, backend memory, deployment configuration
**Risk Level:** Moderate (no API interface changes)
**Excluded:** ChatRunState modifications

---

## 1. Demo Data Optimization

### Goal
Reduce browser memory usage in demo mode from ~4MB to ~800KB.

### Changes

**File: `web-console/src/lib/demo/mock-data.ts`**

| Change | Detail |
|--------|--------|
| Instance count 1700→300 | AWS=80, Aliyun=50, Azure=40, Tencent=30, Huawei=30, Render=20, Oracle=50 |
| Cache `getDemoResources()` | Add `_resourcesCache` lazy-init pattern matching `_instancesCache` |
| Cache `getDemoAlerts()` | Add `_alertsCache` lazy-init pattern |
| Cache `getDemoCostSummary()` | Add `_costsCache` lazy-init pattern |
| Cache `getDemoMetrics()` | Per-instance metric cache to avoid regenerating 25 points per call |
| `resetDemoInstances()` clears all caches | When user clicks "还原 Demo", reset resources/alerts/costs caches too |

**File: `web-console/src/lib/demo/demo-api.ts`**

| Change | Detail |
|--------|--------|
| `demoDashboardStats()` cache result | Pre-compute provider distribution, don't iterate 300 instances on every call |

### Expected Impact
- Browser memory: ~4MB → ~800KB
- Page load: faster initial render
- Filter/switch: instant (cached data)

---

## 2. Frontend Rendering Optimization

### Goal
Reduce unnecessary React re-renders, especially during streaming chat.

### Changes

**File: `web-console/src/pages/Instances.tsx`**

```tsx
// Before: recomputed every render
const filtered = (instances || []).filter((inst) => { ... });

// After: memoized
const filtered = useMemo(() => {
  return (instances || []).filter((inst) => { ... });
}, [instances, searchTerm, selectedProvider, selectedStatus]);
```

**File: `web-console/src/pages/Resources.tsx`**

Same pattern as Instances.tsx — wrap filter logic in `useMemo`.

**File: `web-console/src/components/MessageBubble.tsx`**

```tsx
// Wrap with React.memo to prevent re-rendering during streaming
export default React.memo(MessageBubble);
```

**File: `web-console/src/components/MessageList.tsx`**

```tsx
// Use useCallback for scroll handler to reduce reference changes
const scrollToBottom = useCallback(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, []);

useEffect(() => {
  scrollToBottom();
}, [messages, scrollToBottom]);
```

**React Query gcTime (multiple hooks)**

Add `gcTime: 5 * 60_000` to these hooks to prevent indefinite cache growth:
- `useInstances`
- `useResources`
- `useDashboardStats`
- `useAuditLogs`

### Expected Impact
- Streaming chat: render count reduced ~70%
- List pages: filter/switch more responsive
- Memory: React Query cache cleaned up after 5 min idle

---

## 3. Backend Memory Optimization

### Goal
Prevent unbounded memory growth in ai-gateway long-running processes.

### Changes

**File: `ai-gateway/src/event-ledger.ts`**

| Change | Detail |
|--------|--------|
| `completedRunIds` LRU limit 1000→200 | Reduce from ~1MB to ~200KB |
| `lastDeltaTextByRunId` store last 100 chars only | Prevent long text accumulation |
| `lastDeltaTextByRunId` LRU limit 1000→200 | Consistent with above |

**File: `ai-gateway/src/chat.ts`**

| Change | Detail |
|--------|--------|
| `recordEventQueue` cleanup | Delete session key from Map when session ends, prevent leak |

### NOT Changed
- `ChatRunState` (7 Maps per run) — per user request, excluded from this optimization

### Expected Impact
- ai-gateway memory: stable at ~50MB (currently grows unbounded)
- Long-running sessions: no memory leak

---

## 4. Deployment Configuration

### Goal
Add resource limits to prevent OOM and enforce per-service boundaries.

### Changes

**File: `docker-compose.yml`**

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2g
        reservations:
          memory: 1g
```

**File: `ecosystem.config.js`**

Add `node_args` to each service for Node.js heap limit:

| Service | Current max_memory_restart | New max_memory_restart | node_args |
|---------|---------------------------|------------------------|-----------|
| auth-service | 300M | 200M | `--max-old-space-size=256` |
| api-gateway | 300M | 200M | `--max-old-space-size=256` |
| cloud-service | 300M | 200M | `--max-old-space-size=256` |
| monitor-service | 300M | 200M | `--max-old-space-size=256` |
| ai-agent | 500M | 300M | `--max-old-space-size=256` |
| ai-gateway | 400M | 300M | `--max-old-space-size=256` |

### Expected Impact
- Docker container: stable ~1.5GB usage
- Per-service: isolated heap limits prevent single service from starving others
- PM2: earlier restart on memory spike, less downtime

---

## Summary of Changes

| Category | Files Changed | Risk | Impact |
|----------|--------------|------|--------|
| Demo data | mock-data.ts, demo-api.ts | Low | High |
| Frontend rendering | Instances.tsx, Resources.tsx, MessageBubble.tsx, MessageList.tsx, hooks | Low | Medium |
| Backend memory | event-ledger.ts, chat.ts | Low | Medium |
| Deployment | docker-compose.yml, ecosystem.config.js | Low | Medium |

**Total files modified:** ~10
**Estimated effort:** 2-3 hours
**Rollback:** All changes are configuration/caching only, no data schema changes
