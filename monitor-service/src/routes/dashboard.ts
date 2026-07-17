import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, gte, sql, desc } from 'drizzle-orm';
import { config } from '../config.js';

interface DiagnosticEntry {
  step: string;
  status: 'ok' | 'fail' | 'skip';
  detail: string;
  suggestion?: string;
  duration?: number;
}

// AI 洞察缓存（5 分钟）—— 按 schema 隔离，避免 demo/生产缓存串读
const insightCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function dashboardRoutes(app: FastifyInstance) {
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
      const nowDate = new Date(now);
      const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
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
    try {
      if (!step2Ok) {
        diagnostics.push({ step: 'LLM 响应', status: 'skip', detail: '上游服务不可用，未执行' });
      } else if (!insightResult.ok) {
        diagnostics.push({ step: 'LLM 响应', status: 'fail', detail: insightResult.message || insightResult.error || '未知错误', suggestion: insightResult.suggestion || '请检查 AI 设置' });
      } else {
        diagnostics.push({ step: 'LLM 响应', status: 'ok', detail: `${insightResult.llmDiagnostics?.model || 'unknown'}, ${insightResult.llmDiagnostics?.tokens || 0} tokens`, duration: insightResult.llmDiagnostics?.duration || 0 });
      }
    } catch (e) {
      diagnostics.push({ step: 'LLM 响应', status: 'fail', detail: (e as Error).message, suggestion: '处理 LLM 响应时发生异常，请检查 AI 网关返回格式' });
    }

    const allOk = diagnostics.every(d => d.status === 'ok');
    const nowIso = new Date().toISOString();

    const response = {
      ok: allOk,
      healthScore: insightResult?.healthScore,
      risks: insightResult?.risks,
      suggestions: insightResult?.suggestions,
      raw: insightResult?.raw,
      lastSuccessAt: allOk ? nowIso : (insightCache.get(lastSuccessKey)?.data as string | undefined) || null,
      diagnostics,
    };

    // 缓存
    if (allOk) {
      insightCache.set(cacheKey, { data: response, expiresAt: now + CACHE_TTL_MS });
      insightCache.set(lastSuccessKey, { data: nowIso, expiresAt: now + 86_400_000 }); // 24h
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

  app.get('/token-stats', async (request) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const todayRows = await db.select({
      total: sql<number>`COALESCE(SUM(${t.tokenUsage.totalTokens}), 0)`,
      prompt: sql<number>`COALESCE(SUM(${t.tokenUsage.promptTokens}), 0)`,
      completion: sql<number>`COALESCE(SUM(${t.tokenUsage.completionTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    }).from(t.tokenUsage).where(gte(t.tokenUsage.createdAt, todayStart));

    const weekRows = await db.select({
      total: sql<number>`COALESCE(SUM(${t.tokenUsage.totalTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    }).from(t.tokenUsage).where(gte(t.tokenUsage.createdAt, weekStart));

    const trendRows = await db.select({
      date: sql<string>`DATE(${t.tokenUsage.createdAt})`,
      tokens: sql<number>`COALESCE(SUM(${t.tokenUsage.totalTokens}), 0)`,
    }).from(t.tokenUsage)
      .where(gte(t.tokenUsage.createdAt, weekStart))
      .groupBy(sql`DATE(${t.tokenUsage.createdAt})`)
      .orderBy(desc(sql`DATE(${t.tokenUsage.createdAt})`));

    return {
      today: {
        totalTokens: todayRows[0]?.total || 0,
        promptTokens: todayRows[0]?.prompt || 0,
        completionTokens: todayRows[0]?.completion || 0,
        calls: todayRows[0]?.calls || 0,
      },
      week: {
        totalTokens: weekRows[0]?.total || 0,
        calls: weekRows[0]?.calls || 0,
      },
      trend: trendRows.map(r => ({ date: r.date, tokens: r.tokens })),
    };
  });

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
}
