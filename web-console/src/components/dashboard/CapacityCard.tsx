// web-console/src/components/dashboard/CapacityCard.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCapacitySummary, useCapacityRecommendations } from '@/hooks/useCapacity';
import { TrendingUp, Loader2, AlertTriangle } from 'lucide-react';

export default function CapacityCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: summary, isLoading } = useCapacitySummary();
  const { data: recs } = useCapacityRecommendations();

  const urgentRecs = (recs || []).filter((r) => r.outcome === 'urgent').slice(0, 3);

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor?tab=security')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('capacity.title')}</CardTitle>
          <TrendingUp className="h-4 w-4 text-purple-500" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : summary && summary.total > 0 ? (
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              <span className="text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.urgent} {t('capacity.urgent')}
              </span>
              <span className="text-yellow-600 font-medium">
                {summary.recommend} {t('capacity.recommend')}
              </span>
            </div>
            {urgentRecs.length > 0 && (
              <div className="space-y-1">
                {urgentRecs.map((r) => (
                  <div key={r.id} className="text-xs text-muted-foreground truncate">
                    • {r.symptom}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-green-600 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {t('capacity.noRisk')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
