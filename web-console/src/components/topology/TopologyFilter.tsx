import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import type { TopologyFilters } from '@/types/topology';

const PROVIDERS = ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'render', 'oracle'];
const STATUSES = ['running', 'stopped', 'pending', 'error', 'active'];

interface TopologyFilterProps {
  filters: TopologyFilters;
  onChange: (filters: TopologyFilters) => void;
}

export function TopologyFilter({ filters, onChange }: TopologyFilterProps) {
  const { t } = useTranslation();

  function handleChange(key: keyof TopologyFilters, value: string) {
    onChange({ ...filters, [key]: value || undefined });
  }

  function handleReset() {
    onChange({});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('topology.filters.title')}</h3>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          {t('topology.filters.reset')}
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="topology-provider" className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.provider')}
          </label>
          <Select
            id="topology-provider"
            value={filters.provider || ''}
            onChange={(e) => handleChange('provider', e.target.value)}
            className="w-full"
          >
            <option value="">{t('topology.filters.allProviders')}</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{t(`providers.${p}`)}</option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="topology-region" className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.region')}
          </label>
          <Input
            id="topology-region"
            type="text"
            value={filters.region || ''}
            onChange={(e) => handleChange('region', e.target.value)}
            placeholder={t('topology.filters.regionPlaceholder')}
          />
        </div>

        <div>
          <label htmlFor="topology-resourceType" className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.resourceType')}
          </label>
          <Select
            id="topology-resourceType"
            value={filters.resourceType || ''}
            onChange={(e) => handleChange('resourceType', e.target.value)}
            className="w-full"
          >
            <option value="">{t('topology.filters.allTypes')}</option>
            <option value="instance">{t('resourceTypes.instance')}</option>
            <option value="disk">{t('resourceTypes.disk')}</option>
            <option value="database">{t('resourceTypes.database')}</option>
            <option value="cache">{t('resourceTypes.cache')}</option>
            <option value="bucket">{t('resourceTypes.bucket')}</option>
            <option value="loadbalancer">{t('resourceTypes.loadbalancer')}</option>
            <option value="vpc">{t('resourceTypes.vpc')}</option>
            <option value="securitygroup">{t('resourceTypes.securitygroup')}</option>
            <option value="cdn">{t('resourceTypes.cdn')}</option>
            <option value="cluster">{t('resourceTypes.cluster')}</option>
          </Select>
        </div>

        <div>
          <label htmlFor="topology-status" className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.status')}
          </label>
          <Select
            id="topology-status"
            value={filters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full"
          >
            <option value="">{t('topology.filters.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`statuses.${s}`)}</option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
