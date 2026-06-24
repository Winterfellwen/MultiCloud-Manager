import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VIEW_CONFIG, type TopologyView } from '@/types/topology';
import { Network, Database } from 'lucide-react';

interface ViewSwitcherProps {
  currentView: TopologyView;
  onChange: (view: TopologyView) => void;
}

const VIEW_ICONS: Record<TopologyView, React.ComponentType<{ className?: string }>> = {
  network: Network,
  storage: Database,
};

export function ViewSwitcher({ currentView, onChange }: ViewSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      {(Object.keys(VIEW_CONFIG) as TopologyView[]).map((view) => {
        const config = VIEW_CONFIG[view];
        const Icon = VIEW_ICONS[view];
        const isActive = currentView === view;

        return (
          <Button
            key={view}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(view)}
            className={cn(
              'flex items-center gap-2',
              isActive && 'bg-foreground text-background'
            )}
          >
            <Icon className="h-4 w-4" />
            {t(`topology.view.${view}`)}
          </Button>
        );
      })}
    </div>
  );
}
