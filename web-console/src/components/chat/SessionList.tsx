// 会话列表侧边栏：新建/切换会话
import { Plus, MessageSquare } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';

export function SessionList() {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const createSession = useChatStore((s) => s.createSession);
  const selectSession = useChatStore((s) => s.selectSession);

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="border-b border-border p-3">
        <Button onClick={createSession} className="w-full" size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          新建对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {sessions.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              暂无对话
            </div>
          )}
          {sessions.map((session) => (
            <div
              key={session.sessionKey}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                currentSessionKey === session.sessionKey && 'bg-muted'
              )}
              onClick={() => selectSession(session.sessionKey)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{session.title}</span>
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                {session.messageCount}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
