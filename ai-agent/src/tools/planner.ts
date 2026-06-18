// 工具规划器（移植自 OpenClaw tools/planner.ts）

import type {
  ToolDescriptor,
  ToolPlan,
  ToolPlanEntry,
  HiddenToolPlanEntry,
  BuildToolPlanOptions,
  ToolAvailabilityDiagnostic,
} from './types.js';
import { evaluateToolAvailability } from './availability.js';

export function buildToolPlan(options: BuildToolPlanOptions): ToolPlan {
  const { descriptors, availability } = options;

  const seen = new Set<string>();
  for (const desc of descriptors) {
    if (seen.has(desc.name)) {
      throw new ToolPlanContractError(`Duplicate tool name: ${desc.name}`);
    }
    seen.add(desc.name);
  }

  const sorted = [...descriptors].sort((a, b) => {
    const sa = a.sortKey || a.name;
    const sb = b.sortKey || b.name;
    return sa.localeCompare(sb);
  });

  const visible: ToolPlanEntry[] = [];
  const hidden: HiddenToolPlanEntry[] = [];

  for (const desc of sorted) {
    const diagnostics: readonly ToolAvailabilityDiagnostic[] = desc.availability
      ? evaluateToolAvailability(desc.availability, availability || {})
      : [];

    if (diagnostics.length > 0) {
      hidden.push({ descriptor: desc, diagnostics });
    } else if (desc.executor) {
      visible.push({ descriptor: desc, executor: desc.executor });
    } else {
      throw new ToolPlanContractError(`Tool ${desc.name} has no executor`);
    }
  }

  return { visible, hidden };
}

export class ToolPlanContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolPlanContractError';
  }
}
