import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstance, useInstanceAction } from '@/hooks/useInstances';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { ArrowLeft, Play, Square, RotateCw, Trash2, Server, Cpu, Globe, Tag, Clock } from 'lucide-react';

export default function InstanceDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: instance, isLoading, error } = useInstance(id);
  const action = useInstanceAction();

  async function handleAction(act: 'start' | 'stop' | 'reboot' | 'delete') {
    if (!instance) return;
    if (act === 'delete' && !window.confirm(t('instances.confirmDeleteDesc'))) return;
    try {
      await action.mutateAsync({ id: instance.id, action: act });
      toast.success(t(`instances.${act}Success`));
      if (act === 'delete') navigate('/instances');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-destructive">{t('common.error')}</div>
        <Button variant="outline" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const specText = instance.cpu ? `${instance.cpu}C / ${instance.memoryMb ? Math.round(instance.memoryMb / 1024) : '?'}G / ${instance.diskGb || '?'}GB` : '-';

  return (
    <div className="space-y-6 p-3 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold">{instance.name || instance.providerInstanceId}</h1>
          <p className="text-sm text-muted-foreground">{instance.providerInstanceId}</p>
        </div>
        <InstanceStatusBadge status={instance.status} />
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('common.actions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {instance.status === 'stopped' && (
              <Button size="sm" onClick={() => handleAction('start')}>
                <Play className="h-4 w-4 mr-1" />
                {t('tooltip.start')}
              </Button>
            )}
            {instance.status === 'running' && (
              <Button size="sm" variant="outline" onClick={() => handleAction('stop')}>
                <Square className="h-4 w-4 mr-1" />
                {t('tooltip.stop')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => handleAction('reboot')}>
              <RotateCw className="h-4 w-4 mr-1" />
              {t('tooltip.reboot')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleAction('delete')}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('tooltip.delete')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            {t('instances.basicInfo', '基本信息')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('common.name')} value={instance.name || '-'} />
            <InfoRow label={t('common.provider')} value={instance.provider} />
            <InfoRow label={t('common.region')} value={instance.region} />
            <InfoRow
              label={t('common.status')}
              value={<InstanceStatusBadge status={instance.status} />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Spec */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            {t('instances.spec')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('instances.spec')} value={specText} />
            <InfoRow
              label={t('instances.monthlyCost')}
              value={instance.monthlyCost ? `¥${parseFloat(instance.monthlyCost).toFixed(2)}` : '-'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Network */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('instances.network', '网络信息')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Public IP" value={instance.publicIp || '-'} />
            <InfoRow label="Private IP" value={instance.privateIp || '-'} />
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      {instance.tags && Object.keys(instance.tags).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {t('instances.tags', '标签')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(instance.tags).map(([key, value]) => (
                <Badge key={key} variant="secondary">
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('instances.timeInfo', '时间信息')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('instances.createdAt', '创建时间')} value={formatTime(instance.createdAt)} />
            <InfoRow label={t('instances.lastSynced', '最后同步')} value={formatTime(instance.lastSyncedAt)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
