// CloudOps 模型目录条目类型定义。

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
};
