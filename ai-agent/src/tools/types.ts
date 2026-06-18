// 工具描述符契约（移植自 OpenClaw tools/types.ts，简化为 CloudOps 场景）

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type ToolOwnerRef = { readonly kind: 'core' };

export type ToolExecutorRef = {
  readonly kind: 'core';
  readonly executorId: string;
};

export type ToolAvailabilitySignal =
  | { readonly kind: 'always' }
  | { readonly kind: 'env'; readonly name: string };

export type ToolAvailabilityExpression =
  | ToolAvailabilitySignal
  | { readonly allOf: readonly ToolAvailabilityExpression[] }
  | { readonly anyOf: readonly ToolAvailabilityExpression[] };

export type ToolDescriptor = {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly owner: ToolOwnerRef;
  readonly executor: ToolExecutorRef;
  readonly availability?: ToolAvailabilityExpression;
  readonly annotations?: JsonObject;
  readonly sortKey?: string;
  readonly dangerLevel?: 'safe' | 'moderate' | 'dangerous';
};

export type ToolAvailabilityContext = {
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type ToolUnavailableReason = 'env-missing' | 'unsupported-signal';

export type ToolAvailabilityDiagnostic = {
  readonly reason: ToolUnavailableReason;
  readonly signal: ToolAvailabilitySignal;
  readonly detail?: string;
};

export type ToolPlanEntry = {
  readonly descriptor: ToolDescriptor;
  readonly executor: ToolExecutorRef;
};

export type HiddenToolPlanEntry = {
  readonly descriptor: ToolDescriptor;
  readonly diagnostics: readonly ToolAvailabilityDiagnostic[];
};

export type ToolPlan = {
  readonly visible: readonly ToolPlanEntry[];
  readonly hidden: readonly HiddenToolPlanEntry[];
};

export type BuildToolPlanOptions = {
  readonly descriptors: readonly ToolDescriptor[];
  readonly availability?: ToolAvailabilityContext;
};
