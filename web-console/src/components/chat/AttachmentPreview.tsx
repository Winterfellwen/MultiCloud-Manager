// 附件预览组件：横向排列已选附件，图片显示缩略图，其他显示文件图标
import { X, FileText } from 'lucide-react';
import {
  getChatAttachmentPreviewUrl,
  releaseChatAttachmentPayload,
} from '../../lib/openclaw/attachment-payload-store';
import type { ChatAttachment } from '../../lib/openclaw/ui-types';
import { cn } from '../../lib/utils';

interface AttachmentPreviewProps {
  attachments: ChatAttachment[];
  onChange: (attachments: ChatAttachment[]) => void;
}

/** 格式化文件大小 */
function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 判断是否为图片类型 */
function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.mimeType.startsWith('image/');
}

export function AttachmentPreview({ attachments, onChange }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  const handleRemove = (id: string) => {
    // 释放 object URL 资源
    releaseChatAttachmentPayload(id);
    onChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {attachments.map((attachment) => {
        const previewUrl = getChatAttachmentPreviewUrl(attachment);
        const isImage = isImageAttachment(attachment);
        return (
          <div
            key={attachment.id}
            className={cn(
              'group relative flex shrink-0 flex-col items-center gap-1 rounded-md border border-border bg-muted/30 p-2',
              'w-24'
            )}
          >
            <button
              type="button"
              onClick={() => handleRemove(attachment.id)}
              title="移除附件"
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
            <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded bg-background">
              {isImage && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={attachment.fileName || '附件'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="w-full truncate text-center text-[11px] text-foreground">
              {attachment.fileName || '未命名'}
            </div>
            {attachment.sizeBytes != null && (
              <div className="w-full truncate text-center text-[10px] text-muted-foreground">
                {formatSize(attachment.sizeBytes)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
