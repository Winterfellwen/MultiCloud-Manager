// 内容块（blocks）辅助函数
// 按 assistant 消息事件到达顺序构建 blocks 数组，确保 reasoning / text / tool_call 按实际时间顺序渲染
//
// 核心规则：
// - reasoning_delta：追加到最后一个 reasoning block（连续）；若最后一个不是 reasoning 则新建
// - text_delta：追加到最后一个 text block（连续）；若最后一个不是 text 则新建
// - tool_call：始终新建 tool_call block（不合并）
// - tool_result：更新对应 tool_call block 的 result 和 status

import type { ContentBlock, ToolCallRecord } from '../../types/chat';

/** 创建空 blocks 数组 */
export function createBlocks(): ContentBlock[] {
  return [];
}

/**
 * 追加 reasoning delta 到 blocks
 * 若最后一个 block 是 reasoning，则追加到它；否则新建 reasoning block
 */
export function appendReasoningDelta(blocks: ContentBlock[], delta: string): void {
  if (!delta) return;
  const last = blocks[blocks.length - 1];
  if (last && last.type === 'reasoning') {
    last.content += delta;
  } else {
    blocks.push({ type: 'reasoning', id: `blk-r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content: delta });
  }
}

/**
 * 追加 text delta 到 blocks
 * 若最后一个 block 是 text，则追加到它；否则新建 text block
 */
export function appendTextDelta(blocks: ContentBlock[], delta: string): void {
  if (!delta) return;
  const last = blocks[blocks.length - 1];
  if (last && last.type === 'text') {
    last.content += delta;
  } else {
    blocks.push({ type: 'text', id: `blk-t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content: delta });
  }
}

/**
 * 设置 text block 的完整内容（用于 done 事件覆盖）
 * 找到最后一个 text block 并覆盖其内容；若不存在则新建
 */
export function setTextContent(blocks: ContentBlock[], text: string): void {
  // 从后往前找最后一个 text block
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === 'text') {
      block.content = text;
      return;
    }
  }
  // 不存在则新建
  if (text) {
    blocks.push({ type: 'text', id: `blk-t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content: text });
  }
}

/**
 * 添加工具调用 block
 */
export function appendToolCall(blocks: ContentBlock[], toolCall: ToolCallRecord): void {
  blocks.push({ type: 'tool_call', id: `blk-c-${toolCall.id}`, toolCall });
}

/**
 * 更新工具调用结果
 * 优先通过 toolCallId 精确匹配，回退到最后一个 pending 的 tool_call block
 */
export function updateToolResult(
  blocks: ContentBlock[],
  result: { name: string; content: unknown },
  toolCallId?: string,
): void {
  let target: ToolCallRecord | undefined;
  if (toolCallId) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (block.type === 'tool_call' && block.toolCall.id === toolCallId) {
        target = block.toolCall;
        break;
      }
    }
  }
  if (!target) {
    // 回退：找最后一个 pending 的 tool_call
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (block.type === 'tool_call' && block.toolCall.status === 'pending') {
        target = block.toolCall;
        break;
      }
    }
  }
  if (target) {
    target.result = result;
    target.status = 'completed';
  }
}

/**
 * 从 blocks 中提取拼接后的纯文本内容（用于消息摘要、标题等）
 */
export function extractTextFromBlocks(blocks: ContentBlock[] | undefined): string {
  if (!blocks || blocks.length === 0) return '';
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.content)
    .join('');
}

/**
 * 从 blocks 中提取拼接后的推理过程文本
 */
export function extractReasoningFromBlocks(blocks: ContentBlock[] | undefined): string {
  if (!blocks || blocks.length === 0) return '';
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'reasoning' }> => b.type === 'reasoning')
    .map((b) => b.content)
    .join('');
}

/**
 * 从 blocks 中提取所有工具调用记录（用于兼容旧逻辑）
 */
export function extractToolCallsFromBlocks(blocks: ContentBlock[] | undefined): ToolCallRecord[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'tool_call' }> => b.type === 'tool_call')
    .map((b) => b.toolCall);
}
