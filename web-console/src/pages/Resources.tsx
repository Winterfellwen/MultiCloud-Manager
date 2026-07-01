import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useResources,
  useResourceTypes,
  useResourceStats,
  useDeleteResource,
  useSyncResources,
} from '@/hooks/useResources';
import { useInstances, useInstanceAction, useSyncInstances, useCreateInstance, useProviders, useRegions, useInstanceTypes, useImages } from '@/hooks/useInstances';
import { ResourceTypeNav } from '@/components/ResourceTypeNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getStatusColor, type ResourceType } from '@/types/resource';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import { toast } from 'sonner';
import { Search, RefreshCw, Trash2, RotateCcw, Play, Square, Server, LayoutGrid, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const PROVIDERS = ['aws', 'aliyun', 'azure', 'tencent', 'huawei'];

/** 类型相关列定义 */
interface ColumnDef {
  key: string;
  label: string;
  render: (attrs: Record<string, unknown>) => ReactNode;
}

function attr(attrs: Record<string, unknown>, key: string): string {
  const v = attrs[key];
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

/** 不同资源类型动态展示的额外列 */
const COLUMN_DEFS: Partial<Record<ResourceType, ColumnDef[]>> = {
  instance: [
    { key: 'spec', label: '规格', render: (a) => {
      const cpu = a.cpu; const mem = a.memoryMb;
      if (!cpu && !mem) return '-';
      return `${cpu || '?'}C/${mem ? Math.round(Number(mem) / 1024) : '?'}G`;
    } },
    { key: 'ip', label: 'IP', render: (a) => String(a.publicIp || a.privateIp || '-') },
  ],
  disk: [
    { key: 'size', label: '容量', render: (a) => a.sizeGb ? `${a.sizeGb}GB` : '-' },
    { key: 'diskType', label: '类型', render: (a) => attr(a, 'diskType') },
  ],
  database: [
    { key: 'engine', label: '引擎', render: (a) => a.engine ? `${a.engine} ${a.engineVersion || ''}` : '-' },
    { key: 'class', label: '规格', render: (a) => attr(a, 'instanceClass') },
  ],
  cache: [
    { key: 'engine', label: '引擎', render: (a) => a.engine ? `${a.engine} ${a.engineVersion || ''}` : '-' },
    { key: 'class', label: '规格', render: (a) => attr(a, 'instanceClass') },
  ],
  bucket: [
    { key: 'objectCount', label: '对象数', render: (a) => a.objectCount ? Number(a.objectCount).toLocaleString() : '-' },
    { key: 'size', label: '大小', render: (a) => a.sizeBytes ? formatBytes(Number(a.sizeBytes)) : '-' },
  ],
  loadbalancer: [
    { key: 'lbType', label: '类型', render: (a) => attr(a, 'type') },
    { key: 'dns', label: 'DNS', render: (a) => attr(a, 'dnsName') },
  ],
  vpc: [{ key: 'cidr', label: 'CIDR', render: (a) => attr(a, 'cidrBlock') }],
  cluster: [
    { key: 'version', label: '版本', render: (a) => attr(a, 'kubernetesVersion') },
    { key: 'nodeCount', label: '节点数', render: (a) => attr(a, 'nodeCount') },
  ],
  aiservice: [
    { key: 'kind', label: '类型', render: (a) => attr(a, 'kind') || attr(a, 'serviceKind') },
    { key: 'sku', label: 'SKU', render: (a) => attr(a, 'skuName') },
    { key: 'endpoint', label: '端点', render: (a) => attr(a, 'endpoint') },
  ],
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function Resources() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'instances'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: types } = useResourceTypes();
  const { data: stats } = useResourceStats();
  const { data: result, isLoading } = useResources({
    resourceType: selectedType === 'all' ? undefined : selectedType,
    provider: provider || undefined,
    status: status || undefined,
    search: search || undefined,
    limit: 100,
  }, { enabled: viewMode === 'all' });
  const del = useDeleteResource();
  const sync = useSyncResources();

  const { data: instances, isLoading: instancesLoading } = useInstances({}, { enabled: viewMode === 'instances' });
  const instanceAction = useInstanceAction();
  const syncInstances = useSyncInstances();

  const items = result?.items || [];
  const extraCols = useMemo(() =>
    selectedType !== 'all' ? COLUMN_DEFS[selectedType] || [] : [],
    [selectedType]
  );

  async function handleDelete(id: string) {
    try {
      await del.mutateAsync(id);
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('resources.deleteFailed'));
    }
  }

  async function handleSync() {
    try {
      await sync.mutateAsync({
        resourceType: selectedType === 'all' ? undefined : selectedType,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('resources.syncFailed'));
    }
  }

  async function handleInstanceAction(id: string, act: 'start' | 'stop' | 'reboot' | 'delete') {
    try {
      await instanceAction.mutateAsync({ id, action: act });
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.opFailed'));
    }
  }

  async function handleSyncInstances() {
    try {
      await syncInstances.mutateAsync(undefined);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('instances.syncFailed'));
    }
  }

  const filteredInstances = useMemo(() => {
    if (!instances) return [];
    return instances.filter((inst) => {
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

  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav className="w-full shrink-0 border-b bg-card overflow-x-auto md:w-56 md:border-b-0 md:border-r md:overflow-y-auto">
        <div className="p-3 space-y-1">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            {t('resources.title')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('instances')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === 'instances'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Server className="h-4 w-4" />
            {t('instances.title')}
          </button>
        </div>

        {viewMode === 'all' && (
          <ResourceTypeNav
            types={types || []}
            stats={stats}
            selected={selectedType}
            onSelect={setSelectedType}
          />
        )}

        {viewMode === 'instances' && (
          <div className="p-3 space-y-1 md:block hidden">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(provider === p ? '' : p)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                  provider === p
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span className="truncate">{p}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mobile: provider chips for instances */}
        {viewMode === 'instances' && (
          <div className="flex gap-1 px-3 pb-3 md:hidden">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(provider === p ? '' : p)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                  provider === p
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="flex-1 space-y-6 overflow-auto p-3 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">
            {viewMode === 'instances' ? t('instances.title') : t('resources.title')}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={viewMode === 'instances' ? handleSyncInstances : handleSync}
              disabled={viewMode === 'instances' ? syncInstances.isPending : sync.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${(viewMode === 'instances' ? syncInstances.isPending : sync.isPending) ? 'animate-spin' : ''}`}
              />
              {viewMode === 'instances' ? t('instances.sync') : t('resources.sync')}
            </Button>
            {viewMode === 'instances' && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t('instances.create')}
              </Button>
            )}
          </div>
        </div>

        {/* Resources view */}
        {viewMode === 'all' && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <div className="w-full sm:flex-1 sm:min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('resources.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <Select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full sm:w-[140px]"
                  >
                    <option value="">{t('resources.allProviders')}</option>
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full sm:w-[140px]"
                  >
                    <option value="">{t('resources.allStatus')}</option>
                    <option value="running">{t('resources.running')}</option>
                    <option value="stopped">{t('resources.stopped')}</option>
                    <option value="pending">{t('resources.pending')}</option>
                    <option value="error">{t('resources.error')}</option>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
                ) : items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">{t('resources.noResources')}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[600px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">{t('common.name')}</TableHead>
                          <TableHead className="w-[100px]">{t('common.providerShort')}</TableHead>
                          <TableHead className="w-[100px]">{t('common.region')}</TableHead>
                          <TableHead className="w-[100px]">{t('common.status')}</TableHead>
                          {extraCols.map((c) => (
                            <TableHead key={c.key} className="w-[120px]">{c.label}</TableHead>
                          ))}
                          <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((r) => (
                          <TableRow
                            key={r.id}
                            className={r.resourceType === 'instance' ? 'cursor-pointer hover:bg-muted/50' : ''}
                            onClick={r.resourceType === 'instance' ? () => navigate(`/instances/${r.id}`) : undefined}
                          >
                            <TableCell className="font-medium">
                              {r.name || r.id.slice(0, 8)}
                            </TableCell>
                            <TableCell>{r.provider}</TableCell>
                            <TableCell>{r.region}</TableCell>
                            <TableCell>
                              <Badge variant={getStatusColor(r.status)}>{r.status}</Badge>
                            </TableCell>
                            {extraCols.map((c) => (
                              <TableCell key={c.key} className="text-muted-foreground">
                                {c.render(r.attributes || {})}
                              </TableCell>
                            ))}
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setConfirmDelete(r.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('tooltip.delete')}</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Instances view */}
        {viewMode === 'instances' && (
          <>
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
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
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
                {instancesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
                ) : filteredInstances.length === 0 ? (
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
                        {filteredInstances.map((inst) => (
                          <TableRow
                            key={inst.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/instances/${inst.id}`)}
                          >
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
                                      <Button variant="ghost" size="icon" onClick={() => handleInstanceAction(inst.id, 'start')}>
                                        <Play className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('tooltip.start')}</TooltipContent>
                                  </Tooltip>
                                )}
                                {inst.status === 'running' && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleInstanceAction(inst.id, 'stop')}>
                                        <Square className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('tooltip.stop')}</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleInstanceAction(inst.id, 'reboot')}>
                                      <RotateCcw className="h-4 w-4" />
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
          </>
        )}
      </div>

      {viewMode === 'all' && (
        <Dialog
          open={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title={t('resources.confirmDeleteTitle')}
          description={t('resources.confirmDeleteDesc')}
        >
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              {t('resources.confirmDelete')}
            </Button>
          </div>
        </Dialog>
      )}

      {viewMode === 'instances' && (
        <Dialog
          open={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title={t('instances.confirmDeleteTitle')}
          description={t('instances.confirmDeleteDesc')}
        >
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleInstanceAction(confirmDelete, 'delete')}>
              {t('instances.confirmDelete')}
            </Button>
          </div>
        </Dialog>
      )}

      <CreateInstanceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
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
