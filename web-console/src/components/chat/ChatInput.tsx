// 输入框 + 发送 + 中止按钮
import { type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export function ChatInput() {
  const inputText = useChatStore((s) => s.inputText);
  const isSending = useChatStore((s) => s.isSending);
  const setInputText = useChatStore((s) => s.setInputText);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const streamingBuffers = useChatStore((s) => s.streamingBuffers);

  // 获取当前正在运行的 runId
  const currentRunId = Object.keys(streamingBuffers)[0] || null;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isSending) return;
    sendMessage(inputText);
  };

  const handleAbort = () => {
    if (currentRunId) {
      abortRun(currentRunId);
    }
  };

  return (
    <div className="border-t border-border bg-background p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={1}
          className={cn(
            'max-h-32 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'overflow-auto'
          )}
          style={{ minHeight: '40px' }}
        />
        {isSending ? (
          <Button onClick={handleAbort} variant="destructive" size="sm">
            <Square className="h-4 w-4" />
            中止
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={!inputText.trim()} size="sm">
            <Send className="h-4 w-4" />
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
