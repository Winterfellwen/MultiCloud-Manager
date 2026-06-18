// sessions RPC 方法（复用 OpenClaw server-methods/sessions.ts）
// sessions.subscribe: 订阅 session 事件
// sessions.messages.subscribe: 订阅消息事件
// sessions.unsubscribe: 取消订阅

import type { ClientConnection } from '../gateway/server-broadcast.js';

export interface SessionsMethodContext {
  clients: Map<string, ClientConnection>;
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
