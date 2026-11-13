import '@/components/ui/improved-card.css';
import { Card } from '@/components/ui/card';
import React, { useState, useEffect } from 'react';
import { TimetableGrid } from './TimetableGrid';
import { useStudentTimetable } from '@/hooks/useStudentTimetable';
import type { TimetableEntry } from '@/hooks/useTimetableData';
import type { ViewMode } from './TimetableHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw, LayoutGrid, List } from 'lucide-react';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePageRefresh } from '@/hooks/usePageRefresh';

/**
 * Read-only timetable view for students.
 * Shows the student's class timetable without swap/change features.
 */
export const StudentTimetableView: React.FC = () => {
  const isMobile = useIsMobile();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const { timetable, loading, studentGrade, studentClassNum } = useStudentTimetable();
  // [새로고침] — 수업과 그 주의 쉬는 날 표시를 함께 다시 부른다
  const pageRefresh = usePageRefresh([['student-timetable'], ['school-calendar'], ['academic-term']]);

  // Auto-switch to mobile view on small screens
  useEffect(() => {
    setViewMode(isMobile ? 'mobile' : 'desktop');
  }, [isMobile]);

  // Convert RPC result to TimetableEntry format for TimetableGrid
  const timetableEntries: TimetableEntry[] = timetable.map((entry, index) => ({
    id: `student-${index}`,
    period: entry.period,
    weekday: entry.day_of_week,
    subject: entry.subject,
    section_name: entry.section_name,
    room_name: entry.room_name || undefined,
    teacher_name: entry.teacher_name,
    type: 'pattern' as const,
  }));

  const getWeekRange = (date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekEnd = addWeeks(weekStart, 1);
    weekEnd.setDate(weekEnd.getDate() - 1);
    return {
      start: format(weekStart, 'M월 d일', { locale: ko }),
      end: format(weekEnd, 'M월 d일', { locale: ko }),
    };
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeek(addWeeks(currentWeek, direction === 'next' ? 1 : -1));
  };

  const weekRange = getWeekRange(currentWeek);

  if (loading && timetableEntries.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="card-surface-effect shadow-sm">
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-7 w-20" />
            </div>
          </div>
        </Card>
        <Card className="card-surface-effect p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, j) => (
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
      {/* Header - simplified for students */}
      <Card className="card-surface-effect rounded-3xl border border-white/20 bg-white/70 shadow-sm backdrop-blur-md">
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Week navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label="이전 주"
                    onClick={() => navigateWeek('prev')}
                className="h-8 w-8 p-0 hover:bg-slate-100 rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentWeek(new Date())}
                className="text-sm sm:text-lg font-bold text-slate-800 hover:bg-slate-100 px-3 sm:px-4 h-9 mx-1 sm:mx-2 rounded-xl"
              >
                {weekRange.start} ~ {weekRange.end}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="다음 주"
                    onClick={() => navigateWeek('next')}
                className="h-8 w-8 p-0 hover:bg-slate-100 rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Class info badge */}
              {studentGrade && studentClassNum && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                  {studentGrade}학년 {studentClassNum}반
                </span>
              )}

              {/* View mode toggle */}
              <div className="flex items-center bg-slate-100 rounded-md p-0.5 gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('desktop')}
                  className={`h-7 w-7 p-0 rounded ${viewMode === 'desktop' ? 'bg-white shadow-sm' : ''}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('mobile')}
                  className={`h-7 w-7 p-0 rounded ${viewMode === 'mobile' ? 'bg-white shadow-sm' : ''}`}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Refresh — desktop only */}
              <Button
                variant="outline"
                size="sm"
                onClick={pageRefresh.refresh}
                disabled={loading || pageRefresh.refreshing}
                aria-busy={pageRefresh.refreshing}
                className="rounded-xl bg-white border-slate-200 hover:bg-slate-50 h-8 px-2 sm:px-3 hidden sm:flex items-center gap-1.5 text-xs sm:text-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading || pageRefresh.refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">새로고침</span>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Timetable Grid */}
      {timetableEntries.length > 0 ? (
        <TimetableGrid
          currentDate={currentWeek}
          meetings={timetableEntries}
          viewMode={viewMode}
          selectedResource="student"
          viewerGrade={studentGrade ?? null}
        />
      ) : (
        <Card className="card-surface-effect p-12">
          <div className="text-center text-muted-foreground">
            <div className="text-lg font-medium mb-2">
              시간표 정보가 없습니다
            </div>
            <p className="text-sm">
              {studentGrade && studentClassNum
                ? `${studentGrade}학년 ${studentClassNum}반의 시간표 데이터를 찾을 수 없습니다.`
                : '학생 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.'}
            </p>
          </div>
        </Card>
      )}

      {/* Background Pattern */}
    </div>
  );
};
