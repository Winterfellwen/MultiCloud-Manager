// 工具调用卡片：折叠态显示工具名 + 状态图标 + 摘要；展开态显示参数/结果/错误
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wrench,
  List,
  Eye,
  Play,
  Square,
  RotateCw,
  Plus,
  Trash2,
  Activity,
  AlertTriangle,
  DollarSign,
  Copy,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveToolDisplay } from '../../lib/openclaw/tool-display';
import {
  formatCollapsedToolPreviewText,
  isToolErrorOutput,
} from '../../lib/openclaw/tool-cards-logic';
import { cn } from '../../lib/utils';
import { EASE, DURATION } from '../../lib/motion';

/** tool-display.ts 中 icon 字段 → lucide-react 图标组件映射 */
const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  list: List,
  eye: Eye,
  play: Play,
  square: Square,
  rotate: RotateCw,
  plus: Plus,
  trash: Trash2,
  activity: Activity,
  alert: AlertTriangle,
  dollar: DollarSign,
  wrench: Wrench,
};

interface ToolCallCardProps {
  toolCall: {
    id: string;
    name: string;
    args: unknown;
    result?: { name: string; content: unknown };
    status: 'pending' | 'completed';
  };
  isExpanded: boolean;
  onToggle: () => void;
}

/** 从工具结果 content 中提取纯文本，用于折叠态摘要 */
function extractResultText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const text = (entry as { text?: unknown }).text;
      return typeof text === 'string' ? [text] : [];
    });
    if (parts.length > 0) {
      return parts.join('\n');
    }
  }
  return undefined;
}

/** 序列化参数/结果为可展示字符串（自动解析 JSON 字符串并格式化） */
export function serializeValue(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        // 非合法 JSON，原样返回
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallCard({ toolCall, isExpanded, onToggle }: ToolCallCardProps) {
  const display = resolveToolDisplay(toolCall.name);
  const IconComp = TOOL_ICON_MAP[display.icon] ?? Wrench;
  const [copied, setCopied] = useState(false);

  // 提取结果文本并判断是否出错
  const resultText = toolCall.result
    ? extractResultText(toolCall.result.content)
    : undefined;
  const isError = isToolErrorOutput(resultText);
  const isCompleted = toolCall.status === 'completed';
  const summary = formatCollapsedToolPreviewText(resultText);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const argsStr = serializeValue(toolCall.args);
    const resultStr = toolCall.result
      ? serializeValue(toolCall.result.content)
      : '(等待执行结果)';
    const text = `工具: ${display.label}\n参数:\n${argsStr}\n结果:\n${resultStr}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className={cn(
        'group/card my-2 rounded-md border bg-muted/30 text-sm',
        isError ? 'border-destructive/60' : 'border-border'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <IconComp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{display.label}</span>
        {/* 折叠态摘要 */}
        {!isExpanded && summary && (
          <span className="ml-1 truncate text-xs text-muted-foreground">
            {summary}
          </span>
        )}
        {/* 复制按钮 */}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/card:opacity-100',
            copied && 'text-green-600 opacity-100'
          )}
          title={copied ? '已复制' : '复制工具调用'}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
        {/* 状态图标 */}
        <span className="flex shrink-0 items-center">
          {isCompleted ? (
            isError ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            )
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.out }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-border px-3 py-2">
              {/* 展开态复制按钮 */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    copied && 'text-green-600'
                  )}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              {/* 参数 */}
              <div>
                <div className="mb-1 text-xs text-muted-foreground">参数</div>
                {toolCall.args != null ? (
                  <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">
                    {serializeValue(toolCall.args)}
                  </pre>
                ) : (
                  <div className="rounded bg-background p-2 font-mono text-xs text-muted-foreground">
                    无参数
                  </div>
                )}
              </div>
              {/* 结果 */}
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  结果
                  {isError && (
                    <span className="text-destructive">
                      <AlertCircle className="inline h-3 w-3" /> 错误
                    </span>
                  )}
                </div>
                {toolCall.result ? (
                  <pre className="max-h-60 overflow-auto rounded bg-background p-2 font-mono text-xs">
                    {serializeValue(toolCall.result.content)}
                  </pre>
                ) : (
                  <div className="flex items-center gap-1.5 rounded bg-background p-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>等待执行结果...</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
