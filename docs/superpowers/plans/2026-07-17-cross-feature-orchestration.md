# Cross-Feature Navigation Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link all data entities across pages so users can navigate fluidly: instance names → instance detail, provider bars → filtered resources, alerts → linked instances, audit entries → user profile.

**Architecture:** All changes are frontend-only (re-routing). No backend/API changes needed. Uses React Router v6 `useNavigate`/`useSearchParams`. Links pass IDs via URL params; target pages read them to auto-filter.

**Tech Stack:** React 18, React Router v6, TypeScript, TanStack Query, Tailwind CSS

---

### Files Modified

| File | Change |
|------|--------|
| `web-console/src/components/dashboard/PredictionCard.tsx` | Make instance name a link → `/instances/${p.instanceId}` |
| `web-console/src/components/dashboard/RemediationCard.tsx` | Make instance name a link → `/instances/${run.instanceId}` |
| `web-console/src/pages/Costs.tsx` | Add `onRowClick` on instance costs table → `/instances/${row.id}` |
| `web-console/src/pages/Resources.tsx` | Read `?provider=` from URL search params on mount to initialize filter |
| `web-console/src/pages/Dashboard.tsx` | Make provider distribution bars clickable → `/resources?provider=aws` |
| `web-console/src/pages/Monitor.tsx` | Add instance ID column to events table, link → `/instances/${evt.instanceId}` |
| `web-console/src/pages/Users.tsx` | Read `?userId=` from URL search params, filter user list to matching user |
| `web-console/src/pages/Audit.tsx` | Make userId clickable → `/users?userId=${log.userId}` |

---

### Task 1: PredictionCard — Instance name link

**File:** `web-console/src/components/dashboard/PredictionCard.tsx`

- [ ] **Step 1: Import no new deps** — `useNavigate` already imported
- [ ] **Step 2: Wrap instance name in a clickable element**

Change lines 39-45 from:
```tsx
{topPredictions.map((p) => (
  <div key={p.id} className="flex items-center justify-between text-sm">
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">{p.instanceName || t('aiops.predictions.instanceName')}</div>
      <div className="text-xs text-muted-foreground">
        {p.metricName === 'disk_utilization' ? 'Disk' : 'Mem'} {parseFloat(p.currentValue).toFixed(0)}% → {parseFloat(p.threshold).toFixed(0)}%
      </div>
    </div>
```
to (note: stop propagation so card-level navigate doesn't fire):
```tsx
{topPredictions.map((p) => (
  <div key={p.id} className="flex items-center justify-between text-sm">
    <div className="flex-1 min-w-0">
      <div
        className="font-medium truncate text-blue-600 hover:underline cursor-pointer"
        onClick={(e) => { e.stopPropagation(); navigate(`/instances/${p.instanceId}`); }}
      >
        {p.instanceName || t('aiops.predictions.instanceName')}
      </div>
      <div className="text-xs text-muted-foreground">
        {p.metricName === 'disk_utilization' ? 'Disk' : 'Mem'} {parseFloat(p.currentValue).toFixed(0)}% → {parseFloat(p.threshold).toFixed(0)}%
      </div>
    </div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 2: RemediationCard — Instance name link

**File:** `web-console/src/components/dashboard/RemediationCard.tsx`

- [ ] **Step 1: Check imports** — `useNavigate` already imported
- [ ] **Step 2: Wrap instance name in clickable element**

Change lines 43-49 from:
```tsx
{recentRuns.map((run) => (
  <div key={run.id} className="flex items-center justify-between text-sm">
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">{run.instanceName || t('aiops.remediation.instanceName')}</div>
      <div className="text-xs text-muted-foreground">
        {t(`aiops.remediation.${ACTION_LABELS[run.actionExecuted || ''] || 'reboot'}`)}
      </div>
    </div>
```
to:
```tsx
{recentRuns.map((run) => (
  <div key={run.id} className="flex items-center justify-between text-sm">
    <div className="flex-1 min-w-0">
      {run.instanceId ? (
        <div
          className="font-medium truncate text-blue-600 hover:underline cursor-pointer"
          onClick={(e) => { e.stopPropagation(); navigate(`/instances/${run.instanceId}`); }}
        >
          {run.instanceName || t('aiops.remediation.instanceName')}
        </div>
      ) : (
        <div className="font-medium truncate">{run.instanceName || t('aiops.remediation.instanceName')}</div>
      )}
      <div className="text-xs text-muted-foreground">
        {t(`aiops.remediation.${ACTION_LABELS[run.actionExecuted || ''] || 'reboot'}`)}
      </div>
    </div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 3: Costs — Instance name row click

**File:** `web-console/src/pages/Costs.tsx`

- [ ] **Step 1: Add `useNavigate` import**

Add to existing imports:
```tsx
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add `navigate` hook call**

After line 18 (`const [endDate, setEndDate] = useState(...)`), add:
```tsx
const navigate = useNavigate();
```

- [ ] **Step 3: Add `onRowClick` prop to instance costs table**

Change lines 160-166 from:
```tsx
<TableWithPagination
  data={instanceCosts || []}
  columns={instanceColumns}
  loading={instLoading}
  rowKey="id"
  emptyTitle={t('costs.noInstanceCost')}
/>
```
to:
```tsx
<TableWithPagination
  data={instanceCosts || []}
  columns={instanceColumns}
  loading={instLoading}
  rowKey="id"
  emptyTitle={t('costs.noInstanceCost')}
  onRowClick={(row) => navigate(`/instances/${row.id}`)}
/>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 4: Resources — URL search param support for provider filter

**File:** `web-console/src/pages/Resources.tsx`

- [ ] **Step 1: Update imports to add `useSearchParams`**

Change line 3 from:
```tsx
import { useNavigate } from 'react-router-dom';
```
to:
```tsx
import { useNavigate, useSearchParams } from 'react-router-dom';
```

- [ ] **Step 2: Add `useSearchParams` hook and initialize filter state from URL**

After line 100 (`const navigate = useNavigate();`), add:
```tsx
const [searchParams, setSearchParams] = useSearchParams();
```

- [ ] **Step 3: Initialize `filterValues` with URL provider param**

Change line 102 from:
```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({});
```
to:
```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
  const initial: Record<string, string> = {};
  const p = searchParams.get('provider');
  if (p) initial.provider = p;
  return initial;
});
```

- [ ] **Step 4: Sync `filterValues.provider` back to URL**

Add after the `filteredInstances` memo (after line 249):
```tsx
useEffect(() => {
  const params = new URLSearchParams(searchParams);
  if (filterValues.provider) {
    params.set('provider', filterValues.provider);
  } else {
    params.delete('provider');
  }
  setSearchParams(params, { replace: true });
}, [filterValues.provider]);
```

Add the import:
```tsx
import { useState, useMemo, useEffect, type ReactNode } from 'react';
```
(Just adding `useEffect` to the existing import on line 1.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 5: Dashboard — Provider distribution bars clickable

**File:** `web-console/src/pages/Dashboard.tsx`

- [ ] **Step 1: Check imports** — `useNavigate` already imported

- [ ] **Step 2: Make provider distribution bars clickable**

Change lines 152-164 from:
```tsx
{Object.entries(stats.byProvider).map(([provider, count]) => (
  <div key={provider} className="space-y-1">
    <div className="flex items-center justify-between text-sm">
      <span>{t(`providers.${provider}`) || provider}</span>
      <span className="text-muted-foreground">{count} {t('dashboard.instances')}</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${(count / maxProviderCount) * 100}%` }}
      />
    </div>
  </div>
))}
```
to:
```tsx
{Object.entries(stats.byProvider).map(([provider, count]) => (
  <div
    key={provider}
    className="space-y-1 cursor-pointer hover:opacity-80 transition-opacity"
    onClick={() => navigate(`/resources?provider=${provider}`)}
  >
    <div className="flex items-center justify-between text-sm">
      <span className="text-blue-600 hover:underline">{t(`providers.${provider}`) || provider}</span>
      <span className="text-muted-foreground">{count} {t('dashboard.instances')}</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${(count / maxProviderCount) * 100}%` }}
      />
    </div>
  </div>
))}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 6: Monitor Events — Instance ID link

**File:** `web-console/src/pages/Monitor.tsx`

- [ ] **Step 1: Add `useNavigate` import**

Line 1 already imports React and useState. Add `useNavigate`:
```tsx
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add `navigate` hook call inside `EventsTab` component**

After line 324 (`const [expandedId, setExpandedId] = useState<string | null>(null);`), add:
```tsx
const navigate = useNavigate();
```

- [ ] **Step 3: Add "Instance" column header**

Add to the table header (after line 382 `<TableHead className="w-[200px]">{t('monitor.message')}</TableHead>`):
```tsx
<TableHead className="w-[160px]">{t('monitor.instance') || t('resourceTypes.instance')}</TableHead>
```

- [ ] **Step 4: Add instance cell in each row**

Add after the message cell (after line 406 `</TableCell>`), before status cell:
```tsx
<TableCell className="text-xs font-mono">
  {evt.instanceId ? (
    <button
      onClick={() => navigate(`/instances/${evt.instanceId}`)}
      className="text-blue-600 hover:underline"
    >
      {evt.instanceId.slice(0, 8)}...
    </button>
  ) : (
    <span className="text-muted-foreground">-</span>
  )}
</TableCell>
```

- [ ] **Step 5: Update `colSpan` in expanded row**

Change line 429 from:
```tsx
<TableCell colSpan={6} className="bg-muted/30">
```
to:
```tsx
<TableCell colSpan={7} className="bg-muted/30">
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 7: Users — URL search param support for userId filter

**File:** `web-console/src/pages/Users.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

Change line 2 from:
```tsx
import { useState, useMemo } from 'react';
```
to:
```tsx
import { useState, useMemo, useEffect } from 'react';
```

Add after the react-i18next import:
```tsx
import { useSearchParams } from 'react-router-dom';
```

- [ ] **Step 2: Add `useSearchParams` hook and initialize filter from URL**

After line 81 (`const [userFilters, setUserFilters] = useState<Record<string, string>>({});`), add:
```tsx
const [searchParams] = useSearchParams();
```

- [ ] **Step 3: Update `filteredUsers` to also filter by userId from URL**

Change lines 215-223 from:
```tsx
const filteredUsers = useMemo(() => {
    return (users || []).filter((user) => {
      const s = (userFilters.search || '').toLowerCase();
      if (s && !user.username.toLowerCase().includes(s) && !(user.email || '').toLowerCase().includes(s)) return false;
      if (userFilters.role && user.role !== userFilters.role) return false;
      if (userFilters.team && user.teamId !== userFilters.team) return false;
      return true;
    });
  }, [users, userFilters]);
```
to:
```tsx
const filteredUsers = useMemo(() => {
    return (users || []).filter((user) => {
      const s = (userFilters.search || '').toLowerCase();
      if (s && !user.username.toLowerCase().includes(s) && !(user.email || '').toLowerCase().includes(s)) return false;
      if (userFilters.role && user.role !== userFilters.role) return false;
      if (userFilters.team && user.teamId !== userFilters.team) return false;
      const highlightId = searchParams.get('userId');
      if (highlightId && user.id !== highlightId) return false;
      return true;
    });
  }, [users, userFilters, searchParams]);
```

- [ ] **Step 4: Add a visual indicator when showing a filtered user**

After the `filteredUsers` memo (line 223), add the highlight effect. Change the delete/open area:

Actually, add a useEffect to clear the URL param when user dismisses it — but that's extra complexity. Instead, let's keep it simple: the URL param remains until the user changes filters or navigates away.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

### Task 8: Audit — UserId clickable

**File:** `web-console/src/pages/Audit.tsx`

- [ ] **Step 1: Add `useNavigate` import**

After line 3 (`import { useTranslation } from 'react-i18next';`), add:
```tsx
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add `navigate` hook call**

After line 20 (`const [query, setQuery] = useState<AuditLogQuery>({...`), add:
```tsx
const navigate = useNavigate();
```

- [ ] **Step 3: Make truncated userId clickable**

Change lines 179-181 from:
```tsx
<TableCell className="font-mono text-xs truncate max-w-[100px]">
  {log.userId.slice(0, 8)}...
</TableCell>
```
to:
```tsx
<TableCell className="font-mono text-xs truncate max-w-[100px]">
  <button
    onClick={() => navigate(`/users?userId=${log.userId}`)}
    className="text-blue-600 hover:underline"
  >
    {log.userId.slice(0, 8)}...
  </button>
</TableCell>
```

- [ ] **Step 4: Make expanded full userId clickable**

Change lines 197-198 from:
```tsx
<div className="text-xs text-muted-foreground">{t('audit.fullUserId')}</div>
<div className="font-mono text-xs">{log.userId}</div>
```
to:
```tsx
<div className="text-xs text-muted-foreground">{t('audit.fullUserId')}</div>
<div className="font-mono text-xs">
  <button
    onClick={() => navigate(`/users?userId=${log.userId}`)}
    className="text-blue-600 hover:underline"
  >
    {log.userId}
  </button>
</div>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

---

## Verification

After all tasks, run:

```bash
cd web-console && npx tsc --noEmit
```

If any type errors occur, fix them by checking that all imports are correct and all `navigate` targets match route definitions in `App.tsx`.

Routes in `App.tsx`:
- `/instances/:id` → InstanceDetail
- `/resources` → Resources
- `/users` → Users
