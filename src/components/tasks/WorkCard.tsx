/**
 * 업무 검색 탭의 업무 카드 (2026-09-27 개편 — 내 업무 관리 카드를 참고해 같은 모양으로).
 *
 * 종전엔 2열 그리드의 큰 카드(진행률 블록 · 통계 칸 3개 · 참여자 이니셜)였고 펼치면 할 일이 단순 목록이었다.
 * 지금은 내 업무 관리와 **같은 어휘**다: 한 줄 머리(이름 = 상세 · 상태 · 버튼) + 설명 + 작은 진행률,
 * 펼치면 같은 할 일 표(`WorkTaskTable`).
 *
 * ⚠️ 이 탭은 **내가 매니저가 아닌 업무도** 보인다. 그래서
 *   - 담당자 칸은 **명단이 아니라 개수**만 쓴다(담당자 명단 비노출 결정 — 종전 카드는 참여자 이니셜을
 *     모두에게 보였다). 매니저의 개입(남의 상태 토글)은 내 업무 관리에서 한다.
 *   - 마감일·순서 칸 편집과 [수정]은 **그 업무의 매니저에게만** 열린다(행마다 `isManager`).
 *   - 완료 토글은 없다 — 수행 진입점은 내 할 일 하나다(2026-09-04 사고).
 */
import { ArrowUpRight, Building2, ChevronDown, ListChecks, Pencil, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Work, Task, TaskAssigneeJsonb } from '@/types/tasks';
import { WorkflowLinkButton } from '@/features/task-workflow/components/WorkflowLinkButton';
import { TaskActionButton } from '@/features/task-workflow/components/TaskActionButton';
import type { TaskWorkflowEntityLink } from '@/features/task-workflow/types';
import { getStatusBadgeVariant, getStatusLabel, isWorkManager } from '@/lib/taskUtils';
import { getMyTaskStatus } from '@/lib/taskStatus';
import { getTaskDeadlines } from '@/lib/taskDeadlines';
import type { StepPlacement } from '@/lib/taskOrder';
import { TaskAssignmentIssueBadge } from './TaskAssignmentIssue';
import { type WorkTaskRow } from './WorkTaskTable';
import { WorkTaskTableWithActions } from './WorkTaskTableWithActions';
import { hasConnectedActions } from '@/lib/taskActionPresence';
import { formatTaskDue, sortWorkTasks } from '@/lib/workTaskRows';
import { useSearchParams } from 'react-router-dom';
import { PIPELINE_PARAM, PIPELINE_TASK_PARAM } from '@/lib/workPipelineLink';

interface WorkOverview extends Work {
  manager_id?: string;
  manager?: {
    id: string;
    name: string;
  } | null;
}

interface WorkCardProps {
  work: WorkOverview;
  expanded?: boolean;
  workflowLink?: TaskWorkflowEntityLink;
  taskWorkflowLinks?: Record<string, TaskWorkflowEntityLink>;
  /** 실행(실질 작업)이 연결된 task id 집합 — 「연결된 작업」 버튼 */
  workConnectedTaskIds?: Set<string>;
  /** 매니저 판정용 — 없으면 아무 편집도 열리지 않는다 */
  currentUserResourceId?: string | null;
  onSelect: (work: Work) => void;
  onToggle?: () => void;
  onViewDetail?: (work: Work) => void;
  onWorkEdit?: (work: Work) => void;
  onTaskDetail?: (task: Task) => void;
  onTaskEdit?: (task: Task) => void;
  onDueDateChange?: (taskId: string, due: string | null) => Promise<void>;
  onPlacementChange?: (work: Work, taskId: string, target: StepPlacement) => Promise<void>;
}

function getTaskAssignees(task: Task): TaskAssigneeJsonb[] {
  if (Array.isArray(task.meta?.assignees)) return task.meta.assignees;
  if (Array.isArray(task.assignees_jsonb)) return task.assignees_jsonb;
  return [];
}

export function WorkCard({
  work,
  expanded = false,
  workflowLink,
  taskWorkflowLinks = {},
  workConnectedTaskIds,
  currentUserResourceId = null,
  onSelect,
  onToggle,
  onViewDetail,
  onWorkEdit,
  onTaskDetail,
  onTaskEdit,
  onDueDateChange,
  onPlacementChange,
}: WorkCardProps) {
  const openDetail = () => (onViewDetail ? onViewDetail(work) : onSelect(work));
  const isManager = isWorkManager(work.manager_id, work.meta, currentUserResourceId);
  // 단계별 진행 — 책임자인 업무에만(전체 업무 범위의 다른 권한은 종전대로, 2026-10-06). 업무 관리 페이지가
  // `?pipeline=` 을 한 번 읽어 모달을 연다 — 주소를 바꾸지 않고 파라미터만 얹어 범위(?scope=all)를 지킨다
  const [searchParams, setSearchParams] = useSearchParams();
  const openPipeline = (task: Task) => {
    searchParams.set(PIPELINE_PARAM, work.id);
    searchParams.set(PIPELINE_TASK_PARAM, task.id);
    setSearchParams(searchParams);
  };
  const managers = work.meta?.managers?.length
    ? work.meta.managers
    : work.manager
      ? [work.manager]
      : [];

  const tasks = sortWorkTasks((work.tasks || []) as Task[]);
  const rows: WorkTaskRow[] = tasks.map((task, index) => {
    const orderNumber = task.type === 'procedural' ? (task.order_index ?? index + 1) : 0;
    return {
      task,
      orderNumber,
      isOneTime: task.type !== 'procedural' || orderNumber === 0,
      // 할 일 «전체» 상태 — 내 업무 관리와 같은 판정(taskStatus.ts 단일 출처)
      displayStatus: getMyTaskStatus(task, null),
      assignees: getTaskAssignees(task),
      isManager,
      // 개수만 그린다(아래 renderAssigneeSummary) — 명단은 어느 쪽에도 내보내지 않는다
      canViewAssignees: true,
      deadlines: getTaskDeadlines(task),
      dueLabel: formatTaskDue(task),
    };
  });
  const totalTasks = rows.length;
  const completedTasks = rows.filter(row => row.displayStatus === 'completed').length;
  const progress = Math.max(
    0,
    Math.min(100, work.progress_percentage ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0)),
  );
  const updated = new Date(work.updated_at || work.created_at).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/70 shadow-sm">
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          work.status === 'completed'
            ? 'bg-emerald-500'
            : work.status === 'cancelled'
              ? 'bg-slate-300'
              : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400',
        )}
      />

      <div className="px-3 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 sm:text-lg">
              <button
                type="button"
                onClick={openDetail}
                title={work.name}
                className="max-w-full truncate rounded text-left transition-colors hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {work.name}
              </button>
            </h3>
            {isManager && (
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" aria-label="관리 업무" />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant={getStatusBadgeVariant(work.status)} className="h-6 rounded-md px-2 text-[11px]">
              {getStatusLabel(work.status)}
            </Badge>
            {workflowLink && <WorkflowLinkButton link={workflowLink} />}
            {isManager && onWorkEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                aria-label={`${work.name} 수정`}
                title="업무 수정"
                onClick={() => onWorkEdit(work)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full transition-colors hover:bg-blue-50 hover:text-blue-600"
              aria-label={`${work.name} 상세 보기`}
              onClick={openDetail}
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {work.description?.trim() ? (
              <p className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-slate-700 sm:text-sm">
                {work.description}
              </p>
            ) : (
              <p className="text-xs italic text-slate-400 sm:text-sm">설명이 없습니다</p>
            )}
            {/* 남의 업무도 보이는 탭이라 «누구의 업무인가»를 함께 적는다 */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
              {work.meta?.department && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                  <Building2 className="h-3 w-3" />
                  {work.meta.department}
                </span>
              )}
              {managers.length > 0 && (
                <span className="truncate" title={managers.map(manager => manager.name).join(', ')}>
                  책임자 {managers[0].name}
                  {managers.length > 1 && ` 외 ${managers.length - 1}명`}
                </span>
              )}
              <span className="tabular-nums">수정 {updated}</span>
            </div>
          </div>
          <div className="hidden min-w-[100px] shrink-0 text-right sm:block">
            <div className="flex items-center space-x-2">
              <Progress value={progress} className="h-2 w-16" />
              <span className="text-xs font-medium tabular-nums">{progress}%</span>
            </div>
            <div className="mt-1 text-xs tabular-nums text-slate-500">
              {completedTasks}/{totalTasks} 완료
            </div>
          </div>
        </div>
      </div>

      {totalTasks > 0 && (
        <div className="border-t border-slate-100">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`search-work-tasks-${work.id}`}
            onClick={onToggle}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
          >
            <span className="flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-blue-500" />
              세부 할 일 {totalTasks}개
              <span className="font-normal text-slate-400">
                · 완료 {completedTasks}/{totalTasks}
              </span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', expanded && 'rotate-180')} />
          </button>

          {expanded && (
            <div
              id={`search-work-tasks-${work.id}`}
              className="border-t border-slate-100 bg-slate-50/60 px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-5"
            >
              <WorkTaskTableWithActions
                onOpenPipeline={isManager ? openPipeline : undefined}
                canManage={() => isManager}
                workflowIdOf={(taskId) => taskWorkflowLinks[taskId]?.workflowId ?? null}
                rows={rows}
                isUpdating={false}
                onDueDateChange={onDueDateChange}
                onPlacementChange={
                  onPlacementChange ? (taskId, target) => onPlacementChange(work, taskId, target) : undefined
                }
                onOpenDetail={task => (onTaskDetail ? onTaskDetail(task) : openDetail())}
                onOpenEdit={onTaskEdit}
                renderIssueBadge={task => <TaskAssignmentIssueBadge task={task} />}
                renderWorkflowLink={task => (
                  // 내 업무 관리와 같은 규칙 — 연결된 작업은 늘 아이콘만, 워크플로는 업무 카드 머리에만
                  <TaskActionButton
                    taskId={task.id}
                    taskTitle={task.title}
                    workflowId={taskWorkflowLinks[task.id]?.workflowId ?? null}
                    connected={hasConnectedActions(task, workConnectedTaskIds)}
                    manageable={isManager}
                    variant="compact"
                  />
                )}
                renderAssigneeSummary={row => {
                  const done = row.assignees.filter(assignee => assignee.status === 'completed').length;
                  return (
                    <span className="text-[11px] tabular-nums text-slate-500">
                      완료 {done}/{row.assignees.length}명
                    </span>
                  );
                }}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
