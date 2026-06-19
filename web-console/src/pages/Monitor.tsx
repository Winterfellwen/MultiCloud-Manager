import { useState } from 'react';
import { useAlertRules, useCreateAlertRule, useDeleteAlertRule, useAlertEvents, useResolveAlertEvent } from '@/hooks/useAlerts';
import { useChannels, useCreateChannel, useDeleteChannel } from '@/hooks/useChannels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { AlertSeverityBadge, AlertStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import type { AlertSeverity, AlertActionType, ChannelType } from '@/types/monitor';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'rules' | 'events' | 'channels';

export default function Monitor() {
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">监控告警</h1>

      <div className="border-b">
        <div className="flex gap-4">
          {([
            { key: 'rules' as const, label: '告警规则' },
            { key: 'events' as const, label: '告警事件' },
            { key: 'channels' as const, label: '通知渠道' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rules' && <RulesTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'channels' && <ChannelsTab />}
    </div>
  );
}

function RulesTab() {
  const { data: rules, isLoading } = useAlertRules();
  const del = useDeleteAlertRule();
  const [createOpen, setCreateOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm('确定删除此规则？')) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">告警规则</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />新建规则
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (rules || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无规则</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>指标</TableHead>
                <TableHead>条件</TableHead>
                <TableHead>持续时间</TableHead>
                <TableHead>严重级别</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules || []).map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{rule.metric}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.condition}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.duration}</TableCell>
                  <TableCell><AlertSeverityBadge severity={rule.severity as AlertSeverity} /></TableCell>
                  <TableCell>
                    <span className={rule.enabled ? 'text-green-600' : 'text-muted-foreground'}>
                      {rule.enabled ? '已启用' : '已禁用'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="删除" onClick={() => handleDelete(rule.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateRuleDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

function CreateRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAlertRule();
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('cpu_usage');
  const [condition, setCondition] = useState('> 80');
  const [duration, setDuration] = useState('5m');
  const [severity, setSeverity] = useState<AlertSeverity>('warning');
  const [actionType, setActionType] = useState<AlertActionType>('notify');
  const [actionTargets, setActionTargets] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        name, metric, condition, duration, severity,
        actions: [{ type: actionType, targets: actionTargets.split(',').map((s) => s.trim()).filter(Boolean) }],
      });
      onClose();
      setName(''); setMetric('cpu_usage'); setCondition('> 80'); setDuration('5m');
      setSeverity('warning'); setActionType('notify'); setActionTargets('');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '创建失败');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="新建告警规则">
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>规则名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="CPU 使用率告警" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>指标</Label>
            <Input value={metric} onChange={(e) => setMetric(e.target.value)} required placeholder="cpu_usage" />
          </div>
          <div className="space-y-2">
            <Label>条件</Label>
            <Input value={condition} onChange={(e) => setCondition(e.target.value)} required placeholder="> 80" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>持续时间</Label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} required placeholder="5m" />
          </div>
          <div className="space-y-2">
            <Label>严重级别</Label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity)}>
              <option value="info">信息</option>
              <option value="warning">警告</option>
              <option value="critical">严重</option>
              <option value="emergency">紧急</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>动作类型</Label>
            <Select value={actionType} onChange={(e) => setActionType(e.target.value as AlertActionType)}>
              <option value="notify">通知</option>
              <option value="suggest">建议</option>
              <option value="auto">自动处理</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>目标（逗号分隔）</Label>
            <Input value={actionTargets} onChange={(e) => setActionTargets(e.target.value)} placeholder="channel-1,channel-2" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? '创建中...' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EventsTab() {
  const { data: events, isLoading } = useAlertEvents();
  const resolve = useResolveAlertEvent();

  async function handleResolve(id: string) {
    try {
      await resolve.mutateAsync(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-4">告警事件</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (events || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无告警事件</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>严重级别</TableHead>
                <TableHead>消息</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>触发时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(events || []).map((evt) => (
                <TableRow key={evt.id}>
                  <TableCell><AlertSeverityBadge severity={evt.severity as AlertSeverity} /></TableCell>
                  <TableCell className="max-w-md truncate">{evt.message}</TableCell>
                  <TableCell><AlertStatusBadge status={evt.status as any} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(evt.firedAt).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>
                    {evt.status === 'firing' && (
                      <Button variant="ghost" size="sm" onClick={() => handleResolve(evt.id)}>
                        <CheckCircle className="h-4 w-4 mr-1" />解决
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelsTab() {
  const { data: channels, isLoading } = useChannels();
  const del = useDeleteChannel();
  const [createOpen, setCreateOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm('确定删除此渠道？')) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">通知渠道</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />新建渠道
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (channels || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无渠道</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(channels || []).map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="font-medium">{ch.name}</TableCell>
                  <TableCell>{ch.type}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-xs truncate">
                    {JSON.stringify(ch.config)}
                  </TableCell>
                  <TableCell>
                    <span className={ch.enabled ? 'text-green-600' : 'text-muted-foreground'}>
                      {ch.enabled ? '已启用' : '已禁用'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="删除" onClick={() => handleDelete(ch.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateChannelDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

function CreateChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateChannel();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('webhook');
  const [config, setConfig] = useState('{\n  "url": "https://example.com/webhook"\n}');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const parsedConfig = JSON.parse(config);
      await create.mutateAsync({ name, type, config: parsedConfig });
      onClose();
      setName(''); setType('webhook'); setConfig('{\n  "url": "https://example.com/webhook"\n}');
    } catch (err) {
      if (err instanceof SyntaxError) {
        alert('配置 JSON 格式错误');
      } else {
        alert(err instanceof ApiError ? err.message : '创建失败');
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="新建通知渠道">
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>渠道名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="运维通知群" />
        </div>
        <div className="space-y-2">
          <Label>类型</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
            <option value="webhook">Webhook</option>
            <option value="email">邮件</option>
            <option value="slack">Slack</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>配置（JSON）</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px]"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? '创建中...' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
