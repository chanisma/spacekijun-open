import { useMemo, useState } from 'react';
import { Check, ChevronDown, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CategoryCount } from '@/lib/collabCategories';

interface BoardCategoryFilterProps {
  /** **지금 목록에 보이는 보드**에서 유도한 카탈로그 — 눌러도 0건인 칩이 생기지 않는다 */
  categories: CategoryCount[];
  /** null = 전체 */
  selected: string | null;
  onSelect: (key: string | null) => void;
  totalCount: number;
}

/** 항상 펴서 보여 주는 칩 수. 넘치는 것은 [+N] 팝오버로 접는다. */
const VISIBLE_CHIPS = 5;

/**
 * 보드 목록 헤더의 카테고리 필터.
 *
 * 카테고리는 **자유 입력**이라 개수에 상한이 없다. 전부 한 줄에 펴면 넓은 화면은
 * 괜찮아도 모바일에서 헤더가 두세 줄로 늘어나고 가로 스크롤바가 생긴다.
 * 그래서 자주 쓰는 것(= 보드 수가 많은 것) 5개만 펴고 나머지는 [+N] 뒤에 둔다.
 *
 * **고른 칩은 반드시 보이게 한다.** [+N] 안에서 고른 카테고리가 접힌 채 남으면
 * 목록은 걸러졌는데 화면 어디에도 "무엇으로 걸렀는지"가 없다 — 사용자에게는
 * 보드가 사라진 것으로 보인다. 그래서 선택된 항목은 마지막 슬롯을 차지한다.
 *
 * 디자인 어휘는 업무 관리 `TaskHeader` 의 세그먼트 알약과 같다(CLAUDE.md 규약).
 */
export function BoardCategoryFilter({
  categories,
  selected,
  onSelect,
  totalCount,
}: BoardCategoryFilterProps) {
  const [open, setOpen] = useState(false);

  const { visible, overflow } = useMemo(() => {
    if (categories.length <= VISIBLE_CHIPS) {
      return { visible: categories, overflow: [] as CategoryCount[] };
    }

    const head = categories.slice(0, VISIBLE_CHIPS);
    const tail = categories.slice(VISIBLE_CHIPS);

    // 선택한 것이 접혀 있으면 마지막 자리와 맞바꾼다.
    const hiddenIndex = tail.findIndex((c) => c.key === selected);
    if (hiddenIndex >= 0) {
      const promoted = tail[hiddenIndex];
      const demoted = head[head.length - 1];
      return {
        visible: [...head.slice(0, -1), promoted],
        overflow: [demoted, ...tail.filter((_, i) => i !== hiddenIndex)],
      };
    }
    return { visible: head, overflow: tail };
  }, [categories, selected]);

  // 카테고리가 아예 없으면 줄 자체를 그리지 않는다 — 누를 것이 "전체" 하나뿐인
  // 필터는 자리만 먹는다.
  if (categories.length === 0) return null;

  const chipClass = (active: boolean) =>
    [
      'h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap',
      'inline-flex items-center gap-1.5',
      active
        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
        : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
    ].join(' ');

  const countClass = (active: boolean) =>
    active ? 'text-blue-500' : 'text-slate-400';

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-100/50 p-1">
      <Tag className="ml-1 h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={chipClass(selected === null)}
        >
          전체
          <span className={countClass(selected === null)}>{totalCount}</span>
        </button>

        {visible.map((category) => {
          const active = selected === category.key;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => onSelect(active ? null : category.key)}
              className={`${chipClass(active)} min-w-0`}
              title={category.label}
            >
              <span className="truncate">{category.label}</span>
              <span className={countClass(active)}>{category.count}</span>
            </button>
          );
        })}
      </div>

      {overflow.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 flex-shrink-0 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-white/60 hover:text-slate-800"
            >
              +{overflow.length}
              <ChevronDown className="ml-0.5 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <ScrollArea className="max-h-64">
              <div className="space-y-0.5">
                {overflow.map((category) => {
                  const active = selected === category.key;
                  return (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => {
                        onSelect(active ? null : category.key);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Check
                        className={`h-3.5 w-3.5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-transparent'}`}
                      />
                      <span className="min-w-0 flex-1 truncate" title={category.label}>
                        {category.label}
                      </span>
                      <span className="flex-shrink-0 text-slate-400">{category.count}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
