import { useDemoStore } from '@/stores/demo';
import { useTranslation } from 'react-i18next';

export function DemoBanner() {
  const { t } = useTranslation();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  if (!isDemoMode) return null;
  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
      <span className="font-medium">{t('demo.readOnlyNotice')}</span>
      <span className="ml-2 text-muted-foreground">{t('demo.demoDataNotice')}</span>
    </div>
  );
}
