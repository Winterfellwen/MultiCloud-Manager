// CloudOps 聊天消息类型定义（仅保留工具卡片相关类型）。

/** 工具卡片预览（canvas 类型，保留以兼容 ToolCard 结构）。 */
export type ToolPreview = {
  kind: "canvas";
  surface: "assistant_message";
  render: "url";
  title?: string;
  preferredHeight?: number;
  url?: string;
  viewId?: string;
  className?: string;
  style?: string;
};

/** 工具卡片，用于内联渲染工具调用/结果。 */
export type ToolCard = {
  id: string;
  name: string;
  args?: unknown;
  inputText?: string;
  outputText?: string;
  isError?: boolean;
  messageId?: string;
  preview?: ToolPreview;
};
