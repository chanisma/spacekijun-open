import { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  CircleDotDashed,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  getDeadlineProgress,
  getTaskDeadlineInfo,
  getTaskDeadlines,
  isRoundCompleted,
  todayDateString,
  type DeadlineProgressMap,
} from '@/lib/taskDeadlines';
import { getMyTaskStatus, isMyTaskCompleted } from '@/lib/taskStatus';
import { useDragScroll } from '@/hooks/useDragScroll';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskActionButton } from '@/features/task-workflow/components/TaskActionButton';
import { useTaskActionEntries } from '@/features/task-workflow/hooks/useTaskActions';
import type { MyTasksResponse, Task } from '@/types/tasks';
import { useMyCollectRequests } from '@/features/task-workflow/hooks/useCollectInput';
import { CollectRespondDialog } from '@/features/task-workflow/components/collect/CollectRespondDialog';
import { placeInboxRequests, REQUEST_KIND_LABEL, requestKindOf } from '@/lib/collectInput';
import { TaskCardCollectRequests } from './TaskCardCollectRequests';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';

interface TeacherTasksCardProps {
  myTasksData: MyTasksResponse | null | undefined;
  currentResourceId: string | undefined;
  isLoading: boolean;
}

interface DashboardAssignee {
  id: string;
  status?: string;
}

type DashboardTask = Omit<Task, 'meta' | 'status'> & {
  status: Task['status'] | 'in_progress';
  event_description?: string;
  meta?: {
    assignees?: DashboardAssignee[];
    /** 다중 마감 일정(반복 업무) — due_date는 다음 마감으로 동기화 저장됨 */
    deadlines?: string[];
    /** 회차별 완료 기록 {마감일: {담당자id: {status}}} */
    deadlineProgress?: DeadlineProgressMap;
  };
};

// 다중 마감이면 "다음 마감"(전부 지났으면 마지막)을 판정·표시 기준으로
function effectiveTaskDue(task: DashboardTask): string | null {
  return getTaskDeadlineInfo(task).effective ?? task.due_date ?? null;
}

type DueState = 'overdue' | 'today' | 'upcoming' | 'none';

/** 타임라인 엔트리는 TASK 단위만 — 이벤트 묶음은 표시하지 않는다 */
interface PersonalTimelineEntry {
  id: string;
  title: string;
  context: string;
  startDate: Date;
  endDate: Date;
  taskId: string;
  /** 이 회차(또는 단일 마감 task)를 내가 이미 완료했는지 — 마감일까지 '완료' 상태로 표시 */
  completed: boolean;
}

function parseDashboardDate(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);
  return date;
}

function getDueState(dueDate?: string | null): DueState {
  const due = parseDashboardDate(dueDate);
  if (!due) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (due.getTime() < today.getTime()) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

const dueStyles: Record<DueState, { dot: string; badge: string; label: string }> = {
  overdue: { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700', label: '기한 초과' },
  today: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', label: '오늘 마감' },
  upcoming: { dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500', label: '마감' },
  none: { dot: 'bg-slate-200', badge: 'text-slate-400', label: '마감 없음' },
};

const timelineStyles = {
  overdue: {
    badge: 'bg-rose-50 text-rose-700',
    dot: 'border-rose-500 bg-rose-500 ring-rose-100',
  },
  today: {
    badge: 'bg-amber-50 text-amber-700',
    dot: 'border-amber-500 bg-amber-500 ring-amber-100',
  },
  upcoming: {
    badge: 'bg-emerald-50 text-emerald-700',
    dot: 'border-emerald-500 bg-emerald-500 ring-emerald-100',
  },
  completed: {
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'border-emerald-300 bg-emerald-300 ring-emerald-50',
  },
} as const;

function getPersonalTimelineEntries(
  assignedTasks: DashboardTask[],
  currentResourceId: string | undefined,
): PersonalTimelineEntry[] {
  // 완료한 업무(회차)도 마감일까지는 '완료' 상태로 타임라인에 남긴다.
  // 미완료는 기한이 지나도 유지(기한 초과 표시), 완료는 마감일이 지나면 제거.
  const today = todayDateString();
  return assignedTasks
    .flatMap((task) => {
      const assigneeCompleted = isMyTaskCompleted(task, currentResourceId);
      const deadlines = getTaskDeadlines(task);
      const progress = getDeadlineProgress(task);
      const isMulti = deadlines.length > 1;
      return deadlines.flatMap((deadline) => {
        // 다중 마감은 회차별 완료 기록, 단일 마감은 담당자(본인) 상태로 판정.
        // 단 task 자체가 완료면 회차 기록과 무관하게 끝난 것으로 본다(업무가 종료된 것이므로)
        const completed = isMulti
          ? assigneeCompleted
            || Boolean(currentResourceId && isRoundCompleted(progress, deadline, currentResourceId))
          : assigneeCompleted;
        if (completed && deadline < today) return [];
        const dueDate = parseDashboardDate(deadline);
        if (!dueDate) return [];
        return [{
          id: `task-${task.id}-${deadline}`,
          title: task.title,
          context: task.event_name || '할 일',
          startDate: dueDate,
          endDate: dueDate,
          taskId: task.id,
          completed,
        }];
      });
    })
    .sort((first, second) => {
      const dateDifference = first.startDate.getTime() - second.startDate.getTime();
      if (dateDifference !== 0) return dateDifference;
      return first.title.localeCompare(second.title);
    });
}

function formatTimelineDate(entry: PersonalTimelineEntry) {
  const format = (date: Date) =>
    date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  const start = format(entry.startDate);
  const end = format(entry.endDate);
  return start === end ? start : `${start}–${end}`;
}

function PersonalTaskTimeline({
  entries,
  onSelect,
}: {
  entries: PersonalTimelineEntry[];
  onSelect: (entry: PersonalTimelineEntry) => void;
}) {
  const { isDragging, dragScrollProps } = useDragScroll<HTMLDivElement>();

  return (
    <section
      className="mb-4 min-w-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3"
      aria-label="내 할 일 타임라인"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarRange className="h-4 w-4 flex-shrink-0 text-indigo-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800">개인 타임라인</p>
            <p className="text-[10px] text-slate-400">내 할 일을 마감일 순으로 표시합니다.</p>
          </div>
        </div>
        {entries.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-1.5 text-[10px] font-semibold">
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              할 일 {entries.length}
            </span>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl bg-white/80 px-3 py-4 text-center text-xs text-slate-400">
          마감일이 있는 할 일이 없습니다.
        </div>
      ) : (
        <div
          className={cn(
            'teacher-dashboard-filter-scroll min-w-0 cursor-grab overflow-x-auto pb-1',
            isDragging && 'cursor-grabbing select-none',
          )}
          {...dragScrollProps}
          title="마우스로 좌우로 드래그해 기간을 이동할 수 있습니다"
        >
          <div className="flex min-w-max items-start py-1">
            {entries.map((entry, index) => {
              const dueState = getDueState(entry.endDate.toISOString());
              const styles = entry.completed
                ? timelineStyles.completed
                : timelineStyles[dueState === 'none' ? 'upcoming' : dueState];
              const badgeLabel = entry.completed ? '완료' : '할 일';

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect(entry)}
                  className="group w-36 flex-shrink-0 rounded-xl px-1 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  title={`${badgeLabel} · ${entry.title} · ${formatTimelineDate(entry)}`}
                  aria-label={`할 일 ${entry.title}, ${formatTimelineDate(entry)}${entry.completed ? ', 완료됨' : ''}`}
                >
                  <p className="truncate px-1 text-[10px] font-semibold tabular-nums text-slate-500">
                    {formatTimelineDate(entry)}
                  </p>
                  <div className="relative my-1.5 flex h-4 items-center justify-center">
                    <span
                      className={cn(
                        'absolute top-1/2 h-px -translate-y-1/2 bg-slate-200',
                        entries.length === 1
                          ? 'hidden'
                          : index === 0
                            ? 'left-1/2 right-0'
                            : index === entries.length - 1
                              ? 'left-0 right-1/2'
                              : 'inset-x-0',
                      )}
                    />
                    <span
                      className={cn(
                        'relative z-10 h-3 w-3 rounded-full border-2 border-white ring-4 transition-transform group-hover:scale-125',
                        styles.dot,
                      )}
                    />
                  </div>
                  <div className="px-1">
                    <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold', styles.badge)}>
                      {badgeLabel}
                    </span>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-700">
                      {entry.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">{entry.context}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function TeacherTasksCard({
  myTasksData,
  currentResourceId,
  isLoading,
}: TeacherTasksCardProps) {
  const navigate = useNavigate();
  // 업무 클릭 시 페이지 이동 대신 상세 모달을 제자리에서 연다.
  // TaskDetailDialog는 events 캐시에서 라이브 task를 재조회하므로 대시보드 task를 그대로 넘겨도 된다.
  const [selectedTask, setSelectedTask] = useState<DashboardTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openTaskDetail = (task: DashboardTask) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };
  // 나의 업무 카드는 TASK 단위만 표시 — 내가 매니저인 이벤트(managed_tasks) 묶음은 제외
  const tasks = (myTasksData?.assigned_tasks ?? []) as DashboardTask[];
  const activeTasks = tasks
    .filter((task) => !isMyTaskCompleted(task, currentResourceId))
    .sort((a, b) => {
      const aDue = effectiveTaskDue(a);
      const bDue = effectiveTaskDue(b);
      if (!aDue) return 1;
      if (!bDue) return -1;
      return new Date(aDue).getTime() - new Date(bDue).getTime();
    });
  // 목록에 실제로 그리는 업무만 — 아래 행 렌더와 같은 기준(slice)이어야 한다
  const visibleTasks = activeTasks.slice(0, 5);
  // 실질 작업(WORK) 연결 여부 — 행마다 조회하지 않도록 보이는 업무를 한 번에 판정
  const workEntries = useTaskActionEntries(visibleTasks.map((task) => task.id));
  // 타임라인은 완료 업무도 포함(마감일까지 '완료' 표시)해야 하므로 전체 목록 기준
  const timelineEntries = getPersonalTimelineEntries(tasks, currentResourceId);
  const personalWorkCount = activeTasks.length;
  // 입력 요청 — 담당 할 일이 아니어도 내가 채울 차례인 입력 받기(2026-09-27). 내 할 일 구획과 같은 조회
  const { data: collectRequests = [] } = useMyCollectRequests();
  // 같은 제출 의무를 두 번 그리지 않는다(2026-10-05, 내 할 일과 같은 규칙 placeInboxRequests) —
  // 카드에 그린 할 일 행의 제출 요청은 그 행의 칩이 맡고, 요청 줄은 나머지(담당이 아닌 요청 · 5개 밖 할 일)만
  const placedRequests = placeInboxRequests(collectRequests, new Set(visibleTasks.map((task) => task.id)));
  const pendingRequests = placedRequests.section;
  const requestCount = pendingRequests.length + [...placedRequests.rows.values()].reduce((n, list) => n + list.length, 0);
  const [collectActionId, setCollectActionId] = useState<string | null>(null);
  const overdueCount = activeTasks.filter((task) => getDueState(effectiveTaskDue(task)) === 'overdue').length;
  const inProgressCount = activeTasks.filter(
    (task) => getMyTaskStatus(task, currentResourceId) === 'in_progress',
  ).length;

  return (
    <>
    {/* 이름은 메뉴와 같게 «내 할 일» (2026-10-06 — 종전 «나의 업무»·«TASK»·«개인 업무»가 메뉴 이름과 달랐다. 감사 §4-1) */}
    <DashboardCardShell
      title="내 할 일"
      icon={CheckSquare}
      accent="green"
      description={overdueCount > 0
        ? `기한이 지난 할 일 ${overdueCount}건을 먼저 확인하세요.`
        : requestCount > 0
          ? `입력·제출할 요청 ${requestCount}건이 남아 있습니다.`
          : '우선순위와 마감일을 한 번에 확인하세요.'}
      badge={personalWorkCount > 0 ? (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          {personalWorkCount}
        </span>
      ) : null}
      onAction={() => navigate('/work')}
      actionLabel="내 할 일로 이동"
    >
      {isLoading ? (
        <DashboardCardSkeleton />
      ) : personalWorkCount === 0 && timelineEntries.length === 0 && pendingRequests.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center text-center text-slate-500">
          <CheckSquare className="mb-3 h-8 w-8 text-emerald-300" />
          <p className="text-sm font-medium">진행할 할 일이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">새 할 일이 배정되면 이곳에 표시됩니다.</p>
        </div>
      ) : (
        <div>
          <div className="mb-3 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-slate-50 px-2 py-3">
            <div className="px-2 text-center">
              <p className="text-lg font-bold text-slate-900">{personalWorkCount}</p>
              <p className="text-[10px] font-medium text-slate-400">진행 대상</p>
            </div>
            <div className="px-2 text-center">
              <p className={`text-lg font-bold ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{overdueCount}</p>
              <p className="text-[10px] font-medium text-slate-400">기한 초과</p>
            </div>
            <div className="px-2 text-center">
              <p className="text-lg font-bold text-sky-600">{inProgressCount}</p>
              <p className="text-[10px] font-medium text-slate-400">진행 중</p>
            </div>
          </div>
          {/* 입력 요청 — 할 일 목록보다 위: 남이 내 입력을 기다리고 있다 */}
          <TaskCardCollectRequests
            requests={pendingRequests}
            onOpen={setCollectActionId}
            onMore={() => navigate('/work')}
          />
          {/* 할 일이 하나도 없고 입력 요청만 있으면 빈 타임라인 상자를 그리지 않는다 */}
          {(personalWorkCount > 0 || timelineEntries.length > 0) && (
            <PersonalTaskTimeline
              entries={timelineEntries}
              onSelect={(entry) => {
                const task = tasks.find((item) => item.id === entry.taskId);
                if (task) openTaskDetail(task);
              }}
            />
          )}
          <div className="divide-y divide-slate-100">
            {visibleTasks.map((task) => {
              const taskDue = effectiveTaskDue(task);
              const dueState = getDueState(taskDue);
              const styles = dueStyles[dueState];
              const status = getMyTaskStatus(task, currentResourceId);
              const workEntry = workEntries.get(task.id);
              const rowRequests = placedRequests.rows.get(task.id) ?? [];

              return (
                // WORK 버튼이 업무 이름 옆(행 안쪽)에 들어오므로 본문을 button으로 감쌀 수 없다
                // (button 안의 button은 유효하지 않은 DOM 중첩). 대신 행 전체를 덮는 투명 button을
                // 깔고 내용은 그 위에 얹는다 — 내용은 pointer-events-none이라 클릭이 오버레이로
                // 통과하고, 렌치만 pointer-events-auto로 자기 동작을 되찾는다.
                // z-index는 불필요: 위치 지정된 형제는 DOM 순서대로 그려지므로 오버레이가 맨 아래.
                <div
                  key={task.id}
                  className="teacher-dashboard-row relative flex w-full items-center gap-3 rounded-lg px-1 py-3"
                >
                  <button
                    type="button"
                    onClick={() => openTaskDetail(task)}
                    className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label={`${task.title} 상세 보기`}
                  />
                  <div className={`pointer-events-none relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${status === 'in_progress' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                    {dueState === 'overdue' ? <AlertCircle className="h-4 w-4 text-rose-600" /> : <CircleDotDashed className="h-4 w-4" />}
                  </div>
                  <div className="pointer-events-none relative min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1">
                      <p className="line-clamp-1 min-w-0 text-sm font-semibold text-slate-900">{task.title}</p>
                      {workEntry && (
                        <TaskActionButton
                          taskId={task.id}
                          taskTitle={task.title}
                          workflowId={workEntry.workflowId}
                          className="pointer-events-auto h-6 w-6"
                        />
                      )}
                    </div>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                      {rowRequests.length > 0 && (
                        <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {rowRequests.length > 1 ? `제출 ${rowRequests.length}건 남음` : `${REQUEST_KIND_LABEL[requestKindOf(rowRequests[0])]} 남음`}
                        </span>
                      )}
                      <span className="line-clamp-1 min-w-0">{task.event_name || task.event_description || '업무'}</span>
                    </p>
                  </div>
                  <div className="pointer-events-none relative flex flex-shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${styles.badge}`}>{styles.label}</span>
                    {taskDue && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(taskDue).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <span className={`pointer-events-none relative h-2 w-2 flex-shrink-0 rounded-full ${styles.dot}`} />
                </div>
              );
            })}
          </div>
          {activeTasks.length > 5 && (
            <p className="pt-3 text-center text-xs text-slate-400">
              그 외 할 일 {activeTasks.length - 5}개
            </p>
          )}
        </div>
      )}
    </DashboardCardShell>

    {/* 입력 요청 응답 창 — 내 할 일과 같은 창을 제자리에서 연다 */}
    <CollectRespondDialog
      actionId={collectActionId}
      open={collectActionId !== null}
      onOpenChange={(open) => { if (!open) setCollectActionId(null); }}
    />

    {/* 업무 상세 모달 — 페이지 이동 없이 제자리에서 열림. 선택 시에만 마운트해 events 쿼리를 아낀다 */}
    {selectedTask && (
      <TaskDetailDialog
        task={selectedTask as unknown as Task}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedTask(null);
        }}
      />
    )}
    </>
  );
}
