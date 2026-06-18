// WebSocket 流式对话路由

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { runAgent, type AgentRunEvent } from '../agent/runner.js';
import { sessionManager } from '../agent/session.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cloudops-dev-secret';

export async function wsRoutes(app: FastifyInstance) {
  app.get('/', { websocket: true }, (socket: WebSocket, request) => {
    // WebSocket 升级请求不经过 preHandler，需手动解析 token
    // 支持两种方式：query 参数 ?token=xxx 或 Authorization header
    const queryToken = (request.query as { token?: string }).token;
    const headerToken = (request.headers.authorization || '').replace('Bearer ', '');
    const token = queryToken || headerToken;

    let userId: string | undefined;
    let authToken = '';
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string; username: string; role: string };
        userId = payload.sub;
        authToken = token;
      } catch {
        // token 无效
      }
    }

    if (!userId) {
      socket.send(JSON.stringify({ type: 'error', error: '未认证' }));
      socket.close();
      return;
    }

    socket.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'chat') return;

        let sessionId = msg.sessionId;
        if (!sessionId) {
          sessionId = await sessionManager.createSession(userId, msg.message?.slice(0, 30) || '新对话');
          socket.send(JSON.stringify({ type: 'session_created', sessionId }));
        }

        await runAgent({
          sessionId,
          userId,
          userInput: msg.message,
          authToken,
          onEvent: (event: AgentRunEvent) => {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify(event));
            }
          },
        });
      } catch (err) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'error', error: (err as Error).message }));
        }
      }
    });
  });
}
