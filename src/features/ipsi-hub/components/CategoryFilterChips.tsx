import { Button } from '@/components/ui/button';
import type { FeedType } from './TypeFilterChips';
import { categoriesForType } from '../utils/categories';

type Props = {
  type: FeedType;
  active: string;
  onChange: (category: string) => void;
};

export function CategoryFilterChips({ type, active, onChange }: Props) {
  const categories = categoriesForType(type);

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto">
      {categories.map(cat => (
        <Button
          key={cat}
          variant={active === cat ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(cat)}
          className="h-7 rounded-full px-3 text-xs"
        >
          {cat}
        </Button>
      ))}
    </div>
  );
}
