import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react';

export interface ResourceEdgeData extends Record<string, unknown> {
  label?: string;
  type: string;
}

export type ResourceEdgeType = Edge<ResourceEdgeData>;

function ResourceEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
}: EdgeProps<ResourceEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeConfig = data?.type === 'protected-by'
    ? { color: '#f87171', gradient: ['#fca5a5', '#ef4444'] }
    : data?.type === 'routes-to'
    ? { color: '#fbbf24', gradient: ['#fde68a', '#f59e0b'] }
    : data?.type === 'attached-to'
    ? { color: '#34d399', gradient: ['#a7f3d0', '#10b981'] }
    : { color: '#94a3b8', gradient: ['#cbd5e1', '#94a3b8'] };

  return (
    <>
      {/* Shadow line for depth */}
      <BaseEdge
        id={`${id}-shadow`}
        path={edgePath}
        style={{
          stroke: edgeConfig.color,
          strokeWidth: 6,
          strokeOpacity: 0.08,
          filter: 'blur(3px)',
        }}
      />
      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: edgeConfig.color,
          strokeWidth: 1.5,
          strokeOpacity: 0.7,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan text-[10px] font-medium px-2 py-0.5 rounded-full border backdrop-blur-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              background: `linear-gradient(135deg, rgba(255,255,255,0.95), ${edgeConfig.gradient[0]}40)`,
              borderColor: `${edgeConfig.color}30`,
              color: edgeConfig.color,
              boxShadow: `0 1px 4px ${edgeConfig.color}15`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ResourceEdge = memo(ResourceEdgeComponent);
