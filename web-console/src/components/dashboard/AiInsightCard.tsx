import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, MinusCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AiInsightResponse, DiagnosticEntry } from '@/types/aiInsights';

interface Props {
  data?: AiInsightResponse;
  insight?: AiInsightResponse;
  isLoading?: boolean;
  loading?: boolean;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  showRefresh?: boolean;
  onRefresh: () => void;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function statusIcon(status: DiagnosticEntry['status']) {
  switch (status) {
    case 'ok':   return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'fail': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'skip': return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function AiInsightCard(props: Props) {
  const { t } = useTranslation();
  const data = props.data ?? props.insight;
  const isLoading = props.isLoading ?? props.loading ?? false;
  const { refreshing, refreshDisabled, showRefresh = false, onRefresh } = props;

  const hasFailed = data != null && !data.ok;
  const [diagOpen, setDiagOpen] = useState(hasFailed);
  const [showAllRisks, setShowAllRisks] = useState(false);

  useEffect(() => {
    if (hasFailed) setDiagOpen(true);
  }, [hasFailed]);

  const okCount = data?.diagnostics?.filter((d) => d.status === 'ok').length ?? 0;

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
              disabled={refreshDisabled || isLoading}
              className="text-muted-foreground hover:text-primary transition-colors"
              title={t('aiops.triggerNow')}
            >
              <RefreshCw className={cn('h-4 w-4', (refreshing || isLoading) && 'animate-spin')} />
            </button>
          )}
        </div>

        {isLoading && !data ? (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : data && data.ok ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="text-3xl font-bold"
                style={{
                  color:
                    (data.healthScore ?? 0) >= 80
                      ? '#22c55e'
                      : (data.healthScore ?? 0) >= 60
                        ? '#eab308'
                        : '#ef4444',
                }}
              >
                {data.healthScore ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">{t('dashboard.healthScore')}</div>
            </div>
            {data.risks && data.risks.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">{t('dashboard.risks')}</div>
                <ul className="space-y-1">
                  {(showAllRisks ? data.risks : data.risks.slice(0, 3)).map((risk, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      •{' '}
                      <span
                        className={
                          risk.severity === 'critical'
                            ? 'text-red-500 font-medium'
                            : risk.severity === 'high'
                              ? 'text-orange-500'
                              : risk.severity === 'medium'
                                ? 'text-yellow-500'
                                : ''
                        }
                      >
                        {risk.title}
                      </span>
                      {risk.suggestion && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          — {risk.suggestion}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {data.risks.length > 3 && (
                  <button
                    onClick={() => setShowAllRisks(!showAllRisks)}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    {showAllRisks ? t('common.showLess') : `${t('common.showAll')} (${data.risks.length - 3})`}
                  </button>
                )}
              </div>
            )}
            {data.suggestions && data.suggestions.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">{t('dashboard.suggestions')}</div>
                <ul className="space-y-1">
                  {data.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : data ? (
          <div className="text-center py-4 text-muted-foreground">{t('dashboard.insightUnavailable')}</div>
        ) : null}

        {data && data.diagnostics && data.diagnostics.length > 0 && (
          <div
            className={cn(
              'mt-4 border rounded-md',
              hasFailed ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : 'border-border'
            )}
          >
            <button
              onClick={() => setDiagOpen(!diagOpen)}
              aria-expanded={diagOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                {t('aiops.diagnostics')}
                <span className="text-xs text-muted-foreground">
                  ({okCount}/{data.diagnostics.length} {t('aiops.passed')})
                </span>
              </span>
              {diagOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {diagOpen && (
              <div className="border-t px-3 pb-3 space-y-1.5">
                {data.diagnostics.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm py-1">
                    {statusIcon(entry.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{entry.step}</span>
                        {entry.duration != null && (
                          <span className="text-xs text-muted-foreground">{entry.duration}ms</span>
                        )}
                      </div>
                      {entry.detail && (
                        <div className="text-xs text-muted-foreground mt-0.5">{entry.detail}</div>
                      )}
                      {entry.suggestion && (
                        <div className="text-xs italic text-muted-foreground mt-0.5">
                          {entry.suggestion}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {data.lastSuccessAt && (
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    {t('aiops.lastSuccess')}: {formatRelativeTime(data.lastSuccessAt)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
