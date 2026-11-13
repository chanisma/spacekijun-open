import '@/components/ui/improved-card.css';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TimetableHeader, ViewMode } from './TimetableHeader';
import { TimetableGrid } from './TimetableGrid';
import { TimetableMemoListDialog } from './TimetableMemoListDialog';
import { SwapRequestList } from './SwapRequestList';
import { useTimetable, TimetableEntry } from '@/hooks/useTimetable';
import { useTeacherMemos } from '@/hooks/useTeacherMemo';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, TitleIconChip } from './timetableDialogDesign';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeftRight } from 'lucide-react';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { usePageRefresh } from '@/hooks/usePageRefresh';

interface TimetableViewProps {
  resourceId?: string;
}

export const TimetableView: React.FC<TimetableViewProps> = ({
  resourceId
}) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const location = useLocation();
  useEffect(() => {
    const swapDate = (location.state as { swapDate?: unknown } | null)?.swapDate;
    if (typeof swapDate !== 'string') return;
    const date = new Date(swapDate);
    if (!Number.isNaN(date.getTime())) setCurrentWeek(date);
  }, [location.state]);
  const [swapRequestDialogOpen, setSwapRequestDialogOpen] = useState(false);
  // 모바일에서도 기본은 표 형태(desktop)
  // 사용자 요구사항: 모바일에서 기본 뷰는 표 형태, 표의 크기가 헤더나 푸터보다 커지지 않도록 제한
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [memoListOpen, setMemoListOpen] = useState(false);
  const { toast } = useToast();

  // 화면 크기 변경 감지는 제거 (사용자가 직접 선택하도록)

  // 주간 범위 계산
  const getWeekRange = (date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday start
    const weekEnd = addWeeks(weekStart, 1);
    weekEnd.setDate(weekEnd.getDate() - 1); // Get Sunday

    return {
      start: format(weekStart, 'M월 d일', { locale: ko }),
      end: format(weekEnd, 'M월 d일', { locale: ko })
    };
  };

  // 주차 네비게이션
  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = addWeeks(currentWeek, direction === 'next' ? 1 : -1);
    setCurrentWeek(newWeek);
  };

  const {
    timetable,
    loading,
    weekdays,
    periods,
    selectedResource,
    setSelectedResource,
    refetch
  } = useTimetable(resourceId as any, currentWeek);
  // [새로고침] — 이 화면이 그리는 쿼리를 **전부** 다시 부른다. 종전엔 수업만 다시 불러
  // 메모·교체 요청 배지·쉬는 날 표시는 그대로였고, 회전 표시도 첫 로드에만 돌아 «안 눌린» 것처럼 보였다
  const pageRefresh = usePageRefresh([
    ['timetable-data'],
    ['timetable-resources'],
    ['teacher-memo'],
    ['pending-swap-count'],
    ['class-swaps'],
    ['swap-requests'],
    ['school-calendar'],
    ['academic-term'],
  ]);

  // Teacher memos for header badge count and memo list
  const isTeacherView = selectedResource && selectedResource !== 'student';
  const { data: memos = [] } = useTeacherMemos(
    isTeacherView ? selectedResource : undefined,
    currentWeek
  );

  const handleCellClick = (period: number, weekday: number, entry?: TimetableEntry) => {
    if (!entry) {
      // 빈 셀 클릭 시 수업 추가 안내
      toast({
        title: '수업 추가',
        description: `${weekdays[weekday - 1]}요일 ${period}교시에 담당 수업을 추가할 수 있습니다.`,
      });
    } else {
      // 기존 수업 클릭 시 상세 정보 표시
      toast({
        title: entry.subject || '수업',
        description: `${entry.section_name || ''} - ${entry.teacher_name || '담당교사 미정'}`,
      });
    }
  };




  if (loading && timetable.length === 0) {
    return (
      <div className="space-y-6">
        {/* 헤더 스켈레톤 */}
        <Card className="card-surface-effect shadow-sm">
          <div className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
            {/* 상단: 주차 네비게이션 + 뷰 모드 + 액션 버튼들 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-6 w-32 sm:w-40 mx-2 sm:mx-4" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                {/* 뷰 모드 토글 */}
                <div className="flex items-center bg-slate-100 rounded-md p-0.5 gap-0.5">
                  <Skeleton className="h-6 w-6" />
                  <Skeleton className="h-6 w-6" />
                </div>
                {/* 교체 관리 버튼 */}
                <Skeleton className="h-7 w-20 sm:w-24" />
                {/* 새로고침 버튼 */}
                <Skeleton className="h-7 w-16 sm:w-24" />
              </div>
            </div>
          </div>
          {/* 하단: 교사 검색 */}
          <div className="pt-1 pb-2 px-3 sm:px-4 md:px-6">
            <div className="flex items-center justify-end gap-2">
              <Skeleton className="h-4 w-4 hidden sm:block" />
              <Skeleton className="h-4 w-20 hidden sm:block" />
              <Skeleton className="h-9 w-48 sm:w-64" />
            </div>
          </div>
        </Card>

        {/* 그리드 스켈레톤 */}
        <Card className="card-surface-effect p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2">
              <Skeleton className="h-8 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <Skeleton className="h-20 w-full" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-20 w-full" />
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full relative">
      <TimetableHeader
        loading={loading}
        onRefresh={pageRefresh.refresh}
        refreshing={pageRefresh.refreshing}
        totalEntries={timetable.length}
        selectedResource={selectedResource}
        onResourceChange={setSelectedResource as any}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentWeek={currentWeek}
        onWeekChange={setCurrentWeek}
        getWeekRange={getWeekRange}
        navigateWeek={navigateWeek}
        onOpenSwapRequests={() => setSwapRequestDialogOpen(true)}
        onOpenMemoList={isTeacherView ? () => setMemoListOpen(true) : undefined}
        memoCount={memos.length}
      />

      {/* 운영 시간표(시험·수능 대비 등 기간 한정 임시 시간표)가 이번 주 수업을 바꿨으면 알린다 — 정규와 달라 보이는 이유 */}
      {(() => {
        const titles = [...new Set(timetable.map((e) => e.override_title).filter((t): t is string => !!t))];
        return titles.length > 0 ? (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-blue-800">
            이번 주에는 {titles.map((t) => `«${t}»`).join(', ')}이(가) 적용된 날이 있어 정규 시간표와 다르게 보일 수 있습니다.
          </p>
        ) : null;
      })()}

      {selectedResource ? (
        <TimetableGrid
          currentDate={currentWeek}
          meetings={timetable}
          viewMode={viewMode}
          selectedResource={selectedResource}
        />
      ) : (
        <Card className="card-surface-effect p-12">
          <div className="text-center text-muted-foreground">
            <div className="mb-4">
              <div className="text-lg font-medium mb-2">
                시간표를 불러오는 중입니다
              </div>
              <p className="text-sm">
                사용자 정보를 확인하여 시간표를 자동으로 불러오고 있습니다.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 교체·대체 요청 관리 (받은/보낸 요청) */}
      <Dialog open={swapRequestDialogOpen} onOpenChange={setSwapRequestDialogOpen}>
        <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className={DIALOG_HEADER_CLASS}>
            <div className="flex items-center gap-3.5">
              <TitleIconChip icon={ArrowLeftRight} tone="blue" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  수업 교체 관리
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-slate-500">
                  받은 요청을 검토하고, 보낸 요청과 보강 계획서 결재 진행 상황을 확인합니다.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
            <SwapRequestList />
          </div>
        </DialogContent>
      </Dialog>

      {/* Memo List Dialog */}
      <TimetableMemoListDialog
        open={isTeacherView ? memoListOpen : false}
        onOpenChange={setMemoListOpen}
        memos={memos}
        currentWeek={currentWeek}
        timetableEntries={timetable}
        resourceId={selectedResource ?? undefined}
      />

      {/* Background Pattern */}
    </div>
  );
};
