// ChatRunState - 实时缓冲流式 chunks（复用 OpenClaw server-chat-state.ts）
// 每个 run 的流式内容缓冲在内存中，供 chat.history 恢复 in-flight run

export interface ChatRunState {
  /** runId → 原始缓冲文本 */
  rawBuffers: Map<string, string>;
  /** runId → 处理后缓冲文本 */
  buffers: Map<string, string>;
  /** runId → 推理过程缓冲文本（与正文分开） */
  reasoningBuffers: Map<string, string>;
  /** runId → 最后更新时间 */
  bufferUpdatedAt: Map<string, number>;
  /** runId → 最后 delta 发送时间 */
  deltaSentAt: Map<string, number>;
  /** runId → 最后广播长度 */
  deltaLastBroadcastLen: Map<string, number>;
  /** runId → 最后广播文本 */
  deltaLastBroadcastText: Map<string, string>;
}

export function createChatRunState(): ChatRunState {
  return {
    rawBuffers: new Map(),
    buffers: new Map(),
    reasoningBuffers: new Map(),
    bufferUpdatedAt: new Map(),
    deltaSentAt: new Map(),
    deltaLastBroadcastLen: new Map(),
    deltaLastBroadcastText: new Map(),
  };
}

/**
 * 追加文本到 run 缓冲
 */
export function appendToBuffer(
  state: ChatRunState,
  runId: string,
  text: string
): string {
  const current = state.buffers.get(runId) || '';
  const merged = current + text;
  state.buffers.set(runId, merged);
  state.rawBuffers.set(runId, (state.rawBuffers.get(runId) || '') + text);
  state.bufferUpdatedAt.set(runId, Date.now());
  return merged;
}

/**
 * 追加推理过程到独立的 reasoning 缓冲
 */
export function appendReasoningToBuffer(
  state: ChatRunState,
  runId: string,
  text: string
): string {
  const current = state.reasoningBuffers.get(runId) || '';
  const merged = current + text;
  state.reasoningBuffers.set(runId, merged);
  state.bufferUpdatedAt.set(runId, Date.now());
  return merged;
}

/**
 * 获取 run 的当前缓冲文本
 */
export function getBuffer(state: ChatRunState, runId: string): string {
  return state.buffers.get(runId) || '';
}

/**
 * 获取 run 的推理过程缓冲文本
 */
export function getReasoningBuffer(state: ChatRunState, runId: string): string {
  return state.reasoningBuffers.get(runId) || '';
}

/**
 * 清理已完成的 run 缓冲
 */
export function cleanupRun(state: ChatRunState, runId: string): void {
  state.buffers.delete(runId);
  state.rawBuffers.delete(runId);
  state.reasoningBuffers.delete(runId);
  state.bufferUpdatedAt.delete(runId);
  state.deltaSentAt.delete(runId);
  state.deltaLastBroadcastLen.delete(runId);
  state.deltaLastBroadcastText.delete(runId);
}
