// AI 模型设置页：多 Provider 管理 + 模型选择 + 深度思考 + reasoning effort + 生成参数
// 支持 compat 配置和 thinkingFormat 方言（参考 openclaw）
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/stores/chat';
import { useModels, useDeleteModel, useTestModel } from '@/hooks/useModels';
import {
  useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider, useTestProvider,
  useDiscoverModels, useThinkingFormats,
  type LlmProviderConfig, type ProviderCompat, type ThinkingFormat,
} from '@/hooks/useProviders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Brain, Check, Settings2, Plus, Pencil, Trash2, Zap, Loader2, Server, ChevronDown, ChevronUp,
  Search, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ReasoningEffort = 'low' | 'medium' | 'high';

/** thinkingFormat 中文标签 */
const THINKING_FORMAT_LABELS: Record<ThinkingFormat, string> = {
  'openai': 'OpenAI',
  'openrouter': 'OpenRouter',
  'deepseek': 'DeepSeek',
  'together': 'Together',
  'qwen': 'Qwen',
  'qwen-chat-template': 'Qwen (chat_template)',
  'zai': 'Z.AI',
};

interface ProviderFormState {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  compat: ProviderCompat;
}

interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  thinkingFormat?: ThinkingFormat;
  supportsReasoningEffort?: boolean;
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  supportsTools?: boolean;
  requiresStringContent?: boolean;
  description?: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    thinkingFormat: 'openai',
    supportsReasoningEffort: true,
    maxTokensField: 'max_completion_tokens',
    supportsTools: true,
    description: 'GPT-4o, GPT-4, GPT-3.5 等模型',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    thinkingFormat: 'openai',
    supportsTools: true,
    description: 'Nemotron, Llama, Mistral, DeepSeek 等模型',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    thinkingFormat: 'deepseek',
    supportsReasoningEffort: true,
    supportsTools: true,
    description: 'DeepSeek-V3, DeepSeek-R1 等模型',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    thinkingFormat: 'openrouter',
    supportsReasoningEffort: true,
    supportsTools: true,
    description: '聚合多家模型提供商',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    thinkingFormat: 'together',
    supportsReasoningEffort: true,
    supportsTools: true,
    description: 'Llama, Mistral 等开源模型',
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    thinkingFormat: 'qwen',
    supportsReasoningEffort: true,
    supportsTools: true,
    description: 'Qwen 系列模型',
  },
  {
    id: 'zhipu',
    name: '智谱 AI (Z.AI)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    thinkingFormat: 'zai',
    supportsTools: true,
    description: 'GLM 系列模型',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 (SiliconFlow)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    thinkingFormat: 'openai',
    supportsTools: true,
    description: 'Qwen, DeepSeek, Llama 等模型',
  },
];

const EMPTY_COMPAT: ProviderCompat = {};
const EMPTY_FORM: ProviderFormState = {
  id: '', name: '', baseUrl: '', apiKey: '', compat: { ...EMPTY_COMPAT },
};

function detectModelReasoning(modelId: string): boolean {
  return /reasoning|think|o1|o3|o4|r1|deepseek-r|nemotron.*reason|qwen.*reason/i.test(modelId);
}

function detectModelInputType(modelId: string): string[] {
  if (/vision|omni|vl|image|multimodal|gpt-4o|gpt-4v|gemini|qwen-vl|llava|vila|neva|nemotron.*omni|cosmos/i.test(modelId)) {
    return ['text', 'image'];
  }
  return ['text'];
}

export default function AiSettings() {
  const { t } = useTranslation();
  const { data: models = [], isLoading: modelsLoading } = useModels();
  const { data: providers = [], isLoading: providersLoading } = useProviders();
  const { data: thinkingFormats = [] } = useThinkingFormats();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();
  const testProvider = useTestProvider();
  const discoverModels = useDiscoverModels();
  const deleteModel = useDeleteModel();
  const testModel = useTestModel();
  const [modelTestResult, setModelTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const selectedModel = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setModel);
  const enableThinking = useChatStore((s) => s.enableThinking);
  const setEnableThinking = useChatStore((s) => s.setEnableThinking);
  const reasoningEffort = useChatStore((s) => s.reasoningEffort);
  const setReasoningEffort = useChatStore((s) => s.setReasoningEffort);

  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Provider 编辑对话框
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LlmProviderConfig | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>({ ...EMPTY_FORM });
  const [providerError, setProviderError] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // 模型发现对话框
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);
  const [discoverProviderId, setDiscoverProviderId] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; name: string; ownedBy?: string }>>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [discoverError, setDiscoverError] = useState('');
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState('');
  useEffect(() => {
    const savedTemp = localStorage.getItem('ai-temperature');
    const savedTokens = localStorage.getItem('ai-maxTokens');
    if (savedTemp) setTemperature(parseFloat(savedTemp));
    if (savedTokens) setMaxTokens(parseInt(savedTokens));
  }, []);

  const handleSaveParams = () => {
    localStorage.setItem('ai-temperature', String(temperature));
    localStorage.setItem('ai-maxTokens', String(maxTokens));
    toast.success(t('aiSettings.configSaved'));
  };

  const handleOpenCreateProvider = () => {
    setEditingProvider(null);
    setProviderForm({ ...EMPTY_FORM, compat: { ...EMPTY_COMPAT } });
    setProviderError('');
    setProviderDialogOpen(true);
  };

  const handleOpenEditProvider = (provider: LlmProviderConfig) => {
    setEditingProvider(provider);
    setProviderForm({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: '', // 编辑时不预填 apiKey（masked）
      compat: { ...(provider.compat || EMPTY_COMPAT) },
    });
    setProviderError('');
    setProviderDialogOpen(true);
  };

  const handleSaveProvider = () => {
    setProviderError('');
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim()) {
      setProviderError(t('aiSettings.nameUrlRequired'));
      return;
    }
    if (!editingProvider && !providerForm.apiKey.trim()) {
      setProviderError(t('aiSettings.apiKeyRequired'));
      return;
    }
    if (!editingProvider && !providerForm.id.trim()) {
      setProviderError(t('aiSettings.providerIdRequired'));
      return;
    }

    // 清理空 compat 字段
    const cleanCompat: ProviderCompat = {};
    const c = providerForm.compat;
    if (c.thinkingFormat) cleanCompat.thinkingFormat = c.thinkingFormat;
    if (c.supportsReasoningEffort !== undefined) cleanCompat.supportsReasoningEffort = c.supportsReasoningEffort;
    if (c.maxTokensField) cleanCompat.maxTokensField = c.maxTokensField;
    if (c.supportsTools !== undefined) cleanCompat.supportsTools = c.supportsTools;
    if (c.requiresStringContent !== undefined) cleanCompat.requiresStringContent = c.requiresStringContent;

    if (editingProvider) {
      updateProvider.mutate({
        id: editingProvider.id,
        name: providerForm.name,
        baseUrl: providerForm.baseUrl,
        ...(providerForm.apiKey ? { apiKey: providerForm.apiKey } : {}),
        compat: cleanCompat,
      }, {
        onError: (e: Error) => setProviderError(e.message),
        onSuccess: () => setProviderDialogOpen(false),
      });
    } else {
      createProvider.mutate({
        id: providerForm.id.trim().toLowerCase(),
        name: providerForm.name,
        baseUrl: providerForm.baseUrl,
        apiKey: providerForm.apiKey,
        compat: cleanCompat,
      }, {
        onError: (e: Error) => setProviderError(e.message),
        onSuccess: () => setProviderDialogOpen(false),
      });
    }
  };

  const handleDeleteProvider = (provider: LlmProviderConfig) => {
    if (confirm(t('aiSettings.confirmDeleteProvider', { name: provider.name }))) {
      deleteProvider.mutate(provider.id);
    }
  };

  const handleTestProvider = (provider: LlmProviderConfig) => {
    setTestResult(r => ({ ...r, [provider.id]: { ok: false, msg: t('aiSettings.testConnecting') } }));
    testProvider.mutate(provider.id, {
      onSuccess: (res) => {
        setTestResult(r => ({ ...r, [provider.id]: { ok: true, msg: res.message || t('aiSettings.testSuccess') } }));
      },
      onError: (e: Error) => {
        setTestResult(r => ({ ...r, [provider.id]: { ok: false, msg: e.message } }));
      },
    });
  };

  const handleOpenDiscover = (providerId: string) => {
    setDiscoverProviderId(providerId);
    setDiscoveredModels([]);
    setSelectedModelIds(new Set());
    setDiscoverError('');
    setDiscoverDialogOpen(true);
    // 自动开始发现
    discoverModels.mutate(providerId, {
      onSuccess: (res) => {
        setDiscoveredModels(res.models);
      },
      onError: (e: Error) => {
        setDiscoverError(e.message);
      },
    });
  };

  const handleToggleModel = (modelId: string) => {
    setSelectedModelIds(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const handleSaveDiscoveredModels = () => {
    const provider = providers.find(p => p.id === discoverProviderId);
    if (!provider) return;
    const existingModels = (provider.models || []).map(m => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      thinkingFormat: m.thinkingFormat,
      thinkingLevelMap: m.thinkingLevelMap,
      supportedReasoningEfforts: m.supportedReasoningEfforts,
    }));
    const newModels = discoveredModels
      .filter(m => selectedModelIds.has(m.id) && !provider.models?.some(pm => pm.id === m.id))
      .map(m => {
        // 去掉 provider 前缀，只保存模型ID
        const modelId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
        return {
          id: modelId,
          name: modelId,
          reasoning: detectModelReasoning(modelId),
          input: detectModelInputType(modelId),
        };
      });
    const merged = [...existingModels, ...newModels];
    updateProvider.mutate({
      id: discoverProviderId,
      models: merged,
    }, {
      onError: (e: Error) => setDiscoverError(e.message),
      onSuccess: () => setDiscoverDialogOpen(false),
    });
  };

  // 搜索过滤后的模型列表
  const filteredDiscoveredModels = discoverSearchQuery
    ? discoveredModels.filter(m =>
        m.id.toLowerCase().includes(discoverSearchQuery.toLowerCase()) ||
        (m.name || '').toLowerCase().includes(discoverSearchQuery.toLowerCase())
      )
    : discoveredModels;

  return (
    <div className="container mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl sm:text-2xl font-bold">{t('aiSettings.title')}</h1>
      </div>

      {/* Provider 管理 */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-4 w-4" />
            {t('aiSettings.providerMgmt')}
          </CardTitle>
          <Button onClick={handleOpenCreateProvider} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            {t('aiSettings.addProvider')}
          </Button>
        </CardHeader>
        <CardContent>
          {providersLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
            </div>
          ) : providers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('aiSettings.noProvider')}
            </p>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border">
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold">
                        {provider.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{provider.name}</span>
                          <span className="text-xs text-muted-foreground">({provider.id})</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{provider.baseUrl}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:shrink-0 flex-wrap">
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs">
                        {provider.models?.length || 0} {t('aiSettings.models')}
                      </span>
                      {provider.compat?.thinkingFormat && (
                        <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700" title={t('aiSettings.thinkingLabel')}>
                          {THINKING_FORMAT_LABELS[provider.compat.thinkingFormat] || provider.compat.thinkingFormat}
                        </span>
                      )}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleTestProvider(provider)}
                            disabled={testProvider.isPending}
                          >
                            <Zap className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tooltip.test')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleOpenDiscover(provider.id)}
                            disabled={discoverModels.isPending}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tooltip.discover')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                          >
                            {expandedProvider === provider.id
                              ? <ChevronUp className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tooltip.expand')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEditProvider(provider)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tooltip.edit')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleDeleteProvider(provider)}
                            disabled={deleteProvider.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tooltip.delete')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* 测试结果 */}
                  {testResult[provider.id] && (
                    <div className={cn(
                      'px-3 py-1.5 text-xs break-words',
                      testResult[provider.id].ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    )}>
                      {testResult[provider.id].ok ? '✓ ' : '✗ '}{testResult[provider.id].msg}
                    </div>
                  )}

                  {/* 展开的模型列表 */}
                  {expandedProvider === provider.id && provider.models && provider.models.length > 0 && (
                    <div className="border-t px-3 py-2">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">{t('aiSettings.modelList')}</div>
                      <div className="space-y-1">
                        {provider.models.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 text-xs group">
                            <span className="font-mono">{m.id}</span>
                            <span className="text-muted-foreground">{m.name}</span>
                            {m.reasoning && (
                              <span className="flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5">
                                <Brain className="h-2.5 w-2.5" /> {t('aiSettings.reasoningBadge')}
                              </span>
                            )}
                            {m.thinkingFormat && (
                              <span className="rounded bg-blue-50 px-1 py-0.5 text-blue-600" title={t('aiSettings.thinkingLabel')}>
                                {THINKING_FORMAT_LABELS[m.thinkingFormat] || m.thinkingFormat}
                              </span>
                            )}
                            {m.input?.includes('image') && (
                              <span className="rounded bg-secondary px-1 py-0.5">{t('aiSettings.visionBadge')}</span>
                            )}
                            {m.contextWindow && (
                              <span className="text-muted-foreground">{(m.contextWindow / 1000).toFixed(0)}K</span>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                                  onClick={() => {
                                    if (confirm(t('aiSettings.confirmDeleteModel', { id: m.id }))) {
                                      deleteModel.mutate({ providerId: provider.id, modelId: m.id });
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t('tooltip.deleteModel')}</TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 模型选择 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('aiSettings.modelSelect')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {modelsLoading ? (
            <p className="text-sm text-muted-foreground">{t('aiSettings.loadingModels')}</p>
          ) : models.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('aiSettings.noModels')}</p>
          ) : (
            <div className="space-y-2">
              {models.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                  <div
                    key={model.id}
                    className={cn(
                      'flex cursor-pointer flex-col gap-2 rounded-md border p-3 transition-colors group',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                      !model.available && 'cursor-not-allowed opacity-50'
                    )}
                    onClick={() => model.available !== false && setModel(model.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        isSelected ? 'border-primary bg-primary' : 'border-muted'
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{model.name}</span>
                          <span className="text-xs text-muted-foreground">{model.provider}</span>
                        </div>
                        {model.contextWindow && (
                          <span className="text-xs text-muted-foreground">
                            {t('aiSettings.contextWindow', { value: (model.contextWindow / 1000).toFixed(0) })}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground flex-wrap justify-end">
                        {model.reasoning && (
                          <span className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
                            <Brain className="h-3 w-3" /> {t('aiSettings.reasoningBadge')}
                          </span>
                        )}
                        {model.thinkingFormat && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600" title={t('aiSettings.thinkingLabel')}>
                            {THINKING_FORMAT_LABELS[model.thinkingFormat] || model.thinkingFormat}
                          </span>
                        )}
                        {model.input?.includes('image') && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">{t('aiSettings.visionBadge')}</span>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="text-muted-foreground hover:text-green-600 transition-colors ml-1"
                              disabled={testModel.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                testModel.mutate(
                                  { providerId: model.provider, modelId: model.id },
                                  {
                                    onSuccess: (res) => {
                                      setModelTestResult(prev => ({
                                        ...prev,
                                        [model.id]: { ok: res.ok, msg: res.message || (res.ok ? t('aiSettings.testModelSuccess') : t('aiSettings.testModelFailed')) },
                                      }));
                                    },
                                    onError: (err) => {
                                      setModelTestResult(prev => ({
                                        ...prev,
                                        [model.id]: { ok: false, msg: err.message },
                                      }));
                                    },
                                  }
                                );
                              }}
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.testModel')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(t('aiSettings.confirmDeleteModel', { id: model.id }))) {
                                  deleteModel.mutate({ providerId: model.provider, modelId: model.id });
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.deleteModel')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {modelTestResult[model.id] && !modelTestResult[model.id].ok && (
                      <div className="ml-8 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                        <div className="text-xs font-medium text-red-700">✗ {t('aiSettings.testModelFailed')}</div>
                        <div className="text-xs text-red-600 mt-1 break-words whitespace-pre-wrap">{modelTestResult[model.id].msg}</div>
                      </div>
                    )}
                    {modelTestResult[model.id] && modelTestResult[model.id].ok && (
                      <div className="ml-8 text-xs text-green-600">
                        ✓ {modelTestResult[model.id].msg}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {selectedModel && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">{t('aiSettings.currentModel', { model: selectedModel })}</span>
              <Button variant="ghost" size="sm" onClick={() => setModel(null)}>{t('aiSettings.useDefault')}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 深度思考 + Reasoning Effort */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-4 w-4" />
            {t('aiSettings.reasoning')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
              enableThinking ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
            )}
            onClick={() => setEnableThinking(!enableThinking)}
          >
            <div className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
              enableThinking ? 'border-primary bg-primary' : 'border-muted'
            )}>
              {enableThinking && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{t('aiSettings.enableThinking')}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('aiSettings.enableThinkingDesc')}
              </p>
            </div>
          </div>

          {enableThinking && (
            <div className="space-y-2">
              <Label>{t('aiSettings.reasoningEffort')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as ReasoningEffort[]).map(effort => (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => setReasoningEffort(effort)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm transition-colors',
                      reasoningEffort === effort
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-accent'
                    )}
                  >
                    {effort === 'low' ? t('aiSettings.effortLow') : effort === 'medium' ? t('aiSettings.effortMedium') : t('aiSettings.effortHigh')}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {reasoningEffort === 'low' && t('aiSettings.effortLowDesc')}
                {reasoningEffort === 'medium' && t('aiSettings.effortMediumDesc')}
                {reasoningEffort === 'high' && t('aiSettings.effortHighDesc')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 生成参数 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('aiSettings.genParams')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="temperature">{t('aiSettings.temperature', { value: temperature.toFixed(2) })}</Label>
            <input
              id="temperature" type="range" min="0" max="2" step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t('aiSettings.temperatureDesc')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxTokens">{t('aiSettings.maxTokens')}</Label>
            <Input
              id="maxTokens" type="number" min="256" max="32768" step="256"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
            />
            <p className="text-xs text-muted-foreground">
              {t('aiSettings.maxTokensDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSaveParams} size="sm">{t('aiSettings.saveConfig')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Provider 添加/编辑对话框 */}
      <Dialog
        open={providerDialogOpen}
        onClose={() => setProviderDialogOpen(false)}
        title={editingProvider ? t('aiSettings.editProviderTitle') : t('aiSettings.addProviderTitle')}
        description={t('aiSettings.providerDialogDesc')}
        className="max-w-md"
      >
          <div className="space-y-4 py-2">
            {!editingProvider && (
              <div className="space-y-2">
                <Label>{t('aiSettings.selectPreset')}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value=""
                  onChange={(e) => {
                    const presetId = e.target.value;
                    if (!presetId) return;
                    const preset = PROVIDER_PRESETS.find(p => p.id === presetId);
                    if (preset) {
                      setProviderForm(f => ({
                        ...f,
                        id: preset.id,
                        name: preset.name,
                        baseUrl: preset.baseUrl,
                        compat: {
                          ...f.compat,
                          ...(preset.thinkingFormat ? { thinkingFormat: preset.thinkingFormat } : {}),
                          ...(preset.supportsReasoningEffort !== undefined ? { supportsReasoningEffort: preset.supportsReasoningEffort } : {}),
                          ...(preset.maxTokensField ? { maxTokensField: preset.maxTokensField } : {}),
                          ...(preset.supportsTools !== undefined ? { supportsTools: preset.supportsTools } : {}),
                          ...(preset.requiresStringContent !== undefined ? { requiresStringContent: preset.requiresStringContent } : {}),
                        },
                      }));
                    }
                  }}
                >
                  <option value="">{t('aiSettings.customProvider')}</option>
                  {PROVIDER_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t('aiSettings.presetHint')}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="provider-id">{t('aiSettings.providerId')}</Label>
              <Input
                id="provider-id"
                value={providerForm.id}
                onChange={(e) => setProviderForm(f => ({ ...f, id: e.target.value }))}
                placeholder={t('aiSettings.providerIdPlaceholder')}
                disabled={!!editingProvider}
              />
              <p className="text-xs text-muted-foreground">{t('aiSettings.providerIdHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-name">{t('aiSettings.displayName')}</Label>
              <Input
                id="provider-name"
                value={providerForm.name}
                onChange={(e) => setProviderForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('aiSettings.displayNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-url">{t('aiSettings.baseUrl')}</Label>
              <Input
                id="provider-url"
                value={providerForm.baseUrl}
                onChange={(e) => setProviderForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder={t('aiSettings.baseUrlPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('aiSettings.baseUrlHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-key">{t('aiSettings.apiKey')}</Label>
              <Input
                id="provider-key"
                type="password"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={editingProvider ? t('aiSettings.apiKeyEditPlaceholder') : t('aiSettings.apiKeyPlaceholder')}
              />
            </div>

            {/* compat 配置（参考 openclaw） */}
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Settings2 className="h-3.5 w-3.5" />
                {t('aiSettings.compatConfig')}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('aiSettings.compatDesc')}
              </p>

              {/* thinkingFormat 选择 */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t('aiSettings.thinkingDialect')}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={providerForm.compat.thinkingFormat || ''}
                  onChange={(e) => setProviderForm(f => ({
                    ...f,
                    compat: {
                      ...f.compat,
                      thinkingFormat: e.target.value as ThinkingFormat | undefined || undefined,
                    },
                  }))}
                >
                  <option value="">{t('aiSettings.autoDetect')}</option>
                  {thinkingFormats.map(fmt => (
                    <option key={fmt} value={fmt}>
                      {THINKING_FORMAT_LABELS[fmt] || fmt}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {t('aiSettings.thinkingDialectDesc')}
                </p>
              </div>

              {/* maxTokensField 选择 */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t('aiSettings.maxTokensField')}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={providerForm.compat.maxTokensField || 'max_tokens'}
                  onChange={(e) => setProviderForm(f => ({
                    ...f,
                    compat: {
                      ...f.compat,
                      maxTokensField: e.target.value as 'max_tokens' | 'max_completion_tokens',
                    },
                  }))}
                >
                  <option value="max_tokens">{t('aiSettings.maxTokensDefault')}</option>
                  <option value="max_completion_tokens">{t('aiSettings.maxTokensCompletion')}</option>
                </select>
              </div>

              {/* 布尔开关 */}
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={providerForm.compat.supportsReasoningEffort ?? false}
                    onChange={(e) => setProviderForm(f => ({
                      ...f,
                      compat: { ...f.compat, supportsReasoningEffort: e.target.checked },
                    }))}
                  />
                  <span>{t('aiSettings.supportsReasoningEffort')}</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={providerForm.compat.supportsTools ?? true}
                    onChange={(e) => setProviderForm(f => ({
                      ...f,
                      compat: { ...f.compat, supportsTools: e.target.checked },
                    }))}
                  />
                  <span>{t('aiSettings.supportsTools')}</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={providerForm.compat.requiresStringContent ?? false}
                    onChange={(e) => setProviderForm(f => ({
                      ...f,
                      compat: { ...f.compat, requiresStringContent: e.target.checked },
                    }))}
                  />
                  <span>{t('aiSettings.requiresStringContent')}</span>
                </label>
              </div>
            </div>

            {providerError && <p className="text-sm text-destructive">{providerError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={handleSaveProvider}
              disabled={createProvider.isPending || updateProvider.isPending}
            >
              {(createProvider.isPending || updateProvider.isPending) && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {editingProvider ? t('common.save') : t('common.add')}
            </Button>
          </div>
      </Dialog>

      {/* 模型发现对话框 */}
      <Dialog
        open={discoverDialogOpen}
        onClose={() => setDiscoverDialogOpen(false)}
        title={t('aiSettings.discoverTitle')}
        description={t('aiSettings.discoverDesc', { name: providers.find(p => p.id === discoverProviderId)?.name || '' })}
        className="max-w-lg"
      >
        <div className="space-y-4 py-2">
          {discoverModels.isPending && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('aiSettings.discovering')}
            </div>
          )}
          {discoverError && (
            <p className="text-sm text-destructive">{discoverError}</p>
          )}
          {!discoverModels.isPending && discoveredModels.length === 0 && !discoverError && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('aiSettings.discoverEmpty')}
            </p>
          )}
          {discoveredModels.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('aiSettings.discoverCount', { total: discoveredModels.length, selected: selectedModelIds.size })}
                </span>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => {
                    if (selectedModelIds.size === filteredDiscoveredModels.length) {
                      // 取消选择所有过滤后的模型
                      filteredDiscoveredModels.forEach(m => selectedModelIds.delete(m.id));
                      setSelectedModelIds(new Set(selectedModelIds));
                    } else {
                      // 选择所有过滤后的模型
                      filteredDiscoveredModels.forEach(m => selectedModelIds.add(m.id));
                      setSelectedModelIds(new Set(selectedModelIds));
                    }
                  }}
                >
                  {selectedModelIds.size === filteredDiscoveredModels.length ? t('aiSettings.deselectAll') : t('aiSettings.selectAll')}
                </Button>
              </div>
              {/* 搜索框 */}
              <div className="mt-2">
                <input
                  type="text"
                  placeholder={t('aiSettings.searchPlaceholder')}
                  value={discoverSearchQuery}
                  onChange={(e) => setDiscoverSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {filteredDiscoveredModels.map((m) => {
                  const alreadyHas = providers.find(p => p.id === discoverProviderId)?.models?.some(pm => pm.id === m.id);
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer transition-colors',
                        alreadyHas ? 'bg-green-50 border-green-200' : 'hover:bg-accent',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={selectedModelIds.has(m.id)}
                        onChange={() => handleToggleModel(m.id)}
                        disabled={alreadyHas}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs">{m.id}</span>
                          {detectModelReasoning(m.id) && (
                            <span className="flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5 text-[10px]">
                              <Brain className="h-2.5 w-2.5" /> {t('aiSettings.reasoningBadge')}
                            </span>
                          )}
                          {detectModelInputType(m.id).includes('image') && (
                            <span className="rounded bg-secondary px-1 py-0.5 text-[10px]">{t('aiSettings.visionBadge')}</span>
                          )}
                        </div>
                        {m.name !== m.id && (
                          <span className="text-xs text-muted-foreground">{m.name}</span>
                        )}
                      </div>
                      {alreadyHas && (
                        <span className="text-xs text-green-600">{t('aiSettings.alreadyExists')}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDiscoverDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            onClick={handleSaveDiscoveredModels}
            disabled={selectedModelIds.size === 0 || updateProvider.isPending}
          >
            {updateProvider.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            <Download className="mr-1 h-4 w-4" />
            {t('aiSettings.saveModels', { count: selectedModelIds.size })}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
