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
  payload: unknown,
  userInfo?: { userId: string; username: string }
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
        INSERT INTO acp_replay_sessions (session_key, created_at, last_seq, user_id, username)
        VALUES (${sessionKey}, ${now}, 1, ${userInfo?.userId || ''}, ${userInfo?.username || ''})
        ON CONFLICT (session_key)
        DO UPDATE SET
          last_seq = acp_replay_sessions.last_seq + 1,
          user_id = CASE WHEN acp_replay_sessions.user_id = '' THEN ${userInfo?.userId || ''} ELSE acp_replay_sessions.user_id END,
          username = CASE WHEN acp_replay_sessions.username = '' THEN ${userInfo?.username || ''} ELSE acp_replay_sessions.username END
        RETURNING last_seq
      `);
      return Number((upsertResult[0] as { last_seq: string | number }).last_seq);
    }
    // store only last 100 chars to prevent memory bloat
    lastDeltaTextByRunId.set(runId, delta.slice(-100));
  }

  // 使用 UPSERT 原子递增 seq（queuedRecordEvent 已串行化同 sessionKey 的调用，确保顺序）
  const upsertResult = await db.execute(sql`
    INSERT INTO acp_replay_sessions (session_key, created_at, last_seq, user_id, username)
    VALUES (${sessionKey}, ${now}, 1, ${userInfo?.userId || ''}, ${userInfo?.username || ''})
    ON CONFLICT (session_key)
    DO UPDATE SET
      last_seq = acp_replay_sessions.last_seq + 1,
      user_id = CASE WHEN acp_replay_sessions.user_id = '' THEN ${userInfo?.userId || ''} ELSE acp_replay_sessions.user_id END,
      username = CASE WHEN acp_replay_sessions.username = '' THEN ${userInfo?.username || ''} ELSE acp_replay_sessions.username END
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

  // LRU 清理：限制内存跟踪最多 200 个 runId，防止内存泄漏
  if (completedRunIds.size > 200) {
    const entries = Array.from(completedRunIds);
    const toDelete = entries.slice(0, entries.length - 200);
    for (const id of toDelete) completedRunIds.delete(id);
  }
  if (lastDeltaTextByRunId.size > 200) {
    const entries = Array.from(lastDeltaTextByRunId.keys());
    const toDelete = entries.slice(0, entries.length - 200);
    for (const id of toDelete) lastDeltaTextByRunId.delete(id);
  }
}

export interface SessionListItem {
  sessionKey: string;
  title: string;
  username: string;
  userId: string;
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
}

interface SessionRow {
  session_key: string;
  title: string | null;
  username: string;
  user_id: string;
  created_at: string;
}

interface CountRow {
  session_key: string;
  count: string;
}

interface LastTsRow {
  session_key: string;
  max_ts: string | null;
}

/**
 * 列出用户可见的会话
 */
export async function listSessions(
  viewerId: string,
  viewerRole: string,
  viewerTeam: string,
  filter: 'mine' | 'team' | 'all' = 'mine'
): Promise<SessionListItem[]> {
  let whereClause;

  if (filter === 'all' && viewerRole === 'admin') {
    whereClause = sql`WHERE 1=1`;
  } else if (filter === 'team' && viewerTeam) {
    whereClause = sql`WHERE s.user_id IN (
      SELECT id::text FROM users WHERE team = ${viewerTeam} AND team != ''
    )`;
  } else {
    whereClause = sql`WHERE s.user_id = ${viewerId}`;
  }

  const sessionRows = await db.execute(sql`
    SELECT s.session_key, s.title, s.username, s.user_id, s.created_at
    FROM acp_replay_sessions s
    ${whereClause}
    ORDER BY s.created_at DESC
  `) as unknown as SessionRow[];

  if (sessionRows.length === 0) return [];

  const sessionKeys = sessionRows.map(r => r.session_key);

  const countRows = sessionKeys.length > 0
    ? await db.execute(sql`
      SELECT session_key, COUNT(*) as count
      FROM acp_replay_events
      WHERE session_key IN (${sql.join(sessionKeys.map(k => sql`${k}`), sql`, `)})
        AND event_type = 'user_message'
      GROUP BY session_key
    `) as unknown as CountRow[]
    : [] as CountRow[];

  const countMap = new Map(countRows.map(r => [r.session_key, Number(r.count)]));

  const lastTsRows = sessionKeys.length > 0
    ? await db.execute(sql`
      SELECT session_key, MAX(timestamp) as max_ts
      FROM acp_replay_events
      WHERE session_key IN (${sql.join(sessionKeys.map(k => sql`${k}`), sql`, `)})
      GROUP BY session_key
    `) as unknown as LastTsRow[]
    : [] as LastTsRow[];

  const lastTsMap = new Map(lastTsRows.map(r => [r.session_key, Number(r.max_ts) || 0]));

  return sessionRows.map(row => ({
    sessionKey: row.session_key,
    title: row.title || '新对话',
    username: row.username || 'unknown',
    userId: row.user_id,
    messageCount: countMap.get(row.session_key) || 0,
    lastMessageAt: lastTsMap.get(row.session_key) || Number(row.created_at),
    createdAt: Number(row.created_at),
  }));
}

export interface DeleteBatchResult {
  deleted: number;
  errors: Array<{ key: string; error: string }>;
}

/**
 * 批量删除会话
 */
export async function deleteBatchSessions(
  sessionKeys: string[],
  viewerId: string,
  viewerRole: string,
  viewerTeam: string
): Promise<DeleteBatchResult> {
  const result: DeleteBatchResult = { deleted: 0, errors: [] };

  const ownerRows = await db.execute(sql`
    SELECT session_key, user_id FROM acp_replay_sessions
    WHERE session_key IN (${sql.join(sessionKeys.map(k => sql`${k}`), sql`, `)})
  `) as unknown as Array<{ session_key: string; user_id: string }>;

  const ownerMap = new Map(ownerRows.map(r => [r.session_key, r.user_id]));

  let teamUserIds: Set<string> = new Set();
  if (viewerTeam) {
    const teamRows = await db.execute(sql`
      SELECT id::text as uid FROM users WHERE team = ${viewerTeam} AND team != ''
    `) as unknown as Array<{ uid: string }>;
    teamUserIds = new Set(teamRows.map(r => r.uid));
  }

  for (const key of sessionKeys) {
    const ownerId = ownerMap.get(key);
    if (!ownerId) {
      result.errors.push({ key, error: 'SESSION_NOT_FOUND' });
      continue;
    }

    const canDelete = viewerRole === 'admin'
      || ownerId === viewerId
      || teamUserIds.has(ownerId);

    if (!canDelete) {
      result.errors.push({ key, error: 'NOT_AUTHORIZED' });
      continue;
    }

    try {
      await clearSessionEvents(key);
      result.deleted++;
    } catch (err) {
      result.errors.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/**
 * 更新会话标题
 */
export async function updateSessionTitle(
  sessionKey: string,
  title: string
): Promise<void> {
  await db.execute(sql`
    UPDATE acp_replay_sessions SET title = ${title} WHERE session_key = ${sessionKey}
  `);
}
