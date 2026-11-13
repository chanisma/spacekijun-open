import { createPortal } from 'react-dom';
import { TaskAssignmentIssueBadge } from './TaskAssignmentIssue';
// ========================================
// Integrated Task View Component
// 업무와 할 일을 통합 표시하는 직관적인 화면
// ========================================

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useQueryClient } from '@tanstack/react-query';
import { useWorksJsonb, useMyTasksJsonb, useToggleAssigneeStatusJsonb, useToggleDeadlineStatusJsonb, useToggleUnitStatusJsonb, useUpdateWorkJsonb, useUpdateTaskJsonb, useReorderTasksJsonb } from '@/hooks/useTasksJsonb';
import { getTaskUnits, getUnitProgress } from '@/lib/taskUnits';
import { useCurrentUserResourceId } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useTaskOrders } from '@/hooks/useTaskOrders';
import { useTaskDisplayHelpers } from '@/hooks/useTaskDisplay';
import { WorkflowLinkButton } from '@/features/task-workflow/components/WorkflowLinkButton';
import { TaskActionButton } from '@/features/task-workflow/components/TaskActionButton';
import { useTaskWorkflowEntityLinks } from '@/features/task-workflow/hooks/useTaskWorkflows';
import { useConnectedWorkTaskIds } from '@/features/task-workflow/hooks/useTaskActions';
import { hasConnectedActions } from '@/lib/taskActionPresence';
import { Work, Task, type TaskAssigneeJsonb } from '@/types/tasks';
import { cn } from '@/lib/utils';
import { WorkDetailDialog } from './WorkDetailDialog';
import { TaskDetailDialog } from './TaskDetailDialog';
import { WorkPipelineDialog } from './pipeline/WorkPipelineDialog';
import { TaskAssigneeSummary } from './TaskAssigneeSummary';
import { WorkTaskTableWithActions } from './WorkTaskTableWithActions';
import { TaskAssigneeEditDialog } from './TaskAssigneeEditDialog';
import { formatTaskDue, sortWorkTasks } from '@/lib/workTaskRows';
import {
  getStatusLabel,
  getStatusBadgeVariant as getStatusBadgeVariantUtil,
  isWorkManager as checkIsWorkManager,
  determineUserRole,
  sortTasksByOrder,
  type UserRole,
} from '@/lib/taskUtils';
import { getDeadlineProgress, getTaskDeadlineInfo, getTaskDeadlines } from '@/lib/taskDeadlines';
import { planStepPlacement, type StepOrderTask, type StepPlacement } from '@/lib/taskOrder';

import {
  Calendar,
  User,
  UserCircle,
  UserCheck,
  Settings,
  ShieldCheck,
  CheckCircle,
  ArrowUpRight,
  PlayCircle,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ListChecks,
  Circle,
  Pencil,
  Route
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MY_TASKS_PATH } from '@/lib/taskTabs';
import { workCompleteConfirmMessage } from '@/lib/taskStatus';

// 펼침 상태는 사용자별 화면 취향이라 localStorage에 남긴다(서버 저장 대상 아님).
// 삭제된 업무 id가 남아도 무해하므로 별도 정리 없이 상한만 둔다.
const EXPANDED_EVENTS_STORAGE_KEY = 'task-mywork-expanded-works-v1';
const EXPANDED_EVENTS_STORAGE_LIMIT = 200;

function readExpandedWorks(): Set<string> {
  try {
    const raw = window.localStorage.getItem(EXPANDED_EVENTS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeExpandedWorks(workIds: Set<string>) {
  try {
    window.localStorage.setItem(
      EXPANDED_EVENTS_STORAGE_KEY,
      JSON.stringify([...workIds].slice(-EXPANDED_EVENTS_STORAGE_LIMIT))
    );
  } catch {
    // 저장 실패(프라이빗 모드 등)는 무시 — 펼침 상태는 화면에만 유지된다.
  }
}

/** 표시 상태는 서버 값만 본다 — 개인 상태 낙관적 덮어쓰기는 담당자 칩 쪽에서만 쓴다 */
const NO_STATUS_OVERRIDES: Record<string, string> = {};

interface IntegratedTaskViewProps {
  summaryContainer?: HTMLElement | null;
  toolbarContainer?: HTMLElement | null;
  onWorkEdit?: (work: Work) => void;
  onTaskEdit?: (task: Task) => void;
  filter?: 'all' | 'active' | 'completed' | 'pending';
}

interface ExtendedWork extends Work {
  tasks?: Task[];
  userRole?: 'assigned' | 'manager' | 'both' | 'none';
  isExpanded?: boolean;
}

interface HoverDescriptionProps {
  description?: string | null;
  emptyText?: string;
  className?: string;
}

function HoverDescription({
  description,
  emptyText = '설명이 없습니다',
  className,
}: HoverDescriptionProps) {
  const content = description?.trim();

  if (!content) {
    return (
      <p className={cn('text-muted-foreground/70', className)}>
        {emptyText}
      </p>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={250}>
        <TooltipTrigger asChild>
          <p
            tabIndex={0}
            className={cn('cursor-help break-words', className)}
          >
            {content}
          </p>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-h-64 max-w-md overflow-y-auto whitespace-pre-wrap break-words"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function IntegratedTaskView({
  onWorkEdit,
  onTaskEdit,
  filter = 'all',
  toolbarContainer,
  summaryContainer
}: IntegratedTaskViewProps) {
  // 기본값은 "모두 접힘" — 업무·할 일이 많을 때 목록을 훑기 위한 서랍식 표시.
  const [expandedWorks, setExpandedWorks] = useState<Set<string>>(readExpandedWorks);
  const [taskStatuses, setTaskStatuses] = useState<{[key: string]: string}>({});
  const [assigneeStatusOverrides, setAssigneeStatusOverrides] = useState<
    Record<string, TaskAssigneeJsonb['status']>
  >({});
  const [updatingAssigneeKey, setUpdatingAssigneeKey] = useState<string | null>(null);
  // ✅ task order_index도 별도 hook으로 최적화
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [workDetailOpen, setWorkDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  /** 업무 진행 모달(2026-09-27) — 목록 위에 띄워 닫으면 보던 자리로 돌아온다 */
  // 닫아도 업무 id 는 남겨 둔다 — 지우면 닫히는 애니메이션 도중 본문이 먼저 사라진다
  const [pipelineWorkId, setPipelineWorkId] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  // 할 일 행의 [진행]으로 열면 그 할 일을 고른 채로 연다 (업무 카드의 [진행]은 null)
  const [pipelineTaskId, setPipelineTaskId] = useState<string | null>(null);
  // 파일 제출 할 일의 업로드 화면. 어느 할 일을 여는지가 곧 열림 상태다.
  // 매니저 여부는 카드를 그릴 때 이미 계산돼 있으므로 함께 담는다(다이얼로그에서 재유도하지 않음).
  // 담당자 바꾸기 — task 는 닫힌 뒤에도 남겨 둔다(지우면 닫힘 애니메이션 없이 사라진다)
  const [assigneeEditTask, setAssigneeEditTask] = useState<Task | null>(null);
  const [assigneeEditOpen, setAssigneeEditOpen] = useState(false);
  // ✅ 기존 hook 재사용으로 중복 제거
  const { data: currentUserResourceId } = useCurrentUserResourceId();
  const { toast } = useToast();

  const { data: works, isLoading: eventsLoading } = useWorksJsonb();
  const { data: myTasks } = useMyTasksJsonb(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateTaskMutation = useUpdateTaskJsonb();
  const toggleAssigneeStatusMutation = useToggleAssigneeStatusJsonb();
  const toggleDeadlineStatusMutation = useToggleDeadlineStatusJsonb();
  const [updatingRoundKey, setUpdatingRoundKey] = useState<string | null>(null);
  const toggleUnitStatusMutation = useToggleUnitStatusJsonb();
  const [updatingUnitKey, setUpdatingUnitKey] = useState<string | null>(null);
  const updateWorkMutation = useUpdateWorkJsonb();
  const reorderTasksMutation = useReorderTasksJsonb();

  // ✅ 모든 태스크 ID 수집하여 order_index 조회
  const allTaskIds = useMemo(() => {
    if (!myTasks) return [];
    const assigned = myTasks.assigned_tasks?.map((task: any) => task.id) || [];
    const managed = myTasks.managed_tasks?.map((task: any) => task.id) || [];
    return [...assigned, ...managed];
  }, [myTasks]);

  const { data: taskOrderMap = {} } = useTaskOrders(allTaskIds);

  // ✅ Task display helpers - extracted to reusable hook
  const assignedTaskIds = useMemo(() =>
    myTasks?.assigned_tasks?.map((t: any) => t.id) || [],
    [myTasks?.assigned_tasks]
  );
  const managedTaskIds = useMemo(() =>
    myTasks?.managed_tasks?.map((t: any) => t.id) || [],
    [myTasks?.managed_tasks]
  );

  const {
    getTaskDisplayStatus,
    isRelated: isTaskRelated,
    // 내 업무는 **관리 화면**이다(2026-09-21) — 카드가 말해야 하는 것은 "내가 끝냈나"가 아니라
    // "이 할 일이 끝났나"다. 사용자 id 를 넘기지 않으면 판정이 task 전체 상태로 떨어진다.
    // 내 개인 상태는 담당자 칩(N/M + 명단)에 그대로 보이고, 수행은 '내 할 일'에서 한다.
  } = useTaskDisplayHelpers(null, NO_STATUS_OVERRIDES, {
    filter,
    assignedTaskIds,
    managedTaskIds,
  });


  // 업무와 내 할 일을 통합하여 처리
  const integratedWorks: any[] = works?.map((work: any) => {
    // 내 할 일에서 이 업무와 관련된 할 일들 찾기
    const assignedTasks = myTasks?.assigned_tasks?.filter(
      (task: any) => task.event_id === work.id
    ) || [];

    const managedTasks = myTasks?.managed_tasks?.filter(
      (task: any) => task.event_id === work.id
    ) || [];

    // "전체" 필터일 때는 모든 task를 표시하기 위해 work.tasks 사용
    const allWorkTasks = work.tasks || [];

    // 사용자 역할 결정 - 업무의 manager 확인
    const isManager = checkIsWorkManager(
      work.manager_id,
      work.meta,
      currentUserResourceId
    );
    const hasAssignedTasks = assignedTasks.length > 0;
    const userRole = determineUserRole(isManager, hasAssignedTasks);


    // 매니저는 자기 업무의 **모든** 할 일을 본다 — 필터는 업무 상태만 거른다.
    // (예전엔 '진행중' 필터에서 나와 관련된 할 일만 보여, 같은 업무가 필터마다 다른 모양이었다.)
    const tasksToShow: Task[] = allWorkTasks;

    return {
      ...work,
      tasks: tasksToShow,
      userRole,
      isExpanded: expandedWorks.has(work.id)
    };
  }) || [];

  // ── 관리와 수행을 갈랐다 (2026-09-21) ───────────────────────────────────────
  // 여기는 **내가 매니저인 업무**만 보인다. 담당자이기만 한 업무는 '내 할 일'(`/my-tasks`)에서
  // 수행한다 — 완료·제출·과제 단위 선택의 진입점이 한 곳이어야 "제출 없이 완료" 같은 우회로를
  // 한 곳에서만 지키면 된다(2026-09-04 사고는 진입점이 둘이라 생겼다).
  const filteredWorks = integratedWorks.filter(work => {
    if (work.userRole !== 'manager' && work.userRole !== 'both') return false;
    // 업무 「대기」는 은퇴했다(2026-10-05 — 숨김은 할 일의 «담당자에게 보이는 날»이 맡는다).
    // 혹시 남은 옛 대기 업무는 진행중으로 본다 — 어느 필터에도 안 걸려 사라지면 안 된다.
    const status = work.status === 'pending' ? 'active' : work.status;
    return filter === 'all' || status === filter;
  });

  const sortedWorks = filter === 'all'
    ? [...filteredWorks].sort((a, b) => a.name.localeCompare(b.name))
    : filteredWorks;
  const workflowWorkIds = sortedWorks.map(work => work.id);
  const workflowTaskIds = sortedWorks.flatMap(work =>
    (work.tasks || []).map((task: Task) => task.id)
  );
  const { data: workflowLinks = { works: {}, tasks: {} } } =
    useTaskWorkflowEntityLinks(workflowWorkIds, workflowTaskIds);
  // 연결된 작업 여부 — 할 일 행의 렌치 아이콘을 진하게(연결 있음)/흐리게(없음) 그리는 판정
  const { data: workConnectedTaskIds } = useConnectedWorkTaskIds(workflowTaskIds);

  const toggleWorkExpansion = (workId: string) => {
    setExpandedWorks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(workId)) {
        newSet.delete(workId);
      } else {
        newSet.add(workId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    writeExpandedWorks(expandedWorks);
  }, [expandedWorks]);

  // 현재 필터에 보이는 업무 중 펼칠 내용이 있는 것들만 일괄 토글 대상으로 삼는다.
  const expandableWorkIds = sortedWorks
    .filter(work => (work.tasks?.length || 0) > 0)
    .map(work => work.id);
  const allExpanded =
    expandableWorkIds.length > 0 &&
    expandableWorkIds.every(workId => expandedWorks.has(workId));
  const visibleTaskCount = sortedWorks.reduce(
    (total, work) => total + (work.tasks?.length || 0),
    0
  );

  const toggleAllWorks = () => {
    setExpandedWorks(previous => {
      const next = new Set(previous);
      if (allExpanded) {
        expandableWorkIds.forEach(workId => next.delete(workId));
      } else {
        expandableWorkIds.forEach(workId => next.add(workId));
      }
      return next;
    });
  };

  const handleWorkDelete = (workId: string) => {
    // Refresh the works list and my tasks after deletion
    queryClient.invalidateQueries({ queryKey: ['task-works'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    
    // Close the detail dialog if it was showing the deleted work
    if (selectedWork?.id === workId) {
      setWorkDetailOpen(false);
      setSelectedWork(null);
    }
  };


  // 회차별 완료 토글(다중 마감 할 일) — 서버 RPC가 권한 검증·담당자 상태 파생·집계까지 수행
  const handleRoundStatusChange = async (
    taskId: string,
    assignee: TaskAssigneeJsonb,
    deadline: string,
    nextStatus: 'pending' | 'completed',
    canEditAll: boolean
  ) => {
    if (!currentUserResourceId) {
      toast({ title: '오류', description: '사용자 정보를 확인할 수 없습니다.', variant: 'destructive' });
      return;
    }
    if (!canEditAll && assignee.id !== currentUserResourceId) {
      toast({ title: '권한 없음', description: '본인의 회차 상태만 변경할 수 있습니다.', variant: 'destructive' });
      return;
    }
    setUpdatingRoundKey(`${assignee.id}|${deadline}`);
    try {
      await toggleDeadlineStatusMutation.mutateAsync({
        taskId,
        assigneeId: assignee.id,
        deadline,
        status: nextStatus,
      });
      toast({
        title: '회차 상태 변경',
        description: `${assignee.name?.trim() || '담당자'}님의 ${deadline} 회차를 ${
          nextStatus === 'completed' ? '완료' : '미완료'
        }로 변경했습니다.`,
      });
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '회차 상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRoundKey(null);
    }
  };

  // 과제 단위 선택(claim)/해제/완료 — 서버 RPC가 범주 소속·권한 검증과 파생까지 수행
  const handleUnitStatusChange = async (
    taskId: string,
    unitKey: string,
    assignee: TaskAssigneeJsonb,
    nextStatus: 'pending' | 'completed' | null,
    canEditAll: boolean
  ) => {
    if (!currentUserResourceId) {
      toast({ title: '오류', description: '사용자 정보를 확인할 수 없습니다.', variant: 'destructive' });
      return;
    }
    if (!canEditAll && assignee.id !== currentUserResourceId) {
      toast({ title: '권한 없음', description: '본인의 단위만 변경할 수 있습니다.', variant: 'destructive' });
      return;
    }
    setUpdatingUnitKey(`${assignee.id}|${unitKey}`);
    try {
      await toggleUnitStatusMutation.mutateAsync({
        taskId,
        unitKey,
        assigneeId: assignee.id,
        status: nextStatus,
      });
      toast({
        title: '과제 단위',
        description:
          nextStatus === null
            ? '단위 선택을 해제했습니다.'
            : nextStatus === 'completed'
              ? '단위를 완료로 표시했습니다.'
              : '단위를 선택했습니다. 완료하면 눌러서 표시해주세요.',
      });
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '단위 상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUnitKey(null);
    }
  };

  /**
   * 표의 마감일 칸에서 바로 고치기 (2026-09-24).
   *
   * ⚠️ **단일 마감에만 쓴다** — 다중 마감의 정본은 `meta.deadlines` 이고 `due_date` 는 그
   * «다음 회차»의 사본이라, 칸에서 날짜만 바꾸면 둘이 조용히 어긋나고 회차 기록까지 남는다.
   * 표가 회차 있는 할 일에는 칸 대신 「N회」 칩(편집 창)을 그려 여기로 오지 않게 한다.
   */
  const handleInlineDueDateChange = async (taskId: string, due: string | null) => {
    await updateTaskMutation.mutateAsync({ id: taskId, data: { due_date: due } as never });
    // 이 파일의 `toast` 는 `useToast()` 어댑터라 객체 형태로 부른다(`@/lib/toast` 와 혼동 말 것)
    toast({ title: due ? `마감일을 ${due} 로 바꿨습니다` : '마감일을 지웠습니다' });
  };

  // 순서 칸 — 한 할 일을 옮기면 그 업무의 절차 번호를 1부터 다시 매긴다(계획 = taskOrder.ts)
  const handleTaskPlacementChange = async (workTasks: StepOrderTask[], taskId: string, target: StepPlacement) => {
    const changes = planStepPlacement(workTasks, taskId, target);
    if (changes.length === 0) return;
    await reorderTasksMutation.mutateAsync(changes);
  };

  const handleAssigneeCardStatusChange = async (
    taskId: string,
    assignee: TaskAssigneeJsonb,
    canEditAll: boolean
  ) => {
    if (!currentUserResourceId) {
      toast({
        title: '오류',
        description: '사용자 정보를 확인할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!canEditAll && assignee.id !== currentUserResourceId) {
      toast({
        title: '권한 없음',
        description: '본인의 담당 상태만 변경할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    const assigneeKey = `${taskId}:${assignee.id}`;
    const newStatus: TaskAssigneeJsonb['status'] =
      assignee.status === 'completed' ? 'pending' : 'completed';
    const previousTaskStatusOverride = taskStatuses[taskId];
    const isCurrentUserAssignee = assignee.id === currentUserResourceId;

    setUpdatingAssigneeKey(assigneeKey);
    setAssigneeStatusOverrides(previous => ({
      ...previous,
      [assigneeKey]: newStatus,
    }));
    if (isCurrentUserAssignee) {
      setTaskStatuses(previous => ({
        ...previous,
        [taskId]: newStatus,
      }));
    }

    try {
      await toggleAssigneeStatusMutation.mutateAsync({
        taskId,
        assigneeId: assignee.id,
        status: newStatus,
      });

      setAssigneeStatusOverrides(previous => {
        const next = { ...previous };
        delete next[assigneeKey];
        return next;
      });
      if (isCurrentUserAssignee) {
        setTaskStatuses(previous => {
          const next = { ...previous };
          delete next[taskId];
          return next;
        });
      }
      toast({
        title: '담당자 상태 변경',
        description: `${assignee.name?.trim() || '담당자'}님을 ${
          newStatus === 'completed' ? '완료' : '진행 중'
        } 상태로 변경했습니다.`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : '담당자 상태를 변경하지 못했습니다.';
      console.error('Assignee status update failed:', errorMessage, error);
      setAssigneeStatusOverrides(previous => {
        const next = { ...previous };
        delete next[assigneeKey];
        return next;
      });
      if (isCurrentUserAssignee) {
        setTaskStatuses(previous => {
          const next = { ...previous };
          if (previousTaskStatusOverride) {
            next[taskId] = previousTaskStatusOverride;
          } else {
            delete next[taskId];
          }
          return next;
        });
      }
      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setUpdatingAssigneeKey(null);
    }
  };

  const getRoleIcon = (role: string | undefined) => {
    switch (role) {
      case 'assigned':
        return <User className="h-4 w-4 text-blue-600" aria-label="내 담당 할 일" />;
      case 'manager':
        return <Settings className="h-4 w-4 text-green-600" aria-label="내 관리 할 일" />;
      case 'both':
        return <UserCheck className="h-4 w-4 text-purple-600" aria-label="담당+관리" />;
      default:
        return null;
    }
  };

  const getTaskRoleIcon = (task: any) => {
    const isAssigned = myTasks?.assigned_tasks?.some((t: any) => t.id === task.id);
    const isManaged = myTasks?.managed_tasks?.some((t: any) => t.id === task.id);

    if (isAssigned && isManaged) {
      return <UserCheck className="flex-shrink-0 h-4 w-4 text-purple-600" aria-label="담당+관리" />;
    } else if (isAssigned) {
      return <UserCircle className="flex-shrink-0 h-4 w-4 text-blue-600" aria-label="내 담당" />;
    }
    // 관리자 아이콘은 표시하지 않음
    return null;
  };

  // Helper function to check if current user is an assignee of the task
  const isUserAssignedToTask = (taskId: string): boolean => {
    return myTasks?.assigned_tasks?.some((t: any) => t.id === taskId) || false;
  };

  // Use shared utility for status badge variant
  const getStatusBadgeVariant = (status: string) => {
    return getStatusBadgeVariantUtil(status);
  };

  const handleWorkStatusChange = async (workId: string, newStatus: string) => {
    // 완료로 바꾸면 남은 할 일이 담당자들의 내 할 일에서 내려간다 — 남은 것이 있을 때만 묻는다(2026-10-05)
    const work = sortedWorks.find((w) => w.id === workId);
    if (newStatus === 'completed' && work && work.status !== 'completed') {
      const message = workCompleteConfirmMessage(work.name, work.tasks);
      if (message && !window.confirm(message)) return;
    }
    try {
      await updateWorkMutation.mutateAsync({
        id: workId,
        data: { status: newStatus }
      });
    } catch (error) {
      console.error('Work status update failed:', error);
      toast({ title: '오류', description: '업무 상태 업데이트 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const summary = (
    <p className="whitespace-nowrap text-xs text-slate-500">
        업무 {sortedWorks.length}개 · 할 일 {visibleTaskCount}개
      </p>
  );

  const toolbar = expandableWorkIds.length > 0 ? (
    <div className="flex shrink-0 items-center gap-3">
      {summaryContainer === undefined ? summary : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        aria-expanded={allExpanded}
        aria-label={allExpanded ? '모두 접기' : '모두 펼치기'}
        title={allExpanded ? '모두 접기' : '모두 펼치기'}
        onClick={toggleAllWorks}
      >
        {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
      </Button>
    </div>
  ) : null;

  if (eventsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">

      {summaryContainer && createPortal(summary, summaryContainer)}
      {toolbarContainer ? createPortal(toolbar, toolbarContainer) : toolbarContainer === undefined ? toolbar : null}

      {/* 업무 목록 — 카드의 relative는 필수다. 카드 안 absolute 요소(sr-only 등)에
          위치 지정된 조상이 없으면 컨테이닝 블록이 문서가 되어 main의 overflow를 뚫고
          문서 높이를 늘린다(= 스크롤바 이중 발생). 업무 탭 WorkCard도 같은 이유로 relative. */}
      <div className="space-y-3">
        {sortedWorks.length === 0 ? (
          <ImprovedCard>
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {filter === 'all' ? '내가 관리하는 업무가 없습니다' :
                 filter === 'active' ? '진행 중인 업무가 없습니다' :
                 '완료된 업무가 없습니다'}
              </h3>
              <p className="text-gray-600 mb-4">
                여기에는 내가 책임자인 업무만 보입니다. 담당자로 배정된 할 일은{' '}
                <button
                  type="button"
                  onClick={() => navigate(MY_TASKS_PATH)}
                  className="font-medium text-blue-600 hover:underline"
                >
                  내 할 일
                </button>
                에서 수행합니다.
              </p>
            </CardContent>
          </ImprovedCard>
        ) : (
          sortedWorks.map((work) => (
            <ImprovedCard
              key={work.id}
              className="relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/70"
            >
              <CardHeader className="px-3 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {/* 이름 = 상세 (2026-09-26 — 할 일 제목과 같은 동작) */}
                      <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 sm:text-lg">
                        <button
                          type="button"
                          onClick={clickEvent => {
                            clickEvent.stopPropagation();
                            setSelectedWork(work);
                            setWorkDetailOpen(true);
                          }}
                          title={work.name}
                          className="max-w-full truncate rounded text-left transition-colors hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {work.name}
                        </button>
                      </h3>
                      {(work.userRole === 'manager' || work.userRole === 'both') && (
                        <ShieldCheck
                          className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5"
                          aria-label="관리 업무"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {(work.userRole === 'manager' || work.userRole === 'both') ? (
                      <div className="hidden items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 sm:flex">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clickEvent => {
                            clickEvent.stopPropagation();
                            handleWorkStatusChange(work.id, 'active');
                          }}
                          className={cn(
                            'h-7 px-2 text-xs',
                            work.status === 'active' || work.status === 'pending'
                              ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:text-white'
                              : 'text-blue-700 hover:bg-blue-50 hover:text-blue-800'
                          )}
                        >
                          <PlayCircle className="mr-1 h-3.5 w-3.5" />
                          진행 중
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clickEvent => {
                            clickEvent.stopPropagation();
                            handleWorkStatusChange(work.id, 'completed');
                          }}
                          className={cn(
                            'h-7 px-2 text-xs',
                            work.status === 'completed'
                              ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white'
                              : 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
                          )}
                        >
                          <CheckCircle className="mr-1 h-3.5 w-3.5" />
                          완료
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant={getStatusBadgeVariant(work.status)}
                        className="hidden sm:inline-flex"
                      >
                        {getStatusLabel(work.status)}
                      </Badge>
                    )}
                    {workflowLinks.works[work.id] && (
                      <WorkflowLinkButton
                        link={workflowLinks.works[work.id]}
                      />
                    )}
                    {/* 업무 진행 화면 (2026-09-27) — 단계별로 앞 단계 산출물을 받아 쓰는 자리 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 rounded-full px-2 text-xs text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                      aria-label={`${work.name} 단계별 진행`}
                      title="단계별 진행"
                      onClick={clickEvent => {
                        clickEvent.stopPropagation();
                        setPipelineWorkId(work.id);
                        setPipelineTaskId(null);
                        setPipelineOpen(true);
                      }}
                    >
                      <Route className="h-4 w-4" />
                      {/* 휴대폰에서도 글자를 남긴다 — 아이콘만이면 렌치·연필과 함께 «어딘가로 가는 버튼»으로만 읽혔다(2026-10-06) */}
                      <span className="sm:hidden">진행</span>
                      <span className="hidden sm:inline">단계별 진행</span>
                    </Button>
                    {/* 편집 창 직행 (2026-09-26 사용자 요청) — 상세를 거치지 않는다 */}
                    {onWorkEdit && (work.userRole === 'manager' || work.userRole === 'both') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        aria-label={`${work.name} 수정`}
                        title="업무 수정"
                        onClick={clickEvent => {
                          clickEvent.stopPropagation();
                          onWorkEdit(work);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full transition-colors hover:bg-blue-50 hover:text-blue-600"
                      aria-label={`${work.name} 상세 보기`}
                      onClick={clickEvent => {
                        clickEvent.stopPropagation();
                        setSelectedWork(work);
                        setWorkDetailOpen(true);
                      }}
                    >
                      {/* 할 일 카드의 상세 보기와 같은 대각선 화살표 — "이동" 의미 통일 (구 ... 아이콘) */}
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {work.description?.trim() ? (
                      <HoverDescription
                        description={work.description}
                        className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-slate-700 sm:text-sm"
                      />
                    ) : (
                      <p className="text-xs italic text-slate-400 sm:text-sm">
                        설명이 없습니다
                      </p>
                    )}
                  </div>
                  {(work.userRole === 'manager' || work.userRole === 'both') ? (
                    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 sm:hidden">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="진행 중으로 변경"
                        onClick={clickEvent => {
                          clickEvent.stopPropagation();
                          handleWorkStatusChange(work.id, 'active');
                        }}
                        className={cn(
                          'h-7 w-7 p-0',
                          work.status === 'active' || work.status === 'pending'
                            ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:text-white'
                            : 'text-blue-700 hover:bg-blue-50 hover:text-blue-800'
                        )}
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="완료로 변경"
                        onClick={clickEvent => {
                          clickEvent.stopPropagation();
                          handleWorkStatusChange(work.id, 'completed');
                        }}
                        className={cn(
                          'h-7 w-7 p-0',
                          work.status === 'completed'
                            ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white'
                            : 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
                        )}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      variant={getStatusBadgeVariant(work.status)}
                      className="shrink-0 sm:hidden"
                    >
                      {getStatusLabel(work.status)}
                    </Badge>
                  )}
                  <div className="hidden min-w-[100px] shrink-0 text-right sm:block">
                    <div className="flex items-center space-x-2">
                      <Progress
                        value={work.progress_percentage ?? 0}
                        className="h-2 w-16"
                      />
                      <span className="text-xs font-medium">
                        {work.progress_percentage ?? 0}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {work.completed_tasks}/{work.total_tasks} 완료
                    </div>
                  </div>
                </div>
              </CardHeader>

              {/* 서랍식 세부 할 일 — 요약(이름·상태·진행률)은 항상 보이고 할 일 목록만 접었다 편다 */}
              {work.tasks && work.tasks.length > 0 ? (
                <div className="border-t border-slate-100">
                  <button
                    type="button"
                    aria-expanded={expandedWorks.has(work.id)}
                    aria-controls={`work-tasks-${work.id}`}
                    onClick={clickEvent => {
                      clickEvent.stopPropagation();
                      toggleWorkExpansion(work.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                  >
                    <span className="flex items-center gap-1.5">
                      <ListChecks className="h-3.5 w-3.5 text-blue-500" />
                      세부 할 일 {work.tasks.length}개
                      <span className="font-normal text-slate-400">
                        · 완료{' '}
                        {
                          work.tasks.filter(
                            (task: Task) => getTaskDisplayStatus(task) === 'completed'
                          ).length
                        }
                        /{work.tasks.length}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-slate-400 transition-transform',
                        expandedWorks.has(work.id) && 'rotate-180'
                      )}
                    />
                  </button>

                  {expandedWorks.has(work.id) && (
                  <div
                    id={`work-tasks-${work.id}`}
                    className="border-t border-slate-100 bg-slate-50/60 px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-5"
                  >
                    {(() => {
                      // 순서 = 절차형(번호) → 일회성(만든 순). 업무 검색과 같은 함수를 쓴다
                      const sortedTasks = sortWorkTasks(work.tasks as Task[]);

                      return (
                        <WorkTaskTableWithActions
                          canManage={() => checkIsWorkManager(work.manager_id, work.meta, currentUserResourceId)}
                          workflowIdOf={(taskId) => workflowLinks.tasks[taskId]?.workflowId ?? null}
                          rows={sortedTasks.map((task: any, globalIndex: number) => {
                            const realOrderIndex = taskOrderMap[task.id];
                            const orderNumber = realOrderIndex != null ? realOrderIndex : globalIndex + 1;
                            const baseAssignees = Array.isArray((task as any).meta?.assignees)
                              ? ((task as any).meta.assignees as TaskAssigneeJsonb[])
                              : [];
                            const isManager = checkIsWorkManager(work.manager_id, work.meta, currentUserResourceId);
                            return {
                              task,
                              orderNumber,
                              isOneTime: task.type === 'one_time' || orderNumber === 0,
                              displayStatus: getTaskDisplayStatus(task),
                              assignees: baseAssignees.map(assignee => {
                                const override = assigneeStatusOverrides[`${task.id}:${assignee.id}`];
                                return override ? { ...assignee, status: override } : assignee;
                              }),
                              isManager,
                              canViewAssignees: isManager || isUserAssignedToTask(task.id),
                              updatingAssigneeId: updatingAssigneeKey?.startsWith(`${task.id}:`)
                                ? updatingAssigneeKey.slice(task.id.length + 1)
                                : undefined,
                              deadlines: getTaskDeadlines(task),
                              dueLabel: formatTaskDue(task),
                            };
                          })}
                          isUpdating={toggleAssigneeStatusMutation.isPending || toggleDeadlineStatusMutation.isPending}
                          updatingRoundKey={updatingRoundKey}
                          updatingUnitKey={updatingUnitKey}
                          currentUserResourceId={currentUserResourceId || undefined}
                          onDueDateChange={handleInlineDueDateChange}
                          onPlacementChange={(taskId, target) =>
                            handleTaskPlacementChange(work.tasks as StepOrderTask[], taskId, target)
                          }
                          onOpenDetail={(task) => { setSelectedTask(task); setTaskDetailOpen(true); }}
                          onOpenEdit={onTaskEdit}
                          onEditAssignees={(task) => { setAssigneeEditTask(task); setAssigneeEditOpen(true); }}
                          onOpenPipeline={(task) => {
                            setPipelineWorkId(work.id);
                            setPipelineTaskId(task.id);
                            setPipelineOpen(true);
                          }}
                          renderRoleIcon={(task) => getTaskRoleIcon(task)}
                          renderIssueBadge={(task) => <TaskAssignmentIssueBadge task={task} />}
                          renderWorkflowLink={(task) => (
                            // 연결된 작업 = 연결이 없어도 늘 렌치 아이콘만(없으면 흐리게) (2026-10-01 사용자 결정).
                            // 판정 정본은 task_action 연결(workConnectedTaskIds)이지 워크플로 노드가 아니다.
                            // 워크플로 바로가기는 업무 카드 머리에만 둔다 — 할 일 행마다 두지 않는다.
                            <TaskActionButton
                              taskId={task.id}
                              taskTitle={task.title}
                              workflowId={workflowLinks.tasks[task.id]?.workflowId ?? null}
                              connected={hasConnectedActions(task, workConnectedTaskIds)}
                              manageable={checkIsWorkManager(work.manager_id, work.meta, currentUserResourceId)}
                              variant="compact"
                            />
                          )}
                          renderAssigneeSummary={(row) => (
                            <TaskAssigneeSummary
                              assignees={row.assignees}
                              currentUserResourceId={currentUserResourceId || undefined}
                              canEditAll={row.isManager}
                              isUpdating={toggleAssigneeStatusMutation.isPending || toggleDeadlineStatusMutation.isPending}
                              maxVisible={2}
                              updatingAssigneeId={row.updatingAssigneeId}
                              onAssigneeStatusChange={assignee =>
                                handleAssigneeCardStatusChange(row.task.id, assignee, row.isManager)
                              }
                              deadlines={getTaskDeadlines(row.task)}
                              deadlineProgress={getDeadlineProgress(row.task)}
                              updatingRoundKey={updatingRoundKey}
                              onRoundStatusChange={(assignee, deadline, nextStatus) =>
                                handleRoundStatusChange(row.task.id, assignee, deadline, nextStatus, row.isManager)
                              }
                              units={getTaskUnits(row.task)}
                              unitProgress={getUnitProgress(row.task)}
                              updatingUnitKey={updatingUnitKey}
                              onUnitStatusChange={(unitKey, assignee, nextStatus) =>
                                handleUnitStatusChange(row.task.id, unitKey, assignee, nextStatus, row.isManager)
                              }
                            />
                          )}
                        />
                      );
                    })()}
                  </div>
                  )}
                </div>
              ) : (
                /* 할 일이 없는 경우 — 접을 내용이 없으므로 토글 없이 안내만 */
                <div className="border-t border-slate-100 py-4 text-center text-sm text-slate-500">
                  연결된 할 일이 없습니다
                </div>
              )}
            </ImprovedCard>
          ))
        )}
      </div>
      
      {/* Work Detail Dialog */}
      <WorkDetailDialog
        work={selectedWork}
        open={workDetailOpen}
        onOpenChange={setWorkDetailOpen}
        onEdit={onWorkEdit}
        onDelete={handleWorkDelete}
      />

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        onEdit={onTaskEdit}
      />

      {/* 담당자 바꾸기 (내 업무 관리 표의 담당자 칸) */}
      <TaskAssigneeEditDialog
        task={assigneeEditTask}
        open={assigneeEditOpen}
        onOpenChange={setAssigneeEditOpen}
      />

      {/* 업무 진행 */}
      <WorkPipelineDialog
        workId={pipelineWorkId}
        initialTaskId={pipelineTaskId}
        open={pipelineOpen}
        onOpenChange={setPipelineOpen}
      />

    </div>
  );
}
