// 云厂商账号管理页：添加/编辑/删除/测试云账号
// 参考 MultiCloud-Manager 的声明式字段配置设计，从后端获取厂商元数据动态渲染表单
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cloudApi } from '@/api/cloud';
import { useDemoStore } from '@/stores/demo';
import { demoListCloudAccounts } from '@/lib/demo/demo-api';
import type { CloudAccount, ProviderMeta, TestConnectionResult } from '@/types/cloud';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Cloud, Plus, Pencil, Trash2, CheckCircle2, XCircle, Loader2,
  Zap, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CloudAccounts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    provider: 'aws',
    config: {} as Record<string, string>,
  });
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestConnectionResult>>({});

  // 从后端获取厂商元数据（声明式字段配置）
  const { data: providersMeta = [] } = useQuery({
    queryKey: ['cloud-providers-meta'],
    queryFn: async () => {
      const res = await cloudApi.getProvidersMeta();
      return res.providers;
    },
    staleTime: Infinity, // 元数据基本不变，永久缓存
  });

  const providersMap = useMemo(() => {
    const m: Record<string, ProviderMeta> = {};
    for (const p of providersMeta) m[p.id] = p;
    return m;
  }, [providersMeta]);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['cloud-accounts', isDemoMode],
    queryFn: () => isDemoMode ? demoListCloudAccounts() as unknown as Promise<CloudAccount[]> : cloudApi.listAccounts(),
  });

  const createMutation = useMutation({
    mutationFn: (params: { name: string; provider: string; config: Record<string, unknown> }) =>
      cloudApi.createAccount(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
      setDialogOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; name?: string; config?: Record<string, unknown> }) =>
      cloudApi.updateAccount(params.id, { name: params.name, config: params.config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
      setDialogOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cloudApi.deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => cloudApi.testAccount(id),
    onSuccess: (result, id) => {
      setTestResult(prev => ({ ...prev, [id]: result }));
      setTestingId(null);
    },
    onError: (e: Error, id) => {
      setTestResult(prev => ({ ...prev, [id]: { ok: false, message: e.message } }));
      setTestingId(null);
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    // 用第一个厂商的默认值初始化
    const firstProvider = providersMeta[0];
    const defaultConfig: Record<string, string> = {};
    if (firstProvider) {
      for (const f of firstProvider.fields) {
        if (f.default) defaultConfig[f.key] = f.default;
      }
    }
    setForm({ name: '', provider: firstProvider?.id || 'aws', config: defaultConfig });
    setError('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (account: CloudAccount) => {
    setEditingId(account.id);
    // 编辑时：凭证字段留空（后端会保留原值），只显示脱敏提示
    const meta = providersMap[account.provider];
    const emptyConfig: Record<string, string> = {};
    if (meta) {
      for (const f of meta.fields) {
        emptyConfig[f.key] = '';
      }
    }
    setForm({
      name: account.name,
      provider: account.provider,
      config: emptyConfig,
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    setError('');
    if (!form.name.trim()) {
      setError(t('cloudAccounts.nameRequired'));
      return;
    }
    const meta = providersMap[form.provider];
    if (meta) {
      // 新建时校验必填字段；编辑时空字段=保留原值
      for (const f of meta.fields) {
        if (f.required && !editingId) {
          if (!form.config[f.key]?.trim()) {
            setError(t('cloudAccounts.fieldRequired', { label: f.label }));
            return;
          }
        }
      }
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, name: form.name, config: form.config });
    } else {
      createMutation.mutate({ name: form.name, provider: form.provider, config: form.config });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(t('cloudAccounts.confirmDelete', { name }))) {
      deleteMutation.mutate(id);
    }
  };

  const handleTest = (id: string) => {
    setTestingId(id);
    setTestResult(prev => ({ ...prev, [id]: undefined as any }));
    testMutation.mutate(id);
  };

  const updateConfigField = (key: string, value: string) => {
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }));
  };

  const switchProvider = (provider: string) => {
    const meta = providersMap[provider];
    const defaultConfig: Record<string, string> = {};
    if (meta) {
      for (const f of meta.fields) {
        defaultConfig[f.key] = f.default || '';
      }
    }
    setForm(f => ({ ...f, provider, config: defaultConfig }));
  };

  const currentMeta = providersMap[form.provider];

  return (
    <div className="container mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl sm:text-2xl font-bold">{t('cloudAccounts.title')}</h1>
        </div>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t('cloudAccounts.add')}
        </Button>
      </div>

      {/* 云账号列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('cloudAccounts.configured')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('cloudAccounts.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const meta = providersMap[account.provider];
                const result = testResult[account.id];
                return (
                  <div
                    key={account.id}
                    className="rounded-md border p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                        style={{ backgroundColor: meta?.color || '#6b7280' }}
                      >
                        {meta?.label?.[0] || account.provider[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{account.name}</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                            {meta?.label || account.provider}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {account.status === 'active' ? (
                            <><CheckCircle2 className="h-3 w-3 text-green-500" /> {t('cloudAccounts.active')}</>
                          ) : (
                            <><XCircle className="h-3 w-3 text-muted-foreground" /> {account.status || t('cloudAccounts.unknown')}</>
                          )}
                          <span>·</span>
                          <span>{t('cloudAccounts.createdAt')} {new Date(account.createdAt).toLocaleDateString()}</span>
                        </div>
                        {/* 凭证脱敏提示 */}
                        {account.credentialHint && Object.keys(account.credentialHint).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(account.credentialHint).map(([k, v]) => (
                              <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* 测试结果 */}
                        {result && (
                          <div className={cn('mt-1 flex items-center gap-1 text-xs', result.ok ? 'text-green-600' : 'text-red-600')}>
                            {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {result.message}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTest(account.id)}
                              disabled={testingId === account.id}
                            >
                              {testingId === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Zap className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.test')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.edit')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(account.id, account.name)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 添加/编辑对话框 */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t('cloudAccounts.editTitle') : t('cloudAccounts.addTitle')}
        description={t('cloudAccounts.dialogDesc')}
      >
          <div className="space-y-4 py-2">
            {/* 账号名称 */}
            <div className="space-y-2">
              <Label htmlFor="account-name">{t('cloudAccounts.accountName')}</Label>
              <Input
                id="account-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('cloudAccounts.accountNamePlaceholder')}
              />
            </div>

            {/* 云厂商选择 */}
            {!editingId && (
              <div className="space-y-2">
                <Label>{t('cloudAccounts.providerLabel')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {providersMeta.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => switchProvider(p.id)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-sm transition-colors',
                        form.provider === p.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {currentMeta?.description && (
                  <p className="text-xs text-muted-foreground">{currentMeta.description}</p>
                )}
              </div>
            )}

            {/* 凭证字段（从后端元数据动态渲染） */}
            {currentMeta && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('cloudAccounts.credentialConfig')}</Label>
                  {currentMeta.docsUrl && (
                    <a
                      href={currentMeta.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {t('cloudAccounts.viewDocs')} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {/* 步骤指引 */}
                {currentMeta.guide && (
                  <div className="rounded-md border border-dashed border-muted bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-medium">{currentMeta.guide.title}</div>
                    <ol className="text-xs text-muted-foreground">
                      {currentMeta.guide.steps.map((step, i) => (
                        <li key={i} className="mb-1 flex gap-2">
                          <span className="shrink-0 font-medium">{i + 1}.</span>
                          <span dangerouslySetInnerHTML={{ __html: step }} />
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {currentMeta.fields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={`cfg-${field.key}`} className="text-xs text-muted-foreground">
                      {field.label}
                      {field.required && <span className="ml-1 text-destructive">*</span>}
                    </Label>
                    {field.type === 'textarea' ? (
                      <textarea
                        id={`cfg-${field.key}`}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={form.config[field.key] || ''}
                        onChange={(e) => updateConfigField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <Input
                        id={`cfg-${field.key}`}
                        type={field.type === 'password' ? 'password' : 'text'}
                        value={form.config[field.key] || ''}
                        onChange={(e) => updateConfigField(field.key, e.target.value)}
                        placeholder={editingId ? t('cloudAccounts.editPlaceholder') : field.placeholder}
                      />
                    )}
                    {field.help && (
                      <p className="text-[10px] text-muted-foreground">{field.help}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {editingId ? t('common.save') : t('common.add')}
            </Button>
          </div>
      </Dialog>
    </div>
  );
}
