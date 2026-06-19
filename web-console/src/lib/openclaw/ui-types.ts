// CloudOps 聊天附件类型定义。

/** 聊天附件，描述用户在输入框中附加的文件元数据。 */
export type ChatAttachment = {
  id: string;
  dataUrl?: string;
  previewUrl?: string;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
};
