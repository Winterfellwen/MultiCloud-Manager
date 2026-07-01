import { useState } from 'react';
import { cn } from '@/lib/utils';
import PredictionsTab from '@/components/monitor/PredictionsTab';
import RemediationTab from '@/components/monitor/RemediationTab';
import RemediationPolicySection from '@/components/aiops/RemediationPolicySection';

type Tab = 'predictions' | 'remediation' | 'policy';

export default function AiOps() {
  const [tab, setTab] = useState<Tab>('predictions');

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">AI 运维</h1>

      <div className="border-b">
        <div className="flex gap-4 overflow-x-auto">
          {([
            { key: 'predictions' as const, label: '预测' },
            { key: 'remediation' as const, label: '自愈' },
            { key: 'policy' as const, label: '自愈策略配置' },
          ]).map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
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
