// 审计日志页：筛选栏 + 日志表格 + 分页
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronR } from 'lucide-react';
import { useAuditLogs } from '@/hooks/useAudit';
import { RESULT_LABELS, PROVIDER_OPTIONS } from '@/types/audit';
import type { AuditLogQuery } from '@/types/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';

const PAGE_SIZE = 20;

export default function Audit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState<AuditLogQuery>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  // 用于触发查询的最终参数
  const [activeQuery, setActiveQuery] = useState<AuditLogQuery>(query);
  const { data: logs, isLoading, error } = useAuditLogs(activeQuery);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    action: query.action || '',
    provider: query.provider || '',
  });

  const filterConfigs: FilterConfig[] = [
    { key: 'action', type: 'search', placeholder: t('audit.actionPlaceholder') },
    {
      key: 'provider',
      type: 'select',
      label: t('audit.provider'),
      options: [
        { label: t('audit.allProviders'), value: '' },
        ...PROVIDER_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value })),
      ],
    },
  ];

  useEffect(() => {
    setQuery((prev) => ({
      ...prev,
      action: filterValues.action || undefined,
      provider: filterValues.provider || undefined,
      offset: 0,
    }));
  }, [filterValues]);

  const handleSearch = () => {
    setActiveQuery({ ...query, offset: 0 });
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, (activeQuery.offset || 0) - PAGE_SIZE);
    setActiveQuery({ ...activeQuery, offset: newOffset });
    setQuery({ ...query, offset: newOffset });
  };

  const handleNextPage = () => {
    const newOffset = (activeQuery.offset || 0) + PAGE_SIZE;
    setActiveQuery({ ...activeQuery, offset: newOffset });
    setQuery({ ...query, offset: newOffset });
  };

  const formatDate = (s: string) => new Date(s).toLocaleString();

  const currentPage = Math.floor((activeQuery.offset || 0) / PAGE_SIZE) + 1;
  const hasNextPage = logs && logs.length === PAGE_SIZE;

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t('audit.title')}</h1>

      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <FilterBar
          filters={filterConfigs}
          values={filterValues}
          onChange={setFilterValues}
        />
        <div className="space-y-1 w-full sm:w-[160px]">
          <label className="text-xs text-muted-foreground">{t('audit.startDate')}</label>
          <Input
            type="date"
            value={query.startDate ? query.startDate.slice(0, 10) : ''}
            onChange={(e) =>
              setQuery({
                ...query,
                startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
            className="w-full"
          />
        </div>
        <div className="space-y-1 w-full sm:w-[160px]">
          <label className="text-xs text-muted-foreground">{t('audit.endDate')}</label>
          <Input
            type="date"
            value={query.endDate ? query.endDate.slice(0, 10) : ''}
            onChange={(e) =>
              setQuery({
                ...query,
                endDate: e.target.value
                  ? new Date(e.target.value + 'T23:59:59').toISOString()
                  : undefined,
              })
            }
            className="w-full"
          />
        </div>
        <Button onClick={handleSearch} size="sm" className="w-full sm:w-auto">
          <Search className="mr-1.5 h-4 w-4" />
          {t('audit.search')}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {t('audit.loadFailed')}：{(error as Error).message}
        </div>
      )}

      {/* 日志表格 */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="w-[180px]">{t('audit.time')}</TableHead>
                <TableHead className="w-[100px]">{t('audit.userId')}</TableHead>
                <TableHead className="w-[160px]">{t('audit.action')}</TableHead>
                <TableHead className="w-[100px]">{t('audit.resourceType')}</TableHead>
                <TableHead className="w-[100px]">{t('audit.provider')}</TableHead>
                <TableHead className="w-[100px]">{t('audit.region')}</TableHead>
                <TableHead className="w-[80px]">{t('audit.result')}</TableHead>
                <TableHead className="w-[120px]">{t('audit.ip')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : logs && logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {t('audit.noLogs')}
                  </TableCell>
                </TableRow>
              ) : (
                logs?.map((log) => (
                  <React.Fragment key={log.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {expandedId === log.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronR className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(log.timestamp)}
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[100px]">
                        <button
                          onClick={() => navigate(`/users?userId=${log.userId}`)}
                          className="text-blue-600 hover:underline"
                        >
                          {log.userId.slice(0, 8)}...
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.action}</TableCell>
                      <TableCell className="text-xs">{log.resourceType || '-'}</TableCell>
                      <TableCell className="text-xs">{log.provider || '-'}</TableCell>
                      <TableCell className="text-xs">{log.region || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={log.result === 'success' ? 'success' : 'destructive'}>
                          {RESULT_LABELS[log.result]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.ip || '-'}</TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow key={`${log.id}-detail`}>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <div className="space-y-2 py-2">
                            <div className="text-xs text-muted-foreground">{t('audit.fullUserId')}</div>
                            <div className="font-mono text-xs">
                              <button
                                onClick={() => navigate(`/users?userId=${log.userId}`)}
                                className="text-blue-600 hover:underline"
                              >
                                {log.userId}
                              </button>
                            </div>
                            {log.resourceId && (
                              <>
                                <div className="text-xs text-muted-foreground">{t('audit.resourceId')}</div>
                                <div className="font-mono text-xs">{log.resourceId}</div>
                              </>
                            )}
                            {log.traceId && (
                              <>
                                <div className="text-xs text-muted-foreground">{t('audit.traceId')}</div>
                                <div className="font-mono text-xs">{log.traceId}</div>
                              </>
                            )}
                            {log.params && (
                              <>
                                <div className="text-xs text-muted-foreground">{t('audit.params')}</div>
                                <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">
                                  {JSON.stringify(log.params, null, 2)}
                                </pre>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 分页 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {t('audit.page', { page: currentPage })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={(activeQuery.offset || 0) === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('audit.prevPage')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={!hasNextPage}
          >
            {t('audit.nextPage')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
