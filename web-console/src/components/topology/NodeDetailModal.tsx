import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OverviewTab } from './NodeDetailTabs/OverviewTab';
import { MetricsTab } from './NodeDetailTabs/MetricsTab';
import { LogsTab } from './NodeDetailTabs/LogsTab';
import { ConnectionsTab } from './NodeDetailTabs/ConnectionsTab';
import { type TopologyNode, type TopologyEdge, RESOURCE_TYPE_ROUTE_MAP, NODE_COLORS, type TopologyCategory } from '@/types/topology';
import { cn } from '@/lib/utils';

interface NodeDetailModalProps {
  node: TopologyNode | null;
  allEdges: TopologyEdge[];
  allNodes: TopologyNode[];
  onClose: () => void;
}

type TabKey = 'overview' | 'metrics' | 'logs' | 'connections';

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'overview', labelKey: 'topology.detailModal.overview' },
  { key: 'metrics', labelKey: 'topology.detailModal.metrics' },
  { key: 'logs', labelKey: 'topology.detailModal.logs' },
  { key: 'connections', labelKey: 'topology.detailModal.connections' },
];

export function NodeDetailModal({ node, allEdges, allNodes, onClose }: NodeDetailModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  if (!node) return null;

  const color = NODE_COLORS[node.category as TopologyCategory] || '#6b7280';
  const isRunning = node.status === 'running' || node.status === 'active';

  function handleViewDetails() {
    if (!node) return;
    const baseRoute = RESOURCE_TYPE_ROUTE_MAP[node.type] || '/resources';
    navigate(baseRoute);
  }

  return (
    <AnimatePresence>
      {node && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 backdrop-blur-sm"
            style={{ background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)` }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-white/30 shadow-2xl pointer-events-auto overflow-hidden"
              style={{
                background: `linear-gradient(160deg, rgba(255,255,255,0.98) 0%, ${color}05 100%)`,
                backdropFilter: 'blur(20px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top accent */}
              <div
                className="absolute top-0 left-8 right-8 h-[2px] rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
              />

              {/* Header */}
              <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div
                    className="flex items-center justify-center w-11 h-11 rounded-2xl shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${color}25 0%, ${color}10 100%)`,
                      boxShadow: `0 2px 8px ${color}20`,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{node.label}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-sm text-gray-500">
                        {node.provider} / {node.region}
                      </p>
                      <div className="flex items-center gap-1">
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          isRunning ? 'bg-emerald-400' : 'bg-gray-300'
                        )} />
                        <span className="text-xs text-gray-500">{node.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="rounded-xl hover:bg-gray-100/80 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 px-7">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'relative px-5 py-3 text-sm font-medium transition-colors',
                      activeTab === tab.key
                        ? 'text-gray-900'
                        : 'text-gray-400 hover:text-gray-600'
                    )}
                  >
                    {t(tab.labelKey)}
                    {activeTab === tab.key && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                        style={{ backgroundColor: color }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto px-7 py-5">
                {activeTab === 'overview' && <OverviewTab node={node} />}
                {activeTab === 'metrics' && <MetricsTab />}
                {activeTab === 'logs' && <LogsTab />}
                {activeTab === 'connections' && (
                  <ConnectionsTab node={node} allEdges={allEdges} allNodes={allNodes} />
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-7 py-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleViewDetails}
                  className="rounded-xl border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('topology.detailModal.viewDetails')}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
