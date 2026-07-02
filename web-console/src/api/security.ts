import { api } from './client';

export interface SecurityFinding {
  id: string;
  symptom: string;
  metricName: string;
  instanceProvider: string | null;
  rootCause: string | null;
  actionTaken: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface SecuritySummary {
  critical: number;
  warning: number;
  total: number;
  byRule: Record<string, number>;
  lastScannedAt: string | null;
}

export const securityApi = {
  getFindings: () => api.get<SecurityFinding[]>('/monitor/security/findings'),
  getSummary: () => api.get<SecuritySummary>('/monitor/security/summary'),
  triggerScan: () => api.post<{ status: string; message: string }>('/monitor/security/scan', {}),
};
