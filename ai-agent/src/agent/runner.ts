// Agent 主循环：LLM → tool_call → execute → loop

import type { Message, AssistantMessage, AssistantMessageEvent, ToolCall } from '../llm/types.js';
import { streamChat } from '../llm/stream.js';
import { toolRegistry, type ToolExecutionContext } from '../tools/registry.js';
import { hookRunner } from '../hooks/runner.js';
import { sessionManager } from './session.js';
import { buildContext } from './context.js';
import { config } from '../config.js';

export interface AgentRunOptions {
  sessionId: string;
  userId: string;
  userInput: string;
  authToken?: string;
  onEvent?: (event: AgentRunEvent) => void;
  signal?: AbortSignal;
}

export type AgentRunEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'toolcall_start'; id: string; name: string }
  | { type: 'toolcall_arguments'; id: string; delta: string }
  | { type: 'toolcall_end'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: string; isError: boolean }
  | { type: 'approval_required'; toolCallId: string; toolName: string; message: string }
  | { type: 'done'; finalText: string }
  | { type: 'error'; error: string };

export interface AgentRunResult {
  finalText: string;
  iterations: number;
  toolCalls: number;
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { sessionId, userId, userInput, authToken, onEvent, signal } = options;

  await sessionManager.saveUserMessage(sessionId, userInput);

  const toolCtx: ToolExecutionContext = {
    userId,
    sessionId,
    cloudServiceUrl: config.cloudServiceUrl,
    monitorServiceUrl: config.monitorServiceUrl,
    authToken,
  };

  let iterations = 0;
  let toolCallCount = 0;
  let finalText = '';

  while (iterations < config.agent.maxIterations) {
    iterations++;
    if (signal?.aborted) throw new Error('Agent run aborted');

    const messages = await sessionManager.loadMessages(sessionId);
    const { plan, llmTools } = toolRegistry.buildPlan(process.env as Record<string, string | undefined>);
    const context = buildContext(messages, plan);

    const assistantMsg = await callLLMStream(context, onEvent, signal);

    await sessionManager.saveAssistantMessage(sessionId, assistantMsg);

    const textParts = assistantMsg.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text);
    if (textParts.length > 0) finalText = textParts.join('');

    const toolCalls = assistantMsg.content.filter((c) => c.type === 'toolCall') as ToolCall[];
    if (toolCalls.length === 0) {
      onEvent?.({ type: 'done', finalText });
      return { finalText, iterations, toolCalls: toolCallCount };
    }

    for (const tc of toolCalls) {
      toolCallCount++;
      const descriptor = toolRegistry.getAllDescriptors().find((d) => d.name === tc.name);
      const dangerLevel = descriptor?.dangerLevel || 'safe';

      const hookResult = await hookRunner.runBeforeToolCall({
        userId,
        sessionId,
        toolName: tc.name,
        args: tc.arguments,
        dangerLevel,
      });

      if (hookResult.block) {
        const blockMsg = `操作被阻止：${hookResult.blockReason}`;
        await sessionManager.saveToolResult(sessionId, tc.id, tc.name, blockMsg, true);
        onEvent?.({ type: 'tool_result', toolCallId: tc.id, toolName: tc.name, result: blockMsg, isError: true });
        continue;
      }

      if (hookResult.requireApproval) {
        onEvent?.({
          type: 'approval_required',
          toolCallId: tc.id,
          toolName: tc.name,
          message: hookResult.approvalMessage || `操作 ${tc.name} 需要确认`,
        });
        // MVP 阶段：自动批准。Phase 5 Web Console 会实现人工审批 UI
      }

      const startTime = Date.now();
      let result: string;
      let isError = false;
      try {
        result = await toolRegistry.execute(tc.name, tc.arguments, toolCtx);
      } catch (err) {
        result = `工具执行失败：${(err as Error).message}`;
        isError = true;
      }
      const durationMs = Date.now() - startTime;

      await hookRunner.runAfterToolCall({
        userId,
        sessionId,
        toolName: tc.name,
        args: tc.arguments,
        dangerLevel,
        result,
        success: !isError,
        durationMs,
      });

      await sessionManager.saveToolResult(sessionId, tc.id, tc.name, result, isError);
      onEvent?.({ type: 'tool_result', toolCallId: tc.id, toolName: tc.name, result, isError });
    }
  }

  onEvent?.({ type: 'done', finalText: finalText || '已达到最大迭代次数，请缩小问题范围后重试。' });
  return { finalText, iterations, toolCalls: toolCallCount };
}

async function callLLMStream(
  context: Parameters<typeof streamChat>[0],
  onEvent?: (event: AgentRunEvent) => void,
  signal?: AbortSignal
): Promise<AssistantMessage> {
  return new Promise((resolve, reject) => {
    const eventStream = streamChat(context, {
      signal,
      onEvent: (event: AssistantMessageEvent) => {
        switch (event.type) {
          case 'text_delta':
            onEvent?.({ type: 'text_delta', delta: event.delta });
            break;
          case 'toolcall_start':
            onEvent?.({ type: 'toolcall_start', id: event.id, name: event.name });
            break;
          case 'toolcall_arguments':
            onEvent?.({ type: 'toolcall_arguments', id: event.id, delta: event.delta });
            break;
          case 'toolcall_end':
            onEvent?.({ type: 'toolcall_end', id: event.id, name: event.name, arguments: event.arguments });
            break;
          case 'error':
            onEvent?.({ type: 'error', error: event.error });
            reject(new Error(event.error));
            return;
        }
      },
    });

    eventStream.result().then(resolve).catch(reject);
  });
}
