import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { SearchResultGroup } from './SearchResultGroup';
import { cloudApi } from '@/api/cloud';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await cloudApi.search(query);
        setResults(data);
      } catch {
        setResults({ error: true });
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  const flatResults = useCallback(() => {
    if (!results || results.error) return [];
    return [
      ...(results.resources || []).map((r: any) => ({ ...r, _group: 'resources' })),
      ...(results.instances || []).map((r: any) => ({ ...r, _group: 'instances' })),
      ...(results.alerts || []).map((r: any) => ({ ...r, _group: 'alerts' })),
    ];
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const flat = flatResults();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl bg-background rounded-lg shadow-2xl border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索资源、实例、告警..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(-1); }}
            onKeyDown={handleKeyDown}
            className="flex-1 h-14 bg-transparent outline-none text-base"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs text-muted-foreground bg-muted rounded">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">搜索中...</div>
          )}
          {!loading && query && results?.error && (
            <div className="px-4 py-8 text-center text-sm text-red-500">搜索服务暂不可用</div>
          )}
          {!loading && query && results && !results.error && flatResults().length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">未找到相关结果</div>
          )}
          {!loading && results && !results.error && (
            <>
              <SearchResultGroup title="资源" items={results.resources || []} activeIndex={activeIndex} startIndex={0} onItemClick={() => onClose()} />
              <SearchResultGroup title="实例" items={results.instances || []} activeIndex={activeIndex} startIndex={(results.resources || []).length} onItemClick={() => onClose()} />
              <SearchResultGroup title="告警" items={results.alerts || []} activeIndex={activeIndex} startIndex={(results.resources || []).length + (results.instances || []).length} onItemClick={() => onClose()} />
            </>
          )}
          {!query && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              输入关键字搜索资源、实例和告警
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
