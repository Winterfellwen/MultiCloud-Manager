import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { ToolExecution } from '@/hooks/useToolExecutions';
import { extractResourceInfo, formatTime } from '@/lib/execution-utils';

interface Props {
  execution: ToolExecution;
  user: { username: string; team: string } | null;
  onClose: () => void;
}

export function ExecutionDetailModal({ execution: ex, user, onClose }: Props) {
  const { t } = useTranslation();
  const info = extractResourceInfo(ex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-base">{t('tools.executionDetail')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <Row label={t('tools.execToolName')} value={ex.resourceId} mono />
          <Row label={t('tools.execResource')} value={info.id ? `${info.id}${info.name ? ` (${info.name})` : ''}` : '-'} mono />
          <Row label={t('tools.execProvider')} value={ex.provider || '-'} />
          <Row label="Region" value={ex.region || '-'} />
          <Row label={t('tools.execTime')} value={formatTime(ex.timestamp)} />
          <Row label={t('tools.execResult')} value={ex.result} />
          <Row label={t('tools.execDuration')} value={ex.durationMs != null ? `${ex.durationMs}ms` : '-'} />
          <Row label="User ID" value={ex.userId} mono />
          <Row label={t('tools.execUser')} value={user?.username || '-'} />
          <Row label={t('tools.execTeam')} value={user?.team || '-'} />
          <Row label="IP" value={ex.ip || '-'} />
          <Row label="Trace ID" value={ex.traceId || '-'} />
          <Row label="Session ID" value={ex.sessionId || '-'} />

          {ex.params && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">{t('audit.params')}</span>
              <pre className="rounded bg-muted p-3 font-mono text-xs overflow-x-auto">
                {JSON.stringify(ex.params, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs text-right max-w-[60%] break-all' : 'text-right'}>{value}</span>
    </div>
  );
}
