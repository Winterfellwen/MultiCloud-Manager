// monitor-service/src/routes/predictions.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { metricPredictions, instances } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { predictionEngine } from '../services/prediction-engine.js';

export async function predictionRoutes(app: FastifyInstance) {
  // 列出当前活跃的预测
  app.get('/', async (_request) => {
    const predictions = await db
      .select({
        id: metricPredictions.id,
        instanceId: metricPredictions.instanceId,
        instanceName: instances.name,
        instanceProvider: instances.provider,
        metricName: metricPredictions.metricName,
        currentValue: metricPredictions.currentValue,
        predictedValue: metricPredictions.predictedValue,
        threshold: metricPredictions.threshold,
        hoursToThreshold: metricPredictions.hoursToThreshold,
        slope: metricPredictions.slope,
        confidence: metricPredictions.confidence,
        createdAt: metricPredictions.createdAt,
      })
      .from(metricPredictions)
      .innerJoin(instances, eq(metricPredictions.instanceId, instances.id))
      .orderBy(desc(metricPredictions.createdAt))
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
  app.post('/run', async (_request) => {
    await predictionEngine.runAll();
    return { ok: true, message: 'Prediction run completed' };
  });
}
