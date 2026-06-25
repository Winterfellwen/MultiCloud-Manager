import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstances, useInstanceAction, useSyncInstances, useProviders, useRegions, useInstanceTypes, useImages, useCreateInstance } from '@/hooks/useInstances';
import { useDemoStore } from '@/stores/demo';
import { demoResetAll } from '@/lib/demo/demo-api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import type { InstanceStatus } from '@/types/cloud';
import { Plus, RefreshCw, Search, Play, Square, RotateCw, Trash2, RotateCcw } from 'lucide-react';

export default function Instances() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<{ provider?: string; status?: InstanceStatus }>({});
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: instances, isLoading } = useInstances(filters);
  const { data: providersData } = useProviders();
  const action = useInstanceAction();
  const sync = useSyncInstances();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    return (instances || []).filter((inst) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (inst.name?.toLowerCase().includes(s)) ||
        (inst.providerInstanceId?.toLowerCase().includes(s)) ||
        (inst.publicIp?.includes(s)) ||
        (inst.region?.toLowerCase().includes(s))
      );
    });
  }, [instances, search]);

  async function handleAction(id: string, act: 'start' | 'stop' | 'reboot' | 'delete') {
    try {
      await action.mutateAsync({ id, action: act });
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
    }
  }

  async function handleSync() {
    try {
      await sync.mutateAsync(undefined);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.syncFailed'));
    }
  }

  async function handleResetDemo() {
    if (!window.confirm(t('instances.resetConfirm'))) return;
    try {
      await demoResetAll();
      qc.invalidateQueries({ queryKey: ['instances'] });
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['cloud-accounts'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success(t('instances.resetSuccess'));
    } catch (err) {
      toast.error(t('instances.resetFailed'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">{t('instances.title')}</h1>
        <div className="flex flex-wrap gap-2">
          {isDemoMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleResetDemo}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  {t('instances.resetDemo')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('instances.resetDemoTip')}</TooltipContent>
            </Tooltip>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? 'animate-spin' : ''}`} />
            {t('instances.sync')}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('instances.create')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="w-full sm:flex-1 sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('instances.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select
              value={filters.provider || ''}
              onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value || undefined }))}
              className="w-full sm:w-[140px]"
            >
              <option value="">{t('instances.allProviders')}</option>
              {(providersData?.providers || []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            <Select
              value={filters.status || ''}
              onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as InstanceStatus | undefined }))}
              className="w-full sm:w-[140px]"
            >
              <option value="">{t('instances.allStatus')}</option>
              <option value="running">{t('instances.running')}</option>
              <option value="stopped">{t('instances.stopped')}</option>
              <option value="terminated">{t('instances.terminated')}</option>
              <option value="pending">{t('instances.pending')}</option>
              <option value="error">{t('instances.error')}</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">{t('common.name')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.provider')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.region')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.status')}</TableHead>
                    <TableHead className="w-[100px]">{t('instances.spec')}</TableHead>
                    <TableHead className="w-[140px]">{t('instances.ip')}</TableHead>
                    <TableHead className="w-[120px]">{t('instances.monthlyCost')}</TableHead>
                    <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inst) => (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium">
                        {inst.name || inst.providerInstanceId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{inst.provider}</TableCell>
                      <TableCell>{inst.region}</TableCell>
                      <TableCell><InstanceStatusBadge status={inst.status} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {inst.cpu ? `${inst.cpu}C/${inst.memoryMb ? inst.memoryMb / 1024 : '?'}G` : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {inst.publicIp || inst.privateIp || '-'}
                      </TableCell>
                      <TableCell>
                        {inst.monthlyCost ? `¥${parseFloat(inst.monthlyCost).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inst.status === 'stopped' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleAction(inst.id, 'start')}>
                                  <Play className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('tooltip.start')}</TooltipContent>
                            </Tooltip>
                          )}
                          {inst.status === 'running' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleAction(inst.id, 'stop')}>
                                  <Square className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('tooltip.stop')}</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleAction(inst.id, 'reboot')}>
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('tooltip.reboot')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(inst.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('tooltip.delete')}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateInstanceDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('instances.confirmDeleteTitle')}
        description={t('instances.confirmDeleteDesc')}
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
          <Button variant="destructive" onClick={() => confirmDelete && handleAction(confirmDelete, 'delete')}>
            {t('instances.confirmDelete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: providersData } = useProviders();
  const [provider, setProvider] = useState('');
  const [region, setRegion] = useState('');
  const [name, setName] = useState('');
  const [imageId, setImageId] = useState('');
  const [instanceType, setInstanceType] = useState('');

  const { data: regions } = useRegions(provider || undefined);
  const { data: images } = useImages(provider || undefined);
  const { data: types } = useInstanceTypes(provider || undefined, region || undefined);
  const create = useCreateInstance();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ provider, region, name, imageId, instanceType });
      onClose();
      setProvider(''); setRegion(''); setName(''); setImageId(''); setInstanceType('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.createFailed'));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('instances.createDialogTitle')} description={t('instances.createDialogDesc')}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>{t('instances.providerLabel')}</Label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setRegion(''); }} required>
            <option value="">{t('instances.pleaseSelect')}</option>
            {(providersData?.providers || []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('instances.regionLabel')}</Label>
          <Select value={region} onChange={(e) => setRegion(e.target.value)} required disabled={!provider}>
            <option value="">{t('instances.pleaseSelect')}</option>
            {(regions || []).map((r) => (
              <option key={r.id} value={r.id}>{r.displayName}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('instances.nameLabel')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-instance" required />
        </div>
        <div className="space-y-2">
          <Label>{t('instances.imageLabel')}</Label>
          <Select value={imageId} onChange={(e) => setImageId(e.target.value)} required disabled={!provider}>
            <option value="">{t('instances.pleaseSelect')}</option>
            {(images || []).map((img) => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('instances.typeLabel')}</Label>
          <Select value={instanceType} onChange={(e) => setInstanceType(e.target.value)} required disabled={!provider || !region}>
            <option value="">{t('instances.pleaseSelect')}</option>
            {(types || []).map((ty) => (
              <option key={ty.id} value={ty.id}>{ty.name} ({ty.cpu}C/{ty.memoryMb}MB)</option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? t('common.creating') : t('common.create')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
