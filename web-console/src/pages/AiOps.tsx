import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import PredictionsTab from '@/components/monitor/PredictionsTab';
import RemediationTab from '@/components/monitor/RemediationTab';
import RemediationPolicySection from '@/components/aiops/RemediationPolicySection';

type Tab = 'predictions' | 'remediation' | 'policy';

export default function AiOps() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'predictions';
  const [tab, setTab] = useState<Tab>(initialTab);

  const handleTabChange = (key: Tab) => {
    setTab(key);
    setSearchParams({ tab: key });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t('aiops.title')}</h1>

      <div className="border-b">
        <div className="flex gap-4 overflow-x-auto">
          {([
            { key: 'predictions' as const, label: t('aiops.tabPredictions') },
            { key: 'remediation' as const, label: t('aiops.tabRemediation') },
            { key: 'policy' as const, label: t('aiops.tabPolicy') },
          ]).map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => handleTabChange(tabItem.key)}
              className={cn(
                'pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                tab === tabItem.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'predictions' && <PredictionsTab />}
      {tab === 'remediation' && <RemediationTab />}
      {tab === 'policy' && <RemediationPolicySection />}
    </div>
  );
}
