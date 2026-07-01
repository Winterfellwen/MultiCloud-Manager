// monitor-service/src/services/knowledge-base.service.ts
import { db } from '../db/index.js';
import { knowledgeBase, remediationRuns, alerts, instances } from '../db/schema.js';
import { eq, desc, sql, and } from 'drizzle-orm';
import { config } from '../config.js';

export interface KnowledgeEntry {
  id: string;
  symptom: string;
  metricName: string;
  instanceProvider: string | null;
  instanceEnv: string | null;
  rootCause: string | null;
  actionTaken: string | null;
  outcome: string;
  resolutionTimeMinutes: number | null;
  helpfulCount: number;
  createdAt: Date;
}

export interface SimilarCase {
  outcome: string;
  symptom: string;
  rootCause: string;
  actionTaken: string;
  resolutionTime: number;
}

export class KnowledgeBaseService {
  /**
   * 自愈完成后，将经验写入知识库
   */
  async recordExperience(runId: string): Promise<void> {
    const run = await db.select().from(remediationRuns).where(eq(remediationRuns.id, runId)).limit(1);
    if (run.length === 0) return;

    const remediation = run[0];
    if (!remediation.alertId || !remediation.instanceId) return;

    // 获取告警和实例信息
    const alert = await db.select().from(alerts).where(eq(alerts.id, remediation.alertId)).limit(1);
    const inst = await db.select().from(instances).where(eq(instances.id, remediation.instanceId)).limit(1);
    if (alert.length === 0) return;

    const instance = inst[0];
    const plan = remediation.actionPlan as any;

    // 构造症状描述
    const symptom = `${instance.name || remediation.instanceId} (${instance.provider}) ${alert[0].message}`;

    // 计算恢复时间
    let resolutionTime = 0;
    if (remediation.triggeredAt && remediation.verifiedAt) {
      resolutionTime = Math.round((remediation.verifiedAt.getTime() - remediation.triggeredAt.getTime()) / 60000);
    }

    // 生成 embedding（调用 ai-gateway）
    const embedding = await this.generateEmbedding(symptom);

    // 写入知识库
    await db.insert(knowledgeBase).values({
      alertId: remediation.alertId,
      remediationRunId: runId,
      symptom,
      metricName: plan?.verificationMetric || 'unknown',
      instanceProvider: instance.provider,
      instanceEnv: remediation.env,
      rootCause: remediation.rootCause,
      actionTaken: remediation.actionExecuted,
      outcome: remediation.status === 'success' ? 'success' : 'failed',
      resolutionTimeMinutes: resolutionTime,
    });

    // 如果有 embedding，用原生 SQL 更新
    if (embedding) {
      const embeddingStr = `[${embedding.join(',')}]`;
      await db.execute(sql`UPDATE knowledge_base SET embedding = ${sql.raw(`'${embeddingStr}'::vector`)} WHERE id = (SELECT id FROM knowledge_base WHERE remediation_run_id = ${runId} ORDER BY created_at DESC LIMIT 1)`);
    }
  }

  /**
   * RAG 检索相似案例
   */
  async searchSimilarCases(symptom: string, metricName: string, topK = 5): Promise<SimilarCase[]> {
    // 策略 1：向量检索（如果 pgvector 可用）
    const embedding = await this.generateEmbedding(symptom);
    let vectorResults: any[] = [];

    if (embedding) {
      try {
        const embeddingStr = `[${embedding.join(',')}]`;
        const rows = await db.execute(sql`
          SELECT symptom, root_cause, action_taken, outcome, resolution_time_minutes,
                 1 - (embedding <=> ${sql.raw(`'${embeddingStr}'::vector`)}) as similarity
          FROM knowledge_base
          WHERE embedding IS NOT NULL AND metric_name = ${metricName}
          ORDER BY embedding <=> ${sql.raw(`'${embeddingStr}'::vector`)}
          LIMIT ${topK}
        `);
        vectorResults = rows as any[];
      } catch (err) {
        console.warn('Vector search failed, falling back to keyword search:', (err as Error).message);
      }
    }

    // 策略 2：关键词检索（补充或降级）
    let keywordResults: any[] = [];
    try {
      const keywordRows = await db.execute(sql`
        SELECT symptom, root_cause, action_taken, outcome, resolution_time_minutes
        FROM knowledge_base
        WHERE metric_name = ${metricName}
          AND (to_tsvector('chinese', symptom) @@ plainto_tsquery('chinese', ${symptom})
               OR symptom ILIKE ${'%' + symptom + '%'})
        ORDER BY created_at DESC
        LIMIT ${topK}
      `);
      keywordResults = keywordRows as any[];
    } catch (err) {
      // chinese 全文检索配置不可用时，降级为纯 ILIKE 检索
      console.warn('Keyword tsvector search failed, falling back to ILIKE:', (err as Error).message);
      const ilikeRows = await db.execute(sql`
        SELECT symptom, root_cause, action_taken, outcome, resolution_time_minutes
        FROM knowledge_base
        WHERE metric_name = ${metricName}
          AND symptom ILIKE ${'%' + symptom + '%'}
        ORDER BY created_at DESC
        LIMIT ${topK}
      `);
      keywordResults = ilikeRows as any[];
    }

    // 合并去重
    const allResults = [...vectorResults, ...keywordResults];
    const seen = new Set<string>();
    const unique = allResults.filter((r) => {
      if (seen.has(r.symptom)) return false;
      seen.add(r.symptom);
      return true;
    });

    return unique.slice(0, topK).map((r) => ({
      outcome: r.outcome,
      symptom: r.symptom,
      rootCause: r.root_cause || '',
      actionTaken: r.action_taken || '',
      resolutionTime: r.resolution_time_minutes || 0,
    }));
  }

  /**
   * 列出知识库条目
   */
  async list(limit = 50): Promise<KnowledgeEntry[]> {
    const entries = await db.select().from(knowledgeBase)
      .orderBy(desc(knowledgeBase.createdAt))
      .limit(limit);
    return entries as KnowledgeEntry[];
  }

  /**
   * 调用 ai-gateway 生成 embedding
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const res = await fetch(`${config.aiGatewayUrl}/internal/embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { embedding: number[] | null };
      return data.embedding;
    } catch {
      return null;
    }
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
