import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Column<T> {
  key: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  cell?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
}

interface PaginationState {
  pageSize: number;
  pageIndex: number;
  total: number;
}

interface TableWithPaginationProps<T> {
  data: T[];
  columns: Column<T>[];
  pagination?: PaginationState;
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  loading?: boolean;
  emptyIllustration?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  rowKey: keyof T | ((row: T) => string);
}

function getCellValue<T>(row: T, accessor: keyof T | ((row: T) => React.ReactNode)): unknown {
  if (typeof accessor === 'function') {
    return accessor(row);
  }
  return row[accessor];
}

export function TableWithPagination<T>({
  data,
  columns,
  pagination,
  onPaginationChange,
  loading = false,
  emptyIllustration,
  emptyTitle,
  emptyDescription,
  onRowClick,
  rowKey,
}: TableWithPaginationProps<T>) {
  const { t } = useTranslation();
  const [internalPage, setInternalPage] = useState(0);
  const [internalPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return 0;

    let aVal: string | number;
    let bVal: string | number;

    if (col.sortValue) {
      aVal = col.sortValue(a);
      bVal = col.sortValue(b);
    } else {
      const accessor = col.accessor;
      aVal = typeof accessor === 'function' ? String(accessor(a)) : String(a[accessor] ?? '');
      bVal = typeof accessor === 'function' ? String(accessor(b)) : String(b[accessor] ?? '');
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const pageIndex = pagination?.pageIndex ?? internalPage;
  const pageSize = pagination?.pageSize ?? internalPageSize;
  const total = pagination?.total ?? data.length;

  const totalPages = Math.ceil(total / pageSize);
  const startRow = pageIndex * pageSize;
  const endRow = Math.min(startRow + pageSize, total);
  const displayData = pagination ? sortedData.slice(startRow, endRow) : sortedData;

  const handlePageChange = (newPage: number) => {
    if (onPaginationChange) {
      onPaginationChange(newPage, pageSize);
    } else {
      setInternalPage(newPage);
    }
  };

  const getRowKey = (row: T): string => {
    if (typeof rowKey === 'function') {
      return rowKey(row);
    }
    return String(row[rowKey]);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (displayData.length === 0 && !pagination) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        {emptyIllustration}
        <h3 className="mt-4 text-lg font-medium">{emptyTitle || t('common.noData')}</h3>
        {emptyDescription && <p className="mt-1 text-sm">{emptyDescription}</p>}
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`${col.className || ''} ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                onClick={() => handleSort(col)}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey !== col.key && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                  {sortKey === col.key && sortDir === 'asc' && <ArrowUp className="h-3 w-3" />}
                  {sortKey === col.key && sortDir === 'desc' && <ArrowDown className="h-3 w-3" />}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayData.map((row) => (
            <TableRow
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map((col) => {
                const value = getCellValue(row, col.accessor);
                return (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell ? col.cell(value, row) : (value as React.ReactNode)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            {t('common.showing')} {startRow + 1}-{endRow} {t('common.of')} {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pageIndex - 1)}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {pageIndex + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pageIndex + 1)}
              disabled={pageIndex >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
