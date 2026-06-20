// AI 模型设置页：多 Provider 管理 + 模型选择 + 深度思考 + reasoning effort + 生成参数
// 支持 compat 配置和 thinkingFormat 方言（参考 openclaw）
import { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chat';
import { useModels } from '@/hooks/useModels';
import {
  useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider, useTestProvider,
  useThinkingFormats,
  type LlmProviderConfig, type ProviderCompat, type ThinkingFormat,
} from '@/hooks/useProviders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import {
  Brain, Check, Settings2, Plus, Pencil, Trash2, Zap, Loader2, Server, ChevronDown, ChevronUp,
} from 'lucide-react';
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

const EMPTY_COMPAT: ProviderCompat = {};
const EMPTY_FORM: ProviderFormState = {
  id: '', name: '', baseUrl: '', apiKey: '', compat: { ...EMPTY_COMPAT },
};

export default function AiSettings() {
  const { data: models = [], isLoading: modelsLoading } = useModels();
  const { data: providers = [], isLoading: providersLoading } = useProviders();
  const { data: thinkingFormats = [] } = useThinkingFormats();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();
  const testProvider = useTestProvider();

  const selectedModel = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setModel);
  const enableThinking = useChatStore((s) => s.enableThinking);
  const setEnableThinking = useChatStore((s) => s.setEnableThinking);
  const reasoningEffort = useChatStore((s) => s.reasoningEffort);
  const setReasoningEffort = useChatStore((s) => s.setReasoningEffort);

  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [saved, setSaved] = useState(false);

  // Provider 编辑对话框
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LlmProviderConfig | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>({ ...EMPTY_FORM });
  const [providerError, setProviderError] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  useEffect(() => {
    const savedTemp = localStorage.getItem('ai-temperature');
    const savedTokens = localStorage.getItem('ai-maxTokens');
    if (savedTemp) setTemperature(parseFloat(savedTemp));
    if (savedTokens) setMaxTokens(parseInt(savedTokens));
  }, []);

  const handleSaveParams = () => {
    localStorage.setItem('ai-temperature', String(temperature));
    localStorage.setItem('ai-maxTokens', String(maxTokens));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      setProviderError('名称和 Base URL 为必填');
      return;
    }
    if (!editingProvider && !providerForm.apiKey.trim()) {
      setProviderError('API Key 为必填');
      return;
    }
    if (!editingProvider && !providerForm.id.trim()) {
      setProviderError('Provider ID 为必填（如 openai、deepseek）');
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
    if (confirm(`确定删除 Provider "${provider.name}" 吗？`)) {
      deleteProvider.mutate(provider.id);
    }
  };

  const handleTestProvider = (provider: LlmProviderConfig) => {
    setTestResult(r => ({ ...r, [provider.id]: { ok: false, msg: '测试中...' } }));
    testProvider.mutate(provider.id, {
      onSuccess: (res) => {
        setTestResult(r => ({ ...r, [provider.id]: { ok: true, msg: res.message || '连接成功' } }));
      },
      onError: (e: Error) => {
        setTestResult(r => ({ ...r, [provider.id]: { ok: false, msg: e.message } }));
      },
    });
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">AI 模型设置</h1>
      </div>

      {/* Provider 管理 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-4 w-4" />
            LLM Provider 管理
          </CardTitle>
          <Button onClick={handleOpenCreateProvider} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            添加 Provider
          </Button>
        </CardHeader>
        <CardContent>
          {providersLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </div>
          ) : providers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              暂无 Provider，点击"添加 Provider"配置自定义 LLM
            </p>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border">
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold">
                      {provider.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{provider.name}</span>
                        <span className="text-xs text-muted-foreground">({provider.id})</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{provider.baseUrl}</div>
                    </div>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs">
                      {provider.models?.length || 0} 模型
                    </span>
                    {provider.compat?.thinkingFormat && (
                      <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700" title="Thinking 方言">
                        {THINKING_FORMAT_LABELS[provider.compat.thinkingFormat] || provider.compat.thinkingFormat}
                      </span>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleTestProvider(provider)}
                        disabled={testProvider.isPending}
                        title="测试连通性"
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                      >
                        {expandedProvider === provider.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEditProvider(provider)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleDeleteProvider(provider)}
                        disabled={deleteProvider.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* 测试结果 */}
                  {testResult[provider.id] && (
                    <div className={cn(
                      'px-3 py-1.5 text-xs',
                      testResult[provider.id].ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    )}>
                      {testResult[provider.id].ok ? '✓ ' : '✗ '}{testResult[provider.id].msg}
                    </div>
                  )}

                  {/* 展开的模型列表 */}
                  {expandedProvider === provider.id && provider.models && provider.models.length > 0 && (
                    <div className="border-t px-3 py-2">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">模型列表</div>
                      <div className="space-y-1">
                        {provider.models.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 text-xs">
                            <span className="font-mono">{m.id}</span>
                            <span className="text-muted-foreground">{m.name}</span>
                            {m.reasoning && (
                              <span className="flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5">
                                <Brain className="h-2.5 w-2.5" /> 推理
                              </span>
                            )}
                            {m.thinkingFormat && (
                              <span className="rounded bg-blue-50 px-1 py-0.5 text-blue-600" title="模型级 thinkingFormat">
                                {THINKING_FORMAT_LABELS[m.thinkingFormat] || m.thinkingFormat}
                              </span>
                            )}
                            {m.input?.includes('image') && (
                              <span className="rounded bg-secondary px-1 py-0.5">视觉</span>
                            )}
                            {m.contextWindow && (
                              <span className="text-muted-foreground">{(m.contextWindow / 1000).toFixed(0)}K</span>
                            )}
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
          <CardTitle className="text-lg">模型选择</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {modelsLoading ? (
            <p className="text-sm text-muted-foreground">加载模型列表中...</p>
          ) : models.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无可用模型，请先添加 Provider</p>
          ) : (
            <div className="space-y-2">
              {models.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                  <div
                    key={model.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                      !model.available && 'cursor-not-allowed opacity-50'
                    )}
                    onClick={() => model.available !== false && setModel(model.id)}
                  >
                    <div className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      isSelected ? 'border-primary bg-primary' : 'border-muted'
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.provider}</span>
                      </div>
                      {model.contextWindow && (
                        <span className="text-xs text-muted-foreground">
                          上下文窗口: {(model.contextWindow / 1000).toFixed(0)}K tokens
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                      {model.reasoning && (
                        <span className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
                          <Brain className="h-3 w-3" /> 推理
                        </span>
                      )}
                      {model.thinkingFormat && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600" title="Thinking 方言">
                          {THINKING_FORMAT_LABELS[model.thinkingFormat] || model.thinkingFormat}
                        </span>
                      )}
                      {model.input?.includes('image') && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">视觉</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {selectedModel && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">当前选择: {selectedModel}</span>
              <Button variant="ghost" size="sm" onClick={() => setModel(null)}>使用默认</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 深度思考 + Reasoning Effort */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-4 w-4" />
            深度思考（Reasoning）
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
              <div className="font-medium text-sm">启用深度思考模式</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                开启后，AI 会在回答前进行内部推理（思维链），适合复杂问题求解、代码生成和多步骤任务。
              </p>
            </div>
          </div>

          {enableThinking && (
            <div className="space-y-2">
              <Label>推理努力程度（Reasoning Effort）</Label>
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
                    {effort === 'low' ? '低' : effort === 'medium' ? '中' : '高'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {reasoningEffort === 'low' && '低：快速推理，适合简单任务，响应最快'}
                {reasoningEffort === 'medium' && '中：平衡推理深度和速度，适合日常任务'}
                {reasoningEffort === 'high' && '高：完整推理链，适合复杂问题求解和代码生成'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 生成参数 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">生成参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="temperature">温度（Temperature）: {temperature.toFixed(2)}</Label>
            <input
              id="temperature" type="range" min="0" max="2" step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              控制随机性。0 = 确定性输出，2 = 高度随机。推荐 0.3 用于运维场景。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxTokens">最大 Token 数</Label>
            <Input
              id="maxTokens" type="number" min="256" max="32768" step="256"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
            />
            <p className="text-xs text-muted-foreground">
              单次回复的最大 token 数。增大可获得更长回复，但会增加延迟和成本。
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSaveParams} size="sm">保存配置</Button>
            {saved && <span className="text-xs text-green-600">配置已保存</span>}
          </div>
        </CardContent>
      </Card>

      {/* Provider 添加/编辑对话框 */}
      <Dialog
        open={providerDialogOpen}
        onClose={() => setProviderDialogOpen(false)}
        title={editingProvider ? '编辑 Provider' : '添加 Provider'}
        description="配置自定义 LLM Provider（兼容 OpenAI API 格式）"
        className="max-w-md"
      >
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="provider-id">Provider ID</Label>
              <Input
                id="provider-id"
                value={providerForm.id}
                onChange={(e) => setProviderForm(f => ({ ...f, id: e.target.value }))}
                placeholder="如：openai、deepseek、moonshot"
                disabled={!!editingProvider}
              />
              <p className="text-xs text-muted-foreground">唯一标识，创建后不可修改</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-name">显示名称</Label>
              <Input
                id="provider-name"
                value={providerForm.name}
                onChange={(e) => setProviderForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：OpenAI"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-url">Base URL</Label>
              <Input
                id="provider-url"
                value={providerForm.baseUrl}
                onChange={(e) => setProviderForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">OpenAI 兼容的 API 地址</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-key">API Key</Label>
              <Input
                id="provider-key"
                type="password"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={editingProvider ? '留空则不修改' : 'sk-...'}
              />
            </div>

            {/* compat 配置（参考 openclaw） */}
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Settings2 className="h-3.5 w-3.5" />
                兼容性配置（Compat）
              </div>
              <p className="text-xs text-muted-foreground">
                未配置时根据 Base URL 自动检测。手动配置可覆盖自动检测结果。
              </p>

              {/* thinkingFormat 选择 */}
              <div className="space-y-1.5">
                <Label className="text-xs">Thinking 方言</Label>
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
                  <option value="">自动检测</option>
                  {thinkingFormats.map(fmt => (
                    <option key={fmt} value={fmt}>
                      {THINKING_FORMAT_LABELS[fmt] || fmt}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  不同 provider 的 reasoning 控制参数形状不同，选择对应方言以正确发送思考参数。
                </p>
              </div>

              {/* maxTokensField 选择 */}
              <div className="space-y-1.5">
                <Label className="text-xs">max_tokens 字段名</Label>
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
                  <option value="max_tokens">max_tokens（默认）</option>
                  <option value="max_completion_tokens">max_completion_tokens（OpenAI o1+）</option>
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
                  <span>支持 reasoning_effort 参数（OpenAI 风格）</span>
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
                  <span>支持工具调用（function calling）</span>
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
                  <span>要求消息 content 为字符串（不接受 null）</span>
                </label>
              </div>
            </div>

            {providerError && <p className="text-sm text-destructive">{providerError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleSaveProvider}
              disabled={createProvider.isPending || updateProvider.isPending}
            >
              {(createProvider.isPending || updateProvider.isPending) && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {editingProvider ? '保存' : '添加'}
            </Button>
          </div>
      </Dialog>
    </div>
  );
}
