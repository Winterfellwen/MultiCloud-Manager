import { FileText, Server, AlertTriangle } from 'lucide-react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  resource: <Server className="w-4 h-4" />,
  instance: <Server className="w-4 h-4" />,
  alert: <AlertTriangle className="w-4 h-4" />,
};

interface SearchResultItemProps {
  item: { id: string; name: string; type: string; provider?: string; severity?: string };
  active: boolean;
  onClick: () => void;
}

export function SearchResultItem({ item, active, onClick }: SearchResultItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 flex items-center gap-3 text-sm transition-colors ${
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      }`}
    >
      {TYPE_ICONS[item.type] || <FileText className="w-4 h-4" />}
      <span className="flex-1 truncate">{item.name}</span>
      {item.provider && (
        <span className="text-xs text-muted-foreground shrink-0">{item.provider}</span>
      )}
      {item.severity && (
        <span className={`text-xs shrink-0 ${
          item.severity === 'critical' ? 'text-red-500' :
          item.severity === 'warning' ? 'text-yellow-500' : 'text-muted-foreground'
        }`}>
          {item.severity}
        </span>
      )}
    </button>
  );
}
