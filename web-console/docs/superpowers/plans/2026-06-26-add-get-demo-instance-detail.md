# Add getDemoInstanceDetail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new function `getDemoInstanceDetail` to mock-data.ts that returns extended metrics, logs, and connections data for instance detail pages.

**Architecture:** The function reuses existing `getDemoMetrics` and `getDemoLogs` generators, transforms metrics to `{time, value}` format, and generates fake connections between instances. Returns an object matching the optional fields on InstanceRow.

**Tech Stack:** TypeScript, existing demo data generators.

---

## Task 1: Add getDemoInstanceDetail function

**Files:**
- Modify: `web-console/src/lib/demo/mock-data.ts:1060-1074` (add new export after getDemoLogs)

- [ ] **Step 1: Add the new function after getDemoLogs (line ~1074)**

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

- [ ] **Step 2: Run typecheck to verify no type errors**

Run: `cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console && npx tsc -b --noEmit 2>&1 | head -20`
Expected: PASS (no output or only warnings)

- [ ] **Step 3: Commit the change**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager/web-console
git add src/lib/demo/mock-data.ts
git commit -m "feat(demo): add getDemoInstanceDetail with metrics/logs/connections"
```

## Self-Review

- [ ] **Spec coverage:** Function added exactly as specified.
- [ ] **Placeholder scan:** No placeholders found.
- [ ] **Type consistency:** Return type matches InstanceRow optional fields.
- [ ] **Edge cases:** Handles empty otherInstances array (fallback to `unknown-${i}`).
- [ ] **Dependencies:** Uses existing seededRandom, getDemoMetrics, getDemoLogs, getAllDemoInstances.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-add-get-demo-instance-detail.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?