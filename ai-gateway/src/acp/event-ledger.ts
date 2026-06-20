// ACP 事件账本（PostgreSQL 持久化）
// 记录每个 session update 事件，支持断线重连后重放

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export interface AcpEvent {
  seq: number;
  sessionKey: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

/**
 * 初始化事件账本（表结构由 migrations/001_init.sql 创建）
 * 此函数保留为空，仅为向后兼容；实际初始化在服务启动时由 runMigrations 完成。
 */
export async function initEventLedger(): Promise<void> {
  // no-op：表已通过 migration 创建
}

interface EventRow {
  seq: number;
  session_key: string;
  event_type: string;
  payload: string;
  timestamp: number;
}

// 跟踪已完成的 runId，防止 assistant_complete 之后写入 delta/other 事件
// 导出供 chat.ts 同步更新（解决 fire-and-forget 调用导致的竞态问题）
export const completedRunIds = new Set<string>();
// 跟踪每个 runId 的上一个 assistant_delta 文本（避免重复写入相同 delta）
export const lastDeltaTextByRunId = new Map<string, string>();

/** 标记 runId 为已完成（chat.ts 在调用 onComplete 之前同步调用） */
export function markRunCompleted(runId: string): void {
  completedRunIds.add(runId);
}

/**
 * 记录事件（queuedRecordEvent 已串行化同 sessionKey 的调用，确保顺序）
 */
export async function recordEvent(
  sessionKey: string,
  eventType: string,
  payload: unknown
): Promise<number> {
  const now = Date.now();

  // 从 payload 中提取 runId（如果有）
  const payloadObj = payload as { runId?: string; delta?: string; finalText?: string } | null;
  const runId = payloadObj?.runId;

  // 关键检查：如果是 assistant_delta 且与上次相同，跳过（避免重复）
  if (runId && eventType === 'assistant_delta') {
    const delta = payloadObj?.delta || '';
    const lastDelta = lastDeltaTextByRunId.get(runId) || '';
    if (delta && delta === lastDelta) {
      const upsertResult = await db.execute(sql`
        INSERT INTO acp_replay_sessions (session_key, created_at, last_seq)
        VALUES (${sessionKey}, ${now}, 1)
        ON CONFLICT (session_key)
        DO UPDATE SET last_seq = acp_replay_sessions.last_seq + 1
        RETURNING last_seq
      `);
      return Number((upsertResult[0] as { last_seq: string | number }).last_seq);
    }
    lastDeltaTextByRunId.set(runId, delta);
  }

  // 使用 UPSERT 原子递增 seq（queuedRecordEvent 已串行化同 sessionKey 的调用，确保顺序）
  const upsertResult = await db.execute(sql`
    INSERT INTO acp_replay_sessions (session_key, created_at, last_seq)
    VALUES (${sessionKey}, ${now}, 1)
    ON CONFLICT (session_key)
    DO UPDATE SET last_seq = acp_replay_sessions.last_seq + 1
    RETURNING last_seq
  `);
  const seq = Number((upsertResult[0] as { last_seq: string | number }).last_seq);

  await db.execute(sql`
    INSERT INTO acp_replay_events (session_key, seq, event_type, payload, timestamp)
    VALUES (${sessionKey}, ${seq}, ${eventType}, ${JSON.stringify(payload)}, ${now})
  `);

  return seq;
}

/**
 * 读取 session 的事件重放
 * 按 seq 排序；相同 seq 时按 timestamp 次级排序（历史数据可能存在 seq 重复）
 */
export async function readReplay(sessionKey: string, fromSeq: number = 0): Promise<AcpEvent[]> {
  const rows = await db.execute(sql`
    SELECT seq, session_key, event_type, payload, timestamp
    FROM acp_replay_events
    WHERE session_key = ${sessionKey} AND seq > ${fromSeq}
    ORDER BY seq, timestamp
  `) as unknown as EventRow[];

  return rows.map(row => ({
    seq: Number(row.seq),
    sessionKey: row.session_key,
    type: row.event_type,
    payload: JSON.parse(row.payload),
    timestamp: Number(row.timestamp),
  }));
}

/**
 * 清理 session 的事件（生成完成后调用）
 */
export async function clearSessionEvents(sessionKey: string): Promise<void> {
  // 先查询该 session 的所有 runId，用于清理内存状态
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT payload->>'runId' as run_id
      FROM acp_replay_events
      WHERE session_key = ${sessionKey} AND payload->>'runId' IS NOT NULL
    `) as unknown as Array<{ run_id: string }>;
    for (const row of rows) {
      if (row.run_id) {
        completedRunIds.delete(row.run_id);
        lastDeltaTextByRunId.delete(row.run_id);
      }
    }
  } catch {
    // ignore cleanup errors
  }

  await db.execute(sql`DELETE FROM acp_replay_events WHERE session_key = ${sessionKey}`);
  await db.execute(sql`DELETE FROM acp_replay_sessions WHERE session_key = ${sessionKey}`);

  // LRU 清理：限制内存跟踪最多 1000 个 runId，防止内存泄漏
  if (completedRunIds.size > 1000) {
    const entries = Array.from(completedRunIds);
    const toDelete = entries.slice(0, entries.length - 1000);
    for (const id of toDelete) completedRunIds.delete(id);
  }
  if (lastDeltaTextByRunId.size > 1000) {
    const entries = Array.from(lastDeltaTextByRunId.keys());
    const toDelete = entries.slice(0, entries.length - 1000);
    for (const id of toDelete) lastDeltaTextByRunId.delete(id);
  }
}
