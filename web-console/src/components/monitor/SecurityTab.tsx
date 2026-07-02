// web-console/src/components/monitor/SecurityTab.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useSecurityFindings, useTriggerSecurityScan } from '@/hooks/useSecurity';
import { ApiError } from '@/api/client';
import { Shield, RefreshCw, Loader2 } from 'lucide-react';

export default function SecurityTab() {
  const { t } = useTranslation();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const { data: findings, isLoading } = useSecurityFindings();
  const scanMutation = useTriggerSecurityScan();

  const filtered = (findings || []).filter(
    (f) => severityFilter === 'all' || f.outcome === severityFilter
  );

  const handleScan = async () => {
    try {
      await scanMutation.mutateAsync();
      toast.success(t('security.scanTriggered'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-40"
          >
            <option value="all">{t('security.all')}</option>
            <option value="critical">{t('security.critical')}</option>
            <option value="warning">{t('security.warning')}</option>
          </Select>
        </div>
        <Button onClick={handleScan} disabled={scanMutation.isPending} variant="outline" size="sm">
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('security.rescan')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('security.noFindings')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('security.resource')}</TableHead>
                  <TableHead>{t('security.provider')}</TableHead>
                  <TableHead>{t('security.severity')}</TableHead>
                  <TableHead>{t('security.recommendation')}</TableHead>
                  <TableHead>{t('security.foundAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.symptom}</TableCell>
                    <TableCell>{f.instanceProvider || '-'}</TableCell>
                    <TableCell>
                      <span className={
                        f.outcome === 'critical'
                          ? 'text-red-600 font-medium'
                          : 'text-yellow-600'
                      }>
                        {f.outcome === 'critical' ? t('security.critical') : t('security.warning')}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.rootCause}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(f.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
