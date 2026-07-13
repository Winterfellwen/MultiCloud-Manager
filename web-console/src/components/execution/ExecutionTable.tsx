import { useState, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown,
  Download,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToolExecutions, type ToolExecution } from '@/hooks/useToolExecutions';
import { usersApi } from '@/api/users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  extractResourceInfo, formatTime, sortExecutions, downloadCSV, downloadJSON,
  type SortField, type SortDir,
} from '@/lib/execution-utils';
import { ExecutionDetailModal } from './ExecutionDetailModal';

interface Props {
  providerFilter: string;
}

export function ExecutionTable({ providerFilter }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useToolExecutions(undefined, 200);
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
  });
  const userMap = useMemo(() => {
    if (!users) return new Map<string, { username: string; team: string }>();
    return new Map(users.map(u => [u.id, { username: u.username, team: u.team }]));
  }, [users]);

  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<ToolExecution | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'time' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3 w-3 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />;
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const f = providerFilter === 'all'
      ? data
      : data.filter(ex => ex.provider === providerFilter);
    return sortExecutions(f, sortField, sortDir);
  }, [data, providerFilter, sortField, sortDir]);

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  if (!data || filtered.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('tools.noExecutions')}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-2 gap-1">
        <Button variant="outline" size="sm" onClick={() => downloadCSV(filtered, `executions-${new Date().toISOString().slice(0, 10)}.csv`)}>
          <Download className="mr-1 h-3 w-3" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadJSON(filtered, `executions-${new Date().toISOString().slice(0, 10)}.json`)}>
          <Download className="mr-1 h-3 w-3" /> JSON
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-8 p-2"></th>
              <th className="p-2 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('toolName')}>
                {t('tools.execToolName')} <SortIcon field="toolName" />
              </th>
              <th className="p-2 text-left font-medium">{t('tools.execResource')}</th>
              <th className="p-2 text-left font-medium">{t('tools.execProvider')}</th>
              <th className="p-2 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('time')}>
                {t('tools.execTime')} <SortIcon field="time" />
              </th>
              <th className="p-2 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('result')}>
                {t('tools.execResult')} <SortIcon field="result" />
              </th>
              <th className="p-2 text-left font-medium">{t('tools.execUser')}</th>
              <th className="p-2 text-left font-medium">{t('tools.execTeam')}</th>
              <th className="p-2 text-left font-medium">{t('tools.execAction')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ex => {
              const user = userMap.get(ex.userId);
              const info = extractResourceInfo(ex);
              const isExpanded = expandedId === ex.id;
              return (
                <Fragment key={ex.id}>
                  <tr className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : ex.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="p-2 font-mono text-xs">{ex.resourceId}</td>
                    <td className="p-2 text-xs">
                      {info.id && <span className="font-mono">{info.id}</span>}
                      {info.name && <span className="ml-1 text-muted-foreground">({info.name})</span>}
                      {!info.id && !info.name && <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2 text-xs">{ex.provider || '-'}</td>
                    <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatTime(ex.timestamp)}</td>
                    <td className="p-2">
                      <Badge variant={ex.result === 'success' ? 'success' : 'destructive'} className="text-[10px] px-1.5 py-0">
                        {ex.result === 'success' ? '✓' : '✗'}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs">{user?.username || (ex.userId.length > 12 ? `${ex.userId.slice(0, 12)}...` : ex.userId)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{user?.team || '-'}</td>
                    <td className="p-2">
                      <button
                        onClick={() => setModalTarget(ex)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        {t('tools.execDetail')}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={9} className="p-3">
                        <div className="text-xs space-y-1">
                          <div><span className="font-medium">User ID:</span> {ex.userId}</div>
                          {ex.resourceType && <div><span className="font-medium">Resource Type:</span> {ex.resourceType}</div>}
                          {ex.region && <div><span className="font-medium">Region:</span> {ex.region}</div>}
                          {ex.ip && <div><span className="font-medium">IP:</span> {ex.ip}</div>}
                          {ex.traceId && <div><span className="font-medium">Trace ID:</span> {ex.traceId}</div>}
                          {ex.durationMs != null && <div><span className="font-medium">{t('tools.execDuration')}:</span> {ex.durationMs}ms</div>}
                          {ex.sessionId && <div><span className="font-medium">Session:</span> {ex.sessionId}</div>}
                          {ex.params && (
                            <div>
                              <span className="font-medium">Params:</span>
                              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-xs">
                                {JSON.stringify(ex.params, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalTarget && (
        <ExecutionDetailModal
          execution={modalTarget}
          user={modalTarget.userId ? userMap.get(modalTarget.userId) ?? null : null}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  );
}
