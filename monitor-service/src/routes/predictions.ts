// monitor-service/src/routes/predictions.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, desc } from 'drizzle-orm';
import { predictionEngine } from '../services/prediction-engine.js';

export async function predictionRoutes(app: FastifyInstance) {
  // 列出当前活跃的预测
  app.get('/', async (request) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const predictions = await db
      .select({
        id: t.metricPredictions.id,
        instanceId: t.metricPredictions.instanceId,
        instanceName: t.instances.name,
        instanceProvider: t.instances.provider,
        metricName: t.metricPredictions.metricName,
        currentValue: t.metricPredictions.currentValue,
        predictedValue: t.metricPredictions.predictedValue,
        threshold: t.metricPredictions.threshold,
        hoursToThreshold: t.metricPredictions.hoursToThreshold,
        slope: t.metricPredictions.slope,
        confidence: t.metricPredictions.confidence,
        createdAt: t.metricPredictions.createdAt,
      })
      .from(t.metricPredictions)
      .innerJoin(t.instances, eq(t.metricPredictions.instanceId, t.instances.id))
      .orderBy(desc(t.metricPredictions.createdAt))
      .limit(50);

    // 去重：每个实例+指标只保留最新一条
    const seen = new Set<string>();
    const unique = predictions.filter((p) => {
      const key = `${p.instanceId}-${p.metricName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique;
  });

  // 手动触发预测（demo 用）
  app.post('/run', async (request) => {
    await predictionEngine.runAll(request.scope);
    return { ok: true, message: 'Prediction run completed' };
  });
}
