import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TOPOLOGY_CATEGORY_LABELS, RESOURCE_TYPE_ROUTE_MAP, type TopologyNode, type TopologyCategory } from '@/types/topology';
import { getStatusColor } from '@/types/resource';

interface NodeDetailPanelProps {
  node: TopologyNode | null;
  onClose: () => void;
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!node) return null;

  const categoryLabel = TOPOLOGY_CATEGORY_LABELS[node.category as TopologyCategory] || node.category;

  function handleViewDetails() {
    if (!node) return;
    const baseRoute = RESOURCE_TYPE_ROUTE_MAP[node.type] || '/resources';
    navigate(baseRoute);
  }

  return (
    <div className="w-80 border-l bg-card p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{t('topology.nodeDetail.title')}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-1">{node.label}</div>
          <Badge variant={getStatusColor(node.status)}>{node.status}</Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('topology.nodeDetail.type')}</span>
            <span>{categoryLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('topology.nodeDetail.provider')}</span>
            <span>{node.provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('topology.nodeDetail.region')}</span>
            <span>{node.region}</span>
          </div>
        </div>

        {node.data && Object.keys(node.data).length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {t('topology.nodeDetail.attributes')}
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(node.data).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="truncate max-w-[120px]">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={handleViewDetails}>
          <ExternalLink className="h-4 w-4 mr-2" />
          {t('topology.nodeDetail.viewDetails')}
        </Button>
      </div>
    </div>
  );
}
