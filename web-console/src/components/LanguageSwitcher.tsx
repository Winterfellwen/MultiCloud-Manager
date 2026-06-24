import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLang = i18n.language?.startsWith('en') ? 'en' : 'zh';

  function changeLang(code: string) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
          >
            <Globe className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('topbar.language')}</TooltipContent>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-md border bg-card shadow-md">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLang(lang.code)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors',
                'hover:bg-accent',
                currentLang === lang.code ? 'font-medium text-primary' : 'text-foreground'
              )}
            >
              {lang.label}
              {currentLang === lang.code && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
