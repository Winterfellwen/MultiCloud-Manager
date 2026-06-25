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
import { type TopologyNode, type TopologyEdge, RESOURCE_TYPE_ROUTE_MAP } from '@/types/topology';
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

  function handleViewDetails() {
    if (!node) return;
    const baseRoute = RESOURCE_TYPE_ROUTE_MAP[node.type] || '/resources';
    navigate(baseRoute);
  }

  return (
    <AnimatePresence>
      {node && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h2 className="text-lg font-semibold">{node.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {node.provider} / {node.region}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex border-b px-6">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                      activeTab === tab.key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {activeTab === 'overview' && <OverviewTab node={node} />}
                {activeTab === 'metrics' && <MetricsTab />}
                {activeTab === 'logs' && <LogsTab />}
                {activeTab === 'connections' && (
                  <ConnectionsTab node={node} allEdges={allEdges} allNodes={allNodes} />
                )}
              </div>

              <div className="border-t px-6 py-3 flex justify-end">
                <Button variant="outline" onClick={handleViewDetails}>
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
