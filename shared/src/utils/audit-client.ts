export interface AuditEntry {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  provider?: string;
  region?: string;
  result: 'success' | 'failure';
  params?: Record<string, unknown>;
  ip?: string;
  traceId?: string;
}

/**
 * Fire-and-forget 审计写入：调用 auth-service 的内部审计端点。
 * 写入失败静默忽略，不阻断业务流程。
 */
export async function recordAudit(authServiceUrl: string, entry: AuditEntry): Promise<void> {
  await fetch(`${authServiceUrl}/internal/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {
    // 审计写入失败不阻断业务
  });
}
