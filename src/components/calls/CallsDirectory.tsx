import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchX, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { extensionData } from '@/data/extensionDirectory';
import { countEntries, filterDirectory } from '@/lib/callsDirectory';
import { CallCategory, CallCategoryFilter } from '@/types/calls';
import { DirectorySection } from './DirectorySection';
import { StaffGrid } from './StaffGrid';
import { PhoneGuideCard } from './PhoneGuideCard';

const CATEGORY_FILTERS: CallCategoryFilter[] = [
  { id: 'all', label: '전체' },
  { id: 'admin', label: '운영실' },
  { id: 'grade', label: '학년' },
  { id: 'staff', label: '담당자' },
  { id: 'facility', label: '부속실' },
  { id: 'office', label: '행정실' },
  { id: 'dorm', label: '기숙사' },
  { id: 'cafeteria', label: '식생활관' },
];

/**
 * 화면 배치 묶음. 카테고리를 의미 단위로 묶어 한 덩어리씩 보여준다
 * (그룹을 한 줄짜리 그리드에 그냥 흘리면 학년 3개와 담당자 25명이 뒤섞여 읽기 어렵다).
 */
const LAYOUT_BLOCKS: Array<{
  id: string;
  title: string;
  categories: CallCategory[];
  gridClassName: string;
}> = [
  {
    id: 'offices',
    title: '교무실',
    categories: ['admin', 'grade'],
    // 4열은 2xl부터 — 1280px대에서 4열이면 카드가 좁아 '교무실무사' 같은 이름이 잘린다
    gridClassName: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  },
  {
    id: 'staff',
    title: '담당자별 내선',
    categories: ['staff'],
    gridClassName: 'grid-cols-1',
  },
  {
    id: 'support',
    title: '부속실 · 행정',
    categories: ['facility', 'office', 'dorm', 'cafeteria'],
    // 4열은 2xl부터 — 1280px대에서 4열이면 카드가 좁아 '교무실무사' 같은 이름이 잘린다
    gridClassName: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  },
];

export const CallsDirectory = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CallCategory | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // "/" 로 검색창 포커스 — 번호를 자주 찾는 화면이라 키보드 진입을 빠르게 한다
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredGroups = useMemo(
    () => filterDirectory(extensionData, { query, category }),
    [query, category]
  );

  const resultCount = useMemo(() => countEntries(filteredGroups), [filteredGroups]);
  const isSearching = query.trim().length > 0;

  const visibleBlocks = LAYOUT_BLOCKS.map((block) => ({
    ...block,
    groups: filteredGroups.filter((group) => block.categories.includes(group.category)),
  })).filter((block) => block.groups.length > 0);

  return (
    <div className="space-y-5">
      {/* 검색 + 카테고리 필터 */}
      <div className="sticky top-2 z-20 rounded-2xl border border-slate-200/70 bg-white/85 p-3 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름, 부서, 업무, 번호 검색"
              className="h-9 border-slate-200 pl-9 pr-9 text-sm shadow-sm transition-all focus:border-indigo-500 focus:ring-indigo-500/20"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setCategory(filter.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                  category === filter.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {filter.label}
              </button>
            ))}

            {(isSearching || category !== 'all') && (
              <span className="ml-auto shrink-0 text-xs text-slate-500">
                {resultCount}건
              </span>
            )}
          </div>
        </div>
      </div>

      {visibleBlocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16">
          <SearchX className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">'{query}'</span>에 해당하는 번호가 없습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            검색 조건 초기화
          </button>
        </div>
      ) : (
        <div className="space-y-6 pb-10">
          {visibleBlocks.map((block) => (
            <div key={block.id} className="space-y-2.5">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                {block.title}
              </h2>
              <div className={cn('grid items-start gap-3', block.gridClassName)}>
                {block.groups.map((group) =>
                  group.category === 'staff' ? (
                    <DirectorySection key={group.id} group={group}>
                      <StaffGrid entries={group.entries} />
                    </DirectorySection>
                  ) : (
                    <DirectorySection key={group.id} group={group} />
                  )
                )}
              </div>
            </div>
          ))}

          <PhoneGuideCard />
        </div>
      )}
    </div>
  );
};
