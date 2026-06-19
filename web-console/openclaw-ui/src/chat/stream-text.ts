// 流式文本前缀裁剪（直接复制自 OpenClaw chat/stream-text.ts）
// 零依赖纯函数，用于处理流式增量文本
export function trimAccumulatedStreamPrefix(text: string, previousText: string | null): string {
  if (!previousText || !text.startsWith(previousText)) {
    return text;
  }
  return text.slice(previousText.length).trimStart();
}
