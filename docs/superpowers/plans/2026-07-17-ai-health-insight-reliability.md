# AI Health Insight Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI health insight feature reliably report per-step diagnostics so users can pinpoint failures.

**Architecture:** Monitor-service captures timing/errors at each step (DB query → ai-gateway call → LLM response) into a structured `diagnostics` array, returned in a 200 response alongside `ok: true/false`. Frontend renders a collapsible diagnostic panel with per-step icons and suggestions.

**Tech Stack:** Fastify (monitor-service, ai-gateway), React/TypeScript (frontend), PostgreSQL, TanStack Query

---

### Task 1: Add TypeScript types for diagnostic response

**Files:**
- Modify: `web-console/src/types/aiInsights.ts`
- Modify: (no separate type file in monitor-service — add inline)

- [ ] **Step 1: Add types to web-console/src/types/aiInsights.ts**

```typescript
export interface DiagnosticEntry {
  step: string;
  status: 'ok' | 'fail' | 'skip';
  detail: string;
  suggestion?: string;
  duration?: number;
}

export interface AiInsightResponse {
  ok: boolean;
  healthScore?: number;
  risks?: Array<{ title: string; severity: string; suggestion: string }>;
  suggestions?: string[];
  raw?: string;
  lastSuccessAt?: string;
  diagnostics: DiagnosticEntry[];
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/types/aiInsights.ts
git commit -m "feat: add AiInsightResponse and DiagnosticEntry types"
```

---

### Task 2: Refactor ai-gateway /internal/insight to return structured responses

**Files:**
- Modify: `ai-gateway/src/internal/dashboard-insight.ts`
- Modify: `ai-gateway/src/index.ts` (lines 102-111)

- [ ] **Step 1: Change generateDashboardInsight to return structured result**

In `ai-gateway/src/internal/dashboard-insight.ts`, wrap the function body in try/catch and return `{ ok: true/false, ... }` instead of throwing:

```typescript
export async function generateDashboardInsight(req: {
  totalInstances: number;
  runningInstances: number;
  stoppedInstances: number;
  firingAlerts: number;
  totalCost: number;
  providerBreakdown: Array<{ provider: string; count: number }>;
  recentAlerts: Array<{ severity: string; message: string }>;
  abnormalInstances: Array<{ name: string; provider: string; status: string }>;
  scope: string;
}): Promise<{
  ok: boolean;
  healthScore?: number;
  risks?: Array<{ title: string; severity: string; suggestion: string }>;
  suggestions?: string[];
  raw?: string;
  llmDiagnostics?: { model: string; tokens: number; duration: number };
  error?: string;
  message?: string;
  suggestion?: string;
}> {
  try {
    const prompt = buildPrompt(req);
    const startTime = Date.now();
    const raw = await callLlmChat(prompt, { temperature: 0.3, maxTokens: 2000 });
    const duration = Date.now() - startTime;
    const parsed = extractJsonFromText(raw);
    if (!parsed || typeof parsed.healthScore !== 'number') {
      return {
        ok: false,
        error: 'PARSE_FAILED',
        message: 'LLM 返回数据无法解析',
        suggestion: '请检查 AI 设置中的模型配置',
        llmDiagnostics: { model: config.llm.model, tokens: 0, duration },
      };
    }
    return {
      ok: true,
      healthScore: parsed.healthScore,
      risks: parsed.risks || [],
      suggestions: parsed.suggestions || [],
      raw,
      llmDiagnostics: { model: config.llm.model, tokens: estimateTokens(raw), duration },
    };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      error: 'LLM_API_ERROR',
      message: err.message,
      suggestion: err.message.includes('401') || err.message.includes('API key')
        ? '请检查 AI 设置中的 API Key'
        : err.message.includes('timeout')
          ? 'LLM 请求超时，请检查网络或模型响应速度'
          : '请检查 AI 设置中的模型配置',
    };
  }
}
```

- [ ] **Step 2: Update /internal/insight handler in index.ts**

In `ai-gateway/src/index.ts`, update the `/internal/insight` handler (lines 102-111):

```typescript
app.post('/internal/insight', async (request, reply) => {
  try {
    const body = request.body as any;
    const result = await generateDashboardInsight({ ...body, scope: body.scope || request.scope.schema });
    return reply.send(result);
  } catch (err) {
    app.log.error({ err }, 'dashboard insight failed');
    return reply.status(500).send({ error: 'INSIGHT_FAILED', message: (err as Error).message });
  }
});
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ai-gateway/src/internal/dashboard-insight.ts ai-gateway/src/index.ts
git commit -m "feat: return structured ok/fail from generateDashboardInsight"
```

---

### Task 3: Refactor monitor-service /ai-insight to collect diagnostics

**Files:**
- Modify: `monitor-service/src/routes/dashboard.ts`

- [ ] **Step 1: Rewrite /ai-insight to capture per-step diagnostics**

The entire handler (lines 12-91) needs restructuring. Replace the try/catch approach with step-by-step diagnostics collection:

```typescript
app.get('/ai-insight', async (request, reply) => {
  const scope = request.scope;
  const cacheKey = scope.schema;
  const refresh = (request.query as { refresh?: string })?.refresh === 'true';
  const diagnostics: DiagnosticEntry[] = [];
  const now = Date.now();
  const lastSuccessKey = `lastSuccess:${cacheKey}`;

  // 检查缓存
  if (!refresh) {
    const cached = insightCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return reply.send(cached.data);
    }
  }

  // Step 1: 数据采集
  const step1Start = Date.now();
  let totalInstances = 0, runningInstances = 0, stoppedInstances = 0;
  let firingAlertsList: any[] = [], totalCost = 0;
  let providerBreakdown: Array<{ provider: string; count: number }> = [];
  let abnormalInstances: any[] = [];
  let recentAlerts: Array<{ severity: string; message: string }> = [];
  let step1Ok = false;

  try {
    const t = scopedDb(scope);
    const allInstances = await db.select().from(t.instances);
    totalInstances = allInstances.length;
    runningInstances = allInstances.filter(i => i.status === 'running').length;
    stoppedInstances = allInstances.filter(i => i.status === 'stopped').length;
    firingAlertsList = await db.select().from(t.alerts).where(eq(t.alerts.status, 'firing')).limit(10);
    recentAlerts = firingAlertsList.map(a => ({ severity: a.severity, message: a.message }));
    const providerMap = new Map<string, number>();
    allInstances.forEach(i => providerMap.set(i.provider, (providerMap.get(i.provider) || 0) + 1));
    providerBreakdown = Array.from(providerMap.entries()).map(([provider, count]) => ({ provider, count }));
    abnormalInstances = allInstances.filter(i => i.status !== 'running' && i.status !== 'stopped').slice(0, 5).map(i => ({ name: i.name || i.id, provider: i.provider, status: i.status }));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const costRows = await db.select().from(t.costRecords).where(gte(t.costRecords.periodStart, monthStart));
    totalCost = costRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    step1Ok = true;
    diagnostics.push({ step: '数据采集', status: 'ok', detail: `${totalInstances} 实例, ${firingAlertsList.length} 告警, ¥${totalCost.toFixed(2)}`, duration: Date.now() - step1Start });
  } catch (e) {
    diagnostics.push({ step: '数据采集', status: 'fail', detail: (e as Error).message, suggestion: '数据库连接异常，请检查数据库状态' });
  }

  // Step 2: AI 服务调用
  const step2Start = Date.now();
  let insightResult: any = null;
  let step2Ok = false;
  if (!step1Ok) {
    diagnostics.push({ step: 'AI 服务调用', status: 'skip', detail: '数据采集失败，跳过' });
  } else {
    try {
      const res = await fetch(`${config.aiGatewayUrl}/internal/insight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Mode': scope.isDemo ? 'true' : 'false',
        },
        body: JSON.stringify({
          totalInstances, runningInstances, stoppedInstances,
          firingAlerts: firingAlertsList.length, totalCost, providerBreakdown,
          recentAlerts, abnormalInstances, scope: scope.schema,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        diagnostics.push({ step: 'AI 服务调用', status: 'fail', detail: `HTTP ${res.status}: ${errText.slice(0, 200)}`, suggestion: 'AI 网关内部错误，请查看服务日志' });
      } else {
        insightResult = await res.json();
        step2Ok = true;
        diagnostics.push({ step: 'AI 服务调用', status: 'ok', detail: `${Date.now() - step2Start}ms`, duration: Date.now() - step2Start });
      }
    } catch (e) {
      diagnostics.push({ step: 'AI 服务调用', status: 'fail', detail: (e as Error).message, suggestion: 'AI 网关服务未启动或网络不通，请检查 ai-gateway 进程' });
    }
  }

  // Step 3: LLM 响应
  if (!step2Ok) {
    diagnostics.push({ step: 'LLM 响应', status: 'skip', detail: '上游服务不可用，未执行' });
  } else if (!insightResult.ok) {
    diagnostics.push({ step: 'LLM 响应', status: 'fail', detail: insightResult.message || insightResult.error, suggestion: insightResult.suggestion || '请检查 AI 设置' });
  } else {
    diagnostics.push({ step: 'LLM 响应', status: 'ok', detail: `${insightResult.llmDiagnostics?.model || 'unknown'}, ${insightResult.llmDiagnostics?.tokens || 0} tokens`, duration: insightResult.llmDiagnostics?.duration || 0 });
  }

  const allOk = diagnostics.every(d => d.status === 'ok');
  const lastSuccessAt = insightCache.get(lastSuccessKey) as string | undefined;

  const response = {
    ok: allOk,
    healthScore: insightResult?.healthScore,
    risks: insightResult?.risks,
    suggestions: insightResult?.suggestions,
    raw: insightResult?.raw,
    lastSuccessAt: lastSuccessAt || null,
    diagnostics,
  };

  // 缓存
  if (allOk) {
    insightCache.set(cacheKey, { data: response, expiresAt: now + 300_000 }); // 5 min
    insightCache.set(lastSuccessKey, new Date().toISOString());
  } else {
    insightCache.set(cacheKey, { data: response, expiresAt: now + 60_000 });  // 1 min
  }

  // 持久化（仅成功时）
  if (allOk && insightResult) {
    db.insert(scopedDb(scope).insightHistory).values({
      healthScore: insightResult.healthScore,
      risks: JSON.stringify(insightResult.risks || []),
      suggestions: JSON.stringify(insightResult.suggestions || []),
      raw: insightResult.raw || '',
    }).catch(err => request.log.error(err, 'Failed to persist insight history'));
  }

  return reply.send(response);
});
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/routes/dashboard.ts
git commit -m "feat: collect per-step diagnostics in ai-insight endpoint"
```

---

### Task 4: Update useAiInsights hook for new response format

**Files:**
- Modify: `web-console/src/hooks/useAiInsights.ts`
- Modify: `web-console/src/api/aiInsights.ts`

- [ ] **Step 1: Update aiInsights.ts API call**

No change needed if the endpoint URL and method (`GET /monitor/dashboard/ai-insight`) stay the same. The response type is now `AiInsightResponse`. Verify the `get<AiInsightResponse>` call works with the new shape.

- [ ] **Step 2: Update useAiInsights.ts**

```typescript
import type { AiInsight, AiInsightResponse, DiagnosticEntry } from '../types/aiInsights';

export function useAiInsight() {
  return useQuery<AiInsightResponse>({
    queryKey: ['ai-insight'],
    queryFn: () => api.get<AiInsightResponse>('/monitor/dashboard/ai-insight'),
    refetchInterval: 300_000, // 5 min
  });
}

export function useRefreshInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.get<AiInsightResponse>('/monitor/dashboard/ai-insight?refresh=true'),
    onSuccess: (data) => {
      queryClient.setQueryData(['ai-insight'], data);
    },
  });
}
```

The return type changes from `AiInsight` to `AiInsightResponse`. The hook now exposes `data.ok`, `data.diagnostics`, `data.lastSuccessAt` in addition to the existing fields.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/hooks/useAiInsights.ts web-console/src/api/aiInsights.ts
git commit -m "feat: update useAiInsights to return AiInsightResponse"
```

---

### Task 5: Add diagnostic panel to AiInsightCard

**Files:**
- Modify: `web-console/src/components/dashboard/AiInsightCard.tsx`

- [ ] **Step 1: Rewrite AiInsightCard to display diagnostics**

```typescript
import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { AiInsightResponse, DiagnosticEntry } from '../../types/aiInsights';

interface Props {
  data?: AiInsightResponse;
  isLoading: boolean;
  onRefresh: () => void;
}

const statusIcon = (status: DiagnosticEntry['status']) => {
  switch (status) {
    case 'ok':   return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'fail': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'skip': return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

export function AiInsightCard({ data, isLoading, onRefresh }: Props) {
  const [diagOpen, setDiagOpen] = useState(!data?.ok);
  const hasFailed = data && !data.ok;

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">AI 健康洞察</h3>
        <button onClick={onRefresh} className="text-xs text-primary hover:underline">立即刷新</button>
      </div>

      {data?.ok ? (
        <>
          {/* Health Score */}
          <div className="mb-3">
            <span className="text-3xl font-bold" style={{ color: (data.healthScore ?? 0) >= 80 ? '#22c55e' : (data.healthScore ?? 0) >= 60 ? '#eab308' : '#ef4444' }}>
              {data.healthScore ?? 0}
            </span>
            <span className="text-sm text-muted-foreground ml-1">/ 100</span>
          </div>

          {/* Risks */}
          {data.risks && data.risks.length > 0 && (
            <div className="mb-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">风险</div>
              {data.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={r.severity === 'high' ? 'text-red-500' : r.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'}>
                    ●
                  </span>
                  <span>{r.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {data.suggestions && data.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">建议</div>
              {data.suggestions.map((s, i) => (
                <div key={i} className="text-xs">• {s}</div>
              ))}
            </div>
          )}
        </>
      ) : data ? (
        <div className="mb-3 text-sm text-muted-foreground">洞察暂不可用</div>
      ) : null}

      {/* Diagnostics Panel */}
      {data && (
        <div className={cn('mt-3 rounded-md border', hasFailed ? 'border-red-200 bg-red-50 dark:bg-red-950/10' : '')}>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setDiagOpen(!diagOpen)}
          >
            {diagOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            诊断信息
          </button>
          {diagOpen && (
            <div className="px-3 pb-2 space-y-1.5">
              {data.diagnostics.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{statusIcon(d.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium">{d.step}</span>
                      <span className={d.status === 'ok' ? 'text-green-600' : d.status === 'fail' ? 'text-red-600' : 'text-muted-foreground'}>
                        {d.status === 'ok' ? `✓` : d.status === 'fail' ? `✗` : `—`}
                      </span>
                      {d.duration != null && (
                        <span className="text-muted-foreground">{d.duration}ms</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{d.detail}</div>
                    {d.suggestion && (
                      <div className="text-xs text-muted-foreground mt-0.5 italic">建议: {d.suggestion}</div>
                    )}
                  </div>
                </div>
              ))}
              {data.lastSuccessAt && (
                <div className="pt-1 text-xs text-muted-foreground border-t mt-2">
                  上次成功: {formatRelativeTime(data.lastSuccessAt)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
```

- [ ] **Step 2: Update Dashboard.tsx to pass new response type**

In `web-console/src/pages/Dashboard.tsx`, update the AiInsightCard usage:
```typescript
import { useAiInsight, useRefreshInsight } from '../hooks/useAiInsights';

function Dashboard() {
  const { data: insightData, isLoading: insightLoading } = useAiInsight();
  const refreshInsight = useRefreshInsight();

  return (
    <AiInsightCard
      data={insightData}
      isLoading={insightLoading}
      onRefresh={() => refreshInsight.mutate()}
    />
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/dashboard/AiInsightCard.tsx web-console/src/pages/Dashboard.tsx
git commit -m "feat: add diagnostic panel to AiInsightCard"
```

---

### Task 6: Update main branch and deploy

**Files:**
- (git operations only)

- [ ] **Step 1: Push to TS, merge to main**

```bash
git push origin TS
git checkout main && git reset --hard TS && git push origin main --force && git checkout TS
```

- [ ] **Step 2: Notify user to redeploy on Render**
