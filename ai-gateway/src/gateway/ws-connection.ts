// WebSocket 连接管理（复用 OpenClaw ws-connection.ts，魔改：断连不 abort）
// 关键：close 处理器只取消订阅事件，不 abort 任何 AI 任务

import type { WebSocket } from 'ws';
import type { ClientConnection } from './server-broadcast.js';
import { verifyToken, parseTokenFromRequest } from '../auth.js';

export interface ConnectionContext {
  clients: Map<string, ClientConnection>;
  chatAbortControllers: Map<string, import('./chat-abort.js').ChatAbortControllerEntry>;
}

/**
 * 处理新的 WebSocket 连接
 */
export function handleConnection(
  socket: WebSocket,
  request: {
    query: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
  },
  context: ConnectionContext
): ClientConnection | null {
  // JWT 认证
  const token = parseTokenFromRequest(request.query, request.headers);
  if (!token) {
    socket.send(JSON.stringify({ type: 'error', error: 'AUTH_TOKEN_MISSING' }));
    socket.close(4001, 'Authentication required');
    return null;
  }

  const user = verifyToken(token);
  if (!user) {
    socket.send(JSON.stringify({ type: 'error', error: 'AUTH_TOKEN_INVALID' }));
    socket.close(4001, 'Invalid token');
    return null;
  }

  const connId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client: ClientConnection = {
    connId,
    socket,
    userId: user.userId,
    username: user.username,
    role: user.role,
    team: user.team,
    seq: 0,
    subscribedSessions: new Set(),
  };

  context.clients.set(connId, client);

  // 发送 hello-ok
  socket.send(JSON.stringify({
    type: 'event',
    event: 'hello-ok',
    payload: { connId, userId: user.userId },
  }));

  // close 处理器（魔改：不 abort 任何 AI 任务）
  socket.once('close', () => {
    context.clients.delete(connId);
    // 仅清理订阅，不 abort 任何正在运行的 AI 任务
    client.subscribedSessions.clear();
  });

  return client;
}
