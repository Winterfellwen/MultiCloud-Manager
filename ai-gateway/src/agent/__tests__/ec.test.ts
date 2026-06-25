import { describe, it, expect } from 'vitest';
import { estimateTokens, compactMessages } from '../ec.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns ~1 token per 4 chars for ASCII text', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(text.length);
  });

  it('returns more tokens for CJK characters', () => {
    const cjk = '你好世界';
    const ascii = 'hello world';
    expect(estimateTokens(cjk)).toBeGreaterThan(estimateTokens(ascii));
  });

  it('counts JSON content reasonably', () => {
    const json = JSON.stringify({ success: true, data: { id: '123', name: 'test' } });
    const tokens = estimateTokens(json);
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });
});

describe('compactMessages', () => {
  function makeMsg(role: string, content: string, toolCallId?: string) {
    const m: Record<string, unknown> = { role, content };
    if (toolCallId) m.tool_call_id = toolCallId;
    return m;
  }

  function makeAssistantWithToolCalls(toolCalls: Array<{ id: string; name: string }>) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: '{}' },
      })),
    };
  }

  it('returns empty array for empty input', () => {
    expect(compactMessages([], 1000)).toEqual([]);
  });

  it('preserves all messages within budget', () => {
    const msgs = [
      makeMsg('system', 'You are a helpful assistant'),
      makeMsg('user', 'Hello'),
      makeMsg('assistant', 'Hi there!'),
    ];
    const result = compactMessages(msgs, 10000);
    expect(result).toEqual(msgs);
  });

  it('keeps system messages and a summary when over budget', () => {
    const sys = makeMsg('system', 'You are CloudOps AI');
    const longContent = 'A'.repeat(10000);
    const msgs = [sys, makeMsg('user', longContent), makeMsg('assistant', 'OK')];
    const result = compactMessages(msgs, 100);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toEqual(sys);
    expect(result[result.length - 1].role).not.toBe('tool');
  });

  it('does not orphan tool messages without preceding assistant', () => {
    const msgs = [
      makeMsg('system', 'You are CloudOps AI'),
      makeMsg('user', 'List instances'),
      makeAssistantWithToolCalls([{ id: 'call1', name: 'cloud_list_instances' }]),
      makeMsg('tool', '{"instances": []}', 'call1'),
      makeMsg('user', 'Thanks'),
    ];
    const result = compactMessages(msgs, 50);
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'tool') {
        expect(result[i - 1]).toBeDefined();
        expect(result[i - 1].role).toBe('assistant');
        const tc = (result[i - 1] as any).tool_calls;
        expect(tc).toBeDefined();
      }
    }
  });

  it('adds a summary message when truncation occurs', () => {
    const sys = makeMsg('system', 'You are CloudOps AI');
    const manyMsgs = Array.from({ length: 50 }, (_, i) => makeMsg('user', `Message ${i}`));
    const msgs = [sys, ...manyMsgs];
    const result = compactMessages(msgs, 100);
    const summaryMsg = result.find(m => (m as any).role === 'system' && (m as any).summary);
    if (manyMsgs.length > result.length - 1) {
      expect(summaryMsg).toBeDefined();
    }
  });

  it('returns messages when budget is large enough', () => {
    const msgs = [
      makeMsg('system', 'System prompt'),
      makeMsg('user', 'Hello'),
      makeMsg('assistant', 'World'),
    ];
    const result = compactMessages(msgs, 1000);
    expect(result).toHaveLength(3);
  });

  it('handles messages with null content', () => {
    const msgs = [
      makeMsg('system', 'System prompt'),
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'test', arguments: '{}' } }] },
      makeMsg('tool', 'result', 'c1'),
    ];
    const result = compactMessages(msgs, 1000);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
