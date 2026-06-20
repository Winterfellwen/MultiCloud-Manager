// AbortController 管理 + in-flight run 快照（复用 OpenClaw chat-abort.ts）
// 关键：AbortController 存在共享 Map 中，与 WebSocket 连接解耦
// WebSocket 断开不 abort 任何任务

import type { ChatRunState } from './server-chat-state.js';
import { getBuffer, getReasoningBuffer } from './server-chat-state.js';

export interface ChatAbortControllerEntry {
  runId: string;
  sessionKey: string;
  controller: AbortController;
  /** 拥有者连接 ID（仅用于授权检查，不用于断连 abort） */
  ownerConnId?: string;
  /** 创建时间 */
  createdAt: number;
}

export interface InFlightRunSnapshot {
  runId: string;
  sessionKey: string;
  /** 已缓冲的文本 */
  bufferedText: string;
  /** 已缓冲的推理过程文本 */
  bufferedReasoning: string;
  /** 是否仍在运行 */
  isRunning: boolean;
  /** 开始时间 */
  startedAt: number;
}

/**
 * 注册 AbortController
 */
export function registerChatAbortController(params: {
  controllers: Map<string, ChatAbortControllerEntry>;
  runId: string;
  sessionKey: string;
  ownerConnId?: string;
}): AbortController {
  const controller = new AbortController();
  params.controllers.set(params.runId, {
    runId: params.runId,
    sessionKey: params.sessionKey,
    controller,
    ownerConnId: params.ownerConnId,
    createdAt: Date.now(),
  });
  return controller;
}

/**
 * 中止指定 run
 */
export function abortChatRun(
  controllers: Map<string, ChatAbortControllerEntry>,
  runId: string
): boolean {
  const entry = controllers.get(runId);
  if (!entry) return false;
  entry.controller.abort();
  controllers.delete(runId);
  return true;
}

/**
 * 清理已完成的 run
 */
export function completeChatRun(
  controllers: Map<string, ChatAbortControllerEntry>,
  runId: string
): void {
  controllers.delete(runId);
}

/**
 * 解析正在运行的 run 快照（核心健壮性机制）
 * 用于 chat.history 恢复客户端切换走后继续 streaming 的 run
 */
export function resolveInFlightRunSnapshot(params: {
  controllers: Map<string, ChatAbortControllerEntry>;
  chatRunState: ChatRunState;
  requestedSessionKey: string;
}): InFlightRunSnapshot | null {
  const { controllers, chatRunState, requestedSessionKey } = params;

  for (const [runId, entry] of controllers) {
    if (entry.sessionKey !== requestedSessionKey) continue;

    const bufferedText = getBuffer(chatRunState, runId);
    const bufferedReasoning = getReasoningBuffer(chatRunState, runId);
    return {
      runId,
      sessionKey: entry.sessionKey,
      bufferedText,
      bufferedReasoning,
      isRunning: true,
      startedAt: entry.createdAt,
    };
  }
  return null;
}
