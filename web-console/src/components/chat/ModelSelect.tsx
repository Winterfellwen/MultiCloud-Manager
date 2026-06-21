// 模型选择器：下拉选择可用模型，显示能力图标，不可用模型灰显
import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { ChevronDown, ImageIcon, Brain, FileText, Check } from 'lucide-react';
import { useModels } from '../../hooks/useModels';
import { useChatStore } from '../../stores/chat';
import { buildChatModelOption } from '../../lib/openclaw/chat-model-ref';
import { cn } from '../../lib/utils';

export function ModelSelect() {
  const { data: models = [], isLoading } = useModels();
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setModel);

  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // 构建选项列表
  const options = models.map((m) => ({
    ...buildChatModelOption(m, models),
    available: m.available !== false,
    input: m.input,
    reasoning: m.reasoning,
  }));

  const selectedLabel =
    options.find((o) => o.value === selectedModel)?.label ||
    (selectedModel ? selectedModel : '选择模型');

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[highlightIdx];
      if (opt && opt.available) {
        setModel(opt.value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isLoading || models.length === 0}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs',
          'hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <span className="max-w-[160px] truncate">{selectedLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && options.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-64 w-64 overflow-auto rounded-md border border-border bg-white p-1 shadow-lg dark:bg-slate-800">
          {options.map((opt, idx) => {
            const supportsImage = opt.input?.includes('image');
            const supportsDocument = opt.input?.includes('document');
            return (
              <div
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs',
                  idx === highlightIdx && 'bg-accent',
                  !opt.available && 'cursor-not-allowed opacity-40'
                )}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => {
                  if (opt.available) {
                    setModel(opt.value);
                    setOpen(false);
                  }
                }}
              >
                <Check
                  className={cn(
                    'h-3 w-3 shrink-0',
                    opt.value === selectedModel ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="flex-1 truncate">{opt.label}</span>
                {/* 能力图标 */}
                <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  {supportsImage && <ImageIcon className="h-3 w-3" />}
                  {supportsDocument && <FileText className="h-3 w-3" />}
                  {opt.reasoning && <Brain className="h-3 w-3" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
