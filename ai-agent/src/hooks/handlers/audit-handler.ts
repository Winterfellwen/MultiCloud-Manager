// 审计日志 handler：记录所有工具调用到日志（Phase 6 可扩展写入 DB）

import { hookRunner } from '../runner.js';

hookRunner.registerAfterToolCall(
  (ctx) => {
    const status = ctx.success ? 'SUCCESS' : 'FAILED';
    console.log(
      `[AUDIT] user=${ctx.userId} session=${ctx.sessionId} tool=${ctx.toolName} danger=${ctx.dangerLevel} status=${status} duration=${ctx.durationMs}ms`
    );
  },
  { priority: 50 }
);
