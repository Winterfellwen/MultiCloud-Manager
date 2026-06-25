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

function ResourceNodeComponent({ data, selected, costScale = 1 }: NodeProps<ResourceNodeData> & { costScale?: number }) {
  const Icon = ICON_MAP[data.icon] || Server;
  const color = NODE_COLORS[data.category as TopologyCategory] || '#6b7280';
  const isRunning = data.status === 'running' || data.status === 'active';
  const isStopped = data.status === 'stopped';
  const isError = data.status === 'error';
  const isPending = data.status === 'pending';
  const nodeData = (data.data || {}) as Record<string, unknown>;
  const cidrBlock = (data.type === 'vpc' || data.type === 'subnet') ? nodeData.cidrBlock as string : undefined;

  return (
    <div
      className={cn(
        'relative group cursor-pointer transition-all duration-300'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0 focus-visible:ring-2 focus-visible:ring-blue-500" />

      {/* Glow effect */}
      <div
        className={cn(
          'absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg',
          selected && 'opacity-70'
        )}
        style={{ backgroundColor: color }}
      />

      {/* Main card */}
      <div
        className={cn(
          'relative flex flex-col items-center rounded-2xl border backdrop-blur-md shadow-md transition-all duration-300',
          'min-w-[110px] max-w-[140px] px-3 py-3',
          selected
            ? 'border-white/40 shadow-xl scale-[1.03]'
            : 'border-white/20 hover:border-white/40 hover:shadow-lg hover:scale-[1.02]'
        )}
        style={{
          background: `linear-gradient(145deg, rgba(255,255,255,0.95) 0%, ${color}08 100%)`,
        }}
        aria-label={`${data.label} - ${data.status}`}
      >
        {/* Icon */}
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl mb-2 shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${color}25 0%, ${color}10 100%)`,
            boxShadow: `0 2px 6px ${color}15`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color } as CSSProperties} />
        </div>

        {/* Instance count badge (summary view) */}
        {(nodeData.instanceCount as number) > 0 && (
          <div
            className="absolute -top-2 -right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-md border"
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}10)`,
              borderColor: `${color}40`,
              color,
            }}
            aria-label={`${nodeData.instanceCount} instances`}
          >
            <Server className="w-2.5 h-2.5" aria-hidden="true" />
            {String(nodeData.instanceCount ?? '')}
          </div>
        )}

        {/* Label */}
        <div className="text-[11px] font-semibold text-gray-800 text-center truncate max-w-[90px] leading-tight">
          {data.label}
        </div>

        {/* Network info (CIDR) */}
        {cidrBlock && (
          <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-gray-100/80 border border-gray-200/60">
            <span className="text-[9px] font-mono text-gray-600 truncate max-w-[100px]">
              {cidrBlock}
            </span>
          </div>
        )}

        {/* Provider / Region */}
        <div className="text-[9px] text-gray-400 mt-1 truncate max-w-[90px]">
          {data.provider} / {data.region}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1 mt-2">
          <div className="relative">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isRunning && 'bg-emerald-400',
                isStopped && 'bg-gray-300',
                isPending && 'bg-amber-400',
                isError && 'bg-red-400',
                !isRunning && !isStopped && !isPending && !isError && 'bg-gray-300'
              )}
            />
            {isRunning && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30 motion-reduce:animate-none" />
            )}
          </div>
          <span
            className={cn(
              'text-[9px] font-medium',
              isRunning && 'text-emerald-600',
              isStopped && 'text-gray-400',
              isPending && 'text-amber-600',
              isError && 'text-red-600'
            )}
          >
            {data.status}
          </span>
        </div>

        {/* Cost label (cost mode) */}
        {costScale > 1 && (data.data as Record<string, unknown>)?.monthlyCost && (
          <div className="text-[9px] font-mono text-gray-500 mt-1">
            ${(data.data as Record<string, unknown>).monthlyCost as number}/mo
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0 focus-visible:ring-2 focus-visible:ring-blue-500" />
    </div>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);
