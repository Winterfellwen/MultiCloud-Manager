// 工具可用性求值器（移植自 OpenClaw tools/availability.ts）

import type {
  ToolAvailabilityExpression,
  ToolAvailabilitySignal,
  ToolAvailabilityContext,
  ToolAvailabilityDiagnostic,
  ToolUnavailableReason,
} from './types.js';

export function evaluateToolAvailability(
  expr: ToolAvailabilityExpression,
  context: ToolAvailabilityContext
): readonly ToolAvailabilityDiagnostic[] {
  const diagnostics: ToolAvailabilityDiagnostic[] = [];
  collectDiagnostics(expr, context, diagnostics);
  return diagnostics;
}

function collectDiagnostics(
  expr: ToolAvailabilityExpression,
  context: ToolAvailabilityContext,
  out: ToolAvailabilityDiagnostic[]
): void {
  if ('allOf' in expr) {
    for (const child of expr.allOf) collectDiagnostics(child, context, out);
    return;
  }
  if ('anyOf' in expr) {
    const childDiagnostics: ToolAvailabilityDiagnostic[][] = [];
    let anyAvailable = false;
    for (const child of expr.anyOf) {
      const childOut: ToolAvailabilityDiagnostic[] = [];
      collectDiagnostics(child, context, childOut);
      if (childOut.length === 0) {
        anyAvailable = true;
        break;
      }
      childDiagnostics.push(childOut);
    }
    if (!anyAvailable) {
      for (const childOut of childDiagnostics) out.push(...childOut);
    }
    return;
  }
  const signal = expr as ToolAvailabilitySignal;
  const diag = evaluateSignal(signal, context);
  if (diag) out.push(diag);
}

function evaluateSignal(
  signal: ToolAvailabilitySignal,
  context: ToolAvailabilityContext
): ToolAvailabilityDiagnostic | null {
  switch (signal.kind) {
    case 'always':
      return null;
    case 'env': {
      const value = context.env?.[signal.name];
      if (!value) {
        return {
          reason: 'env-missing' as ToolUnavailableReason,
          signal,
          detail: `Environment variable ${signal.name} is not set`,
        };
      }
      return null;
    }
    default:
      return {
        reason: 'unsupported-signal' as ToolUnavailableReason,
        signal,
        detail: `Unsupported signal kind: ${(signal as { kind: string }).kind}`,
      };
  }
}
