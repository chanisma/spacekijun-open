import { CheckCircle2, ChevronDown, Clock3, Hand, Loader2, Undo2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { TaskAssigneeJsonb } from '@/types/tasks';
import { formatRoundLabel, isRoundCompleted, type DeadlineProgressMap } from '@/lib/taskDeadlines';
import {
  isUnitCompleted,
  isUnitCompletedBy,
  unclaimedUnits,
  unitCompletionStats,
  unitHolderIds,
  unitsOfAssignee,
  type TaskUnit,
  type UnitProgressMap,
} from '@/lib/taskUnits';

interface TaskAssigneeSummaryProps {
  assignees: TaskAssigneeJsonb[];
  className?: string;
  currentUserResourceId?: string;
  canEditAll?: boolean;
  isUpdating?: boolean;
  maxVisible?: number;
  onAssigneeStatusChange?: (assignee: TaskAssigneeJsonb) => void;
  updatingAssigneeId?: string | null;
  /** 다중 마감(반복 할 일) 회차 목록 — 2개 이상이면 회차별 체크 모드로 전환 */
  deadlines?: string[];
  /** 회차별 완료 기록(task.meta.deadlineProgress) */
  deadlineProgress?: DeadlineProgressMap;
  /** 회차 토글(본인 또는 매니저) — set_task_deadline_status RPC로 연결 */
  onRoundStatusChange?: (
    assignee: TaskAssigneeJsonb,
    deadline: string,
    nextStatus: 'pending' | 'completed'
  ) => void;
  /** `${assigneeId}|${deadline}` — 진행 중인 회차 토글 표시 */
  updatingRoundKey?: string | null;
  /** 과제 단위 할 일(task.meta.units) — 있으면 사람 토글 대신 단위 선택/완료 모드로 전환 */
  units?: TaskUnit[];
  /** 단위별 수행 기록(task.meta.unitProgress) */
  unitProgress?: UnitProgressMap;
  /**
   * 단위 상태 변경(set_task_unit_status RPC로 연결).
   * status: 'pending'=선택(claim)/미완료 되돌림, 'completed'=완료, null=선택 해제
   */
  onUnitStatusChange?: (
    unitKey: string,
    assignee: TaskAssigneeJsonb,
    status: 'pending' | 'completed' | null
  ) => void;
  /** `${assigneeId}|${unitKey}` — 진행 중인 단위 토글 표시 */
  updatingUnitKey?: string | null;
}

function getInitials(name?: string): string {
  const normalized = name?.trim();
  if (!normalized) return '?';
  return normalized.replace(/\s+/g, '').slice(0, 2);
}


function AssigneeList({
  title,
  assignees,
  completed,
  canEditAll,
  currentUserResourceId,
  isUpdating,
  onAssigneeStatusChange,
  updatingAssigneeId,
  deadlines,
  deadlineProgress,
  onRoundStatusChange,
  updatingRoundKey,
  showCount = true,
}: {
  title: string;
  assignees: TaskAssigneeJsonb[];
  completed: boolean;
  canEditAll: boolean;
  currentUserResourceId?: string;
  isUpdating: boolean;
  onAssigneeStatusChange?: (assignee: TaskAssigneeJsonb) => void;
  updatingAssigneeId?: string | null;
  deadlines?: string[];
  deadlineProgress?: DeadlineProgressMap;
  onRoundStatusChange?: TaskAssigneeSummaryProps['onRoundStatusChange'];
  updatingRoundKey?: string | null;
  /** 본인 1명만 보여줄 때는 "1명" 표기가 군더더기라 끈다 */
  showCount?: boolean;
}) {
  if (assignees.length === 0) return null;

  const roundMode = Boolean(deadlines && deadlines.length > 1 && onRoundStatusChange);

  const getAssigneeCardClassName = (canEdit: boolean) =>
    cn(
      'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
      completed
        ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
        : 'bg-muted/40 text-foreground',
      canEdit &&
        'cursor-pointer transition hover:-translate-y-px hover:border-emerald-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70'
    );

  const renderAssigneeContent = (assignee: TaskAssigneeJsonb, updating: boolean) => (
    <>
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          completed
            ? 'bg-emerald-600 text-white'
            : 'bg-background text-muted-foreground ring-1 ring-border'
        )}
      >
        {updating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          getInitials(assignee.name)
        )}
      </span>
      <span className="truncate">{assignee.name?.trim() || '이름 없음'}</span>
    </>
  );

  // 회차별 체크 모드: 카드 전체 토글 대신 담당자마다 회차 칩을 개별 토글
  const renderRoundChips = (assignee: TaskAssigneeJsonb, canEdit: boolean) => (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {deadlines!.map((deadline) => {
        const done = isRoundCompleted(deadlineProgress ?? {}, deadline, assignee.id);
        const key = `${assignee.id}|${deadline}`;
        const updating = updatingRoundKey === key;
        const chipClass = cn(
          'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums',
          done
            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
            : 'border-slate-200 bg-background text-muted-foreground',
          canEdit && 'cursor-pointer transition hover:border-emerald-400 hover:shadow-sm',
          updating && 'opacity-60'
        );
        if (!canEdit) {
          return (
            <span key={deadline} className={chipClass}>
              {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock3 className="h-2.5 w-2.5" />}
              {formatRoundLabel(deadlines!, deadline)}
            </span>
          );
        }
        return (
          <button
            key={deadline}
            type="button"
            className={chipClass}
            disabled={isUpdating}
            aria-label={`${assignee.name?.trim() || '담당자'} ${deadline} 회차를 ${done ? '미완료' : '완료'}로 변경`}
            onClick={(event) => {
              event.stopPropagation();
              onRoundStatusChange?.(assignee, deadline, done ? 'pending' : 'completed');
            }}
          >
            {updating ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : done ? (
              <CheckCircle2 className="h-2.5 w-2.5" />
            ) : (
              <Clock3 className="h-2.5 w-2.5" />
            )}
            {formatRoundLabel(deadlines!, deadline)}
          </button>
        );
      })}
    </div>
  );

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
        <span
          className={cn(
            'flex items-center gap-1.5',
            completed ? 'text-emerald-700' : 'text-muted-foreground'
          )}
        >
          {completed ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
          {title}
        </span>
        {showCount && (
          <span className="tabular-nums text-muted-foreground">
            {assignees.length}명
          </span>
        )}
      </div>
      <div className={cn('grid gap-1.5', roundMode ? 'grid-cols-1' : 'grid-cols-2')}>
        {assignees.map((assignee, index) => {
          const canEdit = Boolean(
            (roundMode ? onRoundStatusChange : onAssigneeStatusChange) &&
              (canEditAll || assignee.id === currentUserResourceId)
          );
          const updating = updatingAssigneeId === assignee.id;
          const nextStatusLabel =
            assignee.status === 'completed' ? '진행 중' : '완료';

          if (roundMode) {
            return (
              <div
                key={`${assignee.id}-${index}`}
                className={getAssigneeCardClassName(false)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {renderAssigneeContent(assignee, false)}
                  </div>
                  {renderRoundChips(assignee, canEdit)}
                </div>
              </div>
            );
          }

          if (!canEdit) {
            return (
              <div
                key={`${assignee.id}-${index}`}
                className={getAssigneeCardClassName(false)}
              >
                {renderAssigneeContent(assignee, false)}
              </div>
            );
          }

          return (
            <button
              key={`${assignee.id}-${index}`}
              type="button"
              className={getAssigneeCardClassName(true)}
              disabled={isUpdating}
              aria-label={`${assignee.name?.trim() || '이름 없음'} 담당자 상태를 ${nextStatusLabel}(으)로 변경`}
              onClick={event => {
                event.stopPropagation();
                onAssigneeStatusChange?.(assignee);
              }}
            >
              {renderAssigneeContent(assignee, updating)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 매니저가 아닌 사용자용 요약(2026-08-11 사용자 결정).
 * 담당자 명단(팝오버·아바타 스택)을 노출하지 않고 "몇 명 중 몇 명 완료" + 내 상태만 보여주며,
 * 클릭은 내 상태 토글로 직결한다. 다중 마감은 어느 회차인지 골라야 하므로
 * 예외적으로 팝오버를 쓰되 **내 회차만** 담는다.
 */
function SelfAssigneeSummary({
  className,
  completedCount,
  totalCount,
  myAssignee,
  isUpdating,
  updatingAssigneeId,
  onAssigneeStatusChange,
  roundMode,
  deadlines,
  deadlineProgress,
  onRoundStatusChange,
  updatingRoundKey,
}: {
  className?: string;
  completedCount: number;
  totalCount: number;
  myAssignee?: TaskAssigneeJsonb;
  isUpdating: boolean;
  updatingAssigneeId?: string | null;
  onAssigneeStatusChange?: (assignee: TaskAssigneeJsonb) => void;
  roundMode: boolean;
  deadlines?: string[];
  deadlineProgress?: DeadlineProgressMap;
  onRoundStatusChange?: TaskAssigneeSummaryProps['onRoundStatusChange'];
  updatingRoundKey?: string | null;
}) {
  const myCompleted = myAssignee?.status === 'completed';
  const updating = Boolean(myAssignee && updatingAssigneeId === myAssignee.id);
  const myRoundsDone =
    myAssignee && roundMode && deadlines
      ? deadlines.filter(deadline =>
          isRoundCompleted(deadlineProgress ?? {}, deadline, myAssignee.id)
        ).length
      : 0;
  // 담당자가 아닌 열람자(예: 상위 업무만 보는 경우)는 토글할 내 상태가 없다.
  const canToggle = Boolean(
    myAssignee && (roundMode ? onRoundStatusChange : onAssigneeStatusChange)
  );

  const chipClassName = cn(
    'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-left transition-colors',
    myCompleted
      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
      : 'bg-muted/35',
    canToggle &&
      'hover:border-emerald-300 hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30',
    className
  );

  const body = (
    <>
      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs font-medium tabular-nums">
        {completedCount}/{totalCount}
        <span className="ml-1 font-normal text-muted-foreground">완료</span>
      </span>
      {myAssignee && (
        <span
          className={cn(
            'ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            myCompleted
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-slate-200 bg-background text-muted-foreground'
          )}
        >
          {updating ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : myCompleted ? (
            <CheckCircle2 className="h-2.5 w-2.5" />
          ) : (
            <Clock3 className="h-2.5 w-2.5" />
          )}
          {roundMode
            ? `내 회차 ${myRoundsDone}/${deadlines!.length}`
            : `내 상태 ${myCompleted ? '완료' : '진행 중'}`}
        </span>
      )}
    </>
  );

  if (!canToggle) {
    return (
      <div
        className={chipClassName}
        title={`담당자 ${totalCount}명 중 ${completedCount}명 완료`}
      >
        {body}
      </div>
    );
  }

  if (roundMode) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={chipClassName}
            aria-label={`담당자 ${totalCount}명 중 ${completedCount}명 완료. 내 회차 상태 변경`}
            onClick={event => event.stopPropagation()}
          >
            {body}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[min(20rem,calc(100vw-2rem))] p-3"
          onClick={event => event.stopPropagation()}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            담당자 {totalCount}명 중 {completedCount}명 완료 · 회차를 눌러 내 상태를
            변경하세요
          </p>
          <AssigneeList
            title="내 회차"
            assignees={[myAssignee!]}
            completed={Boolean(myCompleted)}
            canEditAll={false}
            currentUserResourceId={myAssignee!.id}
            isUpdating={isUpdating}
            updatingAssigneeId={updatingAssigneeId}
            deadlines={deadlines}
            deadlineProgress={deadlineProgress}
            onRoundStatusChange={onRoundStatusChange}
            updatingRoundKey={updatingRoundKey}
            showCount={false}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <button
      type="button"
      className={chipClassName}
      disabled={isUpdating}
      aria-label={`담당자 ${totalCount}명 중 ${completedCount}명 완료. 내 상태를 ${
        myCompleted ? '진행 중' : '완료'
      }(으)로 변경`}
      onClick={event => {
        event.stopPropagation();
        onAssigneeStatusChange?.(myAssignee!);
      }}
    >
      {body}
    </button>
  );
}

/**
 * 과제 단위 할 일의 칩(2026-08-12) — 진행 수치가 사람이 아니라 "단위 N/M"이다.
 * 매니저: 팝오버에 전체 단위·담당자 현황(누구든 토글·선택 해제).
 * 범주 담당자(비매니저): 명단 비노출 규칙에 따라 **내 단위 + 아직 아무도 안 맡은 단위**만
 * 보여준다 — 남이 맡은 단위는 라벨만으로 담당자가 추정되므로 개수로만 요약한다.
 */
function UnitAssigneeSummary({
  className,
  units,
  progress,
  assignees,
  canEditAll,
  currentUserResourceId,
  isUpdating,
  updatingUnitKey,
  onUnitStatusChange,
}: {
  className?: string;
  units: TaskUnit[];
  progress: UnitProgressMap;
  assignees: TaskAssigneeJsonb[];
  canEditAll: boolean;
  currentUserResourceId?: string;
  isUpdating: boolean;
  updatingUnitKey?: string | null;
  onUnitStatusChange?: TaskAssigneeSummaryProps['onUnitStatusChange'];
}) {
  const stats = unitCompletionStats(units, progress);
  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const nameById = new Map(assignees.map(assignee => [assignee.id, assignee.name]));
  const myAssignee = currentUserResourceId
    ? assignees.find(
        assignee => assignee.id === currentUserResourceId && assignee.status !== 'cancelled'
      )
    : undefined;
  const myUnits = myAssignee ? unitsOfAssignee(units, progress, myAssignee.id) : [];
  const myDone = myAssignee
    ? myUnits.filter(unit => isUnitCompletedBy(progress, unit.key, myAssignee.id)).length
    : 0;
  const freeUnits = unclaimedUnits(units, progress);
  const othersInProgress = units.length - myUnits.length - freeUnits.length;
  const canInteract = Boolean(onUnitStatusChange && (canEditAll || myAssignee));

  const unitButtonClass = (done: boolean, clickable: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
      done
        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
        : 'border-slate-200 bg-background text-muted-foreground',
      clickable && 'cursor-pointer transition hover:border-emerald-400 hover:shadow-sm',
      isUpdating && 'opacity-70'
    );

  const holderChip = (unit: TaskUnit, assigneeId: string) => {
    const done = isUnitCompletedBy(progress, unit.key, assigneeId);
    const key = `${assigneeId}|${unit.key}`;
    const updating = updatingUnitKey === key;
    const name = nameById.get(assigneeId)?.trim() || '이름 없음';
    const editable = Boolean(
      onUnitStatusChange && (canEditAll || assigneeId === currentUserResourceId)
    );
    return (
      <span key={key} className="inline-flex items-center gap-0.5">
        <button
          type="button"
          className={unitButtonClass(done, editable)}
          disabled={!editable || isUpdating}
          aria-label={`${name}의 ${unit.label}을(를) ${done ? '미완료' : '완료'}로 변경`}
          onClick={event => {
            event.stopPropagation();
            if (!editable) return;
            onUnitStatusChange?.(unit.key, { id: assigneeId, name } as TaskAssigneeJsonb,
              done ? 'pending' : 'completed');
          }}
        >
          {updating ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : done ? (
            <CheckCircle2 className="h-2.5 w-2.5" />
          ) : (
            <Clock3 className="h-2.5 w-2.5" />
          )}
          {name}
        </button>
        {editable && (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-rose-600"
            title="선택 해제"
            disabled={isUpdating}
            onClick={event => {
              event.stopPropagation();
              onUnitStatusChange?.(unit.key, { id: assigneeId, name } as TaskAssigneeJsonb, null);
            }}
          >
            <Undo2 className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  };

  const body = (
    <>
      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs font-medium tabular-nums">
        단위 {stats.completed}/{stats.total}
        <span className="ml-1 font-normal text-muted-foreground">완료</span>
      </span>
      {myAssignee && (
        <span
          className={cn(
            'ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            myUnits.length > 0 && myDone === myUnits.length
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-slate-200 bg-background text-muted-foreground'
          )}
        >
          {myUnits.length > 0 ? (
            <>내 단위 {myDone}/{myUnits.length}</>
          ) : freeUnits.length > 0 ? (
            <>
              <Hand className="h-2.5 w-2.5" />
              단위 선택
            </>
          ) : (
            <>선택할 단위 없음</>
          )}
        </span>
      )}
      {!myAssignee && canEditAll && (
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  const chipClassName = cn(
    'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-left transition-colors',
    stats.total > 0 && stats.completed === stats.total
      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
      : 'bg-muted/35',
    canInteract &&
      'hover:border-sky-300 hover:bg-sky-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-sky-800 dark:hover:bg-sky-950/30',
    className
  );

  if (!canInteract) {
    return (
      <div className={chipClassName} title={`과제 단위 ${stats.total}개 중 ${stats.completed}개 완료`}>
        {body}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={chipClassName}
          aria-label={`과제 단위 ${stats.total}개 중 ${stats.completed}개 완료. 단위 현황 보기`}
          onClick={event => event.stopPropagation()}
        >
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">과제 단위 현황</p>
              <p className="text-xs text-muted-foreground">
                {stats.total}개 중 {stats.completed}개 완료
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-emerald-700">
              {percentage}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto p-3">
          {canEditAll ? (
            // 매니저: 전체 단위 + 담당자 현황(누구든 토글·해제 가능)
            units.map(unit => {
              const holders = unitHolderIds(progress, unit.key);
              const done = isUnitCompleted(progress, unit.key);
              return (
                <div
                  key={unit.key}
                  className={cn(
                    'rounded-md border px-2.5 py-2',
                    done ? 'border-emerald-200 bg-emerald-50/50' : 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{unit.label}</span>
                    {holders.length === 0 && (
                      <span className="shrink-0 text-[11px] text-amber-600">담당자 미선택</span>
                    )}
                  </div>
                  {holders.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {holders.map(assigneeId => holderChip(unit, assigneeId))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // 범주 담당자: 내 단위 + 선택 가능한 단위만(남의 단위는 개수로만)
            <>
              {myUnits.length > 0 && (
                <section>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">내 단위</p>
                  <div className="space-y-1.5">
                    {myUnits.map(unit => {
                      const done = isUnitCompletedBy(progress, unit.key, myAssignee!.id);
                      const key = `${myAssignee!.id}|${unit.key}`;
                      const updating = updatingUnitKey === key;
                      return (
                        <div
                          key={unit.key}
                          className={cn(
                            'flex items-center gap-2 rounded-md border px-2.5 py-1.5',
                            done ? 'border-emerald-200 bg-emerald-50/50' : 'bg-muted/30'
                          )}
                        >
                          <button
                            type="button"
                            className={unitButtonClass(done, true)}
                            disabled={isUpdating}
                            aria-label={`${unit.label}을(를) ${done ? '미완료' : '완료'}로 변경`}
                            onClick={() =>
                              onUnitStatusChange?.(unit.key, myAssignee!, done ? 'pending' : 'completed')
                            }
                          >
                            {updating ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : done ? (
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            ) : (
                              <Clock3 className="h-2.5 w-2.5" />
                            )}
                            {done ? '완료' : '완료로 표시'}
                          </button>
                          <span className="min-w-0 flex-1 truncate text-sm">{unit.label}</span>
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 text-muted-foreground hover:text-rose-600"
                            title="선택 취소"
                            disabled={isUpdating}
                            onClick={() => onUnitStatusChange?.(unit.key, myAssignee!, null)}
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {freeUnits.length > 0 && myAssignee && (
                <section>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    선택 가능한 단위
                  </p>
                  <div className="space-y-1.5">
                    {freeUnits.map(unit => {
                      const key = `${myAssignee.id}|${unit.key}`;
                      const updating = updatingUnitKey === key;
                      return (
                        <div
                          key={unit.key}
                          className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm">{unit.label}</span>
                          <button
                            type="button"
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 transition hover:border-sky-400 hover:shadow-sm disabled:opacity-60"
                            disabled={isUpdating}
                            onClick={() => onUnitStatusChange?.(unit.key, myAssignee, 'pending')}
                          >
                            {updating ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <Hand className="h-2.5 w-2.5" />
                            )}
                            내가 하기
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {othersInProgress > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  다른 담당자가 맡은 단위 {othersInProgress}개
                </p>
              )}
              {myUnits.length === 0 && freeUnits.length === 0 && othersInProgress === 0 && (
                <p className="text-xs text-muted-foreground">표시할 단위가 없습니다.</p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TaskAssigneeSummary({
  assignees,
  className,
  currentUserResourceId,
  canEditAll = false,
  isUpdating = false,
  maxVisible = 3,
  onAssigneeStatusChange,
  updatingAssigneeId,
  deadlines,
  deadlineProgress,
  onRoundStatusChange,
  updatingRoundKey,
  units,
  unitProgress,
  onUnitStatusChange,
  updatingUnitKey,
}: TaskAssigneeSummaryProps) {
  if (!Array.isArray(assignees) || assignees.length === 0) return null;

  const roundMode = Boolean(deadlines && deadlines.length > 1 && onRoundStatusChange);
  const unitTaskMode = Boolean(units && units.length > 0);
  const completedAssignees = assignees.filter(
    assignee => assignee.status === 'completed'
  );
  const pendingAssignees = assignees.filter(
    assignee => assignee.status !== 'completed'
  );
  const completedCount = completedAssignees.length;
  const totalCount = assignees.length;
  const completionPercentage = Math.round((completedCount / totalCount) * 100);

  // 과제 단위 할 일 — 사람 토글 대신 단위 선택/완료 UI로 전환
  if (unitTaskMode) {
    return (
      <UnitAssigneeSummary
        className={className}
        units={units!}
        progress={unitProgress ?? {}}
        assignees={assignees}
        canEditAll={canEditAll}
        currentUserResourceId={currentUserResourceId}
        isUpdating={isUpdating}
        updatingUnitKey={updatingUnitKey}
        onUnitStatusChange={onUnitStatusChange}
      />
    );
  }

  // 매니저가 아니면 여기서 끝 — 명단 대신 요약 수치와 내 상태만 노출한다.
  if (!canEditAll) {
    return (
      <SelfAssigneeSummary
        className={className}
        completedCount={completedCount}
        totalCount={totalCount}
        myAssignee={
          currentUserResourceId
            ? assignees.find(assignee => assignee.id === currentUserResourceId)
            : undefined
        }
        isUpdating={isUpdating}
        updatingAssigneeId={updatingAssigneeId}
        onAssigneeStatusChange={onAssigneeStatusChange}
        roundMode={roundMode}
        deadlines={deadlines}
        deadlineProgress={deadlineProgress}
        onRoundStatusChange={onRoundStatusChange}
        updatingRoundKey={updatingRoundKey}
      />
    );
  }

  // ↓ 아래는 매니저 전용 경로 — 전체 담당자 명단을 펼치고 누구든 상태를 바꿀 수 있다.
  const visibleAssignees = assignees.slice(0, maxVisible);
  const hiddenCount = totalCount - visibleAssignees.length;
  const canEditAnyAssignee = Boolean(
    roundMode ? onRoundStatusChange : onAssigneeStatusChange
  );

  const listProps = {
    canEditAll,
    currentUserResourceId,
    isUpdating,
    onAssigneeStatusChange: roundMode ? undefined : onAssigneeStatusChange,
    updatingAssigneeId,
    deadlines,
    deadlineProgress,
    onRoundStatusChange: roundMode ? onRoundStatusChange : undefined,
    updatingRoundKey,
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border bg-muted/35 px-2 text-left transition-colors',
            'hover:border-emerald-300 hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30',
            className
          )}
          aria-label={`담당자 ${totalCount}명 중 ${completedCount}명 완료. 전체 목록 보기`}
          onClick={event => event.stopPropagation()}
        >
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-emerald-600" />
          <span className="shrink-0 text-xs font-medium tabular-nums">
            {completedCount}/{totalCount}
            <span className="ml-1 font-normal text-muted-foreground">완료</span>
          </span>
          <span className="ml-auto flex min-w-0 items-center">
            <span className="flex -space-x-1.5">
              {visibleAssignees.map((assignee, index) => (
                <span
                  key={`${assignee.id}-${index}`}
                  title={assignee.name || '이름 없음'}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[9px] font-semibold shadow-sm',
                    assignee.status === 'completed'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-background text-muted-foreground'
                  )}
                >
                  {getInitials(assignee.name)}
                </span>
              ))}
            </span>
            {hiddenCount > 0 && (
              <span className="ml-1 shrink-0 text-[10px] font-semibold text-muted-foreground">
                +{hiddenCount}
              </span>
            )}
            <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">담당자 현황</p>
              <p className="text-xs text-muted-foreground">
                {totalCount}명 중 {completedCount}명 완료
                {roundMode && ` · 마감 ${deadlines!.length}회차`}
              </p>
              {canEditAnyAssignee && (
                <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  {roundMode
                    ? '회차를 눌러 담당자별 완료/미완료 변경'
                    : '이름을 눌러 담당자 상태 변경'}
                </p>
              )}
            </div>
            <span className="text-sm font-semibold tabular-nums text-emerald-700">
              {completionPercentage}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto p-3">
          <AssigneeList
            title="완료"
            assignees={completedAssignees}
            completed
            {...listProps}
          />
          <AssigneeList
            title="미완료"
            assignees={pendingAssignees}
            completed={false}
            {...listProps}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
