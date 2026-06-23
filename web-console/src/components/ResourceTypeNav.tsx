import {
  Server,
  HardDrive,
  Database,
  Share2,
  Shield,
  Globe,
  Boxes,
  Cpu,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RESOURCE_CATEGORY_LABELS,
  RESOURCE_CATEGORY_ORDER,
  type ResourceCategory,
  type ResourceStats,
  type ResourceType,
  type ResourceTypeMeta,
} from '@/types/resource';

/** 分类 -> 图标映射 */
const CATEGORY_ICONS: Record<ResourceCategory, LucideIcon> = {
  compute: Server,
  storage: HardDrive,
  database: Database,
  network: Share2,
  security: Shield,
  cdn: Globe,
  container: Boxes,
  ai: Cpu,
};

interface ResourceTypeNavProps {
  types: ResourceTypeMeta[];
  stats?: ResourceStats;
  selected: ResourceType | 'all';
  onSelect: (type: ResourceType | 'all') => void;
}

export function ResourceTypeNav({ types, stats, selected, onSelect }: ResourceTypeNavProps) {
  // 按分类分组
  const grouped = new Map<ResourceCategory, ResourceTypeMeta[]>();
  for (const cat of RESOURCE_CATEGORY_ORDER) grouped.set(cat, []);
  for (const t of types) {
    const arr = grouped.get(t.category);
    if (arr) arr.push(t);
  }

  // 从 stats.byType 数组计算某类型的总数
  const totalCount = stats?.byType?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const getCount = (type: ResourceType) =>
    stats?.byType?.filter((i) => i.resourceType === type).reduce((s, i) => s + i.count, 0) ?? 0;

  return (
    <nav className="w-full shrink-0 border-b bg-card overflow-x-auto md:w-56 md:border-b-0 md:border-r md:overflow-y-auto">
      <div className="p-3">
        <button
          type="button"
          onClick={() => onSelect('all')}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
            selected === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          全部资源
          <span className="ml-auto text-xs opacity-80">{totalCount}</span>
        </button>
      </div>

      <div className="space-y-3 px-3 pb-3 md:block hidden">
        {RESOURCE_CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat) || [];
          if (items.length === 0) return null;
          const Icon = CATEGORY_ICONS[cat];
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {RESOURCE_CATEGORY_LABELS[cat]}
              </div>
              <div className="mt-1 space-y-0.5">
                {items.map((t) => {
                  const count = getCount(t.type);
                  const active = selected === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      title={t.displayName}
                      onClick={() => onSelect(t.type)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                        active
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <span className="truncate">{t.displayName}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 移动端：扁平化的水平滚动列表 */}
      <div className="flex gap-1 px-3 pb-3 md:hidden">
        {RESOURCE_CATEGORY_ORDER.flatMap((cat) => grouped.get(cat) || []).map((t) => {
          const count = getCount(t.type);
          const active = selected === t.type;
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => onSelect(t.type)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                active
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {t.displayName}
              <span className="text-xs text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
