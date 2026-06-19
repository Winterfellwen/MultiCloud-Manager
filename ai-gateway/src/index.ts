// ai-gateway 服务入口

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initEventLedger } from './acp/event-ledger.js';
import { createChatRunState } from './gateway/server-chat-state.js';
import type { ChatAbortControllerEntry } from './gateway/chat-abort.js';
import type { ClientConnection } from './gateway/server-broadcast.js';
import { handleConnection } from './gateway/ws-connection.js';
import {
  handleChatSend,
  handleChatHistory,
  handleChatAbort,
  type ChatMethodContext,
} from './methods/chat.js';
import {
  handleSessionsSubscribe,
  handleSessionsUnsubscribe,
  handleSessionsMessagesSubscribe,
} from './methods/sessions.js';
import { handleModelsList } from './methods/models.js';
import { handleToolsCatalog } from './methods/tools-catalog.js';
import { handleCommandsList } from './methods/commands.js';
import {
  handleExecApprovalList,
  handleExecApprovalResolve,
  type ExecApprovalContext,
} from './methods/exec-approval.js';

// 全局状态
const clients = new Map<string, ClientConnection>();
const chatRunState = createChatRunState();
const chatAbortControllers = new Map<string, ChatAbortControllerEntry>();

const chatContext: ChatMethodContext = { clients, chatRunState, chatAbortControllers };
// 审批上下文（复用 clients Map）
const execApprovalContext: ExecApprovalContext = { clients };

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });
await app.register(websocket);

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-gateway',
  timestamp: new Date().toISOString(),
  activeSessions: clients.size,
}));

// WebSocket 端点
app.get('/ws', { websocket: true }, (socket, request) => {
  const client = handleConnection(
    socket,
    { query: request.query as Record<string, unknown>, headers: request.headers },
    { clients, chatAbortControllers }
  );

  if (!client) return;

  socket.on('message', async (data: Buffer) => {
    try {
      const frame = JSON.parse(data.toString());

      // 只处理请求帧
      if (frame.type !== 'req') return;

      const { id, method, params } = frame;
      const respond = (ok: boolean, payload: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'res', id, ok, payload }));
        }
      };

      switch (method) {
        case 'chat.send':
          await handleChatSend(client, params, chatContext, respond);
          break;
        case 'chat.history':
          handleChatHistory(client, params, chatContext, respond);
          break;
        case 'chat.abort':
          handleChatAbort(client, params, chatContext, respond);
          break;
        case 'sessions.subscribe':
          handleSessionsSubscribe(client, params, respond);
          break;
        case 'sessions.unsubscribe':
          handleSessionsUnsubscribe(client, params, respond);
          break;
        case 'sessions.messages.subscribe':
          handleSessionsMessagesSubscribe(client, params, respond);
          break;
        case 'models.list':
          handleModelsList(respond);
          break;
        case 'tools.catalog':
          handleToolsCatalog(respond);
          break;
        case 'commands.list':
          handleCommandsList(respond);
          break;
        case 'exec.approval.list':
          handleExecApprovalList(client, params, execApprovalContext, respond);
          break;
        case 'exec.approval.resolve':
          handleExecApprovalResolve(client, params, execApprovalContext, respond);
          break;
        default:
          respond(false, { error: `Unknown method: ${method}` });
      }
    } catch (error) {
      app.log.error(error);
    }
  });
});

// 初始化 ACP 事件账本
initEventLedger();

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down ai-gateway...');
  app.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`AI Gateway service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
