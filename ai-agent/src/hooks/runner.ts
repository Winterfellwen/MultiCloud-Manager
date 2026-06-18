// Hook Runner（移植自 OpenClaw plugins/hooks.ts 的执行模式，简化版）

import type {
  BeforeToolCallHook,
  AfterToolCallHook,
  HookContext,
  BeforeToolCallResult,
  HookRegistration,
  AfterToolCallContext,
} from './types.js';

interface RegisteredHook<T> {
  handler: T;
  priority: number;
  timeoutMs: number;
}

class HookRunner {
  private beforeToolCallHooks: RegisteredHook<BeforeToolCallHook>[] = [];
  private afterToolCallHooks: RegisteredHook<AfterToolCallHook>[] = [];

  registerBeforeToolCall(handler: BeforeToolCallHook, opts?: HookRegistration): void {
    this.beforeToolCallHooks.push({
      handler,
      priority: opts?.priority ?? 0,
      timeoutMs: opts?.timeoutMs ?? 15000,
    });
    this.beforeToolCallHooks.sort((a, b) => b.priority - a.priority);
  }

  registerAfterToolCall(handler: AfterToolCallHook, opts?: HookRegistration): void {
    this.afterToolCallHooks.push({
      handler,
      priority: opts?.priority ?? 0,
      timeoutMs: opts?.timeoutMs ?? 15000,
    });
    this.afterToolCallHooks.sort((a, b) => b.priority - a.priority);
  }

  async runBeforeToolCall(ctx: HookContext): Promise<BeforeToolCallResult> {
    let result: BeforeToolCallResult = {};
    for (const reg of this.beforeToolCallHooks) {
      try {
        const hookResult = await withTimeout(reg.handler(ctx), reg.timeoutMs);
        if (hookResult) {
          if (hookResult.block) {
            return { block: true, blockReason: hookResult.blockReason };
          }
          if (hookResult.requireApproval && !result.requireApproval) {
            result = { ...result, ...hookResult };
          }
        }
      } catch (err) {
        console.error('before_tool_call hook error:', err);
      }
    }
    return result;
  }

  async runAfterToolCall(ctx: AfterToolCallContext): Promise<void> {
    const promises = this.afterToolCallHooks.map((reg) =>
      withTimeout(reg.handler(ctx), reg.timeoutMs).catch((err) =>
        console.error('after_tool_call hook error:', err)
      )
    );
    await Promise.all(promises);
  }
}

function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  if (!(promise instanceof Promise)) return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Hook timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export const hookRunner = new HookRunner();
