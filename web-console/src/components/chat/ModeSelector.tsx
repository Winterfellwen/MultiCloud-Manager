import { useChatStore } from '../../stores/chat';
import type { Mode } from '../../stores/chat';
import { cn } from '../../lib/utils';

const modes: { value: Mode; label: string; color: string }[] = [
  { value: 'plan', label: 'Plan', color: 'blue' },
  { value: 'action', label: 'Action', color: 'green' },
  { value: 'confirm', label: 'Confirm', color: 'orange' },
];

export function ModeSelector() {
  const mode = useChatStore((s) => s.mode);
  const setMode = useChatStore((s) => s.setMode);

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex border border-border rounded-md overflow-hidden">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              mode === m.value
                ? m.color === 'blue'
                  ? 'bg-blue-500 text-white'
                  : m.color === 'green'
                  ? 'bg-green-500 text-white'
                  : 'bg-orange-500 text-white'
                : 'bg-background text-muted-foreground hover:bg-accent'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        Current: <strong>{mode}</strong> mode
      </span>
    </div>
  );
}
