// 审计日志类型定义

/** 审计日志查询参数 */
export interface AuditLogQuery {
  userId?: string;
  action?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/** 审计日志行（GET /audit/ 返回） */
export interface AuditLogRow {
  id: string;
  timestamp: string;
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

/** 审计结果标签映射 */
export const RESULT_LABELS: Record<'success' | 'failure', string> = {
  success: '成功',
  failure: '失败',
};

/** 云厂商选项（用于筛选） */
export const PROVIDER_OPTIONS = [
  { value: 'aliyun', label: '阿里云' },
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
] as const;
