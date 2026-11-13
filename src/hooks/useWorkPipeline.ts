// ========================================
// 업무 진행 화면 데이터 (2026-09-27) — 업무·할 일·작업·산출물을 한 번에
// 판정은 src/lib/workPipeline.ts, 원천 읽기는 src/services/workPipelineService.ts
// ========================================

import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkDetailJsonb } from '@/hooks/useTasksJsonb';
import { listTaskActionsForTasks } from '@/features/task-workflow/services/taskActionService';
import { taskActionKeys } from '@/features/task-workflow/hooks/useTaskActions';
import { COLLECT_KEY } from '@/features/task-workflow/hooks/useCollectInput';
import {
  clearTaskOutput,
  listTaskOutputValues,
  resolveTaskOutputs,
  saveTaskOutput,
  updateTaskOutputDecl,
  type TaskOutputValueRow,
} from '@/services/workPipelineService';
import { buildStages, type PipelineActionLike, type PipelineTaskLike, type TaskOutputDecl } from '@/lib/workPipeline';
import type { Task } from '@/types/tasks';

/**
 * ⚠️ 키는 **`taskActionKeys.all`(['task-action']) 아래**에 둔다 — 메시지·입력 받기 러너는 저장할 때 그 키만
 * 무효화한다. 따로 두었더니 러너에서 고친 본문을 이 화면이 옛 설정으로 들고 있다가 흐름 버튼으로 되돌렸다
 * (적대적 검증 2026-09-27). 접두가 같으면 러너의 무효화가 이 화면까지 새로 읽는다.
 */
export const workPipelineKeys = {
  all: [...taskActionKeys.all, 'work-pipeline'] as const,
  actions: (workId: string) => [...taskActionKeys.all, 'work-pipeline', 'actions', workId] as const,
  outputs: (workId: string) => [...taskActionKeys.all, 'work-pipeline', 'outputs', workId] as const,
  resolved: (taskId: string) => [...taskActionKeys.all, 'work-pipeline', 'resolved', taskId] as const,
  canWrite: (taskId: string) => [...taskActionKeys.all, 'work-pipeline', 'can-write', taskId] as const,
};

export type PipelineTask = Task & PipelineTaskLike;

export function useWorkPipeline(workId: string) {
  const detail = useWorkDetailJsonb(workId, { enabled: !!workId });

  const tasks = useMemo<PipelineTask[]>(() => {
    const list = ((detail.data?.tasks ?? []) as Task[]).map((t) => ({
      ...t,
      order_index: Number.isFinite(t.order_index) ? t.order_index : 0,
    })) as PipelineTask[];
    // 단계 안 순서 = 마감 → 제목. 같은 단계의 병렬 할 일이 새로고침마다 자리를 바꾸지 않게
    return list.sort((a, b) =>
      a.order_index - b.order_index
      || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      || a.title.localeCompare(b.title, 'ko'));
  }, [detail.data?.tasks]);

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const actions = useQuery({
    queryKey: [...workPipelineKeys.actions(workId), taskIds.join(',')],
    queryFn: () => listTaskActionsForTasks(taskIds),
    enabled: taskIds.length > 0,
  });

  const outputs = useQuery({
    queryKey: [...workPipelineKeys.outputs(workId), taskIds.join(',')],
    queryFn: () => listTaskOutputValues(taskIds),
    enabled: taskIds.length > 0,
  });

  const stages = useMemo(() => buildStages(tasks), [tasks]);

  const actionList = useMemo<PipelineActionLike[]>(
    () => (actions.data ?? []).map((a) => ({
      id: a.id,
      task_id: a.task_id,
      action_type: a.action_type,
      title: a.title,
      config: (a.config ?? null) as Record<string, unknown> | null,
    })),
    [actions.data],
  );

  const outputByTask = useMemo(() => {
    const map = new Map<string, TaskOutputValueRow>();
    for (const o of outputs.data ?? []) map.set(o.task_id, o);
    return map;
  }, [outputs.data]);

  return {
    work: detail.data ?? null,
    isLoading: detail.isLoading || actions.isLoading || outputs.isLoading,
    error: detail.error ?? actions.error ?? outputs.error ?? null,
    tasks,
    stages,
    actions: actionList,
    rawActions: actions.data ?? [],
    outputByTask,
  };
}

/**
 * 여러 할 일의 산출물을 원천에서 풀어 온다 — 지금 할 일 + 앞 단계 할 일만 부른다(전부 부르면
 * 입력 받기 표를 업무 전체만큼 읽는다). 키에 작업·산출물 갱신 시각을 섞어 바뀌면 다시 읽는다.
 */
export function useResolvedOutputs(
  tasks: PipelineTaskLike[],
  actions: PipelineActionLike[],
  outputByTask: Map<string, TaskOutputValueRow>,
  viewerCanManage: boolean,
) {
  const results = useQueries({
    queries: tasks.map((task) => {
      const manual = outputByTask.get(task.id) ?? null;
      const actionKey = actions.filter((a) => a.task_id === task.id).map((a) => a.id).join(',');
      return {
        queryKey: [...workPipelineKeys.resolved(task.id), actionKey, manual?.updated_at ?? '', JSON.stringify(task.meta?.output ?? null), JSON.stringify(task.meta?.submission ?? null), viewerCanManage],
        queryFn: () => resolveTaskOutputs(task, actions, manual, { viewerCanManage }),
        staleTime: 30_000,
      };
    }),
  });
  return tasks.map((task, i) => ({
    task,
    outputs: results[i]?.data ?? [],
    isLoading: results[i]?.isLoading ?? false,
    error: (results[i]?.error as Error | null) ?? null,
  }));
}

export function useCanWriteTaskOutput(taskId: string | null) {
  return useQuery({
    queryKey: workPipelineKeys.canWrite(taskId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_write_task_output', { p_task_id: taskId! });
      if (error) return false;
      return Boolean(data);
    },
    enabled: !!taskId,
    staleTime: 60_000,
  });
}

/** 산출물·선언·흐름을 바꾼 뒤 다시 읽을 것들 — 한 곳에서 무효화한다(빠뜨리면 화면이 옛 값을 그린다) */
export function useInvalidatePipeline(workId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: workPipelineKeys.all });
    queryClient.invalidateQueries({ queryKey: ['work-detail-jsonb', workId] });
    queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    queryClient.invalidateQueries({ queryKey: [COLLECT_KEY] });
    queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
  };
}

export function useSaveTaskOutput(workId: string) {
  const invalidate = useInvalidatePipeline(workId);
  return useMutation({
    mutationFn: saveTaskOutput,
    onSuccess: invalidate,
  });
}

export function useClearTaskOutput(workId: string) {
  const invalidate = useInvalidatePipeline(workId);
  return useMutation({
    mutationFn: clearTaskOutput,
    onSuccess: invalidate,
  });
}

export function useUpdateTaskOutputDecl(workId: string) {
  const invalidate = useInvalidatePipeline(workId);
  return useMutation({
    mutationFn: ({ taskId, decl }: { taskId: string; decl: TaskOutputDecl | null }) => updateTaskOutputDecl(taskId, decl),
    onSuccess: invalidate,
  });
}
