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
import { appendToBuffer, appendReasoningToBuffer, cleanupRun } from '../gateway/server-chat-state.js';
import { broadcastEvent } from '../gateway/server-broadcast.js';
import { sessionManager } from '../acp/control-plane/manager.js';
import { recordEvent, readReplay } from '../acp/event-ledger.js';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { runAgentTurn, type Attachment } from '../agent/runner.js';
import { recordAudit } from '@cloudops/shared';
import { config } from '../config.js';

async function getSessionOwner(sessionKey: string): Promise<{ userId: string; username: string } | null> {
  const rows = await db.execute(sql`
    SELECT user_id, username FROM acp_replay_sessions WHERE session_key = ${sessionKey}
  `) as unknown as Array<{ user_id: string; username: string }>;
  if (rows.length === 0) return null;
  return { userId: rows[0].user_id, username: rows[0].username };
}

// 按 sessionKey 串行化 recordEvent，确保事件按调用顺序写入 ledger
// （fire-and-forget 并发写入会导致 seq 分配顺序与调用顺序不一致，刷新后 blocks 排序错乱）
const recordEventQueue = new Map<string, Promise<unknown>>();

function queuedRecordEvent(sessionKey: string, eventType: string, payload: unknown): void {
  const prev = recordEventQueue.get(sessionKey) || Promise.resolve();
  // 确保前一个 promise 的错误不会阻断后续事件
  const safePrev = prev.catch(() => {});
  const next = safePrev.then(() => recordEvent(sessionKey, eventType, payload));
  recordEventQueue.set(sessionKey, next);
}

export interface ChatMethodContext {
  clients: Map<string, ClientConnection>;
  chatRunState: ChatRunState;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
}

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  clientRunId?: string;
  /** 模型覆盖（支持 "provider/model" 格式） */
  model?: string;
  /** 附件列表（图片附件会以多模态格式发送给 LLM） */
  attachments?: Array<{
    type: string;
    mimeType: string;
    fileName?: string;
    content: string;
  }>;
  /** 温度覆盖 */
  temperature?: number;
  /** 最大 token 覆盖 */
  maxTokens?: number;
  /** 是否启用深度思考（reasoning）模式，默认 true */
  enableThinking?: boolean;
  /** 推理努力程度：low / medium / high */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** 当前模式：plan/action/confirm */
  mode?: 'plan' | 'action' | 'confirm';
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

  // 权限检查：验证用户是否有权继续该会话
  // Owner: 可以继续自己的会话
  // Team member: 只能继续自己的会话（不能继续其他团队成员的）
  // Admin: 只能继续自己的会话（不能继续其他管理员或团队成员的）
  const sessionOwner = await getSessionOwner(sessionKey);
  if (!sessionOwner) {
    // 会话不存在，允许创建新会话（首次发送消息）
    // 新会话首次创建 —— 审计记录
    await recordAudit(config.authServiceUrl, {
      userId: client.userId,
      action: 'ai.session.create',
      resourceType: 'ai_session',
      resourceId: sessionKey,
      result: 'success',
    });
  } else if (sessionOwner.userId !== client.userId) {
    respond(false, { error: 'NOT_AUTHORIZED', message: '无权继续他人的会话' });
    return;
  }

  // 幂等性检查：相同 clientRunId 返回 in_flight（不重复执行）
  const existing = context.chatAbortControllers.get(runId);
  if (existing) {
    respond(true, { runId, status: 'in_flight' });
    return;
  }

  // 并发限制：同一 sessionKey 已有 in-flight run 时拒绝
  for (const [, entry] of context.chatAbortControllers) {
    if (entry.sessionKey === sessionKey) {
      respond(false, { error: 'SESSION_BUSY', message: '该会话已有正在进行的生成，请等待完成或中止后再发送' });
      return;
    }
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
  await recordEvent(sessionKey, 'user_message', { runId, message: params.message }, {
    userId: client.userId,
    username: client.username,
  });

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
            model: params.model,
            attachments: params.attachments as Attachment[] | undefined,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            enableThinking: params.enableThinking,
            reasoningEffort: params.reasoningEffort,
            mode: params.mode,
            // 审批上下文：用于 dangerous 工具调用前的审批流程
            approvalContext: { clients: context.clients },
          },
          {
            onDelta: (delta) => {
              // 缓冲到内存
              appendToBuffer(context.chatRunState, runId, delta);
              // 记录到 ACP ledger（fire-and-forget，不阻塞流式）
              queuedRecordEvent(sessionKey, 'assistant_delta', { runId, delta });
              // 广播 chat 事件
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'text_delta', delta },
              });
            },
            onReasoning: (delta) => {
              // 推理过程缓冲到独立的 reasoning 缓冲
              appendReasoningToBuffer(context.chatRunState, runId, delta);
              // 记录到 ACP ledger
              queuedRecordEvent(sessionKey, 'assistant_reasoning', { runId, delta });
              // 广播 reasoning_delta 事件（与 text_delta 分开）
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'reasoning_delta', delta },
              });
            },
            onToolCall: (toolCall) => {
              queuedRecordEvent(sessionKey, 'tool_call', { runId, toolCall });
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'tool_call', toolCall },
              });

              // 审计：AI 发起工具调用
              recordAudit(config.authServiceUrl, {
                userId: client.userId,
                action: 'ai.tool_call',
                resourceType: 'ai_tool',
                resourceId: toolCall.name,
                result: 'success',
                params: { sessionKey, tool: toolCall.name },
              });
            },
            onToolResult: (result) => {
              queuedRecordEvent(sessionKey, 'tool_result', { runId, toolCallId: result.toolCallId, result });
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'tool_result', toolCallId: result.toolCallId, result },
              });
            },
            onComplete: (finalText, truncated) => {
              queuedRecordEvent(sessionKey, 'assistant_complete', { runId, finalText, truncated });
              broadcastEvent(context.clients, {
                event: 'chat',
                targetSessionKey: sessionKey,
                payload: { runId, type: 'done', finalText, truncated },
              });
            },
          }
        );
      } catch (error) {
        // 区分 abort 和其他错误
        const isAborted = error instanceof Error && (
          error.message === 'Run aborted' ||
          error.name === 'AbortError' ||
          error.message.toLowerCase().includes('aborted')
        );

        if (isAborted) {
          // 中止：广播 aborted 事件（前端将消息标记为 aborted 而非 error）
          queuedRecordEvent(sessionKey, 'assistant_complete', { runId, finalText: '', aborted: true });
          broadcastEvent(context.clients, {
            event: 'chat',
            targetSessionKey: sessionKey,
            payload: { runId, type: 'aborted' },
          });
        } else {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          queuedRecordEvent(sessionKey, 'error', { runId, error: errorMsg });
          broadcastEvent(context.clients, {
            event: 'chat',
            targetSessionKey: sessionKey,
            payload: { runId, type: 'error', error: errorMsg },
          });
        }
      } finally {
        completeChatRun(context.chatAbortControllers, runId);
        // 清理 recordEventQueue 防止内存泄漏
        recordEventQueue.delete(sessionKey);
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
export async function handleChatHistory(
  client: ClientConnection,
  params: ChatHistoryParams,
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  const sessionKey = params.sessionKey;
  const fromSeq = params.fromSeq || 0;

  // 订阅该 session
  client.subscribedSessions.add(sessionKey);

  // 获取 ACP 事件重放
  const events = await readReplay(sessionKey, fromSeq);

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
      bufferedReasoning: inFlightRun.bufferedReasoning,
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
    // run 可能已完成（completeChatRun 会从 map 中删除条目）
    // 返回成功但标记为 already_completed，避免客户端报错
    respond(true, { runId: params.runId, status: 'already_completed' });
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
