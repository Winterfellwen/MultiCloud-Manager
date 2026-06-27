import { Badge } from '@/components/ui/badge';
import { TOPOLOGY_CATEGORY_LABELS, type TopologyNode, type TopologyCategory } from '@/types/topology';
import { getStatusColor } from '@/types/resource';

interface OverviewTabProps {
  node: TopologyNode;
}

export function OverviewTab({ node }: OverviewTabProps) {
  const categoryLabel = TOPOLOGY_CATEGORY_LABELS[node.category as TopologyCategory] || node.category;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-semibold">{node.label}</div>
          <div className="text-sm text-muted-foreground">{node.type}</div>
        </div>
        <Badge variant={getStatusColor(node.status)}>{node.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">分类</span>
          <div className="font-medium">{categoryLabel}</div>
        </div>
        <div>
          <span className="text-muted-foreground">云厂商</span>
          <div className="font-medium">{node.provider}</div>
        </div>
        <div>
          <span className="text-muted-foreground">区域</span>
          <div className="font-medium">{node.region}</div>
        </div>
        {node.data && Object.keys(node.data).length > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground">属性</span>
            <div className="mt-1 space-y-1">
              {Object.entries(node.data).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="truncate max-w-[180px]">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
