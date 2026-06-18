// seq 序号广播（复用 OpenClaw server-broadcast.ts）
// 每个客户端维护递增 seq，客户端检测 gap 触发重连

import type { WebSocket } from 'ws';

export interface ClientConnection {
  connId: string;
  socket: WebSocket;
  userId: string;
  /** 该客户端的 seq 计数器 */
  seq: number;
  /** 订阅的 sessionKey 集合 */
  subscribedSessions: Set<string>;
}

export interface BroadcastEvent {
  event: string;
  payload: unknown;
  /** 目标 sessionKey（undefined 表示广播给所有） */
  targetSessionKey?: string;
  /** 目标 userId（undefined 表示广播给所有） */
  targetUserId?: string;
}

/**
 * 向客户端发送事件帧
 */
export function sendEventToClient(
  client: ClientConnection,
  event: string,
  payload: unknown,
  isTargeted: boolean = false
): void {
  if (client.socket.readyState !== client.socket.OPEN) return;

  const nextSeq = client.seq + 1;
  client.seq = nextSeq;

  const eventSeq = isTargeted ? undefined : nextSeq;
  const seqFragment = eventSeq === undefined ? '' : `,"seq":${eventSeq}`;

  const frame = `{"type":"event","event":"${event}"${seqFragment},"payload":${JSON.stringify(payload)}}`;
  client.socket.send(frame);
}

/**
 * 广播事件给符合条件的客户端
 */
export function broadcastEvent(
  clients: Map<string, ClientConnection>,
  broadcast: BroadcastEvent
): void {
  for (const client of clients.values()) {
    // userId 过滤
    if (broadcast.targetUserId && client.userId !== broadcast.targetUserId) continue;

    // sessionKey 过滤
    if (broadcast.targetSessionKey) {
      if (!client.subscribedSessions.has(broadcast.targetSessionKey)) continue;
    }

    sendEventToClient(
      client,
      broadcast.event,
      broadcast.payload,
      Boolean(broadcast.targetUserId)
    );
  }
}
