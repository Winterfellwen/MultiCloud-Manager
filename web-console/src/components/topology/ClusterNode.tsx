import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ChevronDown, ChevronRight, Server, Database, HardDrive, Share2, GitBranch, Shield, Globe, Boxes, Cpu, Zap, Layers, type LucideIcon } from 'lucide-react';
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
  const Icon = ICON_MAP[clusterData.icon] || Layers;
  const color = NODE_COLORS[clusterData.category as TopologyCategory] || '#6b7280';
  const totalChildren = clusterData.childNodeIds?.length || 0;
  const statusEntries = Object.entries(clusterData.statusSummary || {});

  const runningCount = statusEntries.find(([s]) => s === 'running' || s === 'active')?.[1] || 0;
  const stoppedCount = statusEntries.find(([s]) => s === 'stopped')?.[1] || 0;
  const errorCount = statusEntries.find(([s]) => s === 'error')?.[1] || 0;
  const pendingCount = statusEntries.find(([s]) => s === 'pending')?.[1] || 0;

  return (
    <div
      className={cn(
        'relative group cursor-pointer transition-all duration-300'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Glow effect */}
      <div
        className={cn(
          'absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-300 blur-xl',
          selected && 'opacity-80'
        )}
        style={{ backgroundColor: color }}
      />

      {/* Main card */}
      <div
        className={cn(
          'relative flex flex-col rounded-2xl border backdrop-blur-md shadow-lg transition-all duration-300',
          'min-w-[180px] max-w-[240px]',
          selected
            ? 'border-white/40 shadow-2xl scale-[1.02]'
            : 'border-white/20 hover:border-white/40 hover:shadow-xl hover:scale-[1.01]'
        )}
        style={{
          background: `linear-gradient(135deg, ${color}18 0%, ${color}08 50%, rgba(255,255,255,0.95) 100%)`,
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-4 right-4 h-[2px] rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${color}30 0%, ${color}15 100%)`,
              boxShadow: `0 2px 8px ${color}20`,
            }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color } as CSSProperties} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-gray-900 truncate leading-tight">
              {clusterData.label}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {totalChildren} 个节点
            </div>
          </div>
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-200',
              'bg-gray-100/80 group-hover:bg-gray-200/80'
            )}
          >
            {clusterData.collapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 pb-3 pt-1">
          <div className="flex items-center gap-3">
            {runningCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-40" />
                </div>
                <span className="text-[10px] font-semibold text-emerald-600">{runningCount}</span>
              </div>
            )}
            {stoppedCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-[10px] font-semibold text-gray-500">{stoppedCount}</span>
              </div>
            )}
            {pendingCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] font-semibold text-amber-600">{pendingCount}</span>
              </div>
            )}
            {errorCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] font-semibold text-red-600">{errorCount}</span>
              </div>
            )}
          </div>

          {/* Mini bar chart */}
          <div className="flex items-end gap-[2px] mt-2 h-3">
              {statusEntries.map(([status, count]) => {
                const height = Math.max(4, totalChildren > 0 ? (count / totalChildren) * 12 : 4);
              const barColor = status === 'running' || status === 'active'
                ? 'bg-emerald-400'
                : status === 'stopped'
                ? 'bg-gray-300'
                : status === 'pending'
                ? 'bg-amber-400'
                : 'bg-red-400';
              return (
                <div
                  key={status}
                  className={cn('rounded-sm transition-all duration-300', barColor)}
                  style={{ width: 4, height, opacity: 0.8 }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
