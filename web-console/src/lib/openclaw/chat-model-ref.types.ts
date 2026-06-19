// CloudOps 聊天模型覆盖类型定义。
export type ChatModelOverride =
  | {
      kind: "qualified";
      value: string;
    }
  | {
      kind: "raw";
      value: string;
    };
