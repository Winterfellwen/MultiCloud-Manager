// 非流式对话路由（HTTP POST，等待完整结果返回）

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runAgent } from '../agent/runner.js';
import { sessionManager } from '../agent/session.js';

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1),
});

export async function chatRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const input = chatSchema.parse(request.body);
    const userId = (request as any).user.userId as string;
    const authToken = (request.headers.authorization || '').replace('Bearer ', '');

    // 如果没有 sessionId，创建新会话
    let sessionId = input.sessionId;
    if (!sessionId) {
      sessionId = await sessionManager.createSession(userId, input.message.slice(0, 30));
    }

    const result = await runAgent({
      sessionId,
      userId,
      userInput: input.message,
      authToken,
    });

    return reply.send({
      sessionId,
      response: result.finalText,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
    });
  });
}
