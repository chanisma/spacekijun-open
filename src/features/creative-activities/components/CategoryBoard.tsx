// ========================================
// 진로·분야 카테고리 보드
//
// 첫 화면 = 분야 타일 그리드(둥근 정사각형, 분야마다 다른 색, 제목 중앙 · 개수 우상단).
// 하나를 고르면 타일들이 **왼쪽 세로 레일로 이동**하고 오른쪽에 그 분야의 활동 목록이 열린다.
//
// 그리드 ↔ 레일은 즉시 전환한다. 모든 카드의 위치 측정·스프링 계산을 피하고
// 목록에만 짧은 CSS 페이드를 적용한다. 활동 행은 페이지 단위로 렌더한다.
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, LayoutGrid, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildCategories,
  getCategoryTone,
  UNCATEGORIZED,
  type CategoryBucket,
} from '../utils/categories';
import { ActivityListRow } from './ActivityListRow';
import type { ActivityListItem } from '../types';
import styles from './CategoryBoard.module.css';

const PAGE_SIZE = 40;

interface CategoryBoardProps {
  activities: ActivityListItem[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onOpenActivity: (activity: ActivityListItem) => void;
  canManage: (activity: ActivityListItem) => boolean;
  emptyTitle: string;
  emptyHint: string;
}

export function CategoryBoard({
  activities,
  selectedKey,
  onSelect,
  onOpenActivity,
  canManage,
  emptyTitle,
  emptyHint,
}: CategoryBoardProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const categories = useMemo(() => buildCategories(activities), [activities]);

  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);

  const selected = selectedKey ? categories.find((c) => c.key === selectedKey) ?? null : null;

  // 가로 메뉴에서 선택 항목만 보이도록 스크롤한다. 페이지 스크롤은 건드리지 않는다.
  useEffect(() => {
    const rail = railRef.current;
    const tile = rail?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!rail || !tile || rail.scrollWidth <= rail.clientWidth) return;
    const left = tile.offsetLeft - rail.scrollLeft;
    const right = left + tile.offsetWidth;
    const offset = left < 0 ? left - 4 : right > rail.clientWidth ? right - rail.clientWidth + 4 : 0;
    if (offset) rail.scrollBy({ left: offset, behavior: 'instant' });
  }, [selectedKey]);

  // 선택된 분야의 활동. 원본 정렬(최신순)이 activityIds에 보존돼 있다.
  const listed = useMemo(() => {
    if (!selected) return [];
    return selected.activityIds
      .map((id) => byId.get(id))
      .filter((a): a is ActivityListItem => !!a);
  }, [selected, byId]);

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-16 text-center">
        <Sparkles className="h-7 w-7 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">{emptyTitle}</p>
        <p className="max-w-sm text-xs leading-relaxed text-slate-400">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div
      className={cn('relative', selected ? 'flex flex-col items-stretch gap-4 sm:flex-row sm:items-start' : 'block')}
    >
      {/* ── 타일: 그리드 ↔ 좌측 레일 ── */}
      <div
        ref={railRef}
        className={cn(
          selected
            ? 'relative flex w-full shrink-0 gap-2 overflow-x-auto rounded-2xl bg-slate-50/80 p-2 sm:w-44 sm:flex-col sm:overflow-visible md:w-48'
            : // 좌우·상하 간격을 같게(gap-3). 타일은 정사각형이고, 열을 늘려 카드를 작게 유지한다.
              'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
        )}
      >
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            전체 분야
          </button>
        )}

        {categories.map((c) => (
          <CategoryTile
            key={c.key}
            bucket={c}
            mode={selected ? 'rail' : 'grid'}
            selected={selected?.key === c.key}
            onClick={() => onSelect(selected?.key === c.key ? null : c.key)}
          />
        ))}
      </div>

      {/* ── 선택된 분야의 활동 목록 ── */}
      {selected && (
        <div
          className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_24px_-12px_rgba(15,23,42,0.16)]"
        >
          {/* 메뉴의 선택 표시와 패널의 강조색을 맞춘다. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1 transition-colors duration-200 motion-reduce:transition-none"
            style={{ background: getCategoryTone(selected.key).accent }}
          />
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-medium tracking-wide text-slate-500">분야별 활동 기록</p>
              <h2 className="break-words text-lg font-bold tracking-tight text-slate-900">
                {selected.label}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
              활동 {listed.length}건
            </span>
          </div>

          {listed.length === 0 ? (
            <p className="px-3 py-10 text-center text-xs text-slate-400">
              이 분야에 표시할 활동이 없습니다.
            </p>
          ) : (
            <ActivityRecordList
              key={selected.key}
              activities={listed}
              label={selected.label}
              onOpenActivity={onOpenActivity}
              canManage={canManage}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------

function CategoryTile({
  bucket,
  mode,
  selected,
  onClick,
}: {
  bucket: CategoryBucket;
  mode: 'grid' | 'rail';
  selected: boolean;
  onClick: () => void;
}) {
  const tone = getCategoryTone(bucket.key);
  const isGrid = mode === 'grid';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${bucket.label} 활동 ${bucket.count}건`}
      className={cn(
        'group relative isolate rounded-xl border text-left transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1',
        isGrid
          ? 'aspect-square overflow-hidden shadow-sm hover:shadow-md'
          : cn(
              'flex shrink-0 items-center justify-between gap-2 sm:shrink',
              'min-h-11 px-3 py-3',
              selected ? 'font-semibold' : 'hover:bg-white'
            ),
        bucket.key === UNCATEGORIZED && 'border-dashed'
      )}
      style={{
        backgroundColor: isGrid ? tone.bg : undefined,
        color: isGrid || selected ? tone.fg : '#475569',
        borderColor: isGrid ? tone.border : 'transparent',
      }}
    >
      {selected && !isGrid && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-xl border shadow-sm"
          style={{ backgroundColor: tone.bg, borderColor: tone.border }}
        />
      )}
      {/* 제목과 개수 DOM을 유지해 모드 전환 시 내용 교체가 겹치지 않게 한다. */}
      <span
        className={cn(
          'rounded-full font-semibold tabular-nums',
          isGrid ? 'absolute right-3 top-3 px-2 py-1 text-xs' : 'order-2 shrink-0 px-1.5 py-0.5 text-[11px]'
        )}
        style={{ backgroundColor: tone.badge }}
        aria-hidden
      >
        {bucket.count}
      </span>
      <span
        className={cn(
          'min-w-0 font-semibold leading-snug',
          isGrid ? 'flex h-full items-center justify-center px-3 pb-4 pt-9 text-center text-lg tracking-tight sm:text-xl lg:text-2xl' : 'truncate text-[13px]'
        )}
        title={bucket.label}
      >
        <span className={isGrid ? 'line-clamp-3' : 'block truncate'}>{bucket.label}</span>
      </span>
      {isGrid && (
        <ArrowUpRight aria-hidden className="absolute bottom-3 right-3 h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100 motion-reduce:transition-none" />
      )}
    </button>
  );
}

/** 긴 제목으로 행 높이가 달라도 렌더 수를 제한한다. 페이지 버튼은 목록 밖에 유지한다. */
function ActivityRecordList({ activities, label, onOpenActivity, canManage }: {
  activities: ActivityListItem[];
  label: string;
  onOpenActivity: (activity: ActivityListItem) => void;
  canManage: (activity: ActivityListItem) => boolean;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(activities.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const start = currentPage * PAGE_SIZE;
  const visible = activities.slice(start, start + PAGE_SIZE);

  return (
    <>
      <ul
        key={currentPage}
        aria-label={`${label} 활동 기록`}
        className={cn(styles.listEnter, 'max-h-[65vh] divide-y divide-slate-100 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]')}
      >
        {visible.map((activity) => (
          <li key={activity.id}>
            <ActivityListRow activity={activity} onClick={onOpenActivity} isMine={canManage(activity)} />
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav aria-label="활동 기록 페이지" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
          <span role="status" className="tabular-nums">
            {start + 1}–{Math.min(start + PAGE_SIZE, activities.length)} / {activities.length}건
          </span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="min-h-9 rounded-md border border-slate-200 bg-white px-3 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-default disabled:opacity-40">이전</button>
            <span className="tabular-nums">{currentPage + 1} / {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="min-h-9 rounded-md border border-slate-200 bg-white px-3 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-default disabled:opacity-40">다음</button>
          </div>
        </nav>
      )}
    </>
  );
}
