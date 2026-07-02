import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type FilterType = 'search' | 'select';

export interface FilterConfig {
  key: string;
  type: FilterType;
  label?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  className?: string;
}

function DebouncedSearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleChange = (val: string) => {
    setLocal(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(val), 300);
  };

  return (
    <div className="relative flex-1 min-w-[200px]">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-8"
      />
    </div>
  );
}

export function FilterBar({ filters, values, onChange, className }: FilterBarProps) {
  const update = (key: string, val: string) => {
    onChange({ ...values, [key]: val });
  };

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap", className)}>
      {filters.map((f) => {
        if (f.type === 'search') {
          return (
            <DebouncedSearchInput
              key={f.key}
              placeholder={f.placeholder}
              value={values[f.key] || ''}
              onChange={(val) => update(f.key, val)}
            />
          );
        }
        if (f.type === 'select') {
          return (
            <Select
              key={f.key}
              value={values[f.key] || ''}
              onChange={(e) => update(f.key, e.target.value)}
              className="w-full sm:w-[160px]"
              aria-label={f.label}
            >
              {f.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          );
        }
        return null;
      })}
    </div>
  );
}
