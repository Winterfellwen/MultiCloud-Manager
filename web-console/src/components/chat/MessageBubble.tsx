// 消息气泡：区分 user/assistant，assistant 消息渲染文本 + 工具卡片
// 支持复制：hover 显示复制按钮，点击复制消息内容
// 支持深度思考（reasoning）独立折叠展示
// 支持按时间顺序渲染 blocks（reasoning / text / tool_call 按实际输出顺序）
import { useState } from 'react';
import { User, Bot, AlertCircle, Copy, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { ChatMessage, ContentBlock } from '../../types/chat';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '../../lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
}

/** 深度思考区块：折叠态显示标题 + 预览；展开态显示完整推理过程 */
function ReasoningBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming: boolean }) {
  // 默认折叠（用户可手动展开查看推理过程）
  const [expanded, setExpanded] = useState(false);
  const previewLines = reasoning.split('\n').slice(0, 2).join('\n');

  return (
    <div className="my-1 rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground">思考</span>
        {isStreaming && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
        {!expanded && previewLines && (
          <span className="ml-1 min-w-0 flex-1 truncate text-xs italic text-muted-foreground/70">
            {previewLines}
          </span>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {expanded ? '收起' : '展开'}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <p className="whitespace-pre-wrap break-words text-xs italic leading-relaxed text-muted-foreground">
            {reasoning}
          </p>
        </div>
      )}
    </div>
  );
}

/** 文本块：渲染正文内容，streaming 时显示光标 + "正在生成"提示 */
function TextBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  if (!content && !isStreaming) return null;
  return (
    <div className="space-y-1">
      {content && (
        <div className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {content}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
          )}
        </div>
      )}
      {isStreaming && !content && (
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>正在生成回复...</span>
        </div>
      )}
    </div>
  );
}

/** 按 blocks 顺序渲染 assistant 消息内容 */
function BlocksRenderer({
  blocks,
  isStreaming,
  expandedTools,
  onToggleTool,
}: {
  blocks: ContentBlock[];
  isStreaming: boolean;
  expandedTools: Set<string>;
  onToggleTool: (id: string) => void;
}) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === 'reasoning') {
          // reasoning 块：仅当该块是最后一个块时才传 isStreaming（流式输出中）
          const isLast = block === blocks[blocks.length - 1];
          return (
            <ReasoningBlock
              key={block.id}
              reasoning={block.content}
              isStreaming={isStreaming && isLast}
            />
          );
        }
        if (block.type === 'text') {
          const isLast = block === blocks[blocks.length - 1];
          return (
            <TextBlock
              key={block.id}
              content={block.content}
              isStreaming={isStreaming && isLast}
            />
          );
        }
        // tool_call 块
        return (
          <ToolCallCard
            key={block.id}
            toolCall={block.toolCall}
            isExpanded={expandedTools.has(block.toolCall.id)}
            onToggle={() => onToggleTool(block.toolCall.id)}
          />
        );
      })}
    </>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';
  // 工具卡片展开状态（按 toolCall id 跟踪）
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  // 复制状态
  const [copied, setCopied] = useState(false);

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    const text = message.content || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div className={cn('group flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn('flex min-w-0 max-w-[80%] flex-col gap-1', isUser && 'items-end')}>
        {/* user 消息：仅渲染 content，不参与 assistant 的 blocks 渲染逻辑 */}
        {isUser && message.content && (
          <div
            className={cn(
              'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
              'bg-primary text-primary-foreground'
            )}
          >
            {message.content}
          </div>
        )}

        {/* assistant 消息：优先按 blocks 顺序渲染 */}
        {!isUser && message.blocks && message.blocks.length > 0 ? (
          <div className="w-full">
            <BlocksRenderer
              blocks={message.blocks}
              isStreaming={isStreaming}
              expandedTools={expandedTools}
              onToggleTool={toggleTool}
            />
          </div>
        ) : !isUser && isStreaming && !message.content && message.toolCalls.length === 0 ? (
          // assistant 消息刚创建（blocks 为空、无内容），显示"正在生成"提示
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>正在生成回复...</span>
          </div>
        ) : (
          <>
            {/* 兼容旧消息（无 blocks）：按原顺序渲染 toolCalls → reasoning → content */}
            {!isUser && message.toolCalls.length > 0 && (
              <div className="w-full">
                {message.toolCalls.map((tc) => (
                  <ToolCallCard
                    key={tc.id}
                    toolCall={tc}
                    isExpanded={expandedTools.has(tc.id)}
                    onToggle={() => toggleTool(tc.id)}
                  />
                ))}
              </div>
            )}
            {!isUser && message.reasoning && (
              <ReasoningBlock
                reasoning={message.reasoning}
                isStreaming={isStreaming && !message.content}
              />
            )}
            {!isUser && message.content && (
              <div
                className={cn(
                  'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                  'bg-muted text-foreground'
                )}
              >
                {message.content}
                {isStreaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
                )}
              </div>
            )}
          </>
        )}

        {/* 错误提示 */}
        {isError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{message.error || '生成失败'}</span>
          </div>
        )}

        {/* 复制按钮（hover 显示） */}
        {message.content && (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground',
              'opacity-0 transition-opacity hover:bg-accent hover:text-foreground',
              'group-hover:opacity-100',
              copied && 'text-green-600 opacity-100'
            )}
            title={copied ? '已复制' : '复制'}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>复制</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
