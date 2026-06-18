export interface AuditLog {
    id: string;
    timestamp: Date;
    userId: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    provider: string | null;
    region: string | null;
    params: Record<string, unknown> | null;
    result: 'success' | 'failure';
    ip: string | null;
    traceId: string | null;
}
export interface CreateAuditLogInput {
    userId: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    provider?: string;
    region?: string;
    params?: Record<string, unknown>;
    result: 'success' | 'failure';
    ip?: string;
    traceId?: string;
}
export interface AuditLogQuery {
    userId?: string;
    action?: string;
    provider?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}
//# sourceMappingURL=audit.d.ts.map