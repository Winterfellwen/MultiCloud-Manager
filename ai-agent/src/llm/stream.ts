// OpenAI 兼容 API 流式调用（简化版，不依赖 OpenClaw 的多 provider 系统）

import type {
  Context,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  ToolCall,
  Usage,
  StopReason,
} from './types.js';
import { normalizeUsage, makeZeroUsage } from './usage.js';
import { config } from '../config.js';

export function streamChat(
  context: Context,
  options?: { signal?: AbortSignal; onEvent?: (event: AssistantMessageEvent) => void }
): AssistantMessageEventStream {
  const events: AssistantMessageEvent[] = [];
  let resolveResult: (msg: AssistantMessage) => void;
  let rejectResult: (err: Error) => void;
  const resultPromise = new Promise<AssistantMessage>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  let done = false;
  const stream: AssistantMessageEventStream = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (events.length > 0) {
          yield events.shift()!;
          continue;
        }
        if (done) break;
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    push(event: AssistantMessageEvent) {
      events.push(event);
      options?.onEvent?.(event);
    },
    end(message?: AssistantMessage) {
      done = true;
      if (message) {
        resolveResult(message);
      }
    },
    result() {
      return resultPromise;
    },
  };

  doStreamChat(context, stream, options?.signal).catch((err) => {
    stream.push({ type: 'error', error: (err as Error).message });
    rejectResult(err as Error);
  });

  return stream;
}

async function doStreamChat(
  context: Context,
  stream: AssistantMessageEventStream,
  signal?: AbortSignal
) {
  const body = buildRequestBody(context);
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
  let textContent = '';
  let usage: Usage = makeZeroUsage();
  let stopReason: StopReason = 'stop';
  let model = config.llm.model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        if (chunk.model) model = chunk.model;
        if (chunk.usage) usage = { ...makeZeroUsage(), ...normalizeUsage(chunk.usage) };

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta?.content) {
          textContent += delta.content;
          stream.push({ type: 'text_delta', delta: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
              stream.push({ type: 'toolcall_start', id: tc.id || '', name: tc.function?.name || '' });
            }
            const entry = toolCalls.get(idx)!;
            if (tc.function?.arguments) {
              entry.args += tc.function.arguments;
              stream.push({ type: 'toolcall_arguments', id: entry.id, delta: tc.function.arguments });
            }
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
          }
        }

        if (choice.finish_reason) {
          stopReason = mapStopReason(choice.finish_reason);
        }
      } catch {
        // 忽略解析错误的行
      }
    }
  }

  const content: AssistantMessage['content'] = [];
  if (textContent) {
    content.push({ type: 'text', text: textContent });
  }
  for (const [, tc] of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = tc.args ? JSON.parse(tc.args) : {};
    } catch {
      args = { _raw: tc.args };
    }
    const toolCall: ToolCall = { type: 'toolCall', id: tc.id, name: tc.name, arguments: args };
    content.push(toolCall);
    stream.push({ type: 'toolcall_end', id: tc.id, name: tc.name, arguments: args });
  }

  const message: AssistantMessage = {
    role: 'assistant',
    content,
    model,
    usage,
    stopReason,
    timestamp: Date.now(),
  };

  stream.push({ type: 'done', message });
  stream.end(message);
}

function buildRequestBody(context: Context) {
  const messages: Array<Record<string, unknown>> = [];
  if (context.systemPrompt) {
    messages.push({ role: 'system', content: context.systemPrompt });
  }
  for (const msg of context.messages) {
    messages.push(toOpenAIMessage(msg));
  }
  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages,
    temperature: config.llm.temperature,
    max_tokens: config.llm.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (context.tools && context.tools.length > 0) {
    body.tools = context.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
  return body;
}

function toOpenAIMessage(msg: Context['messages'][number]): Record<string, unknown> {
  if (msg.role === 'user') {
    return { role: 'user', content: msg.content };
  }
  if (msg.role === 'assistant') {
    const result: Record<string, unknown> = { role: 'assistant' };
    const textParts = msg.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    const toolCalls = msg.content.filter((c) => c.type === 'toolCall');
    if (textParts.length > 0) result.content = textParts.join('');
    if (toolCalls.length > 0) {
      result.tool_calls = toolCalls.map((tc) => {
        const call = tc as ToolCall;
        return {
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        };
      });
    }
    return result;
  }
  const tr = msg as Extract<Context['messages'][number], { role: 'tool' }>;
  return {
    role: 'tool',
    tool_call_id: tr.toolCallId,
    content: tr.content,
  };
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'toolUse';
    case 'content_filter': return 'error';
    default: return 'stop';
  }
}
