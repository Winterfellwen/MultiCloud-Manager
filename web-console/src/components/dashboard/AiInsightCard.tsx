import { Brain, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import type { AiInsight } from '@/types/aiInsights';

interface AiInsightCardProps {
  insight: AiInsight | undefined;
  loading: boolean;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  onRefresh: () => void;
  showRefresh?: boolean;
}

export function AiInsightCard({ insight, loading, refreshing, refreshDisabled, onRefresh, showRefresh = false }: AiInsightCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">{t('dashboard.aiInsight')}</h2>
          </div>
          {showRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshDisabled || loading}
              className="text-muted-foreground hover:text-primary transition-colors"
              title={t('aiops.triggerNow')}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing || loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : insight ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold" style={{
                color: insight.healthScore >= 80 ? '#22c55e' : insight.healthScore >= 60 ? '#eab308' : '#ef4444'
              }}>
                {insight.healthScore}
              </div>
              <div className="text-sm text-muted-foreground">{t('dashboard.healthScore')}</div>
            </div>
            {insight.risks.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">{t('dashboard.risks')}</div>
                <ul className="space-y-1">
                  {insight.risks.map((risk, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
            {insight.suggestions.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">{t('dashboard.suggestions')}</div>
                <ul className="space-y-1">
                  {insight.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">{t('dashboard.insightUnavailable')}</div>
        )}
      </CardContent>
    </Card>
  );
}
