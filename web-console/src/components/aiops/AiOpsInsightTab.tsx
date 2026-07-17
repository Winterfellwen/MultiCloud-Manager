import { useTranslation } from 'react-i18next';
import { useRefreshInsight, useInsightHistory, useAiInsight, useTokenStats } from '@/hooks/useAiInsights';
import { AiInsightCard } from '@/components/dashboard/AiInsightCard';
import { Activity, History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AiOpsInsightTab() {
  const { t } = useTranslation();
  const { data: insight, isLoading, isFetching } = useAiInsight();
  const refreshMutation = useRefreshInsight();
  const { data: history, isLoading: historyLoading } = useInsightHistory();
  const { data: tokenStats } = useTokenStats();

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <AiInsightCard
        insight={refreshMutation.data || insight}
        loading={isLoading}
        refreshing={refreshMutation.isPending || isFetching}
        showRefresh
        refreshDisabled={refreshMutation.isPending}
        onRefresh={handleRefresh}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">{t('dashboard.tokenUsage')}</h2>
          </div>
          {tokenStats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.todayTokens')}</div>
                <div className="text-xl font-bold">{tokenStats.today.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.todayCalls')}</div>
                <div className="text-xl font-bold">{tokenStats.today.calls}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.weekTokens')}</div>
                <div className="text-xl font-bold">{tokenStats.week.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('dashboard.weekCalls')}</div>
                <div className="text-xl font-bold">{tokenStats.week.calls}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t('aiops.insightHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-bold" style={{
                      color: item.healthScore >= 80 ? '#22c55e' : item.healthScore >= 60 ? '#eab308' : '#ef4444'
                    }}>
                      {item.healthScore}
                    </span>
                    <span className="text-muted-foreground">
                      {item.risks?.length ? `${item.risks.length} risks` : 'No risks'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">{t('common.empty')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
