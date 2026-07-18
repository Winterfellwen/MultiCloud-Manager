import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { InstanceStatus } from '@/types/cloud';
import type { AlertSeverity, AlertStatus } from '@/types/monitor';

export function InstanceStatusBadge({ status }: { status: InstanceStatus }) {
  const { t } = useTranslation();
  const labelKey = `instances.${status}`;
  const variantMap: Record<string, 'success' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
    running: 'success',
    stopped: 'secondary',
    terminated: 'destructive',
    pending: 'warning',
    error: 'destructive',
    'in-use': 'success',
    available: 'success',
    attached: 'success',
    detached: 'secondary',
    creating: 'warning',
    deleting: 'warning',
    unknown: 'outline',
  };
  return <Badge variant={variantMap[status] || 'outline'}>{t(labelKey, status)}</Badge>;
}

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { t } = useTranslation();
  const labelMap: Record<AlertSeverity, string> = {
    info: t('monitor.alerts.info'),
    warning: t('monitor.alerts.warning'),
    critical: t('monitor.alerts.critical'),
    emergency: t('monitor.alerts.emergency'),
  };
  const variantMap: Record<AlertSeverity, 'success' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
    info: 'secondary',
    warning: 'warning',
    critical: 'destructive',
    emergency: 'destructive',
  };
  return <Badge variant={variantMap[severity] || 'outline'}>{labelMap[severity] || severity}</Badge>;
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const { t } = useTranslation();
  const labelMap: Record<AlertStatus, string> = {
    firing: t('monitor.alerts.firing'),
    resolved: t('monitor.alerts.resolved'),
    silenced: t('monitor.alerts.silenced'),
  };
  const variantMap: Record<AlertStatus, 'success' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
    firing: 'destructive',
    resolved: 'success',
    silenced: 'secondary',
  };
  return <Badge variant={variantMap[status] || 'outline'}>{labelMap[status] || status}</Badge>;
}
