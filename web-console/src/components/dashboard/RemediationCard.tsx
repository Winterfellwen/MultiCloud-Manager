// web-console/src/components/dashboard/RemediationCard.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRemediationRuns } from '@/hooks/useRemediation';
import { Zap, Loader2, ChevronRight, CheckCircle, XCircle } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  reboot_instance: 'reboot',
  stop_instance: 'stop',
  scale_up: 'scaleUp',
};

export default function RemediationCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: runs, isLoading } = useRemediationRuns();

  const recentRuns = (runs || []).slice(0, 5);
  const pendingCount = (runs || []).filter(r => r.status === 'pending').length;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ai-ops?tab=remediation')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('aiops.tabRemediation')}</CardTitle>
          <Zap className="h-4 w-4 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : recentRuns.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t('aiops.remediation.noData')}</div>
        ) : (
          <div className="space-y-2">
            {pendingCount > 0 && (
              <div className="text-xs text-orange-600 font-medium">
                {pendingCount} {t('aiops.remediation.pending')}
              </div>
            )}
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{run.instanceName || t('aiops.remediation.instanceName')}</div>
                  <div className="text-xs text-muted-foreground">
                    {t(`aiops.remediation.${ACTION_LABELS[run.actionExecuted || ''] || 'reboot'}`)}
                  </div>
                </div>
                {run.status === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : run.status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Badge variant="warning" className="ml-2 shrink-0">{t(`aiops.remediation.${run.status}`)}</Badge>
                )}
              </div>
            ))}
            <div className="flex items-center justify-end text-xs text-muted-foreground pt-1">
              {t('dashboard.ratio')} <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
