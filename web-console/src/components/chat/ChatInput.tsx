// 输入框 + 发送 + 中止按钮 + 模型选择 + 斜杠命令 + 深度思考开关
import { useState, useEffect, type KeyboardEvent } from 'react';
import { Send, Square, Brain } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { useSlashCommands, type SlashCommand } from '../../hooks/useSlashCommands';
import { Button } from '../ui/button';
import { ModelSelect } from './ModelSelect';
import { SlashCommandMenu } from './SlashCommandMenu';
import { cn } from '../../lib/utils';

export function ChatInput() {
  const inputText = useChatStore((s) => s.inputText);
  const isSending = useChatStore((s) => s.isSending);
  const setInputText = useChatStore((s) => s.setInputText);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const createSession = useChatStore((s) => s.createSession);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const setModel = useChatStore((s) => s.setModel);
  const setEnableThinking = useChatStore((s) => s.setEnableThinking);
  const enableThinking = useChatStore((s) => s.enableThinking);
  const streamingBuffers = useChatStore((s) => s.streamingBuffers);

  const { matchCommands } = useSlashCommands();

  // 斜杠命令菜单状态
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 获取当前正在运行的 runId
  const currentRunId = Object.keys(streamingBuffers)[0] || null;

  // 匹配的命令列表
  const matchedCommands = inputText.trim().startsWith('/')
    ? matchCommands(inputText)
    : [];
  const menuOpen = matchedCommands.length > 0;

  // 匹配列表变化时重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [inputText]);

  /** 执行斜杠命令 */
  const executeCommand = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return false;

    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case 'new':
        createSession();
        setInputText('');
        return true;
      case 'stop':
        if (currentRunId) abortRun(currentRunId);
        setInputText('');
        return true;
      case 'clear':
        clearMessages();
        setInputText('');
        return true;
      case 'help':
        // 帮助：清空输入，用户可输入 / 查看命令列表
        setInputText('');
        return true;
      case 'model':
        if (arg) {
          setModel(arg);
          setInputText('');
        }
        return true;
      default:
        return false;
    }
  };

  /** 从菜单选择命令 */
  const handleSelectCommand = (cmd: SlashCommand) => {
    if (cmd.args) {
      // 带参数命令：填充到输入框，等待用户输入参数
      setInputText(`/${cmd.name} `);
    } else {
      // 无参数命令：直接执行
      executeCommand(`/${cmd.name}`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 菜单打开时，拦截导航键
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, matchedCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selected = matchedCommands[selectedIndex];
        if (selected) {
          handleSelectCommand(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInputText('');
        return;
      }
    }

    // 菜单关闭时，Enter 发送或执行命令
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isSending) return;
    // 斜杠命令：尝试执行
    if (inputText.trim().startsWith('/')) {
      const executed = executeCommand(inputText);
      if (executed) return;
    }
    // 普通消息
    sendMessage(inputText);
  };

  const handleAbort = () => {
    if (currentRunId) {
      abortRun(currentRunId);
    }
  };

  return (
    <div className="border-t border-border bg-background p-3">
      <div className="relative flex flex-col gap-2">
        {/* 斜杠命令菜单 */}
        {menuOpen && (
          <SlashCommandMenu
            commands={matchedCommands}
            selectedIndex={selectedIndex}
            onSelect={handleSelectCommand}
            onHoverIndex={setSelectedIndex}
          />
        )}

        {/* 工具栏：模型选择 + 深度思考开关 */}
        <div className="flex flex-wrap items-center gap-2">
          <ModelSelect />
          <button
            type="button"
            onClick={() => setEnableThinking(!enableThinking)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors',
              enableThinking
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background text-muted-foreground hover:bg-accent'
            )}
            title={enableThinking ? '深度思考已开启（点击关闭）' : '深度思考已关闭（点击开启）'}
          >
            <Brain className="h-3 w-3" />
            <span>深度思考</span>
          </button>
        </div>

        {/* 输入框 + 发送按钮 */}
        <div className="flex items-end gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，/ 查看命令，Enter 发送，Shift+Enter 换行"
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
    </div>
  );
}
