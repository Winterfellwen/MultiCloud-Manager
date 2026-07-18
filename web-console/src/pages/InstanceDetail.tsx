import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useInstanceByProviderId, useInstanceAction } from '@/hooks/useInstances';
import { cloudApi } from '@/api/cloud';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TagEditorDialog } from '@/components/instance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { ArrowLeft, Play, Square, RotateCw, Trash2, Server, Cpu, Globe, Tag, Clock, Pencil } from 'lucide-react';
import { InstanceMetricsCard, InstanceLogsCard, InstanceConnectionsCard } from '@/components/instance';

export default function InstanceDetail() {
  const { t } = useTranslation();
  const { providerInstanceId } = useParams<{ providerInstanceId: string }>();
  const navigate = useNavigate();
  const { data: instance, isLoading, error } = useInstanceByProviderId(providerInstanceId);
  const action = useInstanceAction();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [editingTags, setEditingTags] = useState<Record<string, string>>({});
  const [savingTags, setSavingTags] = useState(false);

  async function executeDelete() {
    if (!instance) return;
    try {
      await action.mutateAsync({ id: instance.id, action: 'delete' });
      toast.success(t('instances.deleteSuccess'));
      navigate('/resources');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
    }
  }

  async function handleAction(act: 'start' | 'stop' | 'reboot' | 'delete') {
    if (!instance) return;
    if (act === 'delete') {
      setConfirmOpen(true);
      return;
    }
    try {
      await action.mutateAsync({ id: instance.id, action: act });
      toast.success(t(`instances.${act}Success`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
    }
  }

  async function handleSaveTags() {
    if (!instance) return;
    setSavingTags(true);
    try {
      await cloudApi.updateInstanceTags(instance.id, editingTags);
      toast.success(t('instances.tagsUpdated', '标签更新成功'));
      setTagDialogOpen(false);
      qc.invalidateQueries({ queryKey: ['instance', 'provider', providerInstanceId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
    } finally {
      setSavingTags(false);
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
        <div className="text-destructive">{t('instances.notFound', '实例不存在或已删除')}</div>
        <Button variant="outline" onClick={() => navigate('/resources')}>
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
        <Button variant="ghost" size="icon" onClick={() => navigate('/resources')}>
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
              value={instance.monthlyCost ? `${instance.currency === 'CNY' ? '¥' : '$'}${parseFloat(instance.monthlyCost).toFixed(2)}` : '-'}
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {t('instances.tags', '标签')}
            </div>
            <Button variant="ghost" size="sm" onClick={() => {
              setEditingTags(instance.tags || {});
              setTagDialogOpen(true);
            }}>
              <Pencil className="h-4 w-4 mr-1" />
              {t('common.edit', '编辑')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {instance.tags && Object.keys(instance.tags).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(instance.tags).map(([key, value]) => (
                <Badge key={key} variant="secondary">
                  {key}: {value}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('instances.noTags', '暂无标签')}</p>
          )}
        </CardContent>
      </Card>

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

      {/* Metrics Card */}
      <InstanceMetricsCard instanceId={instance.id} />

      {/* Logs Card */}
      <InstanceLogsCard instanceId={instance.id} />

      {/* Connections Card */}
      <InstanceConnectionsCard
        instanceId={instance.id}
        incoming={instance.connections?.incoming || []}
        outgoing={instance.connections?.outgoing || []}
      />

      <TagEditorDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        tags={editingTags}
        onTagsChange={setEditingTags}
        onSave={handleSaveTags}
        saving={savingTags}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); executeDelete(); }}
        title={t('common.confirmDelete')}
        description={t('common.confirmDeleteDescription')}
        variant="destructive"
      />
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
