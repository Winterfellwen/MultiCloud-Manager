export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled: boolean;
  createdAt: Date;
}

export interface AlertAction {
  type: 'notify' | 'suggest' | 'auto';
  targets: string[];
}

export interface Alert {
  id: string;
  ruleId: string;
  instanceId: string | null;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  firedAt: Date;
  resolvedAt: Date | null;
}

export interface CostSummary {
  provider: string;
  totalAmount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  service: string;
  amount: number;
}
