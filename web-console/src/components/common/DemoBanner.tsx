import { useDemoStore } from '@/stores/demo';

export function DemoBanner() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  if (!isDemoMode) return null;
  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
      <span className="font-medium">演示模式</span>
      <span className="ml-2 text-muted-foreground">所有数据为模拟数据，退出登录后清除</span>
    </div>
  );
}
