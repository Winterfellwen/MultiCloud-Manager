export const DEFAULT_KEEP_TOKENS = 8000;
export const DEFAULT_BUDGET_TOKENS = 20000;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 2;
    } else if (code >= 0x3040 && code <= 0x9fff) {
      tokens += 2;
    } else if (code >= 0x0600 && code <= 0x06ff) {
      tokens += 2;
    } else {
      tokens += 0.25;
    }
  }
  return Math.max(1, Math.ceil(tokens));
}

function countToolTokens(
  toolCalls: unknown
): number {
  let total = 0;
  const calls = toolCalls as Array<Record<string, unknown>> | undefined;
  if (!calls) return 0;
  for (const t of calls) {
    const fn = t.function as Record<string, unknown> | undefined;
    if (fn) {
      total += estimateTokens(String(fn.name || ''));
      total += estimateTokens(String(fn.arguments || ''));
    }
  }
  return total;
}

function totalTokens(messages: Array<Record<string, unknown>>): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(String(m.content || ''));
    if (m.role === 'system' && (m as Record<string, unknown>).summary) {
      total += estimateTokens(String((m as Record<string, unknown>).summary));
    }
    total += countToolTokens(m.tool_calls);
  }
  return total;
}

export function compactMessages(
  messages: Array<Record<string, unknown>>,
  maxTokens: number = DEFAULT_KEEP_TOKENS
): Array<Record<string, unknown>> {
  if (messages.length === 0) return [];

  const total = totalTokens(messages);
  if (total <= maxTokens) return messages;

  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  const summary: Record<string, unknown> = {
    role: 'system',
    content: `[上下文总结] 以下是历史对话中较早部分的摘要，共 ${nonSystem.length} 条消息已被压缩。`,
    summary: true,
  };

  const result = [...systemMessages, summary];

  let budget = maxTokens - totalTokens(result);
  const kept: Array<Record<string, unknown>> = [];

  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msg = nonSystem[i];
    if (msg.role === 'tool') {
      let prevAssistant: Record<string, unknown> | undefined;
      for (let j = kept.length - 1; j >= 0; j--) {
        if (kept[j].role === 'assistant' && kept[j].tool_calls) {
          prevAssistant = kept[j];
          break;
        }
      }
      if (prevAssistant) {
        const tc = prevAssistant.tool_calls as Array<{ id: string }> | undefined;
        const hasMatchingCall = tc?.some(
          (t: { id: string }) => t.id === msg.tool_call_id
        );
        if (hasMatchingCall) {
          const msgTokens = estimateTokens(String(msg.content || ''));
          if (msgTokens <= budget) {
            kept.unshift(msg);
            budget -= msgTokens;
          }
          break;
        }
      }
      continue;
    }

    const msgTokens = estimateTokens(String(msg.content || ''));
    if (msgTokens > budget) break;
    kept.unshift(msg);
    budget -= msgTokens;
  }

  result.push(...kept);

  return result;
}
