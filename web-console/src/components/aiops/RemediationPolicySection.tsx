import { useState, useEffect } from 'react';
import { useRemediationPolicies, useCreateRemediationPolicy, useUpdateRemediationPolicy, useDeleteRemediationPolicy } from '@/hooks/useRemediation';
import type { RemediationPolicy } from '@/types/monitor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const ACTION_OPTIONS = [
  { value: 'reboot_instance', label: '重启实例' },
  { value: 'stop_instance', label: '停止实例' },
  { value: 'scale_up', label: '扩容实例' },
  { value: 'restart_service', label: '重启服务' },
  { value: 'clear_cache', label: '清理缓存' },
  { value: 'failover', label: '故障转移' },
];

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: '全部资源' },
  { value: 'instance', label: '云服务器' },
  { value: 'disk', label: '云磁盘' },
  { value: 'database', label: '数据库' },
  { value: 'cache', label: '缓存' },
  { value: 'loadbalancer', label: '负载均衡' },
  { value: 'bucket', label: '对象存储' },
  { value: 'vpc', label: '虚拟网络' },
  { value: 'securitygroup', label: '安全组' },
];

const ENV_KEYS = ['dev', 'uat', 'prod'] as const;

export default function RemediationPolicySection() {
  const { data: policies, isLoading } = useRemediationPolicies();
  const deleteMutation = useDeleteRemediationPolicy();
  const [editTarget, setEditTarget] = useState<RemediationPolicy | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RemediationPolicy | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('策略已删除');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const getActionLabel = (actionType: string) =>
    ACTION_OPTIONS.find((a) => a.value === actionType)?.label || actionType;

  const getResourceLabel = (resourceType: string | null) =>
    RESOURCE_TYPE_OPTIONS.find((r) => r.value === (resourceType || ''))?.label || '全部';

  if (isLoading) return null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">自愈策略配置</h2>
            <p className="text-sm text-muted-foreground mt-1">
              配置每个动作在不同环境下的执行策略。点击编辑可修改策略详情。
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditTarget(null); setDialogMode('create'); }}>
            <Plus className="h-4 w-4 mr-1" />新增策略
          </Button>
        </div>

        {policies && policies.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead>动作</TableHead>
                  <TableHead>资源类型</TableHead>
                  <TableHead className="w-[120px]">自动执行</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => {
                  const activeEnvs = ENV_KEYS.filter((env) => policy.autoExecute[env]);
                  return (
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">{getActionLabel(policy.actionType)}</TableCell>
                      <TableCell className="text-muted-foreground">{getResourceLabel(policy.resourceType)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {activeEnvs.length > 0 ? activeEnvs.join(', ') : '无'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => { setEditTarget(policy); setDialogMode('edit'); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(policy)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>删除</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {policies && policies.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">暂无策略，点击"新增策略"添加</div>
        )}
      </CardContent>

      <PolicyDialog
        open={dialogMode !== null}
        mode={dialogMode || 'create'}
        policy={editTarget}
        onClose={() => { setDialogMode(null); setEditTarget(null); }}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-muted-foreground mb-4">
          确定要删除策略「{deleteTarget && getActionLabel(deleteTarget.actionType)}」吗？此操作不可恢复。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? '删除中...' : '删除'}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

function PolicyDialog({ open, mode, policy, onClose }: {
  open: boolean;
  mode: 'create' | 'edit';
  policy: RemediationPolicy | null;
  onClose: () => void;
}) {
  const createMutation = useCreateRemediationPolicy();
  const updateMutation = useUpdateRemediationPolicy();
  const isEdit = mode === 'edit' && policy;

  const [name, setName] = useState('');
  const [actionType, setActionType] = useState('reboot_instance');
  const [resourceType, setResourceType] = useState('');
  const [autoExecute, setAutoExecute] = useState<Record<string, boolean>>({ dev: false, uat: false, prod: false });

  useEffect(() => {
    if (open) {
      if (isEdit) {
        setName(policy.name || '');
        setActionType(policy.actionType);
        setResourceType(policy.resourceType || '');
        setAutoExecute({ dev: false, uat: false, prod: false, ...policy.autoExecute });
      } else {
        setName('');
        setActionType('reboot_instance');
        setResourceType('');
        setAutoExecute({ dev: false, uat: false, prod: false });
      }
    }
  }, [open, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = ACTION_OPTIONS.find((a) => a.value === actionType)?.label || actionType;
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: policy.id,
          params: {
            name: name || label,
            actionType,
            resourceType: resourceType || null,
            autoExecute,
          },
        });
        toast.success('策略已更新');
      } else {
        await createMutation.mutateAsync({
          name: name || label,
          actionType,
          resourceType: resourceType || null,
          autoExecute,
        });
        toast.success('策略已创建');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isEdit ? '更新失败' : '创建失败'));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑自愈策略' : '新增自愈策略'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>动作类型</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            required
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>策略名称（可选）</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ACTION_OPTIONS.find((a) => a.value === actionType)?.label}
          />
        </div>

        <div className="space-y-2">
          <Label>资源类型</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          >
            {RESOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>自动执行环境</Label>
          <p className="text-xs text-muted-foreground">勾选后，该环境下的告警将自动执行此动作，无需人工确认。</p>
          <div className="flex gap-4 mt-2">
            {ENV_KEYS.map((env) => (
              <label key={env} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoExecute[env] || false}
                  onChange={(e) => setAutoExecute({ ...autoExecute, [env]: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                {env}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={isEdit ? updateMutation.isPending : createMutation.isPending}>
            {isEdit
              ? (updateMutation.isPending ? '保存中...' : '保存')
              : (createMutation.isPending ? '创建中...' : '创建')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
