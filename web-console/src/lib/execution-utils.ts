import type { ToolExecution } from '@/hooks/useToolExecutions';

export function extractResourceInfo(ex: ToolExecution): { id?: string; name?: string } {
  if (!ex.params) return {};
  const p = ex.params;
  const id = (p.instanceId as string) || (p.resourceId as string) || (p.id as string) || undefined;
  const name = (p.name as string) || (p.instanceName as string) || (p.displayName as string) || undefined;
  return { id, name };
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

export type SortField = 'toolName' | 'time' | 'result';
export type SortDir = 'asc' | 'desc';

export function sortExecutions(data: ToolExecution[], field: SortField, dir: SortDir): ToolExecution[] {
  return [...data].sort((a, b) => {
    let cmp = 0;
    if (field === 'toolName') cmp = a.resourceId.localeCompare(b.resourceId);
    else if (field === 'time') cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    else if (field === 'result') cmp = a.result.localeCompare(b.result);
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function downloadCSV(data: ToolExecution[], filename: string) {
  const headers = ['Tool', 'Resource ID', 'Resource Name', 'Provider', 'Time', 'Result', 'User ID', 'Duration (ms)'];
  const rows = data.map(ex => {
    const info = extractResourceInfo(ex);
    return [
      ex.resourceId,
      info.id ?? '',
      info.name ?? '',
      ex.provider ?? '',
      formatTime(ex.timestamp),
      ex.result,
      ex.userId,
      ex.durationMs != null ? String(ex.durationMs) : '',
    ];
  });
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export function downloadJSON(data: ToolExecution[], filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
