// 响应式布局 hook：检测屏幕宽度断点
import { useState, useEffect } from 'react';

/** Tailwind 默认断点（px）：sm 640 / md 768 / lg 1024 / xl 1280 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', handler);
    setMatches(media.matches);
    return () => media.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** 是否为移动端（< 768px，Tailwind md 断点） */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/** 是否为平板端（< 1024px，Tailwind lg 断点） */
export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
