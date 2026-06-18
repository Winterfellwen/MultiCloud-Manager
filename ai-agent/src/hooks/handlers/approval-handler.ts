// 危险操作审批 handler：对 dangerous 级别工具要求人工确认

import { hookRunner } from '../runner.js';

hookRunner.registerBeforeToolCall(
  (ctx) => {
    if (ctx.dangerLevel === 'dangerous') {
      return {
        requireApproval: true,
        approvalMessage: `⚠️ 即将执行危险操作：${ctx.toolName}。参数：${JSON.stringify(ctx.args).slice(0, 200)}。请确认是否继续？`,
      };
    }
    return {};
  },
  { priority: 100 }
);
