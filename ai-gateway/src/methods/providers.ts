// providers.* RPC 方法
// 支持 LLM provider 的增删改查（含 compat 配置和 thinkingFormat 方言）

import {
  listProvidersFromStore,
  getProviderFromStore,
  createProviderInStore,
  updateProviderInStore,
  deleteProviderFromStore,
} from '../acp/provider-store.js';
import {
  type LLMModelConfig,
  type ProviderCompat,
  type ThinkingFormat,
  isThinkingFormat,
  THINKING_FORMATS,
} from '../config.js';
import {
  normalizeCompat,
  normalizeThinkingLevelMap,
} from '../agent/thinking-format.js';

interface ProviderModelInput {
  id: string;
  name: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
  thinkingFormat?: string;
  thinkingLevelMap?: Record<string, unknown>;
  supportedReasoningEfforts?: string[];
}

interface ProviderCompatInput {
  thinkingFormat?: string;
  supportsReasoningEffort?: boolean;
  maxTokensField?: string;
  supportsTools?: boolean;
  requiresStringContent?: boolean;
}

/** 规范化 compat 输入 */
function normalizeCompatInput(raw: ProviderCompatInput | undefined): ProviderCompat | undefined {
  if (!raw) return undefined;
  return normalizeCompat(raw);
}

/** 规范化 model 输入（含 thinking 配置） */
function normalizeModel(m: ProviderModelInput): LLMModelConfig {
  const model: LLMModelConfig = {
    id: m.id,
    name: m.name,
    contextWindow: m.contextWindow,
    reasoning: m.reasoning,
    input: m.input,
  };
  if (typeof m.thinkingFormat === 'string' && isThinkingFormat(m.thinkingFormat)) {
    model.thinkingFormat = m.thinkingFormat as ThinkingFormat;
  }
  if (m.thinkingLevelMap) {
    const map = normalizeThinkingLevelMap(m.thinkingLevelMap);
    if (map) model.thinkingLevelMap = map;
  }
  if (Array.isArray(m.supportedReasoningEfforts)) {
    model.supportedReasoningEfforts = m.supportedReasoningEfforts.filter(x => typeof x === 'string');
  }
  return model;
}

/** providers.list - 列出所有 provider */
export async function handleProvidersList(
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const providers = await listProvidersFromStore();
    // 隐藏 apiKey 的明文，只返回 masked 版本
    const masked = providers.map(p => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }));
    respond(true, { providers: masked });
  } catch (e) {
    respond(false, { error: 'LIST_FAILED', message: (e as Error).message });
  }
}

/** providers.create - 创建 provider */
export async function handleProvidersCreate(
  params: {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    compat?: ProviderCompatInput;
    models?: ProviderModelInput[];
  },
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    if (!params.id || !params.name || !params.baseUrl || !params.apiKey) {
      respond(false, { error: 'MISSING_FIELDS', message: 'id, name, baseUrl, apiKey 为必填' });
      return;
    }
    // 检查 ID 是否已存在
    const existing = await getProviderFromStore(params.id);
    if (existing) {
      respond(false, { error: 'DUPLICATE_ID', message: `Provider ID "${params.id}" 已存在` });
      return;
    }
    const provider = await createProviderInStore({
      id: params.id,
      name: params.name,
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      compat: normalizeCompatInput(params.compat),
      models: (params.models || []).map(m => normalizeModel(m)),
    });
    respond(true, { provider: { ...provider, apiKey: maskApiKey(provider.apiKey) } });
  } catch (e) {
    respond(false, { error: 'CREATE_FAILED', message: (e as Error).message });
  }
}

/** providers.update - 更新 provider */
export async function handleProvidersUpdate(
  params: {
    id: string;
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    compat?: ProviderCompatInput;
    models?: ProviderModelInput[];
  },
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const existing = await getProviderFromStore(params.id);
    if (!existing) {
      respond(false, { error: 'NOT_FOUND', message: `Provider "${params.id}" 不存在` });
      return;
    }
    const provider = await updateProviderInStore(params.id, {
      name: params.name,
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      compat: params.compat !== undefined ? normalizeCompatInput(params.compat) : undefined,
      models: params.models ? params.models.map(m => normalizeModel(m)) : undefined,
    });
    respond(true, { provider: provider ? { ...provider, apiKey: maskApiKey(provider.apiKey) } : null });
  } catch (e) {
    respond(false, { error: 'UPDATE_FAILED', message: (e as Error).message });
  }
}

/** providers.delete - 删除 provider */
export async function handleProvidersDelete(
  params: { id: string },
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const ok = await deleteProviderFromStore(params.id);
    if (!ok) {
      respond(false, { error: 'NOT_FOUND', message: `Provider "${params.id}" 不存在` });
      return;
    }
    respond(true, { id: params.id, deleted: true });
  } catch (e) {
    respond(false, { error: 'DELETE_FAILED', message: (e as Error).message });
  }
}

/** providers.test - 测试 provider 连通性 */
export async function handleProvidersTest(
  params: { id: string },
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const provider = await getProviderFromStore(params.id);
    if (!provider) {
      respond(false, { error: 'NOT_FOUND', message: `Provider "${params.id}" 不存在` });
      return;
    }
    // 用第一个模型发一个简单请求测试连通性
    const model = provider.models[0];
    if (!model) {
      respond(false, { error: 'NO_MODELS', message: '该 provider 没有配置模型' });
      return;
    }
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      respond(true, { ok: true, message: '连接成功' });
    } else {
      const errText = await res.text().catch(() => '');
      respond(false, { error: 'TEST_FAILED', message: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
    }
  } catch (e) {
    respond(false, { error: 'TEST_FAILED', message: (e as Error).message });
  }
}

/** providers.thinkingFormats - 返回支持的 thinkingFormat 列表（供前端渲染选项） */
export async function handleProvidersThinkingFormats(
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  respond(true, { formats: THINKING_FORMATS });
}

// ============ 辅助函数 ============

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
