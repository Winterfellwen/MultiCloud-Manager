import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">{t('notFound.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('notFound.desc')}</p>
        <Button asChild>
          <Link to="/dashboard">{t('notFound.back')}</Link>
        </Button>
      </div>
    </div>
  );
}
