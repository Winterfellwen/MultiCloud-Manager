// CloudOps 模型目录条目类型定义。

/** Thinking 方言（与后端 THINKING_FORMATS 一致） */
export type ThinkingFormat =
  | "openai"
  | "openrouter"
  | "deepseek"
  | "together"
  | "qwen"
  | "qwen-chat-template"
  | "zai";

/** 模型目录中的一条记录，描述可用模型的元数据。 */
export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  alias?: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<"text" | "image" | "document">;
  available?: boolean;
  /** 生效的 thinkingFormat（模型级 > provider compat > 自动检测） */
  thinkingFormat?: ThinkingFormat;
  /** 模型级 thinkingLevelMap */
  thinkingLevelMap?: Record<string, string | null>;
  /** 该模型支持的思考级别列表 */
  supportedReasoningEfforts?: string[];
};
