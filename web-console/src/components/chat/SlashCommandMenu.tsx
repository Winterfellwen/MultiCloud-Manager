// 斜杠命令菜单：显示匹配的命令列表，支持键盘导航和分类颜色标签
import type { SlashCommand } from '../../hooks/useSlashCommands';
import { cn } from '../../lib/utils';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHoverIndex: (index: number) => void;
}

// 分类对应的标签颜色
const CATEGORY_COLORS: Record<string, string> = {
  session: 'bg-blue-500/15 text-blue-600',
  model: 'bg-purple-500/15 text-purple-600',
  tools: 'bg-green-500/15 text-green-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  session: '会话',
  model: '模型',
  tools: '工具',
};

export function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: SlashCommandMenuProps) {
  if (commands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-80 overflow-hidden rounded-md border border-border bg-white shadow-lg dark:bg-slate-800">
      <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        斜杠命令
      </div>
      <div className="max-h-60 overflow-auto p-1">
        {commands.map((cmd, idx) => {
          const category = cmd.category || 'session';
          return (
            <div
              key={cmd.key}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm',
                idx === selectedIndex && 'bg-accent'
              )}
              onMouseEnter={() => onHoverIndex(idx)}
              onClick={() => onSelect(cmd)}
            >
              <span className="font-mono text-primary">/{cmd.name}</span>
              {cmd.args && (
                <span className="font-mono text-xs text-muted-foreground">{cmd.args}</span>
              )}
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {cmd.description}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  CATEGORY_COLORS[category]
                )}
              >
                {CATEGORY_LABELS[category]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
