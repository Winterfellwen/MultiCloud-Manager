// 工具调用卡片：展示工具名、参数、结果
import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import type { ToolCallRecord } from '../../types/chat';

interface ToolCallCardProps {
  toolCall: ToolCallRecord;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isCompleted = toolCall.status === 'completed';

  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{toolCall.name}</span>
        {isCompleted ? (
          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-500" />
        ) : (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {toolCall.args != null && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">参数</div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">
                {typeof toolCall.args === 'string'
                  ? toolCall.args
                  : JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">结果</div>
              <pre className="max-h-60 overflow-auto rounded bg-background p-2 font-mono text-xs">
                {typeof toolCall.result.content === 'string'
                  ? toolCall.result.content
                  : JSON.stringify(toolCall.result.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
