// chat RPC 方法（复用 OpenClaw server-methods/chat.ts，魔改对接 CloudOps）
// chat.send: fire-and-forget 启动 AI 生成，立即返回 runId
// chat.history: 返回历史消息 + in-flight run 快照
// chat.abort: 中止指定 run

import type { ClientConnection } from '../gateway/server-broadcast.js';
import type { ChatRunState } from '../gateway/server-chat-state.js';
import {
  registerChatAbortController,
  abortChatRun,
  completeChatRun,
  resolveInFlightRunSnapshot,
  type ChatAbortControllerEntry,
} from '../gateway/chat-abort.js';
import { appendToBuffer, cleanupRun } from '../gateway/server-chat-state.js';
import { broadcastEvent } from '../gateway/server-broadcast.js';
import { sessionManager } from '../acp/control-plane/manager.js';
import { recordEvent, readReplay } from '../acp/event-ledger.js';
import { runAgentTurn } from '../agent/runner.js';

export interface ChatMethodContext {
  clients: Map<string, ClientConnection>;
  chatRunState: ChatRunState;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
}

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  clientRunId?: string;
}

export interface ChatHistoryParams {
  sessionKey: string;
  fromSeq?: number;
}

/**
 * chat.send - 发送消息，启动 AI 生成
 */
export async function handleChatSend(
  client: ClientConnection,
  params: ChatSendParams,
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  const runId = params.clientRunId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionKey = params.sessionKey;

  // 幂等性检查
  const existing = context.chatAbortControllers.get(runId);
  if (existing) {
    respond(true, { runId, status: 'in_flight' });
    return;
  }

  // 注册 AbortController
  const controller = registerChatAbortController({
    controllers: context.chatAbortControllers,
    runId,
    sessionKey,
    ownerConnId: client.connId,
  });

  // 立即返回 ack（fire-and-forget）
  respond(true, { runId, status: 'started' });

  // 订阅该 session
  client.subscribedSessions.add(sessionKey);

  // 记录用户消息到 ACP ledger
  recordEvent(sessionKey, 'user_message', { runId, message: params.message });

  // fire-and-forget 启动 AI 生成（与连接解耦）
  sessionManager.runSessionTurn({
    sessionKey,
    runId,
    op: async () => {
      try {
        await runAgentTurn(
          {
            sessionKey,
            runId,
            userMessage: params.message,
            signal: controller.signal,
          },
          {
            onDelta: (delta) => {
              // 缓冲到内存
              appendToBuffer(context.chatRunState, runId, delta);
              // 记录到 ACP ledger
              recordEvent(sessionKey, 'assistant_delta', { runId, delta });
              // 广播 chat 事件
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'text_delta', delta },
              });
            },
            onToolCall: (toolCall) => {
              recordEvent(sessionKey, 'tool_call', { runId, toolCall });
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'tool_call', toolCall },
              });
            },
            onToolResult: (result) => {
              recordEvent(sessionKey, 'tool_result', { runId, result });
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'tool_result', result },
              });
            },
            onComplete: (finalText) => {
              recordEvent(sessionKey, 'assistant_complete', { runId, finalText });
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'done', finalText },
              });
            },
          }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        recordEvent(sessionKey, 'error', { runId, error: errorMsg });
        broadcastEvent(context.clients, {
          event: 'chat',
          targetSessionKey: sessionKey,
          payload: { runId, type: 'error', error: errorMsg },
        });
      } finally {
        completeChatRun(context.chatAbortControllers, runId);
        // 延迟清理缓冲（供短暂断线重连恢复）
        setTimeout(() => cleanupRun(context.chatRunState, runId), 30000);
      }
    },
  }).catch(() => {
    // 并发限制错误已在 runAgentTurn 中处理
  });
}

/**
 * chat.history - 获取历史消息 + in-flight run 快照
 */
export function handleChatHistory(
  client: ClientConnection,
  params: ChatHistoryParams,
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): void {
  const sessionKey = params.sessionKey;
  const fromSeq = params.fromSeq || 0;

  // 订阅该 session
  client.subscribedSessions.add(sessionKey);

  // 获取 ACP 事件重放
  const events = readReplay(sessionKey, fromSeq);

  // 获取 in-flight run 快照（核心健壮性机制）
  const inFlightRun = resolveInFlightRunSnapshot({
    controllers: context.chatAbortControllers,
    chatRunState: context.chatRunState,
    requestedSessionKey: sessionKey,
  });

  respond(true, {
    sessionKey,
    events,
    inFlightRun: inFlightRun ? {
      runId: inFlightRun.runId,
      bufferedText: inFlightRun.bufferedText,
      isRunning: inFlightRun.isRunning,
      startedAt: inFlightRun.startedAt,
    } : null,
  });
}

/**
 * chat.abort - 中止指定 run
 */
export function handleChatAbort(
  client: ClientConnection,
  params: { runId: string },
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): void {
  const entry = context.chatAbortControllers.get(params.runId);
  if (!entry) {
    respond(false, { error: 'RUN_NOT_FOUND' });
    return;
  }

  // 授权检查
  if (entry.ownerConnId && entry.ownerConnId !== client.connId) {
    respond(false, { error: 'NOT_AUTHORIZED' });
    return;
  }

  abortChatRun(context.chatAbortControllers, params.runId);
  respond(true, { runId: params.runId, status: 'aborted' });
}
