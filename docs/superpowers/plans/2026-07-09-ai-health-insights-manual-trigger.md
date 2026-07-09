# AI Health Insights Manual Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual refresh button on Dashboard AI Insight card and an Insight tab in the AI Ops page, with insight history persistence.

**Architecture:** A `?refresh=true` query param on the existing GET endpoint bypasses server cache. A new shared `AiInsightCard` component is used by both Dashboard and AiOps Insight tab. History records persist via a new `insight_history` Drizzle table in both schemas (public/demo).

**Tech Stack:** React + TanStack Query + Fastify + Drizzle ORM + PostgreSQL

---

### Task 1: Add `insightHistory` table to shared schema factory

**Files:**
- Modify: `shared/src/db/schema-factory.ts`

- [ ] **Step 1: Add `insightHistory` table inside `buildTables()`**

Insert after the `knowledgeBase` table block (line 201), before the `return` statement:

```typescript
const insightHistory = createTable('insight_history', {
  id: serial('id').primaryKey(),
  healthScore: integer('health_score').notNull(),
  risks: text('risks'),
  suggestions: text('suggestions'),
  raw: text('raw'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Add `insightHistory` to the returned object:

```typescript
return {
  cloudAccounts,
  instances,
  metrics,
  costRecords,
  alertRules,
  alerts,
  cloudResources,
  tokenUsage,
  metricPredictions,
  remediationPolicies,
  remediationRuns,
  knowledgeBase,
  insightHistory,
};
```

- [ ] **Step 2: Commit**

```bash
git add shared/src/db/schema-factory.ts
git commit -m "feat: add insight_history table to shared schema factory"
```

---

### Task 2: Update monitor-service dashboard route with `?refresh` and `/history` endpoint

**Files:**
- Modify: `monitor-service/src/routes/dashboard.ts`

- [ ] **Step 1: Update `GET /ai-insight` to support `?refresh` parameter**

Add `refresh` query param check before cache lookup:

```typescript
app.get('/ai-insight', async (request, reply) => {
  const scope = request.scope;
  const cacheKey = scope.schema;
  const refresh = request.query?.refresh === 'true';

  if (!refresh) {
    const cached = insightCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return reply.send(cached.data);
    }
  }

  // ... existing context collection code (lines 23-46) unchanged ...

  // ... existing fetch to ai-gateway (lines 49-66) unchanged ...

  const data = await res.json();

  // Update cache
  insightCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

  // Persist to insight_history
  const t = scopedDb(scope);
  await db.insert(t.insightHistory).values({
    healthScore: data.healthScore,
    risks: JSON.stringify(data.risks || []),
    suggestions: JSON.stringify(data.suggestions || []),
    raw: data.raw || '',
  });

  return reply.send(data);
});
```

- [ ] **Step 2: Add `GET /ai-insight/history` endpoint**

Add after the `/token-stats` endpoint (after line 121):

```typescript
app.get('/ai-insight/history', async (request) => {
  const scope = request.scope;
  const t = scopedDb(scope);
  const rows = await db.select()
    .from(t.insightHistory)
    .orderBy(desc(t.insightHistory.createdAt))
    .limit(20);
  return rows.map(r => ({
    ...r,
    risks: typeof r.risks === 'string' ? JSON.parse(r.risks) : r.risks,
    suggestions: typeof r.suggestions === 'string' ? JSON.parse(r.suggestions) : r.suggestions,
  }));
});
```

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/routes/dashboard.ts
git commit -m "feat: add ?refresh param and /history endpoint for AI insight"
```

---

### Task 3: Add frontend API and hooks

**Files:**
- Modify: `web-console/src/api/aiInsights.ts`
- Modify: `web-console/src/hooks/useAiInsights.ts`
- Modify: `web-console/src/types/aiInsights.ts`

- [ ] **Step 1: Add `InsightHistoryItem` type**

Add to `web-console/src/types/aiInsights.ts`:

```typescript
export interface InsightHistoryItem {
  id: number;
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add API methods**

Update `web-console/src/api/aiInsights.ts`:

```typescript
import type { AiInsight, TokenStats, InsightHistoryItem } from '@/types/aiInsights';

export const aiInsightsApi = {
  getInsight(refresh?: boolean): Promise<AiInsight> {
    const qs = refresh ? '?refresh=true' : '';
    return api.get<AiInsight>(`/monitor/dashboard/ai-insight${qs}`);
  },
  getTokenStats(): Promise<TokenStats> {
    return api.get<TokenStats>('/monitor/dashboard/token-stats');
  },
  getInsightHistory(): Promise<InsightHistoryItem[]> {
    return api.get<InsightHistoryItem[]>('/monitor/dashboard/ai-insight/history');
  },
};
```

- [ ] **Step 3: Update hooks**

Update `web-console/src/hooks/useAiInsights.ts`:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { aiInsightsApi } from '@/api/aiInsights';

export function useAiInsight() {
  return useQuery({
    queryKey: ['ai-insight'],
    queryFn: () => aiInsightsApi.getInsight(),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useTokenStats() {
  return useQuery({
    queryKey: ['token-stats'],
    queryFn: aiInsightsApi.getTokenStats,
    refetchInterval: 60 * 1000,
  });
}

export function useRefreshInsight() {
  return useMutation({
    mutationFn: () => aiInsightsApi.getInsight(true),
  });
}

export function useInsightHistory() {
  return useQuery({
    queryKey: ['insight-history'],
    queryFn: aiInsightsApi.getInsightHistory,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add web-console/src/types/aiInsights.ts web-console/src/api/aiInsights.ts web-console/src/hooks/useAiInsights.ts
git commit -m "feat: add API methods and hooks for forced refresh and history"
```

---

### Task 4: Create shared `AiInsightCard` component

**Files:**
- Create: `web-console/src/components/dashboard/AiInsightCard.tsx`

- [ ] **Step 1: Write the shared component**

```tsx
import { Brain, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import type { AiInsight } from '@/types/aiInsights';

interface AiInsightCardProps {
  insight: AiInsight | undefined;
  loading: boolean;
  refreshDisabled?: boolean;
  onRefresh: () => void;
  showRefresh?: boolean;
}

export function AiInsightCard({ insight, loading, refreshDisabled, onRefresh, showRefresh = false }: AiInsightCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">{t('dashboard.aiInsight')}</h2>
          </div>
          {showRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshDisabled || loading}
              className="text-muted-foreground hover:text-primary transition-colors"
              title={t('aiops.triggerNow')}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : insight ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold" style={{
                color: insight.healthScore >= 80 ? '#22c55e' : insight.healthScore >= 60 ? '#eab308' : '#ef4444'
              }}>
                {insight.healthScore}
              </div>
              <div className="text-sm text-muted-foreground">{t('dashboard.healthScore')}</div>
            </div>
            {insight.risks.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">{t('dashboard.risks')}</div>
                <ul className="space-y-1">
                  {insight.risks.map((risk, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
            {insight.suggestions.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">{t('dashboard.suggestions')}</div>
                <ul className="space-y-1">
                  {insight.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">{t('dashboard.insightUnavailable')}</div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web-console/src/components/dashboard/AiInsightCard.tsx
git commit -m "feat: create shared AiInsightCard component"
```

---

### Task 5: Update Dashboard to use shared AiInsightCard with refresh button

**Files:**
- Modify: `web-console/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace inline insight card with AiInsightCard**

Replace the old AI Insight card block (lines 172-216) with:

```tsx
<AiInsightCard
  insight={insight}
  loading={insightLoading}
  showRefresh
  onRefresh={() => refetch()}
/>
```

Add import for `AiInsightCard` and `useQueryClient`:

```typescript
import { AiInsightCard } from '@/components/dashboard/AiInsightCard';
```

Update the hook call to get refetch:

```typescript
const { data: insight, isLoading: insightLoading, refetch } = useAiInsight();
```

- [ ] **Step 2: Commit**

```bash
git add web-console/src/pages/Dashboard.tsx
git commit -m "feat: Dashboard uses shared AiInsightCard with refresh button"
```

---

### Task 6: Add Insight tab to AiOps page

**Files:**
- Modify: `web-console/src/pages/AiOps.tsx`

- [ ] **Step 1: Add Insight tab**

Add `'insight'` to the `Tab` type:

```typescript
type Tab = 'predictions' | 'remediation' | 'policy' | 'insight';
```

Add the tab button in the tab list (after policy button):

```typescript
{ key: 'insight' as const, label: t('aiops.tabInsight') },
```

- [ ] **Step 2: Add Insight tab content**

Add before the closing `</div>` (after line 51):

```tsx
{tab === 'insight' && <AiOpsInsightTab />}
```

Import the new component:

```typescript
import AiOpsInsightTab from '@/components/aiops/AiOpsInsightTab';
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/AiOps.tsx
git commit -m "feat: add Insight tab to AiOps page"
```

---

### Task 7: Create AiOpsInsightTab component

**Files:**
- Create: `web-console/src/components/aiops/AiOpsInsightTab.tsx`

- [ ] **Step 1: Write the Insight tab component**

```tsx
import { useTranslation } from 'react-i18next';
import { useRefreshInsight, useInsightHistory, useAiInsight, useTokenStats } from '@/hooks/useAiInsights';
import { AiInsightCard } from '@/components/dashboard/AiInsightCard';
import { Activity, History, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AiOpsInsightTab() {
  const { t } = useTranslation();
  const { data: insight, isLoading, refetch } = useAiInsight();
  const refreshMutation = useRefreshInsight();
  const { data: history, isLoading: historyLoading } = useInsightHistory();
  const { data: tokenStats } = useTokenStats();

  const handleRefresh = () => {
    refreshMutation.mutate(undefined, {
      onSuccess: () => {
        refetch();
      },
    });
  };

  return (
    <div className="space-y-6">
      <AiInsightCard
        insight={refreshMutation.data || insight}
        loading={refreshMutation.isPending || isLoading}
        showRefresh
        refreshDisabled={refreshMutation.isPending}
        onRefresh={handleRefresh}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">{t('dashboard.tokenUsage')}</h2>
          </div>
          {tokenStats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.todayTokens')}</div>
                <div className="text-xl font-bold">{tokenStats.today.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.todayCalls')}</div>
                <div className="text-xl font-bold">{tokenStats.today.calls}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.weekTokens')}</div>
                <div className="text-xl font-bold">{tokenStats.week.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.weekCalls')}</div>
                <div className="text-xl font-bold">{tokenStats.week.calls}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t('aiops.insightHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-bold" style={{
                      color: item.healthScore >= 80 ? '#22c55e' : item.healthScore >= 60 ? '#eab308' : '#ef4444'
                    }}>
                      {item.healthScore}
                    </span>
                    <span className="text-muted-foreground">
                      {item.risks?.length ? `${item.risks.length} risks` : 'No risks'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">{t('common.empty')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web-console/src/components/aiops/AiOpsInsightTab.tsx
git commit -m "feat: create AiOpsInsightTab with insight card, token stats, and history"
```

---

### Task 8: Add i18n keys

**Files:**
- Modify: `web-console/src/i18n/locales/en.json`
- Modify: `web-console/src/i18n/locales/zh.json`

- [ ] **Step 1: Add English keys**

Add to `web-console/src/i18n/locales/en.json` under `"aiops"` section:

```json
"tabInsight": "Health Insight",
"insightHistory": "Insight History",
"triggerNow": "Refresh"
```

- [ ] **Step 2: Add Chinese keys**

Add to `web-console/src/i18n/locales/zh.json` under `"aiops"` section:

```json
"tabInsight": "健康洞察",
"insightHistory": "洞察历史",
"triggerNow": "立即刷新"
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/i18n/locales/en.json web-console/src/i18n/locales/zh.json
git commit -m "feat: add i18n keys for AI health insight tab"
```

---

### Task 9: Run DB migration and verify

- [ ] **Step 1: Generate Drizzle migration for the new table**

Run the migration generation script (check project docs for exact command):

```bash
docker compose exec -T app npx drizzle-kit push 2>&1 | tail -20
```

Or if a manual migration file is needed, generate one:

```bash
docker compose exec -T app npx drizzle-kit generate 2>&1 | tail -20
```

Then apply it:

```bash
docker compose exec -T app npx drizzle-kit migrate 2>&1 | tail -20
```

Expected: `insight_history` table created in both `public` and `demo` schemas.

- [ ] **Step 2: Rebuild and restart**

```bash
docker compose build app && docker compose up -d app
```

- [ ] **Step 3: Verify the API endpoints**

Test the existing insight endpoint:

```bash
curl -s http://localhost:80/monitor/dashboard/ai-insight | head -c 200
```

Test the refresh endpoint:

```bash
curl -s "http://localhost:80/monitor/dashboard/ai-insight?refresh=true" | head -c 200
```

Test the history endpoint:

```bash
curl -s http://localhost:80/monitor/dashboard/ai-insight/history
```

- [ ] **Step 4: Run frontend tests**

```bash
npx playwright test 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add insight_history DB migration and verify"
```
