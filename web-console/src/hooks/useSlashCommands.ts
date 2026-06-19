// 斜杠命令 hook：合并本地命令和远程命令（commands.list RPC），提供匹配函数
import { useQuery } from '@tanstack/react-query';
import { useChatStore } from '@/stores/chat';

export interface SlashCommand {
  key: string;
  name: string;
  description: string;
  args?: string;
  category?: 'session' | 'model' | 'tools';
}

// 本地命令（不需要后端）
const LOCAL_COMMANDS: SlashCommand[] = [
  { key: 'new', name: 'new', description: '新建对话', category: 'session' },
  { key: 'stop', name: 'stop', description: '停止生成', category: 'session' },
  { key: 'clear', name: 'clear', description: '清空对话', category: 'session' },
  { key: 'help', name: 'help', description: '显示帮助', category: 'session' },
  { key: 'model', name: 'model', description: '切换模型', category: 'model', args: '<model>' },
];

export function useSlashCommands() {
  const wsClient = useChatStore((s) => s.wsClient);

  const remoteQuery = useQuery({
    queryKey: ['slash-commands'],
    queryFn: async () => {
      if (!wsClient) return [];
      const res = await wsClient.request<{ commands: SlashCommand[] }>('commands.list', {});
      return res.commands || [];
    },
    enabled: !!wsClient,
    staleTime: 60_000,
  });

  // 合并本地命令和远程命令（远程命令去重：key 不与本地冲突）
  const localKeys = new Set(LOCAL_COMMANDS.map((c) => c.key));
  const remoteCommands = (remoteQuery.data || []).filter((c) => !localKeys.has(c.key));
  const commands = [...LOCAL_COMMANDS, ...remoteCommands];

  /** 根据输入前缀匹配命令（输入形如 "/new" 或 "/mo"） */
  const matchCommands = (input: string): SlashCommand[] => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return [];
    const query = trimmed.slice(1).toLowerCase();
    if (!query) return commands;
    return commands.filter((c) => c.name.toLowerCase().startsWith(query));
  };

  return {
    commands,
    matchCommands,
    isLoading: remoteQuery.isLoading,
  };
}
