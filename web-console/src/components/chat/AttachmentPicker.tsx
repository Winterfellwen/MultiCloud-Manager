// 附件选择组件：文件选择按钮 + 粘贴图片 + 拖拽上传
import {
  useState,
  useRef,
  useEffect,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import { Paperclip } from 'lucide-react';
import { CHAT_ATTACHMENT_ACCEPT, isSupportedChatAttachmentFile } from '../../lib/openclaw/attachment-support';
import { registerChatAttachmentPayload } from '../../lib/openclaw/attachment-payload-store';
import type { ChatAttachment } from '../../lib/openclaw/ui-types';
import { cn } from '../../lib/utils';

interface AttachmentPickerProps {
  attachments: ChatAttachment[];
  onChange: (attachments: ChatAttachment[]) => void;
}

/** 生成附件唯一 id */
function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取文件为 base64 data URL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AttachmentPicker({ attachments, onChange }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  /** 处理文件列表：过滤不支持的类型，读取为 dataUrl 并注册到 payload store */
  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(isSupportedChatAttachmentFile);
    if (files.length === 0) return;

    const added: ChatAttachment[] = [];
    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const base: ChatAttachment = {
          id: generateAttachmentId(),
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name,
          sizeBytes: file.size,
        };
        // 注册到 payload store，获取 previewUrl
        const registered = registerChatAttachmentPayload({
          attachment: base,
          dataUrl,
          file,
        });
        added.push(registered);
      } catch {
        // 单个文件读取失败，跳过
      }
    }
    if (added.length > 0) {
      onChange([...attachments, ...added]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void addFiles(e.target.files);
    }
    // 重置 input value 以便重复选择同一文件
    e.target.value = '';
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files);
    }
  };

  // 监听全局 paste 事件，提取剪贴板中的图片
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
      if (imageFiles.length > 0) {
        void addFiles(imageFiles);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex items-center',
        isDragOver && 'rounded-md ring-2 ring-ring ring-offset-1'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={CHAT_ATTACHMENT_ACCEPT}
        onChange={handleInputChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleButtonClick}
        title="添加附件"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Paperclip className="h-4 w-4" />
      </button>
    </div>
  );
}
