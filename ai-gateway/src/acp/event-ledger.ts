// ACP 事件账本（复用 OpenClaw event-ledger.ts，SQLite 持久化）
// 记录每个 session update 事件，支持断线重连后重放

import Database from 'better-sqlite3';
import { config } from '../config.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface AcpEvent {
  seq: number;
  sessionKey: string;
  eventType: string;
  payload: unknown;
  timestamp: number;
}

let db: Database.Database | null = null;

/**
 * 初始化 SQLite 数据库
 */
export function initEventLedger(): void {
  mkdirSync(dirname(config.sqlitePath), { recursive: true });
  db = new Database(config.sqlitePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS acp_replay_sessions (
      session_key TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS acp_replay_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_key) REFERENCES acp_replay_sessions(session_key)
    );

    CREATE INDEX IF NOT EXISTS idx_acp_events_session_seq
      ON acp_replay_events(session_key, seq);
  `);
}

/**
 * 记录事件
 */
export function recordEvent(
  sessionKey: string,
  eventType: string,
  payload: unknown
): number {
  if (!db) throw new Error('Event ledger not initialized');

  const now = Date.now();
  const session = db.prepare(
    'SELECT last_seq FROM acp_replay_sessions WHERE session_key = ?'
  ).get(sessionKey) as { last_seq: number } | undefined;

  let seq: number;
  if (session) {
    seq = session.last_seq + 1;
    db.prepare(
      'UPDATE acp_replay_sessions SET last_seq = ? WHERE session_key = ?'
    ).run(seq, sessionKey);
  } else {
    seq = 1;
    db.prepare(
      'INSERT INTO acp_replay_sessions (session_key, created_at, last_seq) VALUES (?, ?, ?)'
    ).run(sessionKey, now, seq);
  }

  db.prepare(
    'INSERT INTO acp_replay_events (session_key, seq, event_type, payload, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionKey, seq, eventType, JSON.stringify(payload), now);

  return seq;
}

/**
 * 读取 session 的事件重放
 */
export function readReplay(sessionKey: string, fromSeq: number = 0): AcpEvent[] {
  if (!db) throw new Error('Event ledger not initialized');

  const rows = db.prepare(
    'SELECT seq, session_key, event_type, payload, timestamp FROM acp_replay_events WHERE session_key = ? AND seq > ? ORDER BY seq'
  ).all(sessionKey, fromSeq) as Array<{
    seq: number;
    session_key: string;
    event_type: string;
    payload: string;
    timestamp: number;
  }>;

  return rows.map(row => ({
    seq: row.seq,
    sessionKey: row.session_key,
    eventType: row.event_type,
    payload: JSON.parse(row.payload),
    timestamp: row.timestamp,
  }));
}

/**
 * 清理 session 的事件（生成完成后调用）
 */
export function clearSessionEvents(sessionKey: string): void {
  if (!db) return;
  db.prepare('DELETE FROM acp_replay_events WHERE session_key = ?').run(sessionKey);
  db.prepare('DELETE FROM acp_replay_sessions WHERE session_key = ?').run(sessionKey);
}
