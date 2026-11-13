import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  copyTaskWorkflow,
  createTaskWorkflow,
  deleteTaskWorkflow,
  listTaskWorkflowEntityLinks,
  listTaskWorkflows,
  loadTaskWorkflowGraph,
  saveTaskWorkflowGraph,
  updateTaskWorkflow,
} from '../services/taskWorkflowService';
import type { SaveTaskWorkflowGraphInput } from '../types';

export const taskWorkflowKeys = {
  all: ['task-workflows'] as const,
  list: (departmentId: string | null) =>
    ['task-workflows', 'list', departmentId ?? 'all'] as const,
  graph: (workflowId: string) => ['task-workflows', workflowId, 'graph'] as const,
  entityLinks: (workIds: string[], taskIds: string[]) =>
    ['task-workflows', 'entity-links', workIds, taskIds] as const,
};

export function useTaskWorkflows(departmentId: string | null) {
  return useQuery({
    queryKey: taskWorkflowKeys.list(departmentId),
    queryFn: () => listTaskWorkflows(departmentId),
    staleTime: 60_000,
  });
}

export function useTaskWorkflowGraph(workflowId: string | null) {
  return useQuery({
    queryKey: taskWorkflowKeys.graph(workflowId ?? ''),
    queryFn: () => loadTaskWorkflowGraph(workflowId!),
    enabled: Boolean(workflowId),
  });
}

export function useTaskWorkflowEntityLinks(
  workIds: string[],
  taskIds: string[]
) {
  const normalizedWorkIds = Array.from(new Set(workIds)).sort();
  const normalizedTaskIds = Array.from(new Set(taskIds)).sort();

  return useQuery({
    queryKey: taskWorkflowKeys.entityLinks(
      normalizedWorkIds,
      normalizedTaskIds
    ),
    queryFn: () =>
      listTaskWorkflowEntityLinks(normalizedWorkIds, normalizedTaskIds),
    enabled: normalizedWorkIds.length > 0 || normalizedTaskIds.length > 0,
    staleTime: 60_000,
  });
}

export function useCreateTaskWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskWorkflow,
    onSuccess: (workflow) => {
      const prependWorkflow = (current: unknown) => {
        const workflows = Array.isArray(current) ? current : [];
        return [workflow, ...workflows];
      };
      queryClient.setQueryData(taskWorkflowKeys.list(null), prependWorkflow);
      if (workflow.department_id) {
        queryClient.setQueryData(
          taskWorkflowKeys.list(workflow.department_id),
          prependWorkflow
        );
      }
      void queryClient.invalidateQueries({ queryKey: taskWorkflowKeys.all });
    },
  });
}

export function useDeleteTaskWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskWorkflow,
    onSuccess: (_, workflowId) => {
      queryClient.invalidateQueries({ queryKey: taskWorkflowKeys.all });
      queryClient.removeQueries({ queryKey: taskWorkflowKeys.graph(workflowId) });
    },
  });
}

export function useUpdateTaskWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTaskWorkflow,
    onSuccess: (workflow, input) => {
      const replaceWorkflow = (current: unknown) => {
        if (!Array.isArray(current)) return current;
        return current.map((item) =>
          typeof item === 'object' && item && 'id' in item && item.id === workflow.id
            ? workflow
            : item
        );
      };
      const removeWorkflow = (current: unknown) => {
        if (!Array.isArray(current)) return current;
        return current.filter(
          (item) => !(typeof item === 'object' && item && 'id' in item && item.id === workflow.id)
        );
      };
      const upsertWorkflow = (current: unknown) => {
        if (!Array.isArray(current)) return [workflow];
        const exists = current.some(
          (item) => typeof item === 'object' && item && 'id' in item && item.id === workflow.id
        );
        return exists ? replaceWorkflow(current) : [workflow, ...current];
      };

      queryClient.setQueryData(taskWorkflowKeys.list(null), replaceWorkflow);
      if (input.previousDepartmentId && input.previousDepartmentId !== workflow.department_id) {
        queryClient.setQueryData(
          taskWorkflowKeys.list(input.previousDepartmentId),
          removeWorkflow
        );
      }
      if (workflow.department_id) {
        queryClient.setQueryData(
          taskWorkflowKeys.list(workflow.department_id),
          upsertWorkflow
        );
      }
      void queryClient.invalidateQueries({ queryKey: taskWorkflowKeys.all });
    },
  });
}

/** 워크플로 복사(내부 event/task 복제 포함) — 성공 시 목록·업무 캐시 무효화 */
export function useCopyTaskWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: copyTaskWorkflow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskWorkflowKeys.all });
      // 복제된 event/task가 업무 목록·내 할 일에도 나타나야 한다
      void queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
      void queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
    },
  });
}

export function useSaveTaskWorkflowGraph() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveTaskWorkflowGraphInput) => saveTaskWorkflowGraph(input),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: taskWorkflowKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskWorkflowKeys.graph(input.workflowId) });
    },
  });
}
