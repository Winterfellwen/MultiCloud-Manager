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
  type LucideIcon,
} from 'lucide-react';
import { resolveToolDisplay } from '../../lib/openclaw/tool-display';
import {
  formatCollapsedToolPreviewText,
  isToolErrorOutput,
} from '../../lib/openclaw/tool-cards-logic';
import { cn } from '../../lib/utils';

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

/** 序列化参数/结果为可展示字符串 */
function serializeValue(value: unknown): string {
  if (typeof value === 'string') {
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

  // 提取结果文本并判断是否出错
  const resultText = toolCall.result
    ? extractResultText(toolCall.result.content)
    : undefined;
  const isError = isToolErrorOutput(resultText);
  const isCompleted = toolCall.status === 'completed';
  const summary = formatCollapsedToolPreviewText(resultText);

  return (
    <div
      className={cn(
        'my-2 rounded-md border bg-muted/30 text-sm',
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
        {/* 状态图标 */}
        <span className="ml-auto flex shrink-0 items-center">
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
      {isExpanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {toolCall.args != null && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">参数</div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">
                {serializeValue(toolCall.args)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                结果
                {isError && (
                  <span className="text-destructive">
                    <AlertCircle className="inline h-3 w-3" /> 错误
                  </span>
                )}
              </div>
              <pre className="max-h-60 overflow-auto rounded bg-background p-2 font-mono text-xs">
                {serializeValue(toolCall.result.content)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
