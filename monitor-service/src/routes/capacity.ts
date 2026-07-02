// monitor-service/src/routes/capacity.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, desc } from 'drizzle-orm';

export async function capacityRoutes(app: FastifyInstance) {
  // 获取容量扩容建议列表（从 knowledge_base 检索 metricName='capacity'）
  app.get('/recommendations', async (request) => {
    const t = scopedDb(request.scope);
    const recs = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'capacity'))
      .orderBy(desc(t.knowledgeBase.createdAt))
      .limit(50);
    return recs;
  });

  // 容量风险汇总
  app.get('/summary', async (request) => {
    const t = scopedDb(request.scope);

    // 从 knowledge_base 获取容量建议
    const recs = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'capacity'));

    const urgent = recs.filter((r) => r.outcome === 'urgent').length;
    const recommend = recs.filter((r) => r.outcome === 'recommend').length;

    // 从 metric_predictions 获取 72h 内的预测
    const predictions = await db.select().from(t.metricPredictions)
      .orderBy(desc(t.metricPredictions.createdAt))
      .limit(100);

    const urgentPredictions = predictions.filter(
      (p) => parseFloat(p.hoursToThreshold) < 72 && parseFloat(p.confidence) > 70
    );

    return {
      urgent,
      recommend,
      total: recs.length,
      urgentPredictions: urgentPredictions.length,
      predictions: urgentPredictions.slice(0, 10).map((p) => ({
        instanceId: p.instanceId,
        metricName: p.metricName,
        currentValue: p.currentValue,
        predictedValue: p.predictedValue,
        hoursToThreshold: p.hoursToThreshold,
        confidence: p.confidence,
      })),
    };
  });
}
