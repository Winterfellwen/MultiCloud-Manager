// models.list RPC 方法
// 返回所有已配置 provider 的模型列表（从 provider store 读取）
// 含 thinkingFormat / thinkingLevelMap 等能力信息

import { listProvidersFromStore } from '../acp/provider-store.js';
import { detectThinkingFormat } from '../agent/thinking-format.js';
import type { ThinkingFormat } from '../config.js';

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
  /** 生效的 thinkingFormat（模型级 > provider compat > 自动检测） */
  thinkingFormat: ThinkingFormat;
  /** 模型级 thinkingLevelMap */
  thinkingLevelMap?: Record<string, string | null>;
  /** 该模型支持的思考级别列表 */
  supportedReasoningEfforts?: string[];
  /** provider 级 compat 配置 */
  providerCompat?: Record<string, unknown>;
}

/**
 * models.list - 返回所有已配置 provider 的模型列表
 * 从 provider store 读取（支持运行时 CRUD）
 * 含 thinkingFormat 方言信息（前端可据此渲染思考级别选项）
 */
export async function handleModelsList(
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const providers = await listProvidersFromStore();
    const models: ModelListItem[] = [];

    for (const provider of providers) {
      const available = Boolean(provider.apiKey);
      for (const model of provider.models) {
        // 计算生效的 thinkingFormat：模型级 > provider compat > 自动检测
        const thinkingFormat: ThinkingFormat =
          model.thinkingFormat ??
          provider.compat?.thinkingFormat ??
          detectThinkingFormat(provider.id, provider.baseUrl);

        models.push({
          id: `${provider.id}/${model.id}`,
          name: model.name,
          provider: provider.id,
          contextWindow: model.contextWindow,
          reasoning: model.reasoning,
          input: model.input,
          available,
          thinkingFormat,
          thinkingLevelMap: model.thinkingLevelMap,
          supportedReasoningEfforts: model.supportedReasoningEfforts,
          providerCompat: provider.compat as Record<string, unknown> | undefined,
        });
      }
    }

    respond(true, { models });
  } catch (e) {
    respond(false, { error: 'MODELS_LIST_FAILED', message: (e as Error).message });
  }
}
