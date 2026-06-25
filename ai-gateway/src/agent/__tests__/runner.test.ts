import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../acp/event-ledger.js', () => ({
  readReplay: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../acp/provider-store.js', () => ({
  getProviderFromStore: vi.fn(),
  listProvidersFromStore: vi.fn().mockResolvedValue([]),
}));

vi.mock('../tools.js', () => ({
  executeTool: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
  getLLMToolsForMode: vi.fn().mockReturnValue([
    { type: 'function', function: { name: 'test_tool', description: 'Test', parameters: {} } },
  ]),
  findTool: vi.fn().mockReturnValue({ name: 'test_tool', dangerLevel: 'safe', label: 'Test Tool' }),
}));

vi.mock('../thinking-format.js', () => ({
  resolveThinkingConfig: vi.fn().mockReturnValue({
    thinkingFormat: 'openai',
    supportsReasoningEffort: true,
    maxTokensField: 'max_tokens',
    supportsTools: true,
    requiresStringContent: false,
  }),
  buildThinkingPayload: vi.fn().mockReturnValue({}),
  extractReasoning: vi.fn().mockImplementation((msg: any) => ({
    text: msg.content || '',
    reasoning: msg.reasoning_content,
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { runAgentTurn } from '../runner.js';

describe('runAgentTurn', () => {
  const defaultParams = {
    sessionKey: 'test-session',
    runId: 'test-run',
    userMessage: 'hello',
    signal: new AbortController().signal,
  };

  function mockCallbacks() {
    return {
      onDelta: vi.fn(),
      onReasoning: vi.fn(),
      onToolCall: vi.fn(),
      onToolResult: vi.fn(),
      onComplete: vi.fn(),
    };
  }

  function mockLLMResponse(overrides: Partial<{
    content: string | null;
    reasoning_content: string;
    tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
  }> = {}) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: null, ...overrides } }],
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('calls onComplete with final text when LLM returns text and no tool calls', async () => {
    mockLLMResponse({ content: 'Hello! How can I help?' });
    const cbs = mockCallbacks();
    await runAgentTurn(defaultParams, cbs);
    expect(cbs.onDelta).toHaveBeenCalledWith('Hello! How can I help?');
    expect(cbs.onComplete.mock.calls[0][0]).toBe('Hello! How can I help?');
    expect(cbs.onComplete.mock.calls[0][1]).toBe(false);
  });

  it('calls onReasoning when LLM returns reasoning_content', async () => {
    mockLLMResponse({
      content: 'Final answer',
      reasoning_content: 'Step by step thinking...',
    });
    const cbs = mockCallbacks();
    await runAgentTurn(defaultParams, cbs);
    expect(cbs.onReasoning).toHaveBeenCalledWith('Step by step thinking...');
  });

  it('throws when signal is already aborted', async () => {
    const aborter = new AbortController();
    aborter.abort();
    const cbs = mockCallbacks();
    await expect(
      runAgentTurn({ ...defaultParams, signal: aborter.signal }, cbs)
    ).rejects.toThrow('Run aborted');
  });

  it('calls onComplete with fallback message when LLM returns empty text', async () => {
    mockLLMResponse({ content: '' });
    const cbs = mockCallbacks();
    await runAgentTurn(defaultParams, cbs);
    expect(cbs.onComplete).toHaveBeenCalled();
    const callArg = cbs.onComplete.mock.calls[0][0];
    expect(callArg).toContain('完成了思考');
    expect(cbs.onComplete.mock.calls[0][1]).toBe(false);
    expect(cbs.onDelta).not.toHaveBeenCalled();
  });
});
