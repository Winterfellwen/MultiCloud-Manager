// Dashboard 总览页：统计卡片 + 云厂商分布
import { Server, DollarSign, AlertTriangle, Loader2, AlertCircle, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '@/hooks/useDashboard';
import { useAiInsight, useTokenStats } from '@/hooks/useAiInsights';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PredictionCard from '@/components/dashboard/PredictionCard';
import RemediationCard from '@/components/dashboard/RemediationCard';
import SecurityCard from '@/components/dashboard/SecurityCard';
import CapacityCard from '@/components/dashboard/CapacityCard';
import { AiInsightCard } from '@/components/dashboard/AiInsightCard';



export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: stats, isLoading, error } = useDashboardStats();
  const { data: insight, isLoading: insightLoading, isFetching, refetch } = useAiInsight();
  const { data: tokenStats } = useTokenStats();

  const formatCost = (cost: number) => {
    if (cost >= 10000) return `¥${(cost / 10000).toFixed(2)}${t('common.tenThousand')}`;
    return `¥${cost.toFixed(2)}`;
  };

  const maxProviderCount = stats
    ? Math.max(...Object.values(stats.byProvider), 1)
    : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t('dashboard.title')}</h1>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {t('dashboard.loadFailed')}：{(error as Error).message}
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/resources')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalResources')}</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : stats ? (
              <div className="text-2xl font-bold">{stats.totalResources}</div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
            {stats?.errors.instances && (
              <p className="mt-1 text-xs text-destructive">{t('dashboard.instancesFailed')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/resources')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.running')}</CardTitle>
              <Server className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : stats ? (
              <>
                <div className="text-2xl font-bold text-green-600">{stats.runningInstances}</div>
                {stats.totalInstances > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('dashboard.ratio')} {((stats.runningInstances / stats.totalInstances) * 100).toFixed(1)}%
                  </p>
                )}
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.alertCount')}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : stats ? (
              <div
                className={`text-2xl font-bold ${
                  stats.alertCount > 0 ? 'text-yellow-600' : ''
                }`}
              >
                {stats.alertCount}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
            {stats?.errors.alerts && (
              <p className="mt-1 text-xs text-destructive">{t('dashboard.alertsFailed')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/costs')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.monthlyCost')}</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : stats ? (
              <div className="text-2xl font-bold">{formatCost(stats.monthlyCost)}</div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
            {stats?.errors.costs && (
              <p className="mt-1 text-xs text-destructive">{t('dashboard.costsFailed')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 云厂商分布 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.providerDist')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stats && Object.keys(stats.byProvider).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.byProvider).map(([provider, count]) => (
                <div
                  key={provider}
                  className="space-y-1 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => navigate(`/resources?provider=${provider}`)}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-600 hover:underline">{t(`providers.${provider}`) || provider}</span>
                    <span className="text-muted-foreground">{count} {t('dashboard.instances')}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(count / maxProviderCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.noInstances')}</p>
          )}
        </CardContent>
      </Card>

      <AiInsightCard
        insight={insight}
        loading={insightLoading}
        refreshing={isFetching}
        showRefresh
        onRefresh={() => refetch()}
      />

      {/* Token 使用统计 */}
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
            <div className="text-center py-4 text-muted-foreground">{t('common.loading')}</div>
          )}
        </CardContent>
      </Card>

      {/* 预测预警卡片 */}
      <PredictionCard />

      {/* 最近自愈卡片 */}
      <RemediationCard />

      {/* 安全风险卡片 */}
      <SecurityCard />

      {/* 容量规划卡片 */}
      <CapacityCard />
    </div>
  );
}
