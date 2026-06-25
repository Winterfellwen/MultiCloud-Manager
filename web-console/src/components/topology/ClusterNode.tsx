import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ChevronDown, ChevronRight, Server, Database, HardDrive, Share2, GitBranch, Shield, Globe, Boxes, Cpu, Zap, type LucideIcon } from 'lucide-react';
import { NODE_COLORS, type ClusterData, type TopologyCategory } from '@/types/topology';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  server: Server,
  database: Database,
  'hard-drive': HardDrive,
  'share-2': Share2,
  'git-branch': GitBranch,
  shield: Shield,
  globe: Globe,
  boxes: Boxes,
  cpu: Cpu,
  zap: Zap,
};

type ClusterNodeData = Node<ClusterData & Record<string, unknown>>;

function ClusterNodeComponent({ data, selected }: NodeProps<ClusterNodeData>) {
  const clusterData = data as unknown as ClusterData;
  const Icon = ICON_MAP[clusterData.icon] || Boxes;
  const color = NODE_COLORS[clusterData.category as TopologyCategory] || '#6b7280';
  const totalChildren = clusterData.childNodeIds.length;
  const statusEntries = Object.entries(clusterData.statusSummary);

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-lg border-2 bg-white shadow-sm transition-all cursor-pointer',
        selected ? 'border-primary shadow-md' : 'border-gray-200 hover:border-gray-300',
        'min-w-[160px] max-w-[220px]'
      )}
      style={{ borderColor: selected ? color : undefined }}
      aria-label={`Cluster: ${clusterData.label}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <div
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color } as CSSProperties} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{clusterData.label}</div>
          <div className="text-[10px] text-muted-foreground">
            {totalChildren} 个节点
          </div>
        </div>
        {clusterData.collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </div>

      <div className="flex items-center gap-1 px-3 py-2">
        {statusEntries.map(([status, count]) => (
          <div key={status} className="flex items-center gap-0.5" title={`${status}: ${count}`}>
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                status === 'running' || status === 'active'
                  ? 'bg-green-500'
                  : status === 'stopped'
                  ? 'bg-gray-400'
                  : status === 'pending'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              )}
            />
            <span className="text-[9px] text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
