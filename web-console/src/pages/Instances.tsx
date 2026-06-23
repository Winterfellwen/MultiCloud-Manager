import { useState } from 'react';
import { useInstances, useInstanceAction, useSyncInstances, useProviders, useRegions, useInstanceTypes, useImages, useCreateInstance } from '@/hooks/useInstances';
import { useDemoStore } from '@/stores/demo';
import { demoResetAll } from '@/lib/demo/demo-api';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import type { InstanceStatus } from '@/types/cloud';
import { Plus, RefreshCw, Search, Play, Square, RotateCw, Trash2, RotateCcw } from 'lucide-react';

export default function Instances() {
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

  const filtered = (instances || []).filter((inst) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (inst.name?.toLowerCase().includes(s)) ||
      (inst.providerInstanceId?.toLowerCase().includes(s)) ||
      (inst.publicIp?.includes(s)) ||
      (inst.region?.toLowerCase().includes(s))
    );
  });

  async function handleAction(id: string, act: 'start' | 'stop' | 'reboot' | 'delete') {
    try {
      await action.mutateAsync({ id, action: act });
      setConfirmDelete(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  async function handleSync() {
    try {
      await sync.mutateAsync(undefined);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '同步失败');
    }
  }

  async function handleResetDemo() {
    if (!confirm('确定要还原所有 Demo 数据吗？这将清除所有修改并恢复初始状态。')) return;
    try {
      await demoResetAll();
      qc.invalidateQueries({ queryKey: ['instances'] });
    } catch (err) {
      alert('还原失败');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">云服务器管理</h1>
        <div className="flex gap-2">
          {isDemoMode && (
            <Button variant="outline" size="sm" onClick={handleResetDemo} title="还原 Demo 数据">
              <RotateCcw className="h-4 w-4 mr-1" />
              还原 Demo
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? 'animate-spin' : ''}`} />
            同步
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            创建实例
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索名称/ID/IP/区域..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select
              value={filters.provider || ''}
              onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value || undefined }))}
              className="w-[140px]"
            >
              <option value="">全部云厂商</option>
              {(providersData?.providers || []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            <Select
              value={filters.status || ''}
              onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as InstanceStatus | undefined }))}
              className="w-[140px]"
            >
              <option value="">全部状态</option>
              <option value="running">运行中</option>
              <option value="stopped">已停止</option>
              <option value="terminated">已终止</option>
              <option value="pending">启动中</option>
              <option value="error">错误</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无实例</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>云厂商</TableHead>
                  <TableHead>区域</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>规格</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>月费用</TableHead>
                  <TableHead>操作</TableHead>
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
                          <Button variant="ghost" size="icon" title="启动" onClick={() => handleAction(inst.id, 'start')}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {inst.status === 'running' && (
                          <Button variant="ghost" size="icon" title="停止" onClick={() => handleAction(inst.id, 'stop')}>
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="重启" onClick={() => handleAction(inst.id, 'reboot')}>
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="删除" onClick={() => setConfirmDelete(inst.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateInstanceDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="确认删除"
        description="此操作不可撤销，确定要删除该实例吗？"
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
          <Button variant="destructive" onClick={() => confirmDelete && handleAction(confirmDelete, 'delete')}>
            确认删除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      alert(err instanceof ApiError ? err.message : '创建失败');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="创建实例" description="选择云厂商、区域和规格创建新实例">
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>云厂商</Label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setRegion(''); }} required>
            <option value="">请选择</option>
            {(providersData?.providers || []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>区域</Label>
          <Select value={region} onChange={(e) => setRegion(e.target.value)} required disabled={!provider}>
            <option value="">请选择</option>
            {(regions || []).map((r) => (
              <option key={r.id} value={r.id}>{r.displayName}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>实例名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-instance" required />
        </div>
        <div className="space-y-2">
          <Label>镜像</Label>
          <Select value={imageId} onChange={(e) => setImageId(e.target.value)} required disabled={!provider}>
            <option value="">请选择</option>
            {(images || []).map((img) => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>实例规格</Label>
          <Select value={instanceType} onChange={(e) => setInstanceType(e.target.value)} required disabled={!provider || !region}>
            <option value="">请选择</option>
            {(types || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.cpu}C/{t.memoryMb}MB)</option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? '创建中...' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
