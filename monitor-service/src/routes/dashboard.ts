import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { instances, alerts, costRecords, tokenUsage } from '../db/schema.js';
import { eq, gte, sql, desc } from 'drizzle-orm';
import { config } from '../config.js';

// AI 洞察缓存（5 分钟）
let insightCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/ai-insight', async (_request, reply) => {
    // 检查缓存
    if (insightCache && Date.now() < insightCache.expiresAt) {
      return reply.send(insightCache.data);
    }

    // 收集上下文数据
    const allInstances = await db.select().from(instances);
    const totalInstances = allInstances.length;
    const runningInstances = allInstances.filter(i => i.status === 'running').length;
    const stoppedInstances = allInstances.filter(i => i.status === 'stopped').length;

    const firingAlertsList = await db.select().from(alerts).where(eq(alerts.status, 'firing')).limit(10);
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
    const costRows = await db.select().from(costRecords).where(gte(costRecords.periodStart, monthStart));
    const totalCost = costRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    // 调用 ai-gateway 内部端点
    const res = await fetch(`${config.aiGatewayUrl}/internal/insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalInstances,
        runningInstances,
        stoppedInstances,
        firingAlerts: firingAlertsList.length,
        totalCost,
        providerBreakdown,
        recentAlerts,
        abnormalInstances,
      }),
    });

    if (!res.ok) {
      return reply.status(502).send({ error: 'AI_INSIGHT_FAILED', message: `ai-gateway responded ${res.status}` });
    }

    const data = await res.json();

    // 更新缓存
    insightCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };

    return reply.send(data);
  });

  app.get('/token-stats', async (_request) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const todayRows = await db.select({
      total: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      prompt: sql<number>`COALESCE(SUM(${tokenUsage.promptTokens}), 0)`,
      completion: sql<number>`COALESCE(SUM(${tokenUsage.completionTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    }).from(tokenUsage).where(gte(tokenUsage.createdAt, todayStart));

    const weekRows = await db.select({
      total: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    }).from(tokenUsage).where(gte(tokenUsage.createdAt, weekStart));

    const trendRows = await db.select({
      date: sql<string>`DATE(${tokenUsage.createdAt})`,
      tokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`,
    }).from(tokenUsage)
      .where(gte(tokenUsage.createdAt, weekStart))
      .groupBy(sql`DATE(${tokenUsage.createdAt})`)
      .orderBy(desc(sql`DATE(${tokenUsage.createdAt})`));

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
