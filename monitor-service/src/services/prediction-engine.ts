// monitor-service/src/services/prediction-engine.ts
import { db } from '../db/index.js';
import { metrics, instances, metricPredictions, alerts, alertRules } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { config } from '../config.js';

interface MetricPoint {
  timestamp: Date;
  value: number;
}

interface PredictionResult {
  instanceId: string;
  metricName: string;
  currentValue: number;
  predictedValue: number;
  threshold: number;
  hoursToThreshold: number;
  slope: number;
  confidence: number;
}

export class PredictionEngine {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.predictionIntervalSec * 1000;
    this.timer = setInterval(() => this.runAll().catch(console.error), intervalMs);
    console.log(`Prediction engine started (interval: ${config.predictionIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async runAll(): Promise<void> {
    const allInstances = await db.select().from(instances).where(eq(instances.status, 'running'));
    const predictionMetrics = ['disk_utilization', 'memory_utilization'];

    for (const inst of allInstances) {
      for (const metricName of predictionMetrics) {
        await this.predictForInstance(inst.id, inst.name || inst.id, metricName)
          .catch((err) => console.error(`Prediction for ${inst.id}/${metricName} failed:`, err));
      }
    }
  }

  async predictForInstance(instanceId: string, instanceName: string, metricName: string): Promise<PredictionResult | null> {
    const since = new Date(Date.now() - config.predictionHistoryHours * 60 * 60 * 1000);
    const points = await db
      .select()
      .from(metrics)
      .where(and(eq(metrics.instanceId, instanceId), eq(metrics.metricName, metricName), gte(metrics.recordedAt, since)))
      .orderBy(desc(metrics.recordedAt));

    if (points.length < 10) return null; // 数据点不足

    // 转换为 (x=小时前, y=值)
    const dataPoints: MetricPoint[] = points.map((p) => ({
      timestamp: new Date(p.recordedAt),
      value: parseFloat(p.value),
    })).reverse(); // 按时间正序

    const regression = this.linearRegression(dataPoints);
    if (!regression) return null;

    const { slope, intercept, r2 } = regression;
    if (r2 < config.predictionMinConfidence) return null; // 置信度不足

    const currentValue = dataPoints[dataPoints.length - 1].value;
    const threshold = config.predictionThreshold;

    if (slope <= 0) return null; // 指标在下降，无需预测

    // 预测何时达到阈值：threshold = intercept + slope * x
    // x 是从数据起点开始的小时数
    const nowX = (Date.now() - dataPoints[0].timestamp.getTime()) / (1000 * 60 * 60);
    const thresholdX = (threshold - intercept) / slope;
    const hoursToThreshold = thresholdX - nowX;

    if (hoursToThreshold <= 0 || hoursToThreshold > 720) return null; // 已超阈值或太远（>30天）

    const result: PredictionResult = {
      instanceId,
      metricName,
      currentValue,
      predictedValue: threshold,
      threshold,
      hoursToThreshold,
      slope,
      confidence: r2 * 100,
    };

    // 保存预测记录
    await db.insert(metricPredictions).values({
      instanceId,
      metricName,
      currentValue: currentValue.toString(),
      predictedValue: threshold.toString(),
      threshold: threshold.toString(),
      hoursToThreshold: hoursToThreshold.toFixed(2),
      slope: slope.toFixed(6),
      confidence: (r2 * 100).toFixed(2),
    });

    // 生成预测告警（severity=info）
    if (hoursToThreshold < 48) { // 48 小时内才生成告警
      await this.createPredictiveAlert(result, instanceName);
    }

    return result;
  }

  private async createPredictiveAlert(result: PredictionResult, instanceName: string): Promise<void> {
    // 检查是否已有相同预测告警
    const existing = await db.select().from(alerts).where(
      and(
        eq(alerts.instanceId, result.instanceId),
        eq(alerts.status, 'firing'),
        eq(alerts.severity, 'info')
      )
    ).limit(1);

    if (existing.length > 0) return; // 已存在

    const metricLabel = result.metricName === 'disk_utilization' ? '磁盘使用率' : '内存使用率';
    const message = `预测：${instanceName} ${metricLabel}将在约 ${Math.round(result.hoursToThreshold)} 小时后达到 ${result.threshold}%（当前 ${result.currentValue.toFixed(1)}%，趋势 +${result.slope.toFixed(2)}%/h，置信度 ${result.confidence.toFixed(0)}%）`;

    await db.insert(alerts).values({
      severity: 'info',
      message,
      status: 'firing',
    });
  }

  /**
   * 简单线性回归（最小二乘法）
   * x = 从第一个数据点开始的小时数
   * y = 指标值
   */
  private linearRegression(points: MetricPoint[]): { slope: number; intercept: number; r2: number } | null {
    if (points.length < 2) return null;

    const startTime = points[0].timestamp.getTime();
    const xs = points.map((p) => (p.timestamp.getTime() - startTime) / (1000 * 60 * 60));
    const ys = points.map((p) => p.value);

    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
    const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
    const sumYY = ys.reduce((acc, y) => acc + y * y, 0);

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // R²（决定系数）
    const meanY = sumY / n;
    const ssTot = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
    const ssRes = ys.reduce((acc, y, i) => acc + (y - (intercept + slope * xs[i])) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }
}

export const predictionEngine = new PredictionEngine();
