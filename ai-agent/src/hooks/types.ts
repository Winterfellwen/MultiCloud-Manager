// CloudOps Hook 类型（移植自 OpenClaw plugins/hooks.ts，简化为云运维场景）

export interface HookContext {
  userId: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
}

export interface BeforeToolCallResult {
  block?: boolean;
  blockReason?: string;
  requireApproval?: boolean;
  approvalMessage?: string;
}

export type BeforeToolCallHook = (
  ctx: HookContext
) => Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;

export interface AfterToolCallContext extends HookContext {
  result: string;
  success: boolean;
  durationMs: number;
}

export type AfterToolCallHook = (
  ctx: AfterToolCallContext
) => Promise<void> | void;

export interface HookRegistration {
  priority?: number;
  timeoutMs?: number;
}
