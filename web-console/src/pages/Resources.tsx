import { useState, useMemo, type ReactNode } from 'react';
import {
  useResources,
  useResourceTypes,
  useResourceStats,
  useDeleteResource,
  useSyncResources,
} from '@/hooks/useResources';
import { ResourceTypeNav } from '@/components/ResourceTypeNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { getStatusColor, type ResourceType } from '@/types/resource';
import { ApiError } from '@/api/client';
import { Search, RefreshCw, Trash2 } from 'lucide-react';

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
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: types } = useResourceTypes();
  const { data: stats } = useResourceStats();
  const { data: result, isLoading } = useResources({
    resourceType: selectedType === 'all' ? undefined : selectedType,
    provider: provider || undefined,
    status: status || undefined,
    search: search || undefined,
    limit: 100,
  });
  const del = useDeleteResource();
  const sync = useSyncResources();

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
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  async function handleSync() {
    try {
      await sync.mutateAsync({
        resourceType: selectedType === 'all' ? undefined : selectedType,
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '同步失败');
    }
  }

  return (
    <div className="flex h-full">
      <ResourceTypeNav
        types={types || []}
        stats={stats}
        selected={selectedType}
        onSelect={setSelectedType}
      />

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">资源总览</h1>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? 'animate-spin' : ''}`} />
            同步
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索资源名称/ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-[140px]"
              >
                <option value="">全部厂商</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-[140px]"
              >
                <option value="">全部状态</option>
                <option value="running">运行中</option>
                <option value="stopped">已停止</option>
                <option value="pending">处理中</option>
                <option value="error">错误</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">暂无资源</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>厂商</TableHead>
                    <TableHead>区域</TableHead>
                    <TableHead>状态</TableHead>
                    {extraCols.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          title="删除"
                          onClick={() => setConfirmDelete(r.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="确认删除"
        description="此操作不可撤销，确定要删除该资源吗？"
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
          >
            确认删除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
