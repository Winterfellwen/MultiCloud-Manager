import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const BREADCRUMB_MAP: Record<string, { parent?: string; label: string }> = {
  '/dashboard': { label: 'nav.group.dashboard' },
  '/chat/react': { parent: 'nav.group.aiAgent', label: 'nav.chat' },
  '/ai-ops': { parent: 'nav.group.aiAgent', label: 'nav.aiOps' },
  '/knowledge-base': { parent: 'nav.group.aiAgent', label: 'nav.knowledgeBase' },
  '/resources': { parent: 'nav.group.resourceMgmt', label: 'nav.resources' },
  '/instances': { parent: 'nav.group.resourceMgmt', label: 'nav.instances' },
  '/topology': { parent: 'nav.group.resourceMgmt', label: 'nav.topology' },
  '/cloud-accounts': { parent: 'nav.group.resourceMgmt', label: 'nav.cloudAccounts' },
  '/monitor': { parent: 'nav.group.monitoring', label: 'nav.monitor' },
  '/notifications': { parent: 'nav.group.monitoring', label: 'nav.notifications' },
  '/costs': { parent: 'nav.group.costMgmt', label: 'nav.costs' },
  '/tools': { parent: 'nav.group.system', label: 'nav.tools' },
  '/mcp': { parent: 'nav.group.system', label: 'nav.mcp' },
  '/users': { parent: 'nav.group.system', label: 'nav.users' },
  '/audit': { parent: 'nav.group.system', label: 'nav.audit' },
  '/ai-settings': { parent: 'nav.group.system', label: 'nav.aiSettings' },
};

export function Breadcrumb() {
  const { t } = useTranslation();
  const location = useLocation();

  // Match the base path (first segment)
  const segments = location.pathname.split('/').filter(Boolean);
  const basePath = '/' + (segments[0] || '');

  // For detail pages like /instances/:id, match on the base path
  const entry = BREADCRUMB_MAP[basePath];

  if (!entry) return null;

  const crumbs: { label: string; to?: string }[] = [];
  if (entry.parent) {
    crumbs.push({ label: t(entry.parent) });
  }
  crumbs.push({ label: t(entry.label), to: basePath });

  // For detail pages with ID after base path
  if (location.pathname !== basePath && segments.length > 1) {
    crumbs.push({ label: segments[segments.length - 1] });
  }

  return (
    <nav className="flex items-center gap-1 px-3 md:px-6 py-2 text-sm text-muted-foreground border-b overflow-x-auto">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground/60">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
