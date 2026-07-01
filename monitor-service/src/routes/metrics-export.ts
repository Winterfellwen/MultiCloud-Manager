import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, sql } from 'drizzle-orm';

export async function metricsExportRoutes(app: FastifyInstance) {
  app.get('/metrics', async (request, reply) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const lines: string[] = [];

    // 1. 实例总数（按 provider + status）
    const instanceRows = await db.select().from(t.instances);
    const instanceMap = new Map<string, number>();
    for (const inst of instanceRows) {
      const key = `provider="${inst.provider}",status="${inst.status}"`;
      instanceMap.set(key, (instanceMap.get(key) || 0) + 1);
    }
    lines.push('# HELP cloudops_instances_total Total instances by provider and status');
    lines.push('# TYPE cloudops_instances_total gauge');
    for (const [key, count] of instanceMap) {
      lines.push(`cloudops_instances_total{${key}} ${count}`);
    }

    // 2. 当前 firing 告警（按 severity）
    const firingAlerts = await db.select().from(t.alerts).where(eq(t.alerts.status, 'firing'));
    const alertMap = new Map<string, number>();
    for (const a of firingAlerts) {
      const key = `severity="${a.severity}"`;
      alertMap.set(key, (alertMap.get(key) || 0) + 1);
    }
    lines.push('');
    lines.push('# HELP cloudops_alerts_firing Current firing alerts by severity');
    lines.push('# TYPE cloudops_alerts_firing gauge');
    for (const [key, count] of alertMap) {
      lines.push(`cloudops_alerts_firing{${key}} ${count}`);
    }
    if (alertMap.size === 0) {
      lines.push('cloudops_alerts_firing{severity="critical"} 0');
      lines.push('cloudops_alerts_firing{severity="warning"} 0');
      lines.push('cloudops_alerts_firing{severity="info"} 0');
    }

    // 3. AI Token 消耗总计（按 provider）
    const tokenRows = await db.select({
      provider: t.tokenUsage.provider,
      total: sql<number>`COALESCE(SUM(${t.tokenUsage.totalTokens}), 0)`,
    }).from(t.tokenUsage).groupBy(t.tokenUsage.provider);
    lines.push('');
    lines.push('# HELP cloudops_ai_tokens_total Total AI tokens consumed by provider');
    lines.push('# TYPE cloudops_ai_tokens_total counter');
    for (const row of tokenRows) {
      const provider = row.provider || 'unknown';
      lines.push(`cloudops_ai_tokens_total{provider="${provider}"} ${row.total}`);
    }
    if (tokenRows.length === 0) {
      lines.push('cloudops_ai_tokens_total{provider="none"} 0');
    }

    // 4. 告警总数
    lines.push('');
    lines.push('# HELP cloudops_alerts_firing_total Total firing alerts count');
    lines.push('# TYPE cloudops_alerts_firing_total gauge');
    lines.push(`cloudops_alerts_firing_total ${firingAlerts.length}`);

    // 5. 实例总数
    lines.push('');
    lines.push('# HELP cloudops_instances_count Total instances count');
    lines.push('# TYPE cloudops_instances_count gauge');
    lines.push(`cloudops_instances_count ${instanceRows.length}`);

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(lines.join('\n') + '\n');
  });
}
