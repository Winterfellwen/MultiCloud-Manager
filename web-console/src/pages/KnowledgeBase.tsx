import { useTranslation } from 'react-i18next';
import KnowledgeBaseTab from '@/components/monitor/KnowledgeBaseTab';

export default function KnowledgeBase() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t('knowledgeBase.title')}</h1>
      <KnowledgeBaseTab />
    </div>
  );
}
