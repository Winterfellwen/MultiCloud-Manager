// web-console/src/components/dashboard/SecurityCard.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecuritySummary, useSecurityFindings } from '@/hooks/useSecurity';
import { Shield, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

export default function SecurityCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: summary, isLoading } = useSecuritySummary();
  const { data: findings } = useSecurityFindings();

  const criticalFindings = (findings || []).filter((f) => f.outcome === 'critical').slice(0, 3);

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor?tab=security')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('security.title')}</CardTitle>
          <Shield className="h-4 w-4 text-blue-500" />
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
                {summary.critical} {t('security.critical')}
              </span>
              <span className="text-yellow-600 font-medium flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {summary.warning} {t('security.warning')}
              </span>
            </div>
            {criticalFindings.length > 0 && (
              <div className="space-y-1">
                {criticalFindings.map((f) => (
                  <div key={f.id} className="text-xs text-muted-foreground truncate">
                    • {f.symptom}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-green-600 flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {t('security.noRisk')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
