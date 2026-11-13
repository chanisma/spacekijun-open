import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTaskWorkflowEntityLinks } from './useTaskWorkflows';
import {
  bindTaskAction,
  deleteTaskAction,
  deleteTaskActionRun,
  finalizeTaskActionRun,
  listConnectedTaskIds,
  listTaskActionRuns,
  listTaskActionRunActionIds,
  listTaskActions,
  listTaskActionsForTasks,
  reviewTaskActionRun,
  setTaskActionFlow,
  startTaskActionRun,
  updateNeisActionConfig,
} from '../services/taskActionService';
import type { NeisActionConfig } from '@/lib/neisScreens';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { readActionFlow } from '../utils/actionFlow';
import type { Task } from '@/types/tasks';

export const taskActionKeys = {
  all: ['task-action'] as const,
  list: (taskId: string) => ['task-action', 'task', taskId] as const,
  runs: (actionId: string) => ['task-action', actionId, 'runs'] as const,
  runPresence: (workIds: string[]) =>
    ['task-action', 'run-presence', [...workIds].sort().join('|')] as const,
};

export function useTaskActions(taskId: string | null) {
  return useQuery({
    queryKey: taskActionKeys.list(taskId ?? ''),
    queryFn: () => listTaskActions(taskId!),
    enabled: Boolean(taskId),
  });
}

export function useTaskActionRuns(actionId: string | null, enabled = true) {
  return useQuery({
    queryKey: taskActionKeys.runs(actionId ?? ''),
    queryFn: () => listTaskActionRuns(actionId!),
    enabled: Boolean(actionId) && enabled,
  });
}

/**
 * 여러 할 일의 작업 목록 — 업무 흐름 캔버스의 작업 노드(2026-09-24).
 * 키가 `taskActionKeys.all` 접두를 공유하므로 연결·해제 뮤테이션이 그대로 무효화한다.
 */
export function useTaskActionsForTasks(taskIds: string[]) {
  return useQuery({
    queryKey: ['task-action', 'by-tasks', [...taskIds].sort().join('|')] as const,
    queryFn: () => listTaskActionsForTasks(taskIds),
    enabled: taskIds.length > 0,
  });
}

/** 실행 연결된 task_id 집합(노드 헤더 아이콘용) — 이력 있는 실행 기준 */
export function useConnectedWorkTaskIds(taskIds: string[]) {
  return useQuery({
    queryKey: ['task-action', 'connected-tasks', [...taskIds].sort().join('|')],
    queryFn: async () => new Set(await listConnectedTaskIds(taskIds)),
    enabled: taskIds.length > 0,
  });
}

/** 할 일 카드·상세에서 여는 "연결된 작업" 진입점 정보 */
export interface TaskActionEntry {
  /** 소속 워크플로 — RUN 기록·편집 권한 판정에 쓰인다. 노드가 없으면 null */
  workflowId: string | null;
}

/**
 * 워크플로 캔버스 밖(홈 대시보드 '나의 할 일', 할 일 상세 모달)에서 실행 버튼을
 * 낼지 판정하고, 열 때 넘길 워크플로 컨텍스트를 함께 돌려준다.
 *
 * 연결 판정의 정본은 **`task_action` bind 행**(= `useConnectedWorkTaskIds`)이지
 * 워크플로 노드가 아니다. 노드는 실행 이력에 남길 컨텍스트일 뿐이라, 노드가
 * 지워진 실행도 버튼은 뜨고 `workflowId`만 null이 된다(서버 RPC·RLS 모두
 * `workflow_id IS NULL`을 허용한다).
 *
 * 행마다 쿼리를 걸면 N+1이 되므로 **목록 단위 배치 조회**로 쓴다.
 */
export function useTaskActionEntries(taskIds: string[]): Map<string, TaskActionEntry> {
  const { data: connectedTaskIds } = useConnectedWorkTaskIds(taskIds);
  const { data: links } = useTaskWorkflowEntityLinks([], taskIds);

  return useMemo(() => {
    const entries = new Map<string, TaskActionEntry>();
    connectedTaskIds?.forEach((taskId) => {
      entries.set(taskId, { workflowId: links?.tasks[taskId]?.workflowId ?? null });
    });
    return entries;
  }, [connectedTaskIds, links]);
}

/** 실행 이력이 있는 action_id 집합 — "이력 없는 실행 = 연결 안 됨" 판정용 */
export function useTaskActionRunPresence(workIds: string[]) {
  return useQuery({
    queryKey: taskActionKeys.runPresence(workIds),
    queryFn: async () => new Set(await listTaskActionRunActionIds(workIds)),
    enabled: workIds.length > 0,
  });
}

export function useBindTaskAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bindTaskAction,
    onSuccess: () => {
      // list만 무효화하면 노드 아이콘용 connected-tasks 쿼리가 남아 연결 표시가
      // 즉시 갱신되지 않는다 — 전체 prefix 무효화(다른 뮤테이션들과 동일)
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useUpdateNeisActionConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { actionId: string; config: NeisActionConfig }) =>
      updateNeisActionConfig(input.actionId, input.config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useStartTaskActionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startTaskActionRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useFinalizeTaskActionRun(_workId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: finalizeTaskActionRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useDeleteTaskAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useDeleteTaskActionRun(_workId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskActionRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useReviewTaskActionRun(_workId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reviewTaskActionRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

/**
 * 연결된 작업 패널이 알아야 할 할 일 쪽 사정 — 내가 담당자인가, 작업 순서(2026-09-23).
 * 담당자 = `task.meta.assignees[].id`(resource id). 모르는 동안은 false(= 관리자에게는 관리
 * 보기만 보이고, 확인되면 토글이 나타난다 — 반대로 두면 잠깐 사용 보기가 떴다 바뀐다).
 * 옛 제출 설정(`task.meta.submission`)은 2026-10-05 에 화면에서 걷어 냈다 — 여기서 읽지 않는다.
 */
export function useTaskActionContext(taskId: string | null): {
  isAssignee: boolean;
  /** 작업 순서(task.meta.actionFlow) — 권장 순서, 강제하지 않는다 */
  flow: string[];
} {
  const { resourceId } = useCurrentResourceId();
  const query = useQuery({
    queryKey: ['task-action', 'task-context', taskId ?? ''],
    enabled: Boolean(taskId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('task').select('meta').eq('id', taskId!).maybeSingle();
      if (error) throw error;
      const meta = (data?.meta ?? null) as Task['meta'] | null;
      const assignees = ((meta as { assignees?: Array<{ id?: unknown }> } | null)?.assignees) ?? [];
      return {
        assigneeIds: assignees.map((item) => item?.id).filter((id): id is string => typeof id === 'string'),
        flow: readActionFlow(meta),
      };
    },
  });
  return {
    isAssignee: Boolean(resourceId && query.data?.assigneeIds.includes(resourceId)),
    flow: query.data?.flow ?? [],
  };
}

export function useSetTaskActionFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; flow: string[] }) => setTaskActionFlow(input.taskId, input.flow),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    },
  });
}

/**
 * 이 작업을 책임자로서 다룰 수 있는가 — 서버 `can_manage_task_action`(만든 사람 ∨ 그 업무의 책임자 ∨ 관리자).
 * 화면이 `created_by` 만 보면 공동 책임자가 자기 업무의 작업 앞에서 «책임자가 보내는 메시지입니다»로 막힌다(2026-10-06).
 */
export function useCanManageTaskAction(actionId: string | null, enabled = true): boolean {
  const { data } = useQuery({
    queryKey: ['task-action', 'can-manage', actionId],
    queryFn: async () => {
      const { data: allowed, error } = await supabase.rpc('can_manage_task_action', { p_action_id: actionId! });
      if (error) return false;
      return Boolean(allowed);
    },
    enabled: enabled && Boolean(actionId),
    staleTime: 60_000,
  });
  return Boolean(data);
}
