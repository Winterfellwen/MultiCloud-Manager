import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAlertRules, useCreateAlertRule, useUpdateAlertRule, useDeleteAlertRule, useAlertEvents, useResolveAlertEvent } from '@/hooks/useAlerts';
import { useChannels, useCreateChannel, useDeleteChannel } from '@/hooks/useChannels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AlertSeverityBadge, AlertStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import type { AlertSeverity, AlertActionType, ChannelType } from '@/types/monitor';
import { Plus, Trash2, CheckCircle, Pencil, Brain, ChevronDown, ChevronRight as ChevronR } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'rules' | 'events' | 'channels';

export default function Monitor() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t('monitor.title')}</h1>

      <div className="border-b">
        <div className="flex gap-4 overflow-x-auto">
          {([
            { key: 'rules' as const, label: t('monitor.tabRules') },
            { key: 'events' as const, label: t('monitor.tabEvents') },
            { key: 'channels' as const, label: t('monitor.tabChannels') },
          ]).map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                'pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                tab === tabItem.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tabItem.label}
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
  const { t } = useTranslation();
  const { data: rules, isLoading } = useAlertRules();
  const del = useDeleteAlertRule();
  const updateRule = useUpdateAlertRule();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  async function handleDelete(id: string) {
    if (!confirm(t('monitor.confirmDeleteRule'))) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('monitor.deleteFailed'));
    }
  }

  async function handleToggleEnabled(rule: any) {
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        params: { enabled: !rule.enabled },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('monitor.updateFailed'));
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('monitor.rulesTitle')}</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('monitor.createRule')}
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : (rules || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('monitor.noRules')}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">{t('common.name')}</TableHead>
                  <TableHead className="w-[140px]">{t('monitor.metric')}</TableHead>
                  <TableHead className="w-[120px]">{t('monitor.condition')}</TableHead>
                  <TableHead className="w-[100px]">{t('monitor.duration')}</TableHead>
                  <TableHead className="w-[100px]">{t('monitor.severity')}</TableHead>
                  <TableHead className="w-[100px]">{t('common.enabled')}</TableHead>
                  <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
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
                      <button
                        onClick={() => handleToggleEnabled(rule)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          rule.enabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setEditingRule(rule)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.edit')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
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
      <CreateRuleDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editingRule && (
        <CreateRuleDialog
          open={!!editingRule}
          onClose={() => setEditingRule(null)}
          editingRule={editingRule}
        />
      )}
    </Card>
  );
}

function CreateRuleDialog({ open, onClose, editingRule }: { open: boolean; onClose: () => void; editingRule?: any }) {
  const { t } = useTranslation();
  const create = useCreateAlertRule();
  const updateRule = useUpdateAlertRule();
  const [name, setName] = useState(editingRule?.name || '');
  const [metric, setMetric] = useState(editingRule?.metric || 'cpu_usage');
  const [condition, setCondition] = useState(editingRule?.condition || '> 80');
  const [duration, setDuration] = useState(editingRule?.duration || '5m');
  const [severity, setSeverity] = useState<AlertSeverity>(editingRule?.severity || 'warning');
  const [actionType, setActionType] = useState<AlertActionType>(editingRule?.actions?.[0]?.type || 'notify');
  const [actionTargets, setActionTargets] = useState(editingRule?.actions?.[0]?.targets?.join(', ') || '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingRule) {
        await updateRule.mutateAsync({
          id: editingRule.id,
          params: {
            name, metric, condition, duration, severity,
            actions: [{ type: actionType, targets: actionTargets.split(',').map((s: string) => s.trim()).filter(Boolean) }],
          },
        });
      } else {
        await create.mutateAsync({
          name, metric, condition, duration, severity,
          actions: [{ type: actionType, targets: actionTargets.split(',').map((s: string) => s.trim()).filter(Boolean) }],
        });
      }
      onClose();
      if (!editingRule) {
        setName(''); setMetric('cpu_usage'); setCondition('> 80'); setDuration('5m');
        setSeverity('warning'); setActionType('notify'); setActionTargets('');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('monitor.createFailed'));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={editingRule ? t('monitor.editRuleTitle') : t('monitor.createRuleTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>{t('monitor.ruleName')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('monitor.ruleNamePlaceholder')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('monitor.metric')}</Label>
            <Input value={metric} onChange={(e) => setMetric(e.target.value)} required placeholder={t('monitor.metricPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('monitor.condition')}</Label>
            <Input value={condition} onChange={(e) => setCondition(e.target.value)} required placeholder={t('monitor.conditionPlaceholder')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('monitor.duration')}</Label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} required placeholder={t('monitor.durationPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('monitor.severity')}</Label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity)}>
              <option value="info">{t('monitor.severityInfo')}</option>
              <option value="warning">{t('monitor.severityWarning')}</option>
              <option value="critical">{t('monitor.severityCritical')}</option>
              <option value="emergency">{t('monitor.severityEmergency')}</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('monitor.actionType')}</Label>
            <Select value={actionType} onChange={(e) => setActionType(e.target.value as AlertActionType)}>
              <option value="notify">{t('monitor.actionNotify')}</option>
              <option value="suggest">{t('monitor.actionSuggest')}</option>
              <option value="auto">{t('monitor.actionAuto')}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('monitor.actionTargets')}</Label>
            <Input value={actionTargets} onChange={(e) => setActionTargets(e.target.value)} placeholder="channel-1,channel-2" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? t('common.creating') : t('common.create')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EventsTab() {
  const { t } = useTranslation();
  const { data: events, isLoading } = useAlertEvents();
  const resolve = useResolveAlertEvent();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleResolve(id: string) {
    try {
      await resolve.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('monitor.opFailed'));
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-4">{t('monitor.eventsTitle')}</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : (events || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('monitor.noEvents')}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[100px]">{t('monitor.severity')}</TableHead>
                  <TableHead className="w-[200px]">{t('monitor.message')}</TableHead>
                  <TableHead className="w-[100px]">{t('common.status')}</TableHead>
                  <TableHead className="w-[160px]">{t('monitor.firedAt')}</TableHead>
                  <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events || []).map((evt) => (
                  <React.Fragment key={evt.id}>
                    <TableRow>
                      <TableCell>
                        {evt.aiAnalysis && (
                          <button
                            onClick={() => setExpandedId(expandedId === evt.id ? null : evt.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {expandedId === evt.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronR className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell><AlertSeverityBadge severity={evt.severity as AlertSeverity} /></TableCell>
                      <TableCell className="text-sm">{evt.message}</TableCell>
                      <TableCell><AlertStatusBadge status={evt.status as any} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(evt.firedAt).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {evt.aiAnalysis && (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-600">
                              <Brain className="h-3 w-3" />
                              AI
                            </span>
                          )}
                          {evt.status === 'firing' && (
                            <Button variant="ghost" size="sm" onClick={() => handleResolve(evt.id)}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === evt.id && evt.aiAnalysis && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="space-y-2 py-3">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <Brain className="h-4 w-4 text-purple-600" />
                              {t('monitor.aiAnalysis')}
                              {evt.aiAnalyzedAt && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  {new Date(evt.aiAnalyzedAt).toLocaleString('zh-CN')}
                                </span>
                              )}
                            </div>
                            <pre className="whitespace-pre-wrap rounded bg-background p-3 text-xs font-mono">
                              {evt.aiAnalysis}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelsTab() {
  const { t } = useTranslation();
  const { data: channels, isLoading } = useChannels();
  const del = useDeleteChannel();
  const [createOpen, setCreateOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm(t('monitor.confirmDeleteChannel'))) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('monitor.deleteFailed'));
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('monitor.channelsTitle')}</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('monitor.createChannel')}
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
        ) : (channels || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('monitor.noChannels')}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">{t('common.name')}</TableHead>
                  <TableHead className="w-[100px]">{t('monitor.type')}</TableHead>
                  <TableHead className="w-[200px]">{t('monitor.config')}</TableHead>
                  <TableHead className="w-[100px]">{t('common.enabled')}</TableHead>
                  <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
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
                        {ch.enabled ? t('common.enabled') : t('common.disabled')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(ch.id)}>
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
      <CreateChannelDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

function CreateChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
        toast.error(t('monitor.jsonError'));
      } else {
        toast.error(err instanceof ApiError ? err.message : t('monitor.createFailed'));
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('monitor.createChannelTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>{t('monitor.channelName')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('monitor.channelNamePlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('monitor.type')}</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
            <option value="webhook">{t('monitor.typeWebhook')}</option>
            <option value="email">{t('monitor.typeEmail')}</option>
            <option value="slack">{t('monitor.typeSlack')}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('monitor.configJson')}</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px]"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? t('common.creating') : t('common.create')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
