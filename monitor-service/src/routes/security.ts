// monitor-service/src/routes/security.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, desc } from 'drizzle-orm';
import { securityScanner } from '../services/security-scanner.js';

export async function securityRoutes(app: FastifyInstance) {
  // 获取安全扫描发现列表（从 knowledge_base 检索）
  app.get('/findings', async (request) => {
    const t = scopedDb(request.scope);
    const findings = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'security'))
      .orderBy(desc(t.knowledgeBase.createdAt))
      .limit(50);
    return findings;
  });

  // 安全风险汇总
  app.get('/summary', async (request) => {
    const t = scopedDb(request.scope);
    const findings = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'security'));

    const critical = findings.filter((f) => f.outcome === 'critical').length;
    const warning = findings.filter((f) => f.outcome === 'warning').length;

    // 按规则关键词分组
    const byRule: Record<string, number> = {};
    for (const f of findings) {
      // 从 symptom 提取规则关键词
      let ruleKey = 'other';
      if (f.symptom?.includes('公网')) ruleKey = 'public_exposure';
      else if (f.symptom?.includes('磁盘未加密')) ruleKey = 'unencrypted_disk';
      else if (f.symptom?.includes('对象存储')) ruleKey = 'unencrypted_storage';
      else if (f.symptom?.includes('闲置')) ruleKey = 'idle_resource';
      else if (f.symptom?.includes('安全组')) ruleKey = 'weak_security_group';
      byRule[ruleKey] = (byRule[ruleKey] || 0) + 1;
    }

    // 查询最近扫描时间
    const latest = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'security'))
      .orderBy(desc(t.knowledgeBase.createdAt))
      .limit(1);

    return {
      critical,
      warning,
      total: findings.length,
      byRule,
      lastScannedAt: latest[0]?.createdAt || null,
    };
  });

  // 手动触发扫描
  app.post('/scan', async (request, reply) => {
    try {
      await securityScanner.scanOnce(request.scope);
      return { status: 'ok', message: 'Security scan completed' };
    } catch (err) {
      return reply.status(409).send({
        error: 'SCAN_IN_PROGRESS',
        message: (err as Error).message,
      });
    }
  });
}
