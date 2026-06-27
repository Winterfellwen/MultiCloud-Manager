import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GROUP_MODE_LABELS, type GroupMode } from '@/types/topology';
import { Network, Layers, Cloud, Users, DollarSign } from 'lucide-react';

interface GroupModeSwitcherProps {
  currentMode: GroupMode;
  onChange: (mode: GroupMode) => void;
}

const GROUP_MODE_ICONS: Record<GroupMode, React.ComponentType<{ className?: string }>> = {
  hierarchy: Network,
  resourceType: Layers,
  provider: Cloud,
  team: Users,
  cost: DollarSign,
};

export function GroupModeSwitcher({ currentMode, onChange }: GroupModeSwitcherProps) {
  return (
    <div className="flex items-center gap-1">
      {(Object.keys(GROUP_MODE_LABELS) as GroupMode[]).map((mode) => {
        const Icon = GROUP_MODE_ICONS[mode];
        const isActive = currentMode === mode;

        return (
          <Button
            key={mode}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(mode)}
            className={cn(
              'flex items-center gap-1.5 text-xs h-8',
              isActive && 'bg-primary text-primary-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {GROUP_MODE_LABELS[mode]}
          </Button>
        );
      })}
    </div>
  );
}
