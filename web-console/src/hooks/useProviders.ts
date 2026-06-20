// LLM Provider 管理 hook：通过 WebSocket RPC 获取/管理 provider
// 支持 compat 配置和 thinkingFormat 方言（参考 openclaw）
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '@/stores/chat';

/** Thinking 方言（与后端 THINKING_FORMATS 一致） */
export type ThinkingFormat =
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'together'
  | 'qwen'
  | 'qwen-chat-template'
  | 'zai';

/** 统一思考级别 */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

/** Provider 级 compat 配置 */
export interface ProviderCompat {
  thinkingFormat?: ThinkingFormat;
  supportsReasoningEffort?: boolean;
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  supportsTools?: boolean;
  requiresStringContent?: boolean;
}

export interface LlmModelConfig {
  id: string;
  name: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
  /** 覆盖 provider 级 compat.thinkingFormat */
  thinkingFormat?: ThinkingFormat;
  /** 各思考级别到 provider 参数的映射 */
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  /** 该模型支持的思考级别列表 */
  supportedReasoningEfforts?: string[];
}

export interface LlmProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // masked
  models: LlmModelConfig[];
  /** provider 级 compat 配置 */
  compat?: ProviderCompat;
  isDefault?: boolean;
}

export function useProviders() {
  const wsClient = useChatStore((s) => s.wsClient);
  return useQuery({
    queryKey: ['llm-providers'],
    queryFn: async () => {
      if (!wsClient) return [];
      const res = await wsClient.request<{ providers: LlmProviderConfig[] }>('providers.list', {});
      return res.providers;
    },
    enabled: !!wsClient,
    staleTime: 30_000,
  });
}

/** 获取支持的 thinkingFormat 列表（供表单渲染选项） */
export function useThinkingFormats() {
  const wsClient = useChatStore((s) => s.wsClient);
  return useQuery({
    queryKey: ['thinking-formats'],
    queryFn: async () => {
      if (!wsClient) return [];
      const res = await wsClient.request<{ formats: ThinkingFormat[] }>('providers.thinkingFormats', {});
      return res.formats;
    },
    enabled: !!wsClient,
    staleTime: Infinity,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (params: {
      id: string;
      name: string;
      baseUrl: string;
      apiKey: string;
      compat?: ProviderCompat;
      models?: LlmModelConfig[];
    }) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<{ provider: LlmProviderConfig }>('providers.create', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      compat?: ProviderCompat;
      models?: LlmModelConfig[];
    }) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<{ provider: LlmProviderConfig }>('providers.update', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request('providers.delete', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useTestProvider() {
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<{ ok: boolean; message?: string }>('providers.test', { id });
    },
  });
}

export function useDiscoverModels() {
  const queryClient = useQueryClient();
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (providerId: string) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<{ models: Array<{ id: string; name: string; ownedBy?: string }> }>(
        'providers.discoverModels',
        { id: providerId }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}
