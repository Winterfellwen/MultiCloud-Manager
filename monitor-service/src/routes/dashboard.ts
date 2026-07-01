import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, gte, sql, desc } from 'drizzle-orm';
import { config } from '../config.js';

// AI 洞察缓存（5 分钟）—— 按 schema 隔离，避免 demo/生产缓存串读
const insightCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/ai-insight', async (request, reply) => {
    const scope = request.scope;
    const cacheKey = scope.schema;

    // 检查缓存
    const cached = insightCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return reply.send(cached.data);
    }

    // 收集上下文数据
    const t = scopedDb(scope);
    const allInstances = await db.select().from(t.instances);
    const totalInstances = allInstances.length;
    const runningInstances = allInstances.filter(i => i.status === 'running').length;
    const stoppedInstances = allInstances.filter(i => i.status === 'stopped').length;

    const firingAlertsList = await db.select().from(t.alerts).where(eq(t.alerts.status, 'firing')).limit(10);
    const recentAlerts = firingAlertsList.map(a => ({ severity: a.severity, message: a.message }));

    const providerMap = new Map<string, number>();
    allInstances.forEach(i => {
      providerMap.set(i.provider, (providerMap.get(i.provider) || 0) + 1);
    });
    const providerBreakdown = Array.from(providerMap.entries()).map(([provider, count]) => ({ provider, count }));

    const abnormalInstances = allInstances
      .filter(i => i.status !== 'running' && i.status !== 'stopped')
      .slice(0, 5)
      .map(i => ({ name: i.name || i.id, provider: i.provider, status: i.status }));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const costRows = await db.select().from(t.costRecords).where(gte(t.costRecords.periodStart, monthStart));
    const totalCost = costRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    // 调用 ai-gateway 内部端点
    const res = await fetch(`${config.aiGatewayUrl}/internal/insight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': scope.isDemo ? 'true' : 'false',
      },
      body: JSON.stringify({
        totalInstances,
        runningInstances,
        stoppedInstances,
        firingAlerts: firingAlertsList.length,
        totalCost,
        providerBreakdown,
        recentAlerts,
        abnormalInstances,
        scope: scope.schema,
      }),
    });

    if (!res.ok) {
      return reply.status(502).send({ error: 'AI_INSIGHT_FAILED', message: `ai-gateway responded ${res.status}` });
    }

    const data = await res.json();

    // 更新缓存
    insightCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

    return reply.send(data);
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
}
