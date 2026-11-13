import '@/components/ui/improved-card.css';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect, SearchableSelectItem } from '@/components/ui/searchable-select';
import { RefreshCw, Calendar, ChevronLeft, ChevronRight, User, Grid3x3, List, ArrowRightLeft, NotebookPen } from 'lucide-react';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTimetableResources } from '@/hooks/useTimetableData';
import { usePendingSwapRequestsCount } from '@/hooks/usePendingSwapRequests';

type ViewMode = 'desktop' | 'mobile';

interface TimetableHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  /** [새로고침]이 다시 불러오는 중 — `loading`(첫 로드)과 따로 둔다 */
  refreshing?: boolean;
  totalEntries: number;
  selectedResource: string;
  onResourceChange: (resourceId: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  currentWeek: Date;
  onWeekChange: (date: Date) => void;
  getWeekRange: (date: Date) => { start: string; end: string };
  navigateWeek: (direction: 'prev' | 'next') => void;
  onOpenSwapRequests?: () => void;
  onOpenMemoList?: () => void;
  memoCount?: number;
}

export const TimetableHeader = ({
  loading,
  onRefresh,
  refreshing = false,
  totalEntries,
  selectedResource,
  onResourceChange,
  viewMode,
  onViewModeChange,
  currentWeek,
  onWeekChange,
  getWeekRange,
  navigateWeek,
  onOpenSwapRequests,
  onOpenMemoList,
  memoCount = 0
}: TimetableHeaderProps) => {
  // 드롭다운이 열릴 때만 교사 목록 로드
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { data: resources = [], isLoading: resourcesLoading } = useTimetableResources(isDropdownOpen);

  // 미처리 받은 요청 개수
  const { data: pendingCount = 0 } = usePendingSwapRequestsCount();

  const weekRange = getWeekRange(currentWeek);

  // 주차 표시를 더 간단한 형태로 변환 (9월 22일 → 9/22)
  const formatSimpleDate = (dateStr: string) => {
    return dateStr.replace(/(\d+)월\s(\d+)일/, '$1/$2');
  };

  const simpleWeekRange = {
    start: formatSimpleDate(weekRange.start),
    end: formatSimpleDate(weekRange.end)
  };

  // resources를 SearchableSelectItem 형태로 변환
  const teacherItems: SearchableSelectItem[] = resources.map(resource => ({
    value: resource.id,
    label: resource.name,
    description: resource.type === 'teacher' ? '선생님' : resource.type
  }));


  return (
    <Card className="card-surface-effect rounded-3xl border border-white/20 bg-white/70 shadow-sm backdrop-blur-md">
      {/* 컴팩트 헤더 */}
      <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
        {/* 상단: 제목, 주차, 뷰 탭, 액션 버튼 - 한 줄로 통합 */}
        <div className="flex flex-col gap-2">
          {/* 첫 번째 줄: 제목과 액션 버튼들 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1 mt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="이전 주"
                    onClick={() => navigateWeek('prev')}
                    className="h-8 w-8 rounded-xl p-0 text-slate-500 hover:bg-slate-100"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onWeekChange(new Date())}
                    className="text-sm sm:text-lg font-bold text-slate-800 hover:bg-slate-100 px-3 sm:px-4 h-9 mx-1 sm:mx-2 rounded-xl"
                  >
                    {simpleWeekRange.start} - {simpleWeekRange.end}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="다음 주"
                    onClick={() => navigateWeek('next')}
                    className="h-8 w-8 rounded-xl p-0 text-slate-500 hover:bg-slate-100"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* 액션 버튼들 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 뷰 모드 선택 토글 - 모바일에서 표시 */}
              <div className="sm:flex flex items-center bg-slate-100/80 rounded-lg p-0.5 gap-0.5 border border-slate-200/50">
                <Button
                  variant={viewMode === 'desktop' ? 'default' : 'ghost'}
                  size="sm"
                  aria-label="표로 보기" aria-pressed={viewMode === 'desktop'}
                  onClick={() => onViewModeChange('desktop')}
                  className={`h-7 w-7 p-0 rounded-md transition-all ${viewMode === 'desktop' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'mobile' ? 'default' : 'ghost'}
                  size="sm"
                  aria-label="목록으로 보기" aria-pressed={viewMode === 'mobile'}
                  onClick={() => onViewModeChange('mobile')}
                  className={`h-7 w-7 p-0 rounded-md transition-all ${viewMode === 'mobile' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              {onOpenMemoList && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="시간표 메모"
                  onClick={onOpenMemoList}
                  className="rounded-xl bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm font-medium transition-all"
                >
                  <NotebookPen className="h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden sm:inline">메모</span>
                  {memoCount > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                      {memoCount}
                    </span>
                  )}
                </Button>
              )}

              {onOpenSwapRequests && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="수업 교체 관리"
                    onClick={onOpenSwapRequests}
                    className="rounded-xl bg-white border-slate-200 hover:bg-slate-50 hover:border-brand-300 hover:text-brand-600 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm font-medium transition-all"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">교체 관리</span>
                  </Button>
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading || refreshing}
                aria-busy={refreshing}
                className="rounded-xl bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 h-8 px-2 sm:px-3 hidden sm:flex items-center gap-1.5 text-xs sm:text-sm transition-all"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">새로고침</span>
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-3 px-3 sm:px-4 md:px-6">
        <div className="space-y-3">
          {/* 교사 검색 - 컴팩트 버전 */}
          <div className="flex items-center justify-end border-t border-slate-100 pt-3 mt-1">
            <div className="flex items-center gap-2 bg-slate-50/80 p-1 pl-3 pr-1 rounded-full border border-slate-200/60">
              <User className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
              <span className="text-xs font-semibold text-slate-500 hidden sm:block mr-1">교사 검색</span>
              <SearchableSelect
                items={teacherItems}
                selectedValue={selectedResource}
                onValueChange={(value) => onResourceChange(value || '')}
                onOpenChange={setIsDropdownOpen}
                placeholder="교사 선택..."
                searchPlaceholder="교사 이름 검색..."
                emptyText="검색 결과가 없습니다."
                className="w-40 sm:w-56 h-8 text-xs sm:text-sm bg-white border-transparent hover:border-brand-100 focus:border-brand-300 shadow-none rounded-xl"
                disabled={loading || resourcesLoading}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export type { ViewMode };