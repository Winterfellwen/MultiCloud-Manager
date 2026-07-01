// ai-gateway 服务入口

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { initEventLedger } from './acp/event-ledger.js';
import { initProviderStore, seedFromEnv } from './acp/provider-store.js';
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
  handleSessionsDelete,
  handleSessionsList,
  handleSessionsDeleteBatch,
  handleSessionsUpdateTitle,
  type SessionsMethodContext,
} from './methods/sessions.js';
import { handleModelsList, handleModelsDelete, handleModelsTest } from './methods/models.js';
import { handleToolsCatalog } from './methods/tools-catalog.js';
import { handleCommandsList } from './methods/commands.js';
import {
  handleProvidersList,
  handleProvidersCreate,
  handleProvidersUpdate,
  handleProvidersDelete,
  handleProvidersTest,
  handleProvidersThinkingFormats,
  handleProvidersDiscoverModels,
} from './methods/providers.js';
import {
  handleExecApprovalList,
  handleExecApprovalResolve,
  type ExecApprovalContext,
} from './methods/exec-approval.js';
import { analyzeAlert } from './internal/analyze-alert.js';
import { generateDashboardInsight } from './internal/dashboard-insight.js';
import { analyzeRemediation } from './internal/analyze-remediation.js';
import { generateEmbedding } from './internal/embedding.js';
import { scopeFromDemoFlag, type RequestScope } from '@cloudops/shared';

declare module 'fastify' {
  interface FastifyRequest {
    scope: RequestScope;
  }
}

// 全局状态
const clients = new Map<string, ClientConnection>();
const chatRunState = createChatRunState();
const chatAbortControllers = new Map<string, ChatAbortControllerEntry>();

const chatContext: ChatMethodContext = { clients, chatRunState, chatAbortControllers };
// 审批上下文（复用 clients Map）
const execApprovalContext: ExecApprovalContext = { clients, chatAbortControllers };
// sessions 上下文（需要 chatAbortControllers 用于删除会话时中止 run）
const sessionsContext: SessionsMethodContext = { clients, chatAbortControllers };

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });
await app.register(websocket);

// scope 注入（demo/生产数据隔离）：内部端点接收 monitor-service 调用时透传的 scope header
app.addHook('onRequest', async (request) => {
  const isDemo = request.headers['x-demo-mode'] === 'true';
  const userId = (request.headers['x-scope-user-id'] as string) || '';
  request.scope = scopeFromDemoFlag(isDemo, userId);
});

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-gateway',
  timestamp: new Date().toISOString(),
  activeSessions: clients.size,
}));

// 内部端点（仅供 monitor-service 调用，不经过 api-gateway 代理）
app.post('/internal/analyze-alert', async (request, reply) => {
  try {
    const body = request.body as any;
    const result = await analyzeAlert({ ...body, scope: body.scope || request.scope.schema });
    return reply.send(result);
  } catch (err) {
    app.log.error({ err }, 'analyze-alert failed');
    return reply.status(500).send({ error: 'ANALYSIS_FAILED', message: (err as Error).message });
  }
});

app.post('/internal/insight', async (request, reply) => {
  try {
    const body = request.body as any;
    const result = await generateDashboardInsight({ ...body, scope: body.scope || request.scope.schema });
    return reply.send(result);
  } catch (err) {
    app.log.error({ err }, 'dashboard insight failed');
    return reply.status(500).send({ error: 'INSIGHT_FAILED', message: (err as Error).message });
  }
});

app.post('/internal/analyze-remediation', async (request, reply) => {
  try {
    const body = request.body as any;
    const result = await analyzeRemediation({ ...body, scope: body.scope || request.scope.schema });
    return reply.send(result);
  } catch (err) {
    app.log.error({ err }, 'analyze-remediation failed');
    return reply.status(500).send({ error: 'ANALYZE_REMEDIATION_FAILED', message: (err as Error).message });
  }
});

app.post('/internal/embedding', async (request, reply) => {
  try {
    const { text } = request.body as { text: string };
    const embedding = await generateEmbedding(text);
    return reply.send({ embedding });
  } catch (err) {
    app.log.error({ err }, 'embedding failed');
    return reply.status(500).send({ error: 'EMBEDDING_FAILED', message: (err as Error).message });
  }
});

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
          await handleChatHistory(client, params, chatContext, respond);
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
        case 'sessions.delete':
          await handleSessionsDelete(client, params, sessionsContext, respond);
          break;
        case 'sessions.list':
          await handleSessionsList(client, params, sessionsContext, respond);
          break;
        case 'sessions.deleteBatch':
          await handleSessionsDeleteBatch(client, params, sessionsContext, respond);
          break;
        case 'sessions.updateTitle':
          await handleSessionsUpdateTitle(client, params, respond);
          break;
        case 'models.list':
          await handleModelsList(respond);
          break;
        case 'models.delete':
          await handleModelsDelete(params, respond);
          break;
        case 'models.test':
          await handleModelsTest(params, respond);
          break;
        case 'providers.list':
          await handleProvidersList(respond);
          break;
        case 'providers.create':
          await handleProvidersCreate(params, respond);
          break;
        case 'providers.update':
          await handleProvidersUpdate(params, respond);
          break;
        case 'providers.delete':
          await handleProvidersDelete(params, respond);
          break;
        case 'providers.test':
          await handleProvidersTest(params, respond);
          break;
        case 'providers.thinkingFormats':
          await handleProvidersThinkingFormats(respond);
          break;
        case 'providers.discoverModels':
          await handleProvidersDiscoverModels(params, respond);
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

// 初始化数据库（运行 migrations + seed 初始 provider）
try {
  await runMigrations();
  console.log('✅ AI Gateway database migrations completed');
} catch (err) {
  console.error('⚠️  AI Gateway migration failed:', (err as Error).message);
}
try { await initEventLedger(); } catch (err) { console.error('initEventLedger failed:', (err as Error).message); }
try { await initProviderStore(); } catch (err) { console.error('initProviderStore failed:', (err as Error).message); }
try { await seedFromEnv(); } catch (err) { console.error('seedFromEnv failed:', (err as Error).message); }

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
