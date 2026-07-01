export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';
export type AlertActionType = 'notify' | 'suggest' | 'auto';
export type ChannelType = 'webhook' | 'email' | 'slack';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled: boolean;
  createdAt: string;
}

export interface AlertAction {
  type: AlertActionType;
  targets: string[];
}

export interface CreateAlertRuleParams {
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled?: boolean;
}

export type UpdateAlertRuleParams = Partial<CreateAlertRuleParams>;

export interface AlertEvent {
  id: string;
  ruleId: string | null;
  instanceId: string | null;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  firedAt: string;
  resolvedAt: string | null;
  aiAnalysis?: string | null;
  aiAnalyzedAt?: string | null;
}

export interface ListAlertEventsParams {
  status?: AlertStatus;
  severity?: AlertSeverity;
  limit?: number;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: ChannelType;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface CreateChannelParams {
  name: string;
  type: ChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface CostSummaryItem {
  provider: string;
  service: string;
  totalAmount: number;
  currency: string;
}

export interface CostSummaryParams {
  provider?: string;
  start?: string;
  end?: string;
}

export interface InstanceCost {
  id: string;
  name: string | null;
  provider: string;
  region: string;
  monthlyCost: string | null;
}

export interface MetricData {
  id: string;
  instanceId: string;
  metricName: string;
  value: string;
  unit: string | null;
  recordedAt: string;
  createdAt: string;
}

export interface PredictionItem {
  id: number;
  instanceId: string;
  instanceName: string | null;
  instanceProvider: string;
  metricName: string;
  currentValue: string;
  predictedValue: string;
  threshold: string;
  hoursToThreshold: string;
  slope: string;
  confidence: string;
  createdAt: string;
}

export interface RemediationRun {
  id: string;
  alertId: string | null;
  instanceId: string | null;
  instanceName: string | null;
  instanceProvider: string | null;
  rootCause: string | null;
  actionPlan: {
    rootCause: string;
    recommendedAction: string;
    reasoning: string;
    riskLevel: string;
    expectedEffect: string;
    verificationMetric: string;
    verificationTimeout: number;
  } | null;
  actionExecuted: string | null;
  status: 'pending' | 'approved' | 'executing' | 'success' | 'failed' | 'skipped';
  env: string | null;
  triggeredAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  verificationResult: string | null;
  errorMessage: string | null;
  alertMessage: string | null;
}

export interface RemediationPolicy {
  id: string;
  name: string;
  actionType: string;
  resourceType: string | null;
  envTags: string[];
  autoExecute: Record<string, boolean>;
  enabled: boolean;
}

export interface KnowledgeEntry {
  id: string;
  symptom: string;
  metricName: string;
  instanceProvider: string | null;
  instanceEnv: string | null;
  rootCause: string | null;
  actionTaken: string | null;
  outcome: string;
  resolutionTimeMinutes: number | null;
  helpfulCount: number;
  createdAt: string;
}
