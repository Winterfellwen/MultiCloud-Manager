// Token 用量归一化（移植自 OpenClaw agents/usage.ts）

export interface NormalizedUsage {
  input?: number;
  output?: number;
  total?: number;
}

export function normalizeUsage(raw: Record<string, unknown> | undefined | null): NormalizedUsage | undefined {
  if (!raw) return undefined;

  const input =
    (raw.prompt_tokens as number) ??
    (raw.input_tokens as number) ??
    (raw.inputTokens as number) ??
    0;
  const output =
    (raw.completion_tokens as number) ??
    (raw.output_tokens as number) ??
    (raw.outputTokens as number) ??
    0;
  const total = (raw.total_tokens as number) ?? (raw.totalTokens as number) ?? input + output;

  if (input === 0 && output === 0) return undefined;

  return { input, output, total };
}

export function makeZeroUsage() {
  return {
    input: 0,
    output: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, total: 0 },
  };
}
