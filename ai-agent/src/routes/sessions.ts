// 会话 CRUD 路由

import type { FastifyInstance } from 'fastify';
import { sessionManager } from '../agent/session.js';

export async function sessionRoutes(app: FastifyInstance) {
  // 列出当前用户的会话
  app.get('/', async (request) => {
    const userId = (request as any).user.userId as string;
    return sessionManager.listSessions(userId);
  });

  // 创建新会话
  app.post('/', async (request, reply) => {
    const userId = (request as any).user.userId as string;
    const body = request.body as { title?: string };
    const sessionId = await sessionManager.createSession(userId, body?.title);
    return reply.status(201).send({ id: sessionId });
  });

  // 获取会话历史消息
  app.get('/:id/messages', async (request) => {
    const { id } = request.params as { id: string };
    return sessionManager.loadMessages(id);
  });

  // 更新会话标题
  app.patch('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { title: string };
    await sessionManager.updateSessionTitle(id, body.title);
    return { ok: true, id };
  });

  // 删除会话
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string };
    await sessionManager.deleteSession(id);
    return { ok: true, id };
  });
}
