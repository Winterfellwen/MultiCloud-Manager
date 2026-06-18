// 工具注册表：executorId → 执行函数映射

import type { ToolDescriptor } from './types.js';
import type { ToolPlan } from './types.js';
import { buildToolPlan } from './planner.js';
import { toLLMTools } from './protocol.js';
import type { Tool } from '../llm/types.js';

export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<string>;

export interface ToolExecutionContext {
  userId: string;
  sessionId: string;
  cloudServiceUrl: string;
  monitorServiceUrl: string;
  authToken?: string;
}

class ToolRegistry {
  private descriptors: Map<string, ToolDescriptor> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();

  register(descriptor: ToolDescriptor, executor: ToolExecutor): void {
    this.descriptors.set(descriptor.name, descriptor);
    this.executors.set(descriptor.executor.executorId, executor);
  }

  getExecutor(executorId: string): ToolExecutor | undefined {
    return this.executors.get(executorId);
  }

  getAllDescriptors(): ToolDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  buildPlan(env?: Record<string, string | undefined>): {
    plan: ToolPlan;
    llmTools: Tool[];
  } {
    const plan = buildToolPlan({
      descriptors: this.getAllDescriptors(),
      availability: { env },
    });
    const llmTools = toLLMTools(plan.visible);
    return { plan, llmTools };
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string> {
    const descriptor = this.descriptors.get(toolName);
    if (!descriptor) throw new Error(`Unknown tool: ${toolName}`);
    const executor = this.getExecutor(descriptor.executor.executorId);
    if (!executor) throw new Error(`No executor for tool: ${toolName}`);
    return executor(args, context);
  }
}

export const toolRegistry = new ToolRegistry();
