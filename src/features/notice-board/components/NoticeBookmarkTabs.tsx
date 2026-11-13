// ========================================
// 부서 북마크 탭
// 활성 공지가 있는 부서를 선택 버튼으로 표시. 미확인 공지는 작은 점으로 구분.
// ========================================

import type { ReactNode } from 'react';
import { List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortDeptName } from '../utils/deptShortName';

export interface DeptTabInfo {
  department: string;
  /** 해당 부서의 활성 공지 수 */
  count: number;
  /** 미확인 활성 공지 존재 여부 */
  hasNew: boolean;
}

/** "전체" 탭 선택값 (부서명과 충돌하지 않는 센티넬) */
export const ALL_DEPARTMENTS = '__all__';

interface NoticeBookmarkTabsProps {
  tabs: DeptTabInfo[];
  totalCount: number;
  hasAnyNew: boolean;
  selected: string;
  onSelect: (dept: string) => void;
  /** 탭 행 맨 오른쪽에 고정되는 요소 (예: '지난 공지 포함' 토글) */
  trailing?: ReactNode;
}

function NewDot() {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5" aria-label="새 공지">
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
    </span>
  );
}

function BookmarkTab({
  label,
  shortLabel,
  mobileIcon,
  count,
  hasNew,
  isActive,
  onClick,
}: {
  label: string;
  /** 모바일(<sm)에서 표시할 축약 라벨 — label과 같으면 분기 없이 label만 렌더 */
  shortLabel?: string;
  /** 모바일(<sm)에서 텍스트 대신 표시할 아이콘 (shortLabel보다 우선) */
  mobileIcon?: ReactNode;
  count: number;
  hasNew: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const hasShort = shortLabel !== undefined && shortLabel !== label;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'relative shrink-0 rounded-xl border px-2.5 py-1.5 text-xs sm:text-sm font-medium',
        'transition-all duration-200 whitespace-nowrap',
        isActive
          ? 'bg-rose-50 border-rose-200 text-rose-700 font-semibold'
          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <span className="flex items-center gap-1.5">
        {mobileIcon ? (
          <>
            <span className="sm:hidden">{mobileIcon}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : hasShort ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
            isActive ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
          )}
        >
          {count}
        </span>
      </span>
      {hasNew && <NewDot />}
    </button>
  );
}

export function NoticeBookmarkTabs({
  tabs,
  totalCount,
  hasAnyNew,
  selected,
  onSelect,
  trailing,
}: NoticeBookmarkTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 좁은 화면에서는 부서 버튼을 줄바꿈한다. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {/* 공지가 없어도 전체 선택을 유지한다. */}
          <BookmarkTab
            label="전체"
            mobileIcon={<List className="h-3.5 w-3.5" />}
            count={totalCount}
            hasNew={hasAnyNew}
            isActive={selected === ALL_DEPARTMENTS}
            onClick={() => onSelect(ALL_DEPARTMENTS)}
          />

        {/* 활성 공지가 있는 부서만 북마크로 표시 — 모바일에선 축약명 */}
        {tabs.map((tab) => (
          <BookmarkTab
            key={tab.department}
            label={tab.department}
            shortLabel={shortDeptName(tab.department)}
            count={tab.count}
            hasNew={tab.hasNew}
            isActive={selected === tab.department}
            onClick={() => onSelect(tab.department)}
          />
        ))}

      </div>

      {/* 추가 필터 슬롯 */}
      {trailing && <div className="shrink-0 pb-1.5 pr-1">{trailing}</div>}
    </div>
  );
}
