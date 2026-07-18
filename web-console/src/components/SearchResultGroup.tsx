import { SearchResultItem } from './SearchResultItem';

interface SearchResultGroupProps {
  title: string;
  items: any[];
  activeIndex: number;
  startIndex: number;
  onItemClick: (item: any) => void;
}

export function SearchResultGroup({ title, items, activeIndex, startIndex, onItemClick }: SearchResultGroupProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title} ({items.length})
      </div>
      {items.map((item, i) => (
        <SearchResultItem
          key={item.id}
          item={item}
          active={activeIndex === startIndex + i}
          onClick={() => onItemClick(item)}
        />
      ))}
    </div>
  );
}
