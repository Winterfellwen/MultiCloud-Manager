import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Server, Database, HardDrive, Share2, GitBranch, Shield, Globe, Boxes, Cpu, Zap, type LucideIcon } from 'lucide-react';
import { NODE_COLORS, type TopologyNode, type TopologyCategory } from '@/types/topology';
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

type ResourceNodeData = Node<TopologyNode & Record<string, unknown>>;

function ResourceNodeComponent({ data, selected }: NodeProps<ResourceNodeData>) {
  const Icon = ICON_MAP[data.icon] || Server;
  const color = NODE_COLORS[data.category as TopologyCategory] || '#6b7280';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 bg-white px-4 py-3 shadow-sm transition-all',
        selected ? 'border-primary shadow-md' : 'border-gray-200 hover:border-gray-300',
        'min-w-[120px]'
      )}
      style={{ borderColor: selected ? color : undefined }}
      aria-label={`${data.label} - ${data.status}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      
      <div
        className="flex items-center justify-center w-8 h-8 rounded-full mb-2"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon className="w-4 h-4" style={{ color } as CSSProperties} />
      </div>
      
      <div className="text-xs font-medium text-center truncate max-w-[100px]">
        {data.label}
      </div>
      
      <div className="text-[10px] text-muted-foreground mt-1">
        {data.provider} / {data.region}
      </div>
      
      <div
        className={cn(
          'absolute -top-1 -right-1 w-2 h-2 rounded-full',
          data.status === 'running' || data.status === 'active'
            ? 'bg-green-500'
            : data.status === 'stopped'
            ? 'bg-gray-400'
            : data.status === 'pending'
            ? 'bg-yellow-500'
            : 'bg-red-500'
        )}
      />
      
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);