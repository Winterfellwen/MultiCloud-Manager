import { hookRunner } from '../runner.js';
import { recordAudit } from '@cloudops/shared';
import { config } from '../../config.js';

hookRunner.registerAfterToolCall(
  (ctx) => {
    recordAudit(config.authServiceUrl, {
      userId: ctx.userId,
      action: 'ai.tool_call',
      resourceType: 'ai_tool',
      resourceId: ctx.toolName,
      provider: ctx.args?.provider as string | undefined,
      result: ctx.success ? 'success' : 'failure',
      params: { args: ctx.args },
      durationMs: ctx.durationMs,
      sessionId: ctx.sessionId,
    });
  },
  { priority: 50 }
);
