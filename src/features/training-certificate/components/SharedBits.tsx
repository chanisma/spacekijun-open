import { cn } from '@/lib/utils';
import { CATEGORY_META } from '../utils/format';
import type { TrainingCategory } from '../types';

export function CategoryTag({ category }: { category: TrainingCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium', meta.tone)}>
      {meta.label}
    </span>
  );
}
