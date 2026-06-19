import { Badge } from '@/components/ui/badge';
import type { InstanceStatus } from '@/types/cloud';
import type { AlertSeverity, AlertStatus } from '@/types/monitor';

const INSTANCE_STATUS_CONFIG: Record<InstanceStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  running: { label: '运行中', variant: 'success' },
  stopped: { label: '已停止', variant: 'secondary' },
  terminated: { label: '已终止', variant: 'destructive' },
  pending: { label: '启动中', variant: 'warning' },
  error: { label: '错误', variant: 'destructive' },
};

export function InstanceStatusBadge({ status }: { status: InstanceStatus }) {
  const config = INSTANCE_STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const ALERT_SEVERITY_CONFIG: Record<AlertSeverity, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  info: { label: '信息', variant: 'secondary' },
  warning: { label: '警告', variant: 'warning' },
  critical: { label: '严重', variant: 'destructive' },
  emergency: { label: '紧急', variant: 'destructive' },
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const config = ALERT_SEVERITY_CONFIG[severity] || { label: severity, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const ALERT_STATUS_CONFIG: Record<AlertStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  firing: { label: '告警中', variant: 'destructive' },
  resolved: { label: '已解决', variant: 'success' },
  silenced: { label: '已静音', variant: 'secondary' },
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const config = ALERT_STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
