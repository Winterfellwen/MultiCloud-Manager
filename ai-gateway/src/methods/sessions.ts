// sessions RPC 方法（复用 OpenClaw server-methods/sessions.ts）
// sessions.subscribe: 订阅 session 事件
// sessions.messages.subscribe: 订阅消息事件
// sessions.unsubscribe: 取消订阅
// sessions.delete: 删除会话（中止运行中的 run + 清理数据库事件）

import type { ClientConnection } from '../gateway/server-broadcast.js';
import type { ChatAbortControllerEntry } from '../gateway/chat-abort.js';
import { abortChatRun } from '../gateway/chat-abort.js';
import { clearSessionEvents, listSessions, deleteBatchSessions, updateSessionTitle, type SessionListItem } from '../acp/event-ledger.js';

export interface SessionsMethodContext {
  clients: Map<string, ClientConnection>;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
}

export function handleSessionsSubscribe(
  client: ClientConnection,
  params: { sessionKey: string },
  respond: (ok: boolean, payload: unknown) => void
): void {
  client.subscribedSessions.add(params.sessionKey);
  respond(true, { sessionKey: params.sessionKey, subscribed: true });
}

export function handleSessionsUnsubscribe(
  client: ClientConnection,
  params: { sessionKey: string },
  respond: (ok: boolean, payload: unknown) => void
): void {
  client.subscribedSessions.delete(params.sessionKey);
  respond(true, { sessionKey: params.sessionKey, subscribed: false });
}

export function handleSessionsMessagesSubscribe(
  client: ClientConnection,
  params: { sessionKey: string },
  respond: (ok: boolean, payload: unknown) => void
): void {
  // messages.subscribe 等价于 sessions.subscribe（简化实现）
  client.subscribedSessions.add(params.sessionKey);
  respond(true, { sessionKey: params.sessionKey, subscribed: true });
}

/**
 * sessions.list - 列出当前用户可见的会话
 */
export async function handleSessionsList(
  client: ClientConnection,
  params: { filter?: 'mine' | 'team' | 'all' },
  context: SessionsMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const userId = (client as any).userId || '';
    const role = (client as any).role || 'viewer';
    const team = (client as any).team || '';

    const filter = params.filter || 'mine';
    const sessions = await listSessions(userId, role, team, filter);

    respond(true, { sessions });
  } catch (err) {
    respond(false, { error: 'FAILED_TO_LIST_SESSIONS', detail: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * sessions.deleteBatch - 批量删除会话
 */
export async function handleSessionsDeleteBatch(
  client: ClientConnection,
  params: { sessionKeys: string[] },
  context: SessionsMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const userId = (client as any).userId || '';
    const role = (client as any).role || 'viewer';
    const team = (client as any).team || '';

    const { sessionKeys } = params;
    if (!Array.isArray(sessionKeys) || sessionKeys.length === 0) {
      respond(false, { error: 'INVALID_PARAMS', detail: 'sessionKeys must be a non-empty array' });
      return;
    }

    for (const sessionKey of sessionKeys) {
      for (const [runId, entry] of context.chatAbortControllers) {
        if (entry.sessionKey === sessionKey) {
          abortChatRun(context.chatAbortControllers, runId);
        }
      }
    }

    const result = await deleteBatchSessions(sessionKeys, userId, role, team);

    for (const sessionKey of sessionKeys) {
      for (const client of context.clients.values()) {
        client.subscribedSessions.delete(sessionKey);
      }
    }

    respond(true, result);
  } catch (err) {
    respond(false, { error: 'FAILED_TO_DELETE_BATCH', detail: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * sessions.updateTitle - 更新会话标题
 */
export async function handleSessionsUpdateTitle(
  client: ClientConnection,
  params: { sessionKey: string; title: string },
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    await updateSessionTitle(params.sessionKey, params.title);
    respond(true, { sessionKey: params.sessionKey, title: params.title });
  } catch (err) {
    respond(false, { error: 'FAILED_TO_UPDATE_TITLE', detail: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * sessions.delete - 删除会话
 * 1. 中止该 session 中正在运行的所有 run
 * 2. 清理数据库中的事件记录
 */
export async function handleSessionsDelete(
  _client: ClientConnection,
  params: { sessionKey: string },
  context: SessionsMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  const { sessionKey } = params;

  // 1. 中止该 session 中正在运行的所有 run
  const abortedRunIds: string[] = [];
  for (const [runId, entry] of context.chatAbortControllers) {
    if (entry.sessionKey === sessionKey) {
      abortChatRun(context.chatAbortControllers, runId);
      abortedRunIds.push(runId);
    }
  }

  // 2. 清理数据库事件
  try {
    await clearSessionEvents(sessionKey);
  } catch (err) {
    respond(false, { error: 'FAILED_TO_CLEAR_EVENTS', detail: err instanceof Error ? err.message : String(err) });
    return;
  }

  // 3. 取消所有客户端对该 session 的订阅
  for (const client of context.clients.values()) {
    client.subscribedSessions.delete(sessionKey);
  }

  respond(true, { sessionKey, abortedRunIds });
}
