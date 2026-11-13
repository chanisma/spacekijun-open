import type { ReactNode } from 'react';
import type { InboxFilter } from './taskInboxUtils';
import { WORK_LIST_SCOPES, type WorkListScope } from '@/lib/taskTabs';
import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  Plus,
  FolderOpen,
  User,
  CircleCheckBig,
  Filter,
  Building2,
  PlayCircle,
  Sparkles,
  CalendarDays,
  HelpCircle, History } from 'lucide-react';

/** 업무 목록 범위 아이콘 — 값·라벨은 `@/lib/taskTabs` 의 `WORK_LIST_SCOPES` 가 정본이고 여기는 그림만 붙인다 */
const SCOPE_ICONS: Record<WorkListScope, typeof User> = {
  mine: User,
  all: FolderOpen,
};

interface Manager {
  id: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface WorkFilters {
  status: string;
  keyword: string;
  manager_id: string;
  department: string;
}

interface TaskHeaderProps {
  /**
   * `tabs`(기본) = 업무 관리 페이지(`/tasks/*`). `myTasks` = 내 할 일(`/my-tasks`).
   * 2026-10-05 부터 업무 관리도 **탭 줄이 없다** — 페이지 이동은 사이드바의 「업무 관리」 서랍이 한다.
   * 머리글에는 그 페이지의 필터·액션만 둔다. 기능명·아이콘은 쓰지 않는다
   * (2026-09-22 사용자 규약 — 사이드바와 주소가 이미 어디인지 말한다. CLAUDE.md "UI 큰 틀 규약" §1).
   */
  mode?: 'tabs' | 'myTasks';
  /** 지금 보기(페이지 + 범위) — `@/lib/taskTabs` 의 `taskViewOf` */
  activeTab?: string;
  /** 업무 목록의 범위(내가 매니저인 업무 / 전체 업무) — 업무 목록 페이지에서만 */
  workListScope?: WorkListScope;
  onWorkListScopeChange?: (scope: WorkListScope) => void;

  inboxFilter?: InboxFilter;
  onInboxFilterChange?: (value: InboxFilter) => void;

  // 업무 목록(내가 매니저인 업무)의 상태 필터. 「대기」는 2026-10-05 에 은퇴했다 — 숨김은 할 일의 «보이는 날»
  myWorksFilter?: 'all' | 'active' | 'completed' | 'pending';
  onMyWorksFilterChange?: (value: 'all' | 'active' | 'completed' | 'pending') => void;

  // Work filters (only shown when activeTab is 'works')
  workFilters?: WorkFilters;
  onWorkFiltersChange?: (filters: WorkFilters) => void;
  managers?: Manager[];
  departmentOptions?: DepartmentOption[];
  selectedDepartmentId?: string;
  onDepartmentChange?: (departmentId: string) => void;

  workSummaryRef?: (node: HTMLDivElement | null) => void;
  workToolbarRef?: (node: HTMLDivElement | null) => void;
  onCreateWork?: () => void;
  /** 참고해서 시작(작년 같은 일 이어가기 · 비슷한 일 참고, 2026-11-12 — 옛 «지난 업무 가져오기») */
  onRolloverWork?: () => void;

  // Actions
  onAnalyzeDocument?: () => void;
  onSearch?: () => void;
  onRefresh?: () => void;
  /** 사용 방법 안내 모달 열기 */
  onGuide?: () => void;
  plannerOpen?: boolean;
  onPlannerOpenChange?: (open: boolean) => void;
  onClearWorkFilters?: () => void;
  /** 액션 묶음 끝에 더할 버튼(업무노트 = 새로고침·타임라인·새 업무, 2026-11-12) */
  extraActions?: ReactNode;

  // Stats
  totalWorks?: number;
  totalTasks?: number;
  completedTasks?: number;

  // Loading state
  loading?: boolean;

}

export const TaskHeader = ({
  mode = 'tabs',
  activeTab: activeTabProp = '',
  workListScope = 'mine',
  onWorkListScopeChange,
  inboxFilter = 'todo',
  onInboxFilterChange,
  myWorksFilter = 'all',
  onMyWorksFilterChange,
  workFilters,
  onWorkFiltersChange,
  managers = [],
  departmentOptions = [],
  selectedDepartmentId = 'all',
  onDepartmentChange,
  workToolbarRef,
  workSummaryRef,
  onCreateWork,
  onRolloverWork,
  onAnalyzeDocument,
  onSearch,
  onGuide,
  plannerOpen = true,
  onPlannerOpenChange,
  onClearWorkFilters,
  extraActions,
}: TaskHeaderProps) => {
  // 업무 필터 핸들러들
  const handleKeywordChange = (value: string) => {
    if (onWorkFiltersChange && workFilters) {
      onWorkFiltersChange({ ...workFilters, keyword: value });
    }
  };

  const handleStatusChange = (value: string) => {
    if (onWorkFiltersChange && workFilters) {
      onWorkFiltersChange({ ...workFilters, status: value });
    }
  };

  const handleManagerChange = (value: string) => {
    if (onWorkFiltersChange && workFilters) {
      onWorkFiltersChange({ ...workFilters, manager_id: value });
    }
  };

  // 활성 필터 개수 계산
  // 부서도 업무 검색의 거르기 조건이다 (2026-10-05) — 빼고 세면 부서만 골라 0건일 때
  // 목록은 「조건에 맞는 업무가 없습니다」라고 하는데 [초기화]는 꺼져 있어 빠져나올 수 없었다.
  const departmentFiltered = !!onDepartmentChange && selectedDepartmentId !== 'all';
  const hasActiveWorkFilters = workFilters && (
    workFilters.status !== 'all' ||
    workFilters.keyword !== '' ||
    workFilters.manager_id !== 'all' ||
    departmentFiltered
  );

  const activeWorkFiltersCount = workFilters ? [
    workFilters.status !== 'all' ? 1 : 0,
    workFilters.keyword !== '' ? 1 : 0,
    workFilters.manager_id !== 'all' ? 1 : 0,
    departmentFiltered ? 1 : 0
  ].reduce((sum, val) => sum + val, 0) : 0;

  // 내 할 일 화면은 아래 분기들이 쓰는 'myTasks' 자리를 그대로 탄다(탭 값이 아니라 화면 구분이다)
  const activeTab = mode === 'myTasks' ? 'myTasks' : activeTabProp;
  const showDepartmentScope = ['timeline', 'workflow'].includes(activeTab);
  const isMyTasks = mode === 'myTasks';

  // 업무 목록의 범위 — 종전 「내 업무 관리」·「업무 검색」 두 탭을 합친 자리(2026-10-05).
  // 첫 줄 왼쪽에 선다(내 할 일의 상태 필터와 같은 자리·같은 모양).
  const isWorkList = !isMyTasks && (activeTab === 'myWorks' || activeTab === 'works');
  const scopeSegment = isWorkList && onWorkListScopeChange ? (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="업무 목록 범위">
      {WORK_LIST_SCOPES.map(({ value, label }) => {
        const Icon = SCOPE_ICONS[value];
        const active = workListScope === value;
        return (
          <Button key={value} type="button" variant="ghost" size="sm" aria-pressed={active} onClick={() => onWorkListScopeChange(value)} className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs transition-all sm:px-3 sm:text-sm ${active ? 'bg-white font-medium text-blue-700 shadow-sm hover:bg-white hover:text-blue-700' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'}`}>
            <Icon className="h-3 w-3" />{label}
          </Button>
        );
      })}
    </div>
  ) : null;

  // 내 할 일 상태 필터 — 탭 줄이 없는 화면이라 그 자리(첫 줄 왼쪽)에 선다
  // 2026-11-12 드롭다운(사용자 요청) — 업무노트 머리글이 버튼으로 붐벼 상태 셋을 한 칸에 접었다
  const inboxFilterSegment = isMyTasks && onInboxFilterChange ? (
    <Select value={inboxFilter} onValueChange={(v) => onInboxFilterChange(v as InboxFilter)}>
      <SelectTrigger aria-label="내 할 일 상태 필터" className="h-11 w-28 sm:h-8 border-slate-200 bg-white text-xs sm:text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todo"><span className="flex items-center gap-1.5"><PlayCircle className="h-3.5 w-3.5 text-blue-600" />할 일</span></SelectItem>
        <SelectItem value="completed"><span className="flex items-center gap-1.5"><CircleCheckBig className="h-3.5 w-3.5 text-emerald-600" />완료</span></SelectItem>
        <SelectItem value="all"><span className="flex items-center gap-1.5 pl-5">전체</span></SelectItem>
      </SelectContent>
    </Select>
  ) : null;

  return (
    <div className="mb-4">
      {/* 머리글을 띄우지 않는다 (2026-10-05 — 내 할 일, 같은 날 업무 관리 페이지에도) — ImprovedCard 의
          진한 그림자(+마우스를 올리면 들리는 효과)가 필터 몇 개뿐인 머리글을 화면에서 가장 높은 층으로 만들어,
          시선이 내용보다 장식으로 먼저 갔다. 내용 카드와 같은 층(옅은 테두리 + 1px 그림자)에 둔다.
          `.improved-card` 는 일반 CSS 라 같은 특이도의 유틸리티로는 순서에 따라 지므로 `!` 로 못 박는다. */}
      <ImprovedCard className="border border-slate-200/70 bg-white !shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] hover:!translate-y-0 hover:!transform-none hover:!bg-white hover:!shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
        {/* 컴팩트 헤더 */}
        <CardHeader className={isMyTasks ? 'px-2 py-2 sm:px-3' : 'px-2 py-2 sm:px-3 md:px-4'}>
          <div className="flex flex-col gap-2">
            {/* 첫 번째 줄: 왼쪽 = 그 화면의 첫 필터(내 할 일 = 상태, 업무 목록 = 범위), 오른쪽 = 액션.
                탭 줄은 없다(2026-10-05 — 페이지 이동은 사이드바 서랍). 왼쪽이 비는 페이지(흐름·타임라인·
                학교 전체)는 액션만 오른쪽에 선다 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isMyTasks ? inboxFilterSegment : scopeSegment}

              {/* 액션 버튼들 */}
              <div className="ml-auto flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
                {/* 사용 방법 — 액션 묶음의 **맨 왼쪽**이 늘 이 자리다(그 왼쪽에는 아무 버튼도
                    두지 않는다 — 앱 전역 규약). 부서 선택보다 앞이다. */}
                {onGuide && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onGuide}
                    title="사용 방법"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">사용 방법</span>
                  </Button>
                )}
                {activeTab === 'myTasks' && onPlannerOpenChange && (
                  <Button variant="outline" size="sm" aria-expanded={plannerOpen} aria-controls="my-task-planner" onClick={() => onPlannerOpenChange(!plannerOpen)} className="h-8 shrink-0 gap-1.5 px-2 text-xs sm:px-3 sm:text-sm">
                    <CalendarDays className="h-3.5 w-3.5" />계획표 {plannerOpen ? '접기' : '열기'}
                  </Button>
                )}
                {showDepartmentScope && onDepartmentChange && (
                  <Select value={selectedDepartmentId} onValueChange={onDepartmentChange}>
                    <SelectTrigger className="h-8 w-36 border-slate-200 bg-white/80 text-xs sm:w-44 sm:text-sm">
                      <div className="flex min-w-0 items-center">
                        <Building2 className="mr-1.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <SelectValue placeholder="부서 선택" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 부서</SelectItem>
                      {departmentOptions.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {activeTab !== 'myTasks' && onAnalyzeDocument && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAnalyzeDocument}
                    className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800 h-8 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm rounded-lg"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">문서분석</span>
                  </Button>
                )}
                {(activeTab === 'myWorks' || activeTab === 'works') && (
                  <>
                    {onRolloverWork && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRolloverWork}
                        title="작년 같은 일이나 비슷한 일을 참고해 새 업무를 만듭니다"
                        className="h-8 shrink-0 gap-1.5 rounded-lg px-2 text-xs sm:px-3 sm:text-sm"
                      >
                        <History className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">참고해서 시작</span>
                        <span className="sm:hidden">참고</span>
                      </Button>
                    )}
                    {onCreateWork && <Button type="button" size="sm" onClick={onCreateWork} className="h-8 shrink-0 gap-1.5 rounded-lg bg-blue-600 px-2 text-xs text-white hover:bg-blue-700 sm:px-3 sm:text-sm">
                      <Plus className="h-3.5 w-3.5" />새 업무
                    </Button>}
                  </>
                )}
                {extraActions}
              </div>
            </div>


            {/* 내 업무 — 업무 상태 필터 */}
            {activeTab === 'myWorks' && onMyWorksFilterChange && (
              <div className="flex flex-wrap items-center justify-between gap-2 w-full pt-2 border-t border-slate-100">
                <div ref={workSummaryRef} aria-label="내 업무 건수" className="mr-auto" />
                <div ref={workToolbarRef} className="flex shrink-0 items-center gap-2" aria-label="내 업무 펼침 도구" />
                <div className="flex bg-slate-100/50 rounded-lg p-1 gap-1 overflow-x-auto border border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMyWorksFilterChange('all')}
                    className={`h-7 px-2 sm:px-3 text-xs sm:text-sm rounded-md transition-all ${myWorksFilter === 'all' ? 'bg-white text-slate-900 shadow-sm font-medium hover:bg-white hover:text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                  >
                    <span className="hidden sm:inline">전체</span>
                    <span className="sm:hidden">전체</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMyWorksFilterChange('active')}
                    className={`h-7 px-2 sm:px-3 flex items-center gap-1 text-xs sm:text-sm rounded-md transition-all ${myWorksFilter === 'active' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100 font-medium hover:bg-blue-50 hover:text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                  >
                    <PlayCircle className={`h-3 w-3 ${myWorksFilter === 'active' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="hidden sm:inline">진행 중</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMyWorksFilterChange('completed')}
                    className={`h-7 px-2 sm:px-3 flex items-center gap-1 text-xs sm:text-sm rounded-md transition-all ${myWorksFilter === 'completed' ? 'bg-green-50 text-green-700 shadow-sm border border-green-100 font-medium hover:bg-green-50 hover:text-green-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                  >
                    <CircleCheckBig className={`h-3 w-3 ${myWorksFilter === 'completed' ? 'text-green-600' : 'text-slate-400'}`} />
                    <span className="hidden sm:inline">완료된 업무</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 업무 필터 (업무 탭일 때만 표시) */}
            {activeTab === 'works' && workFilters && onWorkFiltersChange && (
              <div className="mt-1 border-t border-slate-100 pt-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="업무명, 할 일, 담당자, 키워드 검색"
                      value={workFilters.keyword}
                      onChange={(event) => handleKeywordChange(event.target.value)}
                      className="h-9 border-slate-200 bg-white pl-9 text-xs transition-all focus:border-blue-300 focus:ring-blue-100 sm:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
                    <Select value={workFilters.status} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-9 border-slate-200 bg-white text-xs transition-all focus:border-blue-300 focus:ring-blue-100 sm:text-sm lg:w-32">
                        <SelectValue placeholder="상태 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">모든 상태</SelectItem>
                        <SelectItem value="active">진행 중</SelectItem>
                        <SelectItem value="completed">완료</SelectItem>
                        <SelectItem value="cancelled">취소</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={workFilters.manager_id} onValueChange={handleManagerChange}>
                      <SelectTrigger className="h-9 border-slate-200 bg-white text-xs transition-all focus:border-blue-300 focus:ring-blue-100 sm:text-sm lg:w-40">
                        <div className="flex min-w-0 items-center">
                          <User className="mr-1.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <SelectValue placeholder="책임자" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">모든 책임자</SelectItem>
                        {managers.map(manager => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-2">
                  {onDepartmentChange && (
                  <Select value={selectedDepartmentId} onValueChange={onDepartmentChange}>
                    <SelectTrigger aria-label="업무 부서 필터" className="h-9 w-36 shrink-0 border-slate-200 bg-white text-xs sm:w-44 sm:text-sm">
                      <div className="flex min-w-0 items-center">
                        <Building2 className="mr-1.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <SelectValue placeholder="부서 선택" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 부서</SelectItem>
                      {departmentOptions.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClearWorkFilters}
                    disabled={!hasActiveWorkFilters}
                    className="h-9 shrink-0 justify-center gap-1.5 px-3 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    초기화
                    {hasActiveWorkFilters && (
                      <Badge
                        variant="secondary"
                        className="h-5 min-w-5 justify-center rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700"
                      >
                        {activeWorkFiltersCount}
                      </Badge>
                    )}
                  </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
      </ImprovedCard>
    </div>
  );
};
