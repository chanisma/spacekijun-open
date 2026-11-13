import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImprovedCard } from '@/components/ui/improved-card';
import { BookOpen, Search } from 'lucide-react';

interface Props {
  isManager: boolean;
  onManageTrainings: () => void;
  showSearch: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  count: number;
}

/**
 * 연수 이수 현황 머리글 — 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
 * 남는 것은 교사 검색(관리자)과 [연수 종류 관리] 뿐이라, 둘 다 없는 일반 교사에게는 **머리글 자체를
 * 그리지 않는다**(빈 카드가 남는다). 전체/나의 현황 구분은 아래 표가 이미 보여 준다.
 */
export function TrainingHeader({ isManager, onManageTrainings, showSearch, search, onSearchChange, count }: Props) {
  if (!isManager && !showSearch) return null;
  return (
    <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4 md:px-6">
        {/* 교사 검색 (관리자 전용) */}
        {showSearch && (
          <div className="flex items-center gap-2 bg-slate-50/80 p-1 pl-3 pr-1 rounded-full border border-slate-200/60">
            <Search className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
            <span className="text-xs font-semibold text-slate-500 hidden sm:block mr-1">교사 검색</span>
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="이름 또는 학급 검색"
              className="w-40 sm:w-56 h-8 text-xs sm:text-sm bg-white border-transparent hover:border-blue-100 focus:border-blue-300 shadow-sm rounded-full"
            />
            <span className="px-2 text-xs text-slate-500 tabular-nums whitespace-nowrap">{count}명</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {isManager && (
            <Button
              variant="outline"
              size="sm"
              onClick={onManageTrainings}
              className="bg-white/50 border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm font-medium transition-all"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">연수 종류 관리</span>
            </Button>
          )}
        </div>
      </div>
    </ImprovedCard>
  );
}
