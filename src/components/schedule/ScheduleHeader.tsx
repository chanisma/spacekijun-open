import { CalendarDays, Plus, RefreshCw, Filter, Clock, Users, Download, Settings, ChevronLeft, ChevronRight, Globe, Send, ChevronDown, Table2, ClipboardList, CalendarSearch, LayoutGrid, Utensils, ClipboardCheck } from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDropdownDialog } from '@/hooks/useDropdownDialog';
import { RoleGate } from '@/components/auth/RoleGate';
import { cn } from '@/lib/utils';
import type { ScheduleViewMode } from '@/lib/scheduleUtils';

/** 전환 가능한 뷰 — 달력(월 격자)과 일별 계획표(표) */
const VIEW_OPTIONS: { value: ScheduleViewMode; label: string; icon: typeof CalendarDays }[] = [
  { value: 'month', label: '달력', icon: CalendarDays },
  { value: 'plan', label: '계획표', icon: Table2 },
];

interface ScheduleHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  viewMode: ScheduleViewMode;
  onViewModeChange: (mode: ScheduleViewMode) => void;
  onRefresh: () => void;
  /** [새로고침]이 다시 불러오는 중 — `loading`(첫 로드)과 따로 둔다 */
  refreshing?: boolean;
  onCreateEvent: () => void;
  createDisabled?: boolean;
  isStudent?: boolean;
  onGoogleExport: () => void;
  onGoogleDirectExport: () => void;
  loading: boolean;
  eventCount: number;
  /** 일정 설문 목록 열기 */
  onOpenSurveys?: () => void;
  /** 아직 답하지 않은, 나에게 온 설문 수 */
  pendingSurveyCount?: number;
  /** 회의 가능 시간 검색 열기 (교직원 — 2026-09-28 도구 모음에서 옮겨 왔다) */
  onOpenMeetingSearch?: () => void;
  /** 급식지도 월간 명단 만들기 (교직원 — 2026-10-01) */
  onOpenMealDuty?: () => void;
  /** 자습 감독 배정(학년부장·담임) · 내 감독 교체 (2026-10-11) */
  onOpenSupervision?: () => void;
  /** 나에게 온 자습 감독 교체 요청 수 — 메뉴 버튼 배지에 함께 센다 */
  pendingSupervisionSwapCount?: number;
}

export const ScheduleHeader = ({
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  refreshing = false,
  onCreateEvent,
  createDisabled = false,
  isStudent = false,
  onGoogleExport,
  onGoogleDirectExport,
  loading,
  eventCount,
  onOpenSurveys,
  pendingSurveyCount = 0,
  onOpenMeetingSearch,
  onOpenMealDuty,
  onOpenSupervision,
  pendingSupervisionSwapCount = 0,
}: ScheduleHeaderProps) => {
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();

  const formatDateRange = () => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    // 계획표는 한 달치를 표로 펼치므로 달력(월)과 같은 기간 표기를 쓴다
    if (viewMode === 'month' || viewMode === 'plan') {
      return selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
    } else if (viewMode === 'week') {
      const weekStart = new Date(selectedDate);
      weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `${weekStart.toLocaleDateString('ko-KR', options)} - ${weekEnd.toLocaleDateString('ko-KR', options)}`;
    } else {
      return selectedDate.toLocaleDateString('ko-KR', options);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);

    if (viewMode === 'month' || viewMode === 'plan') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    }

    onDateChange(newDate);
  };

  return (
    <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
      <div className="flex flex-col gap-2 pb-3 pt-3 px-3 sm:px-4 md:px-6">
        {/* 상단 헤더 섹션 */}
        <div className="flex items-center justify-between">
          {/* 날짜 네비게이션 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateDate('prev')}
              className="h-8 w-8 p-0 hover:bg-slate-100 rounded-full text-slate-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            {/* 현재 날짜/기간 표시 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDateChange(new Date())}
              className="text-sm sm:text-lg font-bold text-slate-800 hover:bg-slate-100 px-3 sm:px-4 h-9 mx-1 sm:mx-2 rounded-xl"
            >
              {formatDateRange()}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateDate('next')}
              className="h-8 w-8 p-0 hover:bg-slate-100 rounded-full text-slate-500"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* 액션 버튼들 */}
          <div className="flex items-center gap-2">
            {/*
              부가 기능 — 일정 설문 · 회의 가능 시간 검색 · 구글 캘린더를 한 메뉴로 묶는다 (2026-09-28 사용자 요청).
              ⚠ 미응답 설문 배지는 **메뉴 버튼 위에** 둔다 — 메뉴 안에만 두면 열어 보기 전에는
              답할 설문이 있다는 사실이 사라진다.
              학생은 쓸 수 있는 것이 일정 설문 하나뿐이라 메뉴 대신 그 버튼을 그대로 둔다
              (항목 하나짜리 메뉴는 한 번 더 누르게 할 뿐이다).
            */}
            <RoleGate
              not="student"
              fallback={
                onOpenSurveys ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenSurveys}
                    className="relative bg-white/50 border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm font-medium transition-all"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">일정 설문</span>
                    <PendingBadge count={pendingSurveyCount} />
                  </Button>
                ) : null
              }
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="부가 기능"
                    className="relative bg-white/50 border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm font-medium transition-all"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">부가 기능</span>
                    <ChevronDown className="h-3.5 w-3.5 ml-0.5 opacity-50" />
                    <PendingBadge count={(onOpenSurveys ? pendingSurveyCount : 0) + (onOpenSupervision ? pendingSupervisionSwapCount : 0)} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-white/90 backdrop-blur-md border-white/20 shadow-lg" {...dropdownContentProps}>
                  {onOpenSurveys && (
                    <MenuEntry
                      icon={ClipboardList}
                      title="일정 설문"
                      hint="좋은 날짜 의견 모으기"
                      count={pendingSurveyCount}
                      onSelect={() => triggerDialog(onOpenSurveys)}
                    />
                  )}
                  {onOpenMeetingSearch && (
                    <MenuEntry
                      icon={CalendarSearch}
                      title="회의 가능 시간 검색"
                      hint="선생님들의 시간표에서 빈 시간 찾기"
                      onSelect={() => triggerDialog(onOpenMeetingSearch)}
                    />
                  )}
                  {onOpenMealDuty && (
                    <MenuEntry
                      icon={Utensils}
                      title="급식지도 명단 만들기"
                      hint="3교시가 빈 선생님으로 한 달 명단"
                      onSelect={() => triggerDialog(onOpenMealDuty)}
                    />
                  )}
                  {onOpenSupervision && (
                    <MenuEntry
                      icon={ClipboardCheck}
                      title={pendingSupervisionSwapCount > 0 ? `자습 감독 배정 · 교체 요청 ${pendingSupervisionSwapCount}` : '자습 감독 배정'}
                      hint="학년별 한 달 감독 · 선생님끼리 교체"
                      onSelect={() => triggerDialog(onOpenSupervision)}
                    />
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <Globe className="h-3 w-3" />
                    구글 캘린더로 내보내기
                  </DropdownMenuLabel>
                  <MenuEntry
                    icon={Download}
                    title=".ics 파일 다운로드"
                    hint="수동으로 가져오기"
                    disabled={loading}
                    onSelect={() => triggerDialog(onGoogleExport)}
                  />
                  <MenuEntry
                    icon={Send}
                    title="직접 전송 (API)"
                    hint="자동으로 일정 생성"
                    disabled={loading}
                    onSelect={() => triggerDialog(onGoogleDirectExport)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </RoleGate>

              <Button
                onClick={onCreateEvent}
                disabled={createDisabled}
                aria-label="일정 추가"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 h-8 px-3 sm:px-4 flex items-center gap-1.5 text-xs sm:text-sm shadow-sm transition-all rounded-lg"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">일정 추가</span>
              </Button>


            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading || refreshing}
              aria-label="새로고침"
              aria-busy={refreshing}
              className="bg-white/50 border-slate-200 hover:bg-white hover:border-slate-300 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">새로고침</span>
            </Button>
          </div>
        </div>

        {/* 뷰 전환 + 범례 섹션 - TimetableHeader의 하단 스타일 적용 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-1">
          {/* 달력 / 일별 계획표 전환 */}
          <div className="flex items-center gap-0.5 rounded-full border border-slate-200/60 bg-slate-50/80 p-0.5">
            {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => {
              // 월/주/일 격자는 모두 '달력'으로 묶어 표시한다
              const active = value === 'plan' ? viewMode === 'plan' : viewMode !== 'plan';
              return (
                <Button
                  key={value}
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewModeChange(value)}
                  className={cn(
                    'h-7 rounded-full px-2.5 sm:px-3 text-xs font-medium transition-all',
                    active
                      ? 'bg-white text-blue-600 shadow-sm hover:bg-white hover:text-blue-600'
                      : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 bg-slate-50/80 p-1 pl-3 pr-1 rounded-full border border-slate-200/60">
            <span className="text-xs font-semibold text-slate-500 mr-2 hidden sm:inline">범례</span>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mr-2">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-green-100"></div>
                <span>학사</span>
              </div>
              <RoleGate not="student">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                  <div className="w-2.5 h-2.5 bg-purple-500 rounded-full ring-2 ring-purple-100"></div>
                  <span>출장</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                  <div className="w-2.5 h-2.5 bg-orange-500 rounded-full ring-2 ring-orange-100"></div>
                  <span>업무</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                  <div className="w-2.5 h-2.5 bg-pink-500 rounded-full ring-2 ring-pink-100"></div>
                  <span>연수</span>
                </div>
              </RoleGate>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full ring-2 ring-indigo-100"></div>
                <span>개인일정</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                <div className="w-2.5 h-2.5 bg-teal-500 rounded-full ring-2 ring-teal-100"></div>
                <span>{isStudent ? '학생일정' : '학급일정'}</span>
              </div>
              {isStudent && <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:text-sm">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-100" />
                <span>과제일정</span>
              </div>}
            </div>
          </div>
        </div>
      </div>
    </ImprovedCard>
  );
};

/** 버튼 모서리의 미응답 설문 수 — 0 이면 그리지 않는다 */
function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`응답하지 않은 설문 ${count}건`}
      className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white"
    >
      {count}
    </span>
  );
}

/** 부가 기능 메뉴의 한 줄 — 아이콘 · 이름 · 한 줄 설명 (· 숫자) */
function MenuEntry({
  icon: Icon,
  title,
  hint,
  count = 0,
  disabled,
  onSelect,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  count?: number;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled} className="cursor-pointer gap-2 py-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {count > 0 && (
        <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-600 ring-1 ring-rose-100">
          미응답 {count}
        </span>
      )}
    </DropdownMenuItem>
  );
}
