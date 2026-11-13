import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addDays, addWeeks, format, isSameDay, isWeekend, startOfWeek } from 'date-fns';
import { AlertCircle, CalendarDays, Check, CheckCircle, CircleCheckBig, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Inbox, ListTodo, Loader2, RefreshCw, Undo2, UserRoundX, X } from 'lucide-react';
import { ko } from 'date-fns/locale';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUserResourceId } from '@/hooks/usePermissions';
import { useMyTasksJsonb, useToggleAssigneeStatusJsonb, useToggleDeadlineStatusJsonb, useToggleUnitStatusJsonb } from '@/hooks/useTasksJsonb';
import { formatRoundLabel, getDeadlineProgress, getTaskDeadlines, isRoundCompleted } from '@/lib/taskDeadlines';
import { getTaskUnits, getUnitProgress } from '@/lib/taskUnits';
import { hasReportedNotMine } from '@/lib/taskAssignmentIssue';
import { cn } from '@/lib/utils';
import { collectDueDay, placeInboxRequests, REQUEST_KIND_LABEL, requestKindOf, requestProgressLabel, requestVerb, type MyCollectRequest } from '@/lib/collectInput';
import { CollectRequestInbox } from '@/features/task-workflow/components/collect/CollectRequestInbox';
import type { Work, Task } from '@/types/tasks';
import { TaskAssigneeSummary } from './TaskAssigneeSummary';
import { ClampedText } from './ClampedText';
import { buildMyTaskInbox, buildTaskPlanner, completedAtOf, groupCompletedByWork, inboxGroups, shortDate, weekProgress, type InboxFilter, type InboxGroup, type InboxTask, type WeekProgress } from './taskInboxUtils';
import { INBOX_CHIP, INBOX_CHIP_TONE } from './inboxChip';

/** 업무별 묶기(업무노트, 2026-11-12)에서 «내가 책임자인 업무» 한 줄 — 머리에 그릴 것은 화면이 준다 */
export interface InboxManagedWork {
  id: string;
  name: string;
  /** 정렬용(목표일) — 없으면 뒤 */
  sortDate: string | null;
  /** 머리 오른쪽(진척·D-day 등) */
  meta?: ReactNode;
}

interface MyTaskInboxProps {
  works: Work[];
  filter?: InboxFilter;
  onTaskDetail: (task: Task) => void;
  /** 계획표를 목록 옆에 붙일 때만(옛 «내 할 일» 화면). 업무노트는 계획표를 오른쪽 패널에 따로 둔다(MyTaskPlanner) */
  plannerOpen?: boolean;
  onPlannerOpenChange?: (open: boolean) => void;
  /**
   * 'byWork' = 업무별로 묶는다(업무노트, 2026-11-12 사용자 결정): 내가 책임자인 업무는 큰 머리 아래 내 할 일을 들여 쓰고,
   * 담당만 맡은 업무는 작은 머리로. 'flat' = 종전 한 줄 목록.
   */
  layout?: 'flat' | 'byWork';
  managedWorks?: InboxManagedWork[];
  workHref?: (workId: string) => string;
  /**
   * 업무별 묶기에서 할 일 줄을 «가는 줄»로 — 누르면 그 업무의 작업실(할 일을 짚어서), 줄에 버튼이 없다
   * (2026-11-12 사용자 결정: 업무노트 첫 화면은 고르는 곳, 완료·제출은 작업실에서 할 일을 눌러 뜨는 창에서).
   */
  taskHref?: (task: Task) => string;
  /**
   * 나에게 온 입력 요청(`my_collect_requests`) — 계획표에 마감일로 함께 놓는다(2026-09-27).
   * 응답자는 할 일 담당자가 아니라서 `assigned_tasks` 에서 출발하는 계획표에는 원래 없다.
   */
  collectRequests?: MyCollectRequest[];
  onOpenCollect?: (actionId: string) => void;
}

/** 계획표의 요청 한 줄 — 할 일과 구분되게 인디고 칩(«입력 요청»·«제출 요청»)을 단다 */
function PlannerCollectItem({ request, onOpen }: { request: MyCollectRequest; onOpen?: (actionId: string) => void }) {
  return (
    <>
      <button
        type="button"
        disabled={!onOpen}
        className="flex max-w-full flex-col items-start gap-1 rounded text-left text-[13px] font-medium leading-snug text-slate-800 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen?.(request.action_id)}
      >
        <span className={cn(INBOX_CHIP, INBOX_CHIP_TONE.request)}>
          <ClipboardList className="h-3 w-3" aria-hidden />{requestKindOf(request) === 'input' ? '입력 요청' : '제출 요청'}
        </span>
        <span className="min-w-0">{request.action_title}</span>
      </button>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">
        {requestProgressLabel(request)} · {[request.work_title, request.task_title].filter(Boolean).join(' › ')}
      </p>
    </>
  );
}

const COMPLETED_ACCENT = 'bg-emerald-500';

/**
 * 목록 카드 상단 액센트 바 = **이번 주 진행률** (2026-10-05 시각 정리).
 * 종전엔 진행 그라데이션(블루→시안→에메랄드)이었는데, 지난 일·오늘·예정이 섞인 목록 위에서는 아무것도
 * 말하지 않는 장식이었다. "카드 위 바 = 상태" 어휘는 그대로 두고 그 4px 에 이번 주 완료 비율을 싣는다.
 * 이번 주 마감이 없으면 채움 없이 바탕 띠만 남는다(0%와 "셀 것이 없음"을 같은 그림으로 만들지 않으려고
 * 바 아래 글자가 둘을 가른다 — `WeekProgressLabel`).
 */
function WeekProgressBar({ progress }: { progress: WeekProgress }) {
  const ratio = progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <div className="absolute inset-x-0 top-0 h-1 bg-slate-100" aria-hidden>
      <div className="h-full bg-emerald-500 transition-[width] duration-500 ease-out" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

function weekProgressText(progress: WeekProgress): string {
  return progress.total > 0 ? `이번 주 ${progress.done}/${progress.total} 완료` : '이번 주 마감 없음';
}

/**
 * 행 왼쪽 점 — 기한 지남·오늘은 앰버, 예정은 블루, 나머지는 슬레이트.
 * 지남·오늘은 **후광**(ring)으로 한 단계 무겁게 — 점 크기·색만으로는 둘이 거의 같아 보였다.
 * 빈 원(테두리만)으로 그리지 않는다: 할 일 앱의 체크 원으로 읽혀 눌러 보게 되는데 이 점은 누를 수 없다.
 */
const GROUP_DOT: Record<InboxGroup, string> = {
  overdue: 'h-2.5 w-2.5 bg-amber-500 ring-4 ring-amber-100',
  today: 'h-2 w-2 bg-amber-400 ring-[3px] ring-amber-50',
  upcoming: 'h-2 w-2 bg-blue-500',
  undated: 'h-2 w-2 bg-slate-300',
  waiting: 'h-2 w-2 bg-slate-300',
  completed: 'h-2 w-2 bg-emerald-500',
  cancelled: 'h-2 w-2 bg-slate-300',
};

/** 행에 마우스를 올리면 왼쪽에 서는 2px 띠 — 점과 같은 색 계열 */
const GROUP_EDGE: Record<InboxGroup, string> = {
  overdue: 'bg-amber-500',
  today: 'bg-amber-400',
  upcoming: 'bg-blue-500',
  undated: 'bg-slate-300',
  waiting: 'bg-slate-300',
  completed: 'bg-emerald-500',
  cancelled: 'bg-slate-300',
};

/**
 * 목록 열 (2026-09-26 사용자 요청 — 내 업무 관리의 할 일 목록과 같은 모양).
 * 할 일 칸 = **할 일 이름, 그 아래 줄에 업무 이름**(사용자 결정 — 업무를 따로 된 열로 두지 않는다).
 * **머리글과 행이 이 한 상수를 함께 써야 칸이 맞는다** — 어긋나도 오류가 없다.
 * 휴대폰(<640px)에서는 열이 아니라 제목 + 메타 한 줄로 쌓인다(열 넷은 390px 에서 못 읽는다).
 * `grid-cols-[…]` 는 빌드 때 스캔되므로 반드시 **완성된 문자열**로 둔다(조립 금지).
 *
 * ⚠️ **좁아질 때 줄어드는 것은 할 일이 아니라 상태다** (2026-09-26 사용자 지적). 할 일을 `minmax(0,1fr)`
 *    로 두면 그리드가 상태 열(`minmax(0,11rem)`)을 **먼저** 최대까지 채우고 남는 것만 할 일에 줘서,
 *    창을 줄이면 제목만 `…` 로 사라진다. 할 일에 하한(14rem)을 주면 상태 쪽이 줄고 칩이 줄바꿈된다.
 */
const ROW_GRID = 'sm:grid sm:grid-cols-[1rem_minmax(14rem,1fr)_7rem_minmax(0,12rem)_8.5rem] sm:items-start sm:gap-x-4';

function InboxListHeader({ inWorkGroup = false, progress }: { inWorkGroup?: boolean; progress?: WeekProgress }) {
  return (
    <div
      aria-hidden
      className={cn(
        'hidden border-b border-slate-100 px-3.5 pb-2 pt-3.5 text-[11px] font-medium text-slate-500 sm:px-5',
        ROW_GRID,
      )}
    >
      <span />
      <span>할 일</span>
      <span>{inWorkGroup ? '완료일' : '마감일'}</span>
      <span>상태</span>
      <span className="text-right tabular-nums">{progress ? weekProgressText(progress) : ''}</span>
    </div>
  );
}

function InboxRow({ item, resourceId, onDetail, inWorkGroup = false, pendingSubmits, onOpenCollect, hideWork = false, dense = false }: {
  item: InboxTask;
  /** 업무 머리 아래에 놓일 때 — 업무 이름은 머리가 말한다 */
  hideWork?: boolean;
  /** 담당만 맡은 일 — 작게 */
  dense?: boolean;
  resourceId: string;
  onDetail: (task: Task) => void;
  /** 완료 목록의 업무 묶음 안 — 업무 이름은 묶음 머리가 말하고, 마감일 대신 완료일을 보인다 */
  inWorkGroup?: boolean;
  /**
   * 이 할 일에서 내가 아직 내지 않은 제출 요청(2026-10-01 제출 받기 작업) — 있으면 [완료하기] 대신 [제출하기].
   * 서버가 내기 전 완료를 거부하므로 완료 버튼을 두면 누를 때마다 오류가 난다.
   */
  pendingSubmits?: MyCollectRequest[];
  onOpenCollect?: (actionId: string) => void;
}) {
  const { task, status, group, due } = item;
  const [expanded, setExpanded] = useState(false);
  const toggle = useToggleAssigneeStatusJsonb();
  const toggleRound = useToggleDeadlineStatusJsonb();
  const toggleUnit = useToggleUnitStatusJsonb();
  const units = getTaskUnits(task);
  const deadlines = getTaskDeadlines(task);
  const progress = getDeadlineProgress(task);
  const completed = status === 'completed';
  const inactive = group === 'cancelled' || group === 'waiting';
  const busy = toggle.isPending || toggleRound.isPending || toggleUnit.isPending;
  const complex = units.length > 0 || deadlines.length > 1;
  const myAssignee = task.meta.assignees?.find(a => a.id === resourceId);
  // 관리자가 전체를 종료했지만 내 상태가 미완료면 개인 토글로 다시 열지 않는다.
  const closedByManager = completed && myAssignee?.status !== 'completed';

  const change = async (action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success('내 할 일 상태를 저장했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '상태를 저장하지 못했습니다. 다시 시도해주세요.');
    }
  };

  /**
   * [완료하기] — 확인창 없이 바로 바꾸되 **되돌리기**를 토스트에 둔다 (2026-10-05).
   * 완료한 행은 진행 중 목록에서 사라지므로, 잘못 눌렀을 때 «완료» 보기를 찾아가 [완료 취소]를 눌러야 했다.
   * 가장 흔한 동작이라 확인창으로 막지 않는다(감사 문서 §4-8). 행이 사라진 뒤에도 되돌리기가 동작하도록
   * 값만 붙잡아 둔다(mutation 은 훅 옵션의 무효화로 목록을 다시 받는다).
   */
  const completeWithUndo = async () => {
    const taskId = task.id;
    const assigneeId = resourceId;
    try {
      await toggle.mutateAsync({ taskId, assigneeId, status: 'completed' });
      toast.success(`"${task.title}" 완료`, {
        action: {
          label: '되돌리기',
          onClick: () => {
            toggle.mutateAsync({ taskId, assigneeId, status: 'pending' }).catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : '되돌리지 못했습니다. 완료 보기에서 [완료 취소]를 눌러 주세요.');
            });
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '상태를 저장하지 못했습니다. 다시 시도해주세요.');
    }
  };

  // '담당자 아님'을 표시한 할 일 — 홈 대시보드에서는 빠지지만 여기에는 **표시와 함께** 남는다.
  // 숨기면 매니저가 담당자를 고쳤는지 확인할 길이 없고, 잘못 눌렀을 때 취소할 자리도 사라진다.
  const reportedNotMine = hasReportedNotMine(task, resourceId);
  // 버튼 = 둥글기 8px · 높이 32px(툴바 `h-8` 과 같은 단). 칩은 inboxChip.ts 한 벌
  const actionButton = 'h-8 gap-1 rounded-lg px-2.5 text-xs';
  // 흔한 동작(완료·상세·펼침)은 조용하게 — 무게는 예외 동작(제출하기 = 파랑)에 싣는다.
  // 같은 테두리 버튼이 세로로 일곱 개 늘어서면 눈이 제목이 아니라 버튼 벽으로 간다.
  const quietButton = 'border-slate-200 bg-white font-medium text-slate-600 shadow-none hover:bg-slate-50 hover:text-slate-900';

  const workLabel = `${task.event_name || '할 일'}${task.type === 'procedural' ? ` · 순서 ${task.order_index}` : ''}`;
  const completedAt = shortDate(completedAtOf(task, resourceId));
  // 마감일 — 칩은 알려야 할 때(지남·오늘)만. 평범한 날짜는 글자로 둔다(모든 행이 칩이면 예외가 묻힌다)
  const urgent = group === 'overdue' || group === 'today';
  const dateChip = inWorkGroup ? (
    completedAt ? <span className="text-xs tabular-nums text-slate-500">{completedAt} 완료</span> : null
  ) : urgent ? (
    <span className={cn(INBOX_CHIP, 'tabular-nums', INBOX_CHIP_TONE[group === 'overdue' ? 'overdue' : 'today'])}>
      {due ? `${due.replace(/-/g, '.')} 마감` : '마감일 없음'}
    </span>
  ) : (
    <span className={cn('text-xs tabular-nums', due ? 'text-slate-600' : 'text-slate-500')}>
      {due ? `${due.replace(/-/g, '.')} 마감` : '마감일 없음'}
    </span>
  );
  // 같은 요소를 휴대폰 메타 줄과 데스크톱 상태 열에 두 번 그린다(계산은 한 번)
  const statusChips = (
    <>
      {pendingSubmits && pendingSubmits.length > 0 && (
        <span className={cn(INBOX_CHIP, INBOX_CHIP_TONE.request)}>
          {pendingSubmits.length > 1 ? `제출 ${pendingSubmits.length}건 남음` : `${REQUEST_KIND_LABEL[requestKindOf(pendingSubmits[0])]} 남음`}
        </span>
      )}
      {deadlines.length > 1 && <span className={cn(INBOX_CHIP, 'tabular-nums', INBOX_CHIP_TONE.neutral)}>내 회차 {deadlines.filter(d => isRoundCompleted(progress, d, resourceId)).length}/{deadlines.length} 완료</span>}
      {completed && (!inWorkGroup || closedByManager) && <span className={cn(INBOX_CHIP, INBOX_CHIP_TONE.done)}>{closedByManager ? '할 일 종료' : '완료'}</span>}
      {/* 취소된 할 일 — 버튼이 [상세 보기]뿐이라 «왜 완료할 수 없는가»를 칩이 말한다 (2026-10-06, 감사 §4-9) */}
      {group === 'cancelled' && (
        <span className={cn(INBOX_CHIP, INBOX_CHIP_TONE.cancelled)} title="책임자가 할 일이나 업무를 취소했습니다. 할 일은 더 하지 않아도 됩니다.">
          {task.event_status === 'cancelled' ? '업무 취소됨' : '취소됨'}
        </span>
      )}
      {reportedNotMine && (
        <span className={cn(INBOX_CHIP, INBOX_CHIP_TONE.notice)} title="책임자가 담당자를 조정할 때까지 목록에 남습니다. 상세에서 표시를 취소할 수 있습니다.">
          <UserRoundX className="h-3 w-3" />담당자 아님 표시함
        </span>
      )}
    </>
  );

  return (
    // 목록 행 (2026-09-26) — 데스크톱은 열(할 일·그 아래 업무 | 마감일 | 상태 | 행동), 휴대폰은 제목 + 메타 한 줄.
    // 설명은 행에 쓰지 않는다(2026-09-21 결정 — 한 건이 세 줄을 넘으면 한 화면에 몇 개 안 들어온다).
    // 대신 제목 위에 0.5초 머물면 제목 + 설명이 뜬다.
    // 세로 밀도는 py-2 그대로(2026-09-21 결정 — 한 화면에 더 많이). 열은 첫 줄(제목)에 맞춰 위로 붙인다(items-start) — 두 줄 행에서 가운데 정렬이면
    // 점·날짜가 제목과 업무 이름 사이 허공에 뜬다. 각 열의 첫 요소 높이를 제목 줄(20px)에 맞춘다.
    <li className={cn(dense ? 'px-3.5 py-1.5 sm:px-5' : 'px-3.5 py-2 sm:px-5', 'group/row relative transition-colors hover:bg-slate-50/80', reportedNotMine && 'bg-slate-50/60')}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5 opacity-0 transition-opacity group-hover/row:opacity-100', GROUP_EDGE[group])} />
      <div className={cn('flex items-center gap-3', ROW_GRID)}>
        <span className="hidden h-5 items-center justify-center sm:flex">
          {completed
            ? <CheckCircle className="h-4 w-4 text-emerald-600" aria-label="완료" />
            : <span className={cn('rounded-full', GROUP_DOT[group])} />}
        </span>
        <div className="min-w-0 flex-1">
          <ClampedText
            text={task.title}
            onClick={() => onDetail(task)}
            ariaLabel={`${task.title} 상세 보기`}
            overlay={task.description?.trim() ? `${task.title}\n\n${task.description.trim()}` : undefined}
            className={cn(
              dense ? 'text-[13px] font-medium leading-5' : 'text-sm font-semibold leading-5 tracking-tight',
              reportedNotMine ? 'text-slate-500' : 'text-slate-900'
            )}
          />
          {/* 데스크톱: 할 일 이름 아래 업무 이름. 업무 묶음 안(완료)은 묶음 머리가 이미 말한다 */}
          {!inWorkGroup && !hideWork && <ClampedText text={workLabel} className="mt-0.5 hidden text-xs text-slate-500 sm:block" />}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:hidden">
            {!inWorkGroup && !hideWork && <span className="max-w-[14rem] truncate text-slate-500">{workLabel}</span>}
            {dateChip}
            {statusChips}
          </div>
        </div>
        <div className="hidden h-5 items-center sm:flex">{dateChip}</div>
        <div className="hidden min-h-5 flex-wrap items-center gap-1 sm:flex">{statusChips}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:-my-1.5">
          {inactive || reportedNotMine || closedByManager ? (
            <Button variant="outline" size="sm" className={cn(actionButton, quietButton)} onClick={() => onDetail(task)}>상세 보기</Button>
          ) : pendingSubmits && pendingSubmits.length > 0 && onOpenCollect ? (
            // 제출 받기 작업 — 내면 서버가 그 담당자를 완료로 바꾼다(완료 버튼은 서버가 거부한다).
            // 실물 제출은 화면에서 낼 것이 없다(책임자가 [받음]을 체크한다) → 동사는 「제출 안내 보기」, 무게는 조용하게
            // (2026-10-05 — 파란 [제출하기]를 눌러도 할 수 있는 게 없었다). 동사 단일 출처 = collectInput.requestVerb
            <Button
              size="sm"
              variant={requestKindOf(pendingSubmits[0]) === 'physical' ? 'outline' : 'default'}
              className={cn(actionButton, 'gap-1.5', requestKindOf(pendingSubmits[0]) === 'physical' ? quietButton : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700')}
              onClick={() => onOpenCollect(pendingSubmits[0].action_id)}
            >
              <Inbox className="h-3.5 w-3.5" />
              {requestVerb(pendingSubmits[0])}
            </Button>
          ) : complex ? (
            <Button variant="outline" size="sm" className={cn(actionButton, quietButton, 'gap-1.5')} aria-expanded={expanded} aria-controls={`task-actions-${task.id}`} onClick={() => setExpanded(!expanded)}>
              {units.length > 0 ? '과제 선택·완료' : '회차별 완료'}<ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform', expanded && 'rotate-180')} />
            </Button>
          ) : (
            <Button
              variant={completed ? 'ghost' : 'outline'}
              size="sm"
              disabled={busy || !myAssignee}
              className={cn(actionButton, 'gap-1.5', completed ? 'text-slate-500' : cn(quietButton, 'hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'))}
              onClick={() => completed
                ? void change(() => toggle.mutateAsync({ taskId: task.id, assigneeId: resourceId, status: 'pending' }))
                : void completeWithUndo()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : completed ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {completed ? '완료 취소' : '완료하기'}
            </Button>
          )}
        </div>
      </div>
      {expanded && !inactive && !closedByManager && !reportedNotMine && (
        <div id={`task-actions-${task.id}`} className="mt-2.5 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 sm:ml-8">
          {units.length > 0 ? (
            <TaskAssigneeSummary
              assignees={task.meta.assignees ?? []}
              currentUserResourceId={resourceId}
              canEditAll={false}
              isUpdating={busy}
              units={units}
              unitProgress={getUnitProgress(task)}
              updatingUnitKey={toggleUnit.isPending ? `${resourceId}|${toggleUnit.variables?.unitKey}` : null}
              onUnitStatusChange={(unitKey, assignee, nextStatus) => {
                if (assignee.id !== resourceId) return;
                void change(() => toggleUnit.mutateAsync({ taskId: task.id, unitKey, assigneeId: resourceId, status: nextStatus }));
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {deadlines.map((deadline) => {
                const done = isRoundCompleted(progress, deadline, resourceId);
                return <Button key={deadline} variant="outline" size="sm" disabled={busy} aria-pressed={done} className={cn('h-8 gap-1.5 rounded-lg bg-white px-2.5 text-xs tabular-nums', done ? 'border-emerald-200 text-emerald-700' : 'hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700')} onClick={() => void change(() => toggleRound.mutateAsync({ taskId: task.id, assigneeId: resourceId, deadline, status: done ? 'pending' : 'completed' }))}>
                  {done && <Check className="h-3.5 w-3.5" />}{formatRoundLabel(deadlines, deadline)} · {done ? '완료' : '완료하기'}
                </Button>;
              })}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** 처음에 펼쳐 둘 업무 수 — 최근에 완료한 업무 몇 개만. 나머지는 머리 한 줄로 접는다 */
const COMPLETED_WORKS_OPEN = 3;

/**
 * 완료한 할 일 — 업무별 묶음(2026-09-24). 최근에 완료한 할 일이 든 업무가 위(사용자 결정).
 * 흩어진 한 줄 목록은 업무가 뒤섞여 무엇을 끝냈는지 훑기 어려웠다. 판정 = groupCompletedByWork.
 */
function CompletedByWork({ rows, resourceId, onDetail }: {
  rows: InboxTask[];
  resourceId: string;
  onDetail: (task: Task) => void;
}) {
  const groups = groupCompletedByWork(rows, resourceId);
  // 사용자가 연 것·닫은 것만 기억한다 — 나머지는 "앞의 몇 개만 펼침" 기본값을 따른다
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      <div className={cn('absolute inset-x-0 top-0 h-1', COMPLETED_ACCENT)} />
      <InboxListHeader inWorkGroup />
      <ul className="divide-y divide-slate-100">
        {groups.map((group, index) => {
          const open = toggled[group.key] ?? index < COMPLETED_WORKS_OPEN;
          const last = shortDate(group.lastCompletedAt);
          return (
            <li key={group.key || 'none'}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setToggled(prev => ({ ...prev, [group.key]: !open }))}
                className="flex w-full items-center gap-2 bg-slate-50/70 px-3.5 py-2 text-left hover:bg-slate-100/70 sm:px-5"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700" title={group.workName}>{group.workName}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                  {group.items.length}개{last && ` · 최근 ${last}`}
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {group.items.map(item => (
                    <InboxRow key={item.task.id} item={item} resourceId={resourceId} onDetail={onDetail} inWorkGroup />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 목록·계획표가 함께 쓰는 판정 — 같은 쿼리(react-query 가 한 번만 부른다)에서 같은 규칙으로 */
function useInboxModel(works: Work[], collectRequests: MyCollectRequest[]) {
  const { data, isLoading, isError, refetch } = useMyTasksJsonb(true);
  const { data: resourceId, isLoading: resourceLoading, isError: resourceError } = useCurrentUserResourceId();
  const today = format(new Date(), 'yyyy-MM-dd');
  const items = resourceId ? buildMyTaskInbox(data?.assigned_tasks ?? [], works, resourceId, today) : [];
  const todo = items.filter(item => !['completed', 'cancelled', 'waiting'].includes(item.group));
  const planned = resourceId ? buildTaskPlanner(data?.assigned_tasks ?? [], data?.managed_tasks ?? [], works, resourceId, today) : [];
  // 요청을 어디에 보일지 — 할 일 행이 맡는 제출 요청은 행에만, 나머지는 「요청」 구획·계획표에 (2026-10-05).
  // 종전엔 같은 제출 의무가 구획·행·계획표에 2~3번 나왔다. 행 = InboxRow 가 [제출하기]를 그리는 행과 같은 조건
  // (끝난·시작 전·취소·'담당자 아님' 행은 [상세 보기]라 요청을 맡지 못한다 — 그런 할 일의 요청은 구획에 남는다)
  const rowTaskIds = new Set(todo.filter(item => !hasReportedNotMine(item.task, resourceId)).map(item => item.task.id));
  const placed = placeInboxRequests(collectRequests, rowTaskIds);
  return { isLoading, isError, refetch, resourceId, resourceLoading, resourceError, items, todo, planned, placed };
}

/**
 * 할 일 계획표 — 이번 주 날짜별 마감(할 일 + 구획의 요청) + 마감일 미정. 옛 «내 할 일»에서는 목록 옆,
 * 업무노트(2026-11-12)에서는 오른쪽 패널에 따로 놓는다.
 */
export function MyTaskPlanner({ works, collectRequests = [], onTaskDetail, onOpenCollect, onClose, className }: {
  works: Work[];
  collectRequests?: MyCollectRequest[];
  onTaskDetail: (task: Task) => void;
  onOpenCollect?: (actionId: string) => void;
  /** 없으면 닫기 버튼을 그리지 않는다(업무노트 — 계획표를 늘 둔다) */
  onClose?: () => void;
  className?: string;
}) {
  const { planned, placed } = useInboxModel(works, collectRequests);
  const [plannerWeek, setPlannerWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(plannerWeek, index));
  const weekDates = weekDays.map(day => format(day, 'yyyy-MM-dd'));
  // 계획표의 요청 = 구획의 남은 요청(행이 맡는 것은 그 할 일이 이미 계획표에 있다). 마감일은 'YYYY-MM-DD' 로 맞춰 날짜 칸에
  const plannedCollect = placed.section;
  const collectOn = (date: string) => plannedCollect.filter(r => collectDueDay(r.due_date) === date);
  const undatedCollect = plannedCollect.filter(r => !collectDueDay(r.due_date));
  const weekCount = planned.filter(entry => entry.date && weekDates.includes(entry.date)).length
    + plannedCollect.filter(r => { const d = collectDueDay(r.due_date); return !!d && weekDates.includes(d); }).length;
  const undated = planned.filter(entry => !entry.date);
  const undatedCount = undated.length + undatedCollect.length;
  const undatedList = (
    <ul className="space-y-2.5">{undated.map(({ task, isManager }) => <li key={task.id}>
      <button type="button" className="rounded text-left text-[13px] font-medium leading-snug text-slate-800 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onTaskDetail(task)}>{task.title}</button>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">{isManager ? '관리 · ' : ''}{task.event_name}</p>
    </li>)}{undatedCollect.map(r => <li key={`collect:${r.action_id}`}><PlannerCollectItem request={r} onOpen={onOpenCollect} /></li>)}</ul>
  );
  return (
    <aside id="my-task-planner" aria-label="할 일 계획표" className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm', className)}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:flex">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">할 일 계획표</h2>
                <p className="text-[11px] text-slate-500">이번 주 마감 {weekCount}건</p>
              </div>
            </div>
            {onClose && <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700" aria-label="할 일 계획표 닫기" onClick={onClose}><X className="h-4 w-4" /></Button>}
          </div>
          <div className="flex items-center justify-between gap-1 border-b border-slate-100 px-2 py-2">
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-500" aria-label="이전 주" onClick={() => setPlannerWeek(week => addWeeks(week, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-xs font-medium tabular-nums text-slate-700" aria-live="polite">{format(plannerWeek, 'yyyy. M. d')} – {format(addDays(plannerWeek, 6), 'M. d')}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-500" aria-label="다음 주" onClick={() => setPlannerWeek(week => addWeeks(week, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg border-slate-200 px-2.5 text-xs font-medium text-slate-600 shadow-none" onClick={() => setPlannerWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>오늘</Button>
          </div>
          {/* 표 격자·회색 머리 띠를 걷었다 (2026-10-05) — 옆 목록 카드와 같은 언어(가는 행 구분선)로 그린다.
              머리글은 화면 읽기용으로만 남긴다. 날짜는 달력 앱처럼 숫자 원, 오늘은 채운 원. */}
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">주간 할 일 마감 스케줄</caption>
            {/* table-fixed 는 첫 줄로 열 너비를 정한다 — 머리글이 sr-only(1px)라 그 일을 colgroup 이 맡는다.
                없으면 두 열이 반반이 되어 날짜 칸이 화면의 절반을 먹는다 */}
            <colgroup><col className="w-[5rem] sm:w-16" /><col /></colgroup>
            <thead className="sr-only"><tr><th scope="col">날짜</th><th scope="col">해야 할 할 일</th></tr></thead>
            <tbody>{weekDays.map(day => {
              const date = format(day, 'yyyy-MM-dd');
              const entries = planned.filter(entry => entry.date === date);
              const collectEntries = collectOn(date);
              const today = isSameDay(day, new Date());
              const weekend = isWeekend(day);
              const empty = !entries.length && !collectEntries.length;
              return <tr key={date} className={cn('border-b border-slate-100 last:border-b-0', today && 'bg-blue-50/50', !entries.length && !collectEntries.length && 'hidden sm:table-row')}>
                <th scope="row" className="w-[5rem] px-3 py-2.5 text-left align-top font-normal sm:w-16 sm:py-3">
                  <time dateTime={date} className="flex items-center gap-1.5 sm:flex-col sm:gap-0.5">
                    <span className={cn(
                      'flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      today ? 'bg-blue-600 text-white shadow-sm' : weekend ? 'text-slate-500' : 'text-slate-800',
                    )}>{format(day, 'M/d')}</span>
                    <span className={cn('text-[11px] font-medium', today ? 'text-blue-700' : 'text-slate-500')}>{format(day, 'EEE', { locale: ko })}</span>
                  </time>
                  {today && <span className="sr-only">오늘</span>}
                </th>
                <td className="py-2.5 pl-1 pr-3 align-top sm:py-3">
                  {!empty ? <ul className="space-y-2.5 sm:space-y-3">{entries.map(({ task, isManager }) => {
                    return <li key={task.id}>
                      <button type="button" className="rounded text-left text-[13px] font-medium leading-snug text-slate-800 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onTaskDetail(task)}>{task.title}</button>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{isManager ? '관리 · ' : ''}{task.event_name}</p>
                    </li>;
                  })}{collectEntries.map(r => <li key={`collect:${r.action_id}`}><PlannerCollectItem request={r} onOpen={onOpenCollect} /></li>)}</ul>
                    // 빈 날은 문구 대신 짧은 선 — 「예정된 할 일 없음」이 일곱 줄 중 서너 줄을 채우면 그 문구가 화면의 주인공이 된다
                    : <><span aria-hidden className="mt-3.5 block h-px w-5 bg-slate-200" /><span className="sr-only">예정된 할 일 없음</span></>}
                </td>
              </tr>;
            })}</tbody>
          </table>
          {weekCount === 0 && <p className="border-t border-slate-100 px-3 py-4 text-center text-xs text-slate-500 sm:hidden">이번 주 마감 없음</p>}
          {undatedCount > 0 && <>
            <div className="hidden border-t border-slate-100 px-3 py-3 sm:block">
              <h3 className="mb-2.5 text-[11px] font-semibold text-slate-500">마감일 미정</h3>
              {undatedList}
            </div>
            <details className="group border-t border-slate-100 sm:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-xs text-slate-500 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90" />
                마감일 미정 <span className="tabular-nums">{undatedCount}건</span>
              </summary>
              <div className="px-3 pb-3">{undatedList}</div>
            </details>
          </>}
        </aside>
  );
}

export function MyTaskInbox({ works, onTaskDetail, plannerOpen = false, onPlannerOpenChange, filter = 'todo', collectRequests = [], onOpenCollect, layout = 'flat', managedWorks = [], workHref, taskHref }: MyTaskInboxProps) {
  const { isLoading, isError, refetch, resourceId, resourceLoading, resourceError, items, todo, placed } = useInboxModel(works, collectRequests);
  const visible = items.filter(item => filter === 'all' || (filter === 'todo' ? todo.includes(item) : item.group === 'completed'));
  const pendingSubmitByTask = placed.rows;
  // 구획을 나누지 않는다 (2026-09-26 사용자 결정 — «마감일 없는 할 일»·«완료한 할 일» 같은 구분이
  // 필요 없다). 순서만 구획 순서(기한 지남 → 오늘 → 예정 → 마감일 없음 → 대기 → 완료 → 취소)를 지킨다.
  const ordered = inboxGroups.flatMap(group => visible.filter(item => item.group === group.id));
  // 이번 주 진행률 — 계획표에서 넘겨 보는 주가 아니라 **오늘이 든 주**로 센다(목록 카드 위 바)
  const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const progress = weekProgress(items, format(thisWeek, 'yyyy-MM-dd'), format(addDays(thisWeek, 6), 'yyyy-MM-dd'));
  // 할 일 보기가 비었는데 완료한 할 일이 있다 = 다 끝낸 상태. «없다»가 아니라 «마쳤다»로 말한다.
  // 단 위 「요청」에 남은 것이 있으면 «모두 마쳤다»고 하지 않는다 — 바로 위에 남은 일이 보이는데 축하가 뜨면 어긋난다
  const requestsLeft = placed.section.length;
  const allDone = filter === 'todo' && items.some(item => item.group === 'completed');
  const celebrate = allDone && requestsLeft === 0;
  // 업무별 묶기 — 완료 보기는 종전대로 «완료한 할 일 업무별»(CompletedByWork)
  const byWork = layout === 'byWork' && filter !== 'completed';

  if (isLoading || resourceLoading) {
    return (
      <div className="space-y-4" aria-label="내 할 일 불러오는 중">
        <Skeleton className="h-14 w-full rounded-xl" />
        {[1, 2, 3].map(n => <Skeleton key={n} className="h-14 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (isError || resourceError) {
    return (
      <div role="alert" className="rounded-2xl border bg-card p-12 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">내 할 일을 불러오지 못했습니다</p>
          <Button variant="outline" size="sm" onClick={() => { if (resourceError) window.location.reload(); else void refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  if (!resourceId) {
    return (
      <div className="rounded-2xl border bg-card p-12 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-3 text-center text-slate-500">
          <ListTodo className="h-8 w-8" />
          <p className="max-w-sm text-sm leading-relaxed">연결된 사용자 정보가 없어 담당 할 일을 표시할 수 없습니다. 프로필의 사용자 연결을 확인해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-label="내가 수행할 할 일">
      {/* 「요청」 구획 — 할 일 행이 맡지 않는 요청만(placeInboxRequests). 완료 보기에서는 감춘다 */}
      {filter !== 'completed' && onOpenCollect && (
        <CollectRequestInbox requests={placed.section} doneRequests={placed.sectionDone} onOpen={onOpenCollect} />
      )}
      <div className={cn('grid items-start gap-4', plannerOpen && 'xl:grid-cols-[minmax(0,1fr)_360px]')}>
        <div className="min-w-0 space-y-4">
          {byWork ? (
            <ByWorkList ordered={ordered} resourceId={resourceId} managedWorks={managedWorks} workHref={workHref} taskHref={taskHref} progress={progress} onDetail={onTaskDetail} pendingSubmitByTask={pendingSubmitByTask} onOpenCollect={onOpenCollect} />
          ) : visible.length === 0 ? (
            <div className={cn(
              'rounded-2xl border-2 border-dashed px-6 py-16',
              celebrate ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/40' : 'border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50',
            )}>
              <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <div className={cn(
                  'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm',
                  celebrate ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600',
                )}>
                  {celebrate ? <CircleCheckBig className="h-7 w-7" /> : <ListTodo className="h-7 w-7" />}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {celebrate ? '지금 해야 할 할 일을 모두 마쳤습니다' : allDone ? '할 일은 모두 마쳤습니다' : filter === 'todo' ? '지금 해야 할 할 일이 없습니다' : filter === 'completed' ? '아직 완료한 할 일이 없습니다' : '배정된 할 일이 없습니다'}
                </h3>
                {filter === 'todo' && requestsLeft > 0 && (
                  <p className="mt-1.5 text-sm font-medium tabular-nums text-indigo-700">위 「요청」에 남은 것이 {requestsLeft}건 있습니다</p>
                )}
                {celebrate && progress.total > 0 && (
                  <p className="mt-1.5 text-sm font-medium tabular-nums text-emerald-700">{weekProgressText(progress)}</p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  업무의 전체 진행 상황과 관리 기능은{' '}
                  <Link to="/tasks/mine" className="font-medium text-blue-700 underline-offset-2 hover:underline">업무 관리 › 업무 목록</Link>에서 확인할 수 있습니다.
                </p>
              </div>
            </div>
          ) : filter === 'completed' ? (
            // 완료 보기만 업무별로 접는다(2026-09-24 결정 — 최근에 완료한 할 일이 든 업무가 위). 제목 줄은 없다.
            <CompletedByWork
              rows={ordered}
              resourceId={resourceId}
              onDetail={onTaskDetail}
            />
          ) : (
            // 카드 = rounded-2xl + shadow-sm + 상단 액센트 — 하나뿐이다. 액센트 = 이번 주 진행률
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
              <WeekProgressBar progress={progress} />
              {/* 데스크톱 머리글은 aria-hidden 이라 진행률 글자를 여기 한 번 더 둔다 — 휴대폰에서는 보이는 한 줄 */}
              <p className="px-3.5 pt-3 text-[11px] font-medium tabular-nums text-slate-500 sm:sr-only">{weekProgressText(progress)}</p>
              <InboxListHeader progress={progress} />
              <ul className="divide-y divide-slate-100">
                {ordered.map(item => <InboxRow key={item.task.id} item={item} resourceId={resourceId} onDetail={onTaskDetail} pendingSubmits={pendingSubmitByTask.get(item.task.id)} onOpenCollect={onOpenCollect} />)}
              </ul>
            </div>
          )}
        </div>

        {/* 계획표 — 휴대폰은 간단히 (2026-09-26 사용자 요청): 목록 위에 쌓이므로 7일 전부를 그리면
            정작 할 일 목록이 화면 밖으로 밀린다. 휴대폰에서는 ①할 일이 있는 날만 ②날짜를 한 줄로
            ③마감일 미정은 건수만 보이고 눌러서 편다. 데스크톱(옆 패널)은 종전 그대로 7일 전부. */}
                {plannerOpen && onPlannerOpenChange && (
          <MyTaskPlanner
            works={works} collectRequests={collectRequests} onTaskDetail={onTaskDetail} onOpenCollect={onOpenCollect}
            onClose={() => onPlannerOpenChange(false)} className="order-first xl:order-last xl:sticky xl:top-6"
          />
        )}
      </div>
    </section>
  );
}

/**
 * 가는 줄 — 상태 점 · 제목 · 마감 · (남은 제출·회차) · ›. 버튼이 없다: 누르면 작업실로 가서 그 할 일을 짚는다.
 * 판정(무엇이 급한가·제출이 남았나)은 InboxRow 와 같은 값(group·due·pendingSubmits)을 쓴다.
 */
function InboxLinkRow({ item, resourceId, href, pendingSubmits, dense = false }: {
  item: InboxTask; resourceId: string; href: string; pendingSubmits?: MyCollectRequest[]; dense?: boolean;
}) {
  const { task, group, due } = item;
  const deadlines = getTaskDeadlines(task);
  const progress = getDeadlineProgress(task);
  const urgent = group === 'overdue' || group === 'today';
  return (
    <li>
      <Link to={href} className={cn('group/row flex min-h-11 min-w-0 items-center gap-3 px-3.5 transition-colors hover:bg-slate-50 sm:px-5', dense ? 'py-1 sm:min-h-8' : 'py-1.5 sm:min-h-10')}>
        <span className={cn('flex-none rounded-full', GROUP_DOT[group])} aria-hidden />
        <span className={cn('min-w-0 flex-1 truncate', dense ? 'text-[13px] font-medium text-slate-800' : 'text-sm font-semibold text-slate-900')} title={task.title}>{task.title}</span>
        {pendingSubmits && pendingSubmits.length > 0 && (
          <span className={cn(INBOX_CHIP, INBOX_CHIP_TONE.request, 'hidden sm:inline-flex')}>
            {pendingSubmits.length > 1 ? `제출 ${pendingSubmits.length}건 남음` : `${REQUEST_KIND_LABEL[requestKindOf(pendingSubmits[0])]} 남음`}
          </span>
        )}
        {deadlines.length > 1 && (
          <span className={cn(INBOX_CHIP, 'hidden tabular-nums sm:inline-flex', INBOX_CHIP_TONE.neutral)}>회차 {deadlines.filter(d => isRoundCompleted(progress, d, resourceId)).length}/{deadlines.length}</span>
        )}
        {urgent ? (
          <span className={cn(INBOX_CHIP, 'flex-none tabular-nums', INBOX_CHIP_TONE[group === 'overdue' ? 'overdue' : 'today'])}>{due ? `${due.slice(5).replace('-', '/')} 마감` : '오늘'}</span>
        ) : (
          <span className="flex-none text-xs tabular-nums text-slate-500">{due ? `${due.slice(5).replace('-', '/')} 마감` : '마감일 없음'}</span>
        )}
        <ChevronRight className="h-4 w-4 flex-none text-slate-300 group-hover/row:text-blue-600" aria-hidden />
      </Link>
    </li>
  );
}

const GROUP_RANK = new Map(inboxGroups.map((g, i) => [g.id, i]));

/**
 * 업무별 묶기 (업무노트, 2026-11-12 사용자 결정) — «업무 안에 내 할 일».
 * ① 내가 책임자인 업무: 큰 머리(이름 → 작업실 · 진척 · D-day) 아래 내가 담당인 할 일을 들여 쓴다.
 *    내 할 일이 없는 책임 업무는 머리 한 줄만(접어 둔다).
 * ② 담당만 맡은 업무: 작은 머리 + 작은 행.
 * 할 일 행은 같은 InboxRow — 완료·회차·과제 단위·제출 판정이 한 곳에 남는다.
 */
function ByWorkList({ ordered, resourceId, managedWorks, workHref, taskHref, progress, onDetail, pendingSubmitByTask, onOpenCollect }: {
  ordered: InboxTask[];
  resourceId: string;
  managedWorks: InboxManagedWork[];
  workHref?: (workId: string) => string;
  taskHref?: (task: Task) => string;
  progress: WeekProgress;
  onDetail: (task: Task) => void;
  pendingSubmitByTask: Map<string, MyCollectRequest[]>;
  onOpenCollect?: (actionId: string) => void;
}) {
  const [showIdle, setShowIdle] = useState(false);
  const byWorkId = new Map<string, InboxTask[]>();
  for (const item of ordered) {
    const key = item.task.event_id ?? '';
    byWorkId.set(key, [...(byWorkId.get(key) ?? []), item]);
  }
  const rank = (list: InboxTask[]) => Math.min(...list.map(i => GROUP_RANK.get(i.group) ?? 99));
  const managedIds = new Set(managedWorks.map(w => w.id));
  const managed = managedWorks
    .map(w => ({ work: w, items: byWorkId.get(w.id) ?? [] }))
    .sort((a, b) => {
      const ra = a.items.length ? rank(a.items) : 99;
      const rb = b.items.length ? rank(b.items) : 99;
      if (ra !== rb) return ra - rb;
      const da = a.work.sortDate ?? '9999';
      const db = b.work.sortDate ?? '9999';
      if (da !== db) return da < db ? -1 : 1;
      return a.work.name.localeCompare(b.work.name, 'ko');
    });
  const busy = managed.filter(g => g.items.length > 0);
  const idle = managed.filter(g => g.items.length === 0);
  const others = [...byWorkId.entries()]
    .filter(([id]) => !managedIds.has(id))
    .map(([id, items]) => ({ id, name: items[0]?.task.event_name || '업무', items }))
    .sort((a, b) => rank(a.items) - rank(b.items) || a.name.localeCompare(b.name, 'ko'));

  const rows = (items: InboxTask[], dense = false) => (
    <ul className="divide-y divide-slate-100">
      {items.map(item => taskHref ? (
        <InboxLinkRow key={item.task.id} item={item} resourceId={resourceId} href={taskHref(item.task)} pendingSubmits={pendingSubmitByTask.get(item.task.id)} dense={dense} />
      ) : (
        <InboxRow key={item.task.id} item={item} resourceId={resourceId} onDetail={onDetail} pendingSubmits={pendingSubmitByTask.get(item.task.id)} onOpenCollect={onOpenCollect} hideWork dense={dense} />
      ))}
    </ul>
  );
  const head = (id: string, name: string, small: boolean, meta?: ReactNode) => {
    const label = <span className={cn('min-w-0 flex-1 truncate', small ? 'text-xs font-medium text-slate-600' : 'text-sm font-semibold text-slate-900')} title={name}>{name}</span>;
    return (
      <div className={cn('flex min-w-0 items-center gap-2', small ? 'px-3.5 pb-0.5 pt-2 sm:px-5' : 'bg-slate-50/70 px-3.5 py-1.5 sm:px-5')}>
        {workHref && id ? <Link to={workHref(id)} className="flex min-h-11 min-w-0 flex-1 items-center hover:underline sm:min-h-8">{label}</Link> : label}
        {meta && <span className="flex flex-none items-center gap-2 text-[11px] tabular-nums text-slate-500">{meta}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <WeekProgressBar progress={progress} />
        <p className="px-3.5 pt-3 text-[11px] font-medium tabular-nums text-slate-500 sm:px-5">내 업무 {managedWorks.length} · {weekProgressText(progress)}</p>
        {busy.length === 0 && idle.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">내가 책임자인 진행 중 업무가 없습니다.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200/70">
            {busy.map(({ work, items }) => (
              <li key={work.id}>
                {head(work.id, work.name, false, work.meta)}
                <div className="ml-3 border-l-2 border-blue-100 sm:ml-5">{rows(items)}</div>
              </li>
            ))}
            {idle.length > 0 && (
              <li>
                <button type="button" onClick={() => setShowIdle(v => !v)} aria-expanded={showIdle} className="flex min-h-11 w-full items-center gap-1.5 px-3.5 text-left text-xs text-slate-500 hover:bg-slate-50 sm:min-h-9 sm:px-5">
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showIdle && 'rotate-90')} />
                  내 할 일이 없는 업무 {idle.length}
                </button>
                {showIdle && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {idle.map(({ work }) => <li key={work.id}>{head(work.id, work.name, false, work.meta)}</li>)}
                  </ul>
                )}
              </li>
            )}
          </ul>
        )}
      </div>

      {others.length > 0 && (
        <section aria-label="담당만 맡은 일" className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
          <h3 className="px-3.5 pt-2.5 text-xs font-semibold text-slate-500 sm:px-5">담당만 맡은 일 <span className="text-slate-900">{others.reduce((n, g) => n + g.items.length, 0)}</span></h3>
          <ul className="divide-y divide-slate-100">
            {others.map(g => (
              <li key={g.id || 'none'}>
                {head(g.id, g.name, true)}
                {rows(g.items, true)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
