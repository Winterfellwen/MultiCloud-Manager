// models.list RPC 方法
// 返回所有已配置 provider 的模型列表

import { config } from '../config.js';

/** 模型列表项 */
export interface ModelListItem {
  /** 模型 ID（格式：provider/model，供 chat.send 的 model 参数使用） */
  id: string;
  /** 模型显示名 */
  name: string;
  /** 所属 provider ID */
  provider: string;
  /** 上下文窗口大小（token 数） */
  contextWindow?: number;
  /** 是否支持推理模式 */
  reasoning?: boolean;
  /** 输入类型：text / image / audio 等 */
  input?: string[];
  /** 是否可用（apiKey 是否已配置） */
  available: boolean;
}

/**
 * models.list - 返回所有已配置 provider 的模型列表
 *
 * 包含：
 * - 默认 provider（从 config.llm 合成）
 * - 多 provider（从 config.llmProviders 读取）
 */
export function handleModelsList(
  respond: (ok: boolean, payload: unknown) => void
): void {
  const models: ModelListItem[] = [];

  // 默认 provider（向后兼容）
  if (config.llm.baseUrl) {
    models.push({
      id: `default/${config.llm.model}`,
      name: config.llm.model,
      provider: 'default',
      available: Boolean(config.llm.apiKey),
    });
  }

  // 多 provider 配置
  for (const provider of config.llmProviders) {
    const available = Boolean(provider.apiKey);
    for (const model of provider.models) {
      models.push({
        id: `${provider.id}/${model.id}`,
        name: model.name,
        provider: provider.id,
        contextWindow: model.contextWindow,
        reasoning: model.reasoning,
        input: model.input,
        available,
      });
    }
  }

  respond(true, { models });
}
