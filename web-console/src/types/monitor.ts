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
