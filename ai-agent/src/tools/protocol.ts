// 协议转换：ToolPlanEntry → LLM 可识别的 Tool 描述（移植自 OpenClaw tools/protocol.ts）

import type { ToolPlanEntry, JsonObject } from './types.js';
import type { Tool } from '../llm/types.js';

export type ToolProtocolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

export function toToolProtocolDescriptor(entry: ToolPlanEntry): ToolProtocolDescriptor {
  return {
    name: entry.descriptor.name,
    description: entry.descriptor.description,
    inputSchema: entry.descriptor.inputSchema,
  };
}

export function toToolProtocolDescriptors(entries: readonly ToolPlanEntry[]): readonly ToolProtocolDescriptor[] {
  return entries.map(toToolProtocolDescriptor);
}

export function toLLMTools(entries: readonly ToolPlanEntry[]): Tool[] {
  return entries.map((entry) => ({
    name: entry.descriptor.name,
    description: entry.descriptor.description,
    parameters: entry.descriptor.inputSchema as Record<string, unknown>,
  }));
}
