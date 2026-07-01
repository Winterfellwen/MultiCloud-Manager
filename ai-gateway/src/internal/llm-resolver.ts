// 运维 AI（告警分析、Dashboard 洞察）共用 LLM 配置解析
// 复用 provider store：优先使用用户在 AiSettings 配置的默认 provider，
// 回退到环境变量 config.llm，确保开箱即用。

import { config } from '../config.js';
import { listProvidersFromStore } from '../acp/provider-store.js';

export interface ResolvedOpsLlm {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 解析运维 AI 使用的 LLM 配置。
 *
 * 优先级：
 * 1. provider store 中 is_default=true 的 provider（用户在 AiSettings 页面设置的默认 provider）
 * 2. provider store 中第一个 provider
 * 3. 环境变量 config.llm（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）
 *
 * 这样用户在前端配置好 provider 后，运维 AI 功能自动可用，无需改 .env。
 */
export async function resolveOpsLlm(): Promise<ResolvedOpsLlm> {
  const providers = await listProvidersFromStore();
  const defaultProvider = providers.find((p) => p.isDefault) || providers[0];

  if (defaultProvider && defaultProvider.apiKey && defaultProvider.models.length > 0) {
    const modelId = defaultProvider.models[0].id;
    // OpenAI 兼容 API（NVIDIA NIM、OpenRouter 等）通常需要 "provider/model" 格式
    // OpenAI 自己的 API 接受纯 model 名（如 gpt-4o）
    const fullModelId = modelId.includes('/') ? modelId : `${defaultProvider.id}/${modelId}`;
    return {
      baseUrl: defaultProvider.baseUrl,
      apiKey: defaultProvider.apiKey,
      model: fullModelId,
    };
  }

  // 回退到环境变量配置
  if (!config.llm.apiKey) {
    throw new Error(
      '未配置 LLM provider。请在「AI 设置」页面添加 provider 并设为默认，或在 .env 中配置 LLM_API_KEY。',
    );
  }

  return {
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
  };
}

/**
 * 通用 LLM 聊天调用（非 Agent 场景，如告警分析、Dashboard 洞察）
 */
export async function callLlmChat(
  prompt: string,
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const llm = await resolveOpsLlm();

  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
