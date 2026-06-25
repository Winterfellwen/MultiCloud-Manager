import { useState, useCallback } from 'react';

export function useSyncedState<T>(
  key: string,
  defaultValue: T,
  serialize: (v: T) => string = String,
  deserialize: (s: string) => T = String as unknown as (s: string) => T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(key);
    return raw !== null ? deserialize(raw) : defaultValue;
  });

  const setSyncedValue = useCallback((value: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = value instanceof Function ? value(prev) : value;
      const params = new URLSearchParams(window.location.search);
      params.set(key, serialize(next));
      window.history.replaceState(null, '', `?${params.toString()}`);
      return next;
    });
  }, [key, serialize]);

  return [value, setSyncedValue];
}
