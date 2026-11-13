// ========================================
// New JSONB-based Task Management Hooks
// Optimized hooks using merged assignee structure
// ========================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import { getTaskDeadlines } from '@/lib/taskDeadlines';
import { planAssigneeEdit } from '@/lib/taskAssigneeEdit';
import { TaskFileService } from '@/services/taskFileService';
import type {
  Task,
  TaskAssigneeJsonb,
  TaskAssigneeWithDetails,
  CreateTaskRequest,
  UpdateTaskRequest,
  MyTasksResponse,
  WorkDetail,
  TaskCompletionStats
} from '@/types/tasks';

// ========================================
// Task Creation and Updates
// ========================================

export function useCreateTaskJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTaskRequest & { event_id: string }) => {
      // Get current user info to set created_by
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      // Get user resource ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      let createdBy = null;
      if (profile?.name) {
        const { data: resource } = await supabase
          .from('resource')
          .select('id')
          .eq('name', profile.name)
          .single();

        createdBy = resource?.id;
      }

      // Prepare meta with assignees
      const meta: any = data.meta || {};
      // Merge in any assignees if provided
      if (data.meta?.assignees && data.meta.assignees.length > 0) {
        meta.assignees = data.meta.assignees;
      }

      const { data: result, error } = await (supabase as any)
        .from('task')
        .insert({
          event_id: data.event_id,
          title: data.title,
          description: data.description,
          type: data.type || 'procedural',
          // 절차형은 1부터(src/lib/taskOrder.ts), 일회성은 0
          order_index: data.order_index || ((data.type || 'procedural') === 'procedural' ? 1 : 0),
          due_date: data.due_date,
          keywords: data.keywords || [],
          meta: meta,
          status: 'pending',
          created_by: createdBy
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['work', (result as any).event_id] });
      queryClient.invalidateQueries({ queryKey: ['work-detail', (result as any).event_id] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
    },
  });
}

export function useUpdateTaskJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTaskRequest }) => {
      const updateData: any = {
        title: data.title,
        description: data.description,
        type: data.type,
        order_index: data.order_index,
        status: data.status,
        due_date: data.due_date,
        keywords: data.keywords
      };

      // Update meta if provided
      if (data.meta !== undefined) {
        // Get current meta first
        const { data: currentTask } = await (supabase as any)
          .from('task')
          .select('meta')
          .eq('id', id)
          .single();

        const currentMeta = (currentTask as any)?.meta || {};
        updateData.meta = {
          ...currentMeta,
          ...data.meta
        };
      }

      const { data: result, error } = await (supabase as any)
        .from('task')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['work', (result as any).event_id] });
      queryClient.invalidateQueries({ queryKey: ['work-detail', (result as any).event_id] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
    },
  });
}

/**
 * 할 일 여러 개의 유형·순서를 한 번에 바꾼다 — 내 업무 관리 표의 순서 칸 (2026-09-26).
 * 계획은 `planStepPlacement`(src/lib/taskOrder.ts)가 세우고 여기서는 쓰기만 한다.
 * `useUpdateTaskJsonb` 를 행마다 부르면 성공할 때마다 목록을 다시 받아 깜빡이므로 한 번에 무효화한다.
 */
export function useReorderTasksJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (changes: { id: string; type: 'procedural' | 'one_time'; order_index: number }[]) => {
      const results = await Promise.allSettled(
        changes.map(async ({ id, type, order_index }) => {
          const { error } = await (supabase as any).from('task').update({ type, order_index }).eq('id', id);
          if (error) throw error;
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        // 일부만 반영됐을 수 있다 — 무효화(onSettled)로 실제 상태를 다시 그린다
        throw new Error(`${changes.length}건 중 ${failed}건의 순서를 바꾸지 못했습니다.`);
      }
    },
    // 무효화를 기다려야 mutateAsync 가 «새 순서가 그려진 뒤» 끝난다 — 안 기다리면 옛 번호가 한 번 비친다
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
      queryClient.invalidateQueries({ queryKey: ['task-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['work'] }),
      queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
    ]),
  });
}

/**
 * 할 일 담당자를 바꾼다 — 내 업무 관리 표의 담당자 칸 (2026-10-01, 매니저만).
 * 계획은 `planAssigneeEdit`(src/lib/taskAssigneeEdit.ts)가 세운다.
 *
 * 화면이 들고 있는 행이 아니라 **저장 직전의 행**으로 계획한다 — 그 사이 담당자가 자기 상태를
 * 바꿨으면 화면 값으로 덮어써 완료가 조용히 되돌아간다. 권한은 서버 트리거
 * `guard_task_structure` 가 다시 본다(매니저가 아니면 42501).
 */
export function useUpdateTaskAssigneesJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId, nextIds, names,
    }: { taskId: string; nextIds: string[]; names: Record<string, string> }) => {
      const { data: current, error: readError } = await (supabase as any)
        .from('task')
        .select('due_date, meta')
        .eq('id', taskId)
        .single();
      if (readError) throw readError;

      const plan = planAssigneeEdit(current ?? {}, nextIds, (id) => names[id]);
      if (plan.blockedUnitHolders.length > 0) {
        throw new Error(
          `${plan.blockedUnitHolders.map((p) => p.name).join(', ')} 님은 과제 단위를 맡고 있어 여기서 뺄 수 없습니다. 편집 창에서 단위를 먼저 정리해 주세요.`,
        );
      }
      if (!plan.changed) return plan;

      const meta = {
        ...((current as { meta?: Record<string, unknown> | null } | null)?.meta ?? {}),
        assignees: plan.assignees,
        ...(plan.assignmentIssues !== undefined ? { assignmentIssues: plan.assignmentIssues } : {}),
      };
      const { error } = await (supabase as any).from('task').update({ meta }).eq('id', taskId);
      if (error) throw error;
      return plan;
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
      queryClient.invalidateQueries({ queryKey: ['work'] }),
      queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
    ]),
  });
}

// ========================================
// Assignee Status Management
// ========================================

export function useUpdateAssigneeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      assigneeId,
      newStatus,
      comment
    }: {
      taskId: string;
      assigneeId: string;
      newStatus: 'pending' | 'completed' | 'cancelled';
      comment?: string;
    }) => {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { error } = await (supabase as any).rpc('update_assignee_status_meta', {
        p_task_id: taskId,
        p_user_id: user.id,
        p_status: newStatus
      });

      if (error) throw error;
      return { taskId, assigneeId, newStatus };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['enhanced-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['works'] });
      queryClient.invalidateQueries({ queryKey: ['work-detail'] });
    },
  });
}

export function useAddAssignees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      assigneeIds
    }: {
      taskId: string;
      assigneeIds: string[];
    }) => {
      const { error } = await (supabase as any).rpc('add_assignees_meta', {
        p_task_id: taskId,
        p_assignee_ids: assigneeIds
      });

      if (error) throw error;
      return { taskId, assigneeIds };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['works'] });
      queryClient.invalidateQueries({ queryKey: ['work-detail'] });
    },
  });
}

export function useRemoveAssignees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      assigneeIds
    }: {
      taskId: string;
      assigneeIds: string[];
    }) => {
      const { error } = await (supabase as any).rpc('remove_assignees_meta', {
        p_task_id: taskId,
        p_assignee_ids: assigneeIds
      });

      if (error) throw error;
      return { taskId, assigneeIds };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['works'] });
      queryClient.invalidateQueries({ queryKey: ['work-detail'] });
    },
  });
}

// ========================================
// Task Queries
// ========================================

export function useMyTasksJsonb(includeManaged = true, status?: string) {
  return useQuery({
    queryKey: ['my-tasks-jsonb', includeManaged, status],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await (supabase as any).rpc('get_my_tasks_jsonb', {
        p_user_id: user.id,
        p_status: status || null,
        p_include_managed: includeManaged
      });

      if (error) throw error;

      // RPC function now returns a table with columns: summary, assigned_tasks, managed_tasks, urgent_tasks
      const result = data[0]; // Get first row
      const { summary, assigned_tasks: assignedTasksData, managed_tasks: managedTasksData, urgent_tasks: urgentTasksData } = result;

      // Tasks already have enriched assignees from meta.assignees (with names)
      return {
        assigned_tasks: assignedTasksData || [],
        managed_tasks: managedTasksData || [],
        urgent_tasks: urgentTasksData || [],
        summary: summary || {}
      } as MyTasksResponse;
    },
    staleTime: 2 * 60 * 1000,  // 2분간 fresh - 태스크 데이터는 자주 변경됨
    gcTime: 5 * 60 * 1000,     // 5분간 캐시 보관
    refetchOnMount: true,      // 마운트 시 항상 최신 데이터 가져오기
    refetchOnWindowFocus: true, // 탭 전환 시 staleTime 초과하면 refetch
    refetchOnReconnect: true,
  });
}

export function useWorkDetailJsonb(workId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['work-detail-jsonb', workId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_work_detail', {
        p_event_id: workId
      });

      if (error) throw error;

      const workDetail = data[0] as WorkDetail;

      // Tasks already have enriched assignees from meta.assignees (with names)
      // Just add event_id to each task
      if (workDetail?.tasks && workDetail.tasks.length > 0) {
        workDetail.tasks = workDetail.tasks.map((task: any) => ({
          ...task,
          event_id: workId
        }));
      }

      return workDetail;
    },
    enabled: !!workId && (options?.enabled !== false),
  });
}

// ========================================
// Utility Functions
// ========================================

export function useGetTaskAssignees(taskId: string) {
  return useQuery({
    queryKey: ['task-assignees-jsonb', taskId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_task_assignees_jsonb', {
        p_task_id: taskId
      });

      if (error) throw error;
      return (data as any) as TaskAssigneeWithDetails[];
    },
    enabled: !!taskId,
  });
}

// Helper function to build assignees JSONB from assignee IDs
export function buildAssigneesJsonb(assigneeIds: string[]): any {
  return {
    assignees: assigneeIds.map(id => ({
      id,
      status: 'pending',
      assigned_at: new Date().toISOString()
    })),
    completion_stats: {
      total: assigneeIds.length,
      completed: 0,
      pending: assigneeIds.length,
      completion_percentage: 0
    },
    last_updated: new Date().toISOString()
  };
}

// Helper function to extract assignee IDs from JSONB
export function extractAssigneeIds(assigneesJsonb?: any): string[] {
  return assigneesJsonb?.assignees?.map(a => a.id) || [];
}

// Helper function to get completion stats
// ========================================
// Task Works - JSONB versions of legacy hooks
// ========================================

export function useWorksJsonb(filters?: any) {
  return useQuery({
    queryKey: ['works-jsonb', filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('work')
        .select(`
          *,
          manager:resource!fk_event_manager(id, name, type),
          tasks:task(id, event_id, title, description, type, status, order_index, due_date, keywords, meta, created_at)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      // Manager 필터링은 meta.managers를 통해 처리 (deprecated: manager_id 필터링 제거)

      const { data, error } = await query;
      if (error) throw error;

      // Calculate progress for each work
      const eventsWithProgress = (data as any)?.map((work: any) => {
        const tasks = (work as any).tasks || [];
        let totalTasks = tasks.length;
        let completedTasks = 0;
        let totalAssignees = 0;
        let completedAssignees = 0;

        tasks.forEach((task: any) => {
          // Use meta.assignees instead of assignees_jsonb
          const assignees = task.meta?.assignees;

          if (assignees && Array.isArray(assignees) && assignees.length > 0) {
            // Count based on individual assignee status
            totalAssignees += assignees.length;
            completedAssignees += assignees.filter((a: any) => a.status === 'completed').length;

            // Task is considered completed if all assignees are completed
            if (assignees.every((a: any) => a.status === 'completed')) {
              completedTasks++;
            }
          } else {
            // Fallback to task status for tasks without assignees
            totalAssignees += 1;
            if (task.status === 'completed') {
              completedTasks++;
              completedAssignees++;
            }
          }
        });

        // Calculate progress percentage based on assignees for more granular progress
        const progress_percentage = totalAssignees > 0 ? Math.round((completedAssignees / totalAssignees) * 100) : 0;

        return {
          ...work,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          progress_percentage,
          total_assignees: totalAssignees,
          completed_assignees: completedAssignees
        };
      }) || [];

      return eventsWithProgress;
    },
    staleTime: 3 * 60 * 1000,    // 3분간 fresh - 업무 목록은 태스크보다 덜 자주 변경
    gcTime: 8 * 60 * 1000,       // 8분간 캐시 보관
  });
}

export function useWorkJsonb(workId: string) {
  return useQuery({
    queryKey: ['work-jsonb', workId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('work')
        .select(`
          *,
          manager:resource!fk_event_manager(id, name, type)
        `)
        .eq('id', workId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!workId,
  });
}

export function useUpdateTaskStatusJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const { data, error } = await (supabase as any)
        .from('task')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['work-detail', (result as any).event_id] });
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    },
  });
}

export function useDeleteTaskJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('User profile not found');

      // Get user resource ID
      const { data: resource } = await supabase
        .from('resource')
        .select('id')
        .eq('name', profile.name)
        .single();

      const currentUserResourceId = resource?.id;

      // Get task details
      const { data: task, error: taskError } = await (supabase as any)
        .from('task')
        .select('id, event_id, created_by')
        .eq('id', taskId)
        .single();

      if (taskError) throw taskError;

      // Check permissions
      let canDelete = false;

      // Admin can delete any task
      if (profile.role === 'admin') {
        canDelete = true;
      }
      // Task creator can delete their own task
      else if ((task as any).created_by === currentUserResourceId) {
        canDelete = true;
      }
      // Work manager can delete any task in their work
      else if (currentUserResourceId) {
        const { data: work } = await (supabase as any)
          .from('work')
          .select('meta')
          .eq('id', (task as any).event_id)
          .single();

        if (work) {
          // meta.managers 체크
          if ((work as any).meta?.managers && Array.isArray((work as any).meta.managers)) {
            const isManager = (work as any).meta.managers.some((manager: any) =>
              manager.id === currentUserResourceId
            );
            if (isManager) {
              canDelete = true;
            }
          }
        }
      }

      if (!canDelete) {
        throw new Error('권한이 없습니다. 태스크를 삭제할 수 없습니다.');
      }

      // Clean up task files before deletion
      console.log(`🧹 Starting file cleanup for task deletion: ${taskId}`);
      await TaskFileService.cleanupTaskFiles(taskId);

      // Proceed with deletion
      const { data, error } = await (supabase as any)
        .from('task')
        .delete()
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['work-detail', (result as any).event_id] });
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    },
  });
}

export function useToggleAssigneeStatusJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      status,
      assigneeId,
    }: {
      taskId: string;
      status: string;
      assigneeId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = assigneeId
        ? await (supabase as any).rpc('set_task_assignee_status', {
            p_task_id: taskId,
            p_assignee_resource_id: assigneeId,
            p_status: status,
          })
        : await (supabase as any).rpc('update_assignee_status_meta', {
            p_task_id: taskId,
            p_user_id: user.id,
            p_status: status,
          });

      if (error) {
        const errorMessage = [
          error.message,
          error.details,
          error.hint,
        ].filter(Boolean).join(' ');
        throw new Error(errorMessage || '담당자 상태를 변경하지 못했습니다.');
      }
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
        queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['work-jsonb'] }),
        queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
      ]);
    },
  });
}

/**
 * 회차별 완료 토글(다중 마감 할 일) — set_task_deadline_status RPC 경유.
 * 서버가 본인/매니저 권한 검증, 회차 기록 갱신, 담당자 전체 상태 파생("모든 회차 완료"),
 * task.status 재계산·감사 기록까지 원자적으로 수행한다.
 */
export function useToggleDeadlineStatusJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      assigneeId,
      deadline,
      status,
    }: {
      taskId: string;
      assigneeId: string;
      deadline: string;
      status: 'pending' | 'completed';
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await (supabase as any).rpc('set_task_deadline_status', {
        p_task_id: taskId,
        p_assignee_resource_id: assigneeId,
        p_deadline: deadline,
        p_status: status,
      });

      if (error) {
        const errorMessage = [error.message, error.details, error.hint]
          .filter(Boolean).join(' ');
        throw new Error(errorMessage || '회차 상태를 변경하지 못했습니다.');
      }
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
        queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['work-jsonb'] }),
        queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
      ]);
    },
  });
}

/**
 * 과제 단위 선택/해제/완료 토글(단위 할 일) — set_task_unit_status RPC 경유.
 * status: 'pending'=선택(claim)/미완료 되돌림, 'completed'=완료, null=선택 해제.
 * 서버가 본인/매니저 권한·범주(pool) 소속 검증, 단위 기록 갱신, 담당자 상태 파생
 * ("내 단위 전부 완료"), task.status 재계산("모든 단위 완료")·감사 기록까지 원자적으로
 * 수행한다 — 동시 선택이 서로를 지우는 JSONB read-modify-write 경쟁을 막는 정본 경로.
 */
export function useToggleUnitStatusJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      unitKey,
      assigneeId,
      status,
    }: {
      taskId: string;
      unitKey: string;
      assigneeId: string;
      status: 'pending' | 'completed' | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await (supabase as any).rpc('set_task_unit_status', {
        p_task_id: taskId,
        p_unit_key: unitKey,
        p_assignee_resource_id: assigneeId,
        p_status: status,
      });

      if (error) {
        const errorMessage = [error.message, error.details, error.hint]
          .filter(Boolean).join(' ');
        throw new Error(errorMessage || '과제 단위 상태를 변경하지 못했습니다.');
      }
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
        queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['work-jsonb'] }),
        queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
      ]);
    },
  });
}

// ========================================
// Analytics and Search Hooks (JSONB version)
// ========================================

export function useTaskStatsJsonb() {
  return useQuery({
    queryKey: ['task-stats-jsonb'],
    queryFn: async () => {
      // Placeholder - analytics need to be reimplemented for JSONB
      // For now return basic stats from my tasks
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await (supabase as any).rpc('get_my_tasks_jsonb', {
        p_user_id: user.id,
        p_status: null,
        p_include_managed: true
      });

      if (error) throw error;

      return {
        totalWorks: 0, // TODO: Implement
        completionRate: 0, // TODO: Implement
        totalTasks: (data as any)?.summary?.total || 0,
        completedTasks: (data as any)?.summary?.completed || 0
      };
    },
  });
}

export function useKeywordAnalyticsJsonb() {
  return useQuery({
    queryKey: ['keyword-analytics-jsonb'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('analyze_tasks_by_keyword');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDuplicateAnalysisJsonb() {
  return useQuery({
    queryKey: ['duplicate-analysis-jsonb'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('analyze_duplicate_tasks');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTaskSearchJsonb() {
  return useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const { data, error } = await (supabase as any).rpc('search_tasks', {
        p_query: query,
        p_limit: 50
      });

      if (error) throw error;

      // Group results by type
      const works = (data as any)?.filter((item: any) => item.type === 'event') || [];
      const tasks = (data as any)?.filter((item: any) => item.type === 'task') || [];

      return { works, tasks, all: data || [] };
    },
  });
}

export function usePopularKeywordsJsonb() {
  return useQuery({
    queryKey: ['popular-keywords-jsonb'],
    queryFn: async () => {
      // Placeholder - extract popular keywords from JSONB data
      const { data, error } = await (supabase as any)
        .from('work')
        .select('keywords')
        .not('keywords', 'is', null);

      if (error) throw error;

      // Basic keyword frequency analysis
      const keywordCounts: { [key: string]: number } = {};
      (data as any)?.forEach((work: any) => {
        if ((work as any).keywords && Array.isArray((work as any).keywords)) {
          (work as any).keywords.forEach((keyword: string) => {
            keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
          });
        }
      });

      return Object.entries(keywordCounts)
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
  });
}

// ========================================
// Resource Name Resolution Hook
// ========================================

export function useEnrichAssignees(assignees: TaskAssigneeJsonb[] | undefined) {
  const assigneeIds = assignees?.map(a => a.id) || [];

  return useQuery({
    queryKey: ['resource-names', assigneeIds],
    queryFn: async () => {
      if (assigneeIds.length === 0) return [];

      const { data: resources, error } = await supabase
        .from('resource')
        .select('id, name, type')
        .in('id', assigneeIds);

      if (error) throw error;

      // Merge assignee status with resource details
      return assignees?.map((assignee) => {
        const resource = resources?.find(r => r.id === assignee.id);
        return {
          ...assignee,
          name: resource?.name || 'Unknown',
          type: resource?.type || 'unknown'
        } as TaskAssigneeWithDetails;
      }) || [];
    },
    enabled: assigneeIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

export function useCreateWorkJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      // Extract manager_id from meta.managers (first manager) or throw error
      let managerId = data.manager_id;
      if (!managerId && data.meta?.managers && data.meta.managers.length > 0) {
        managerId = data.meta.managers[0].id;
      }

      if (!managerId) {
        throw new Error('manager_id is required');
      }

      const { data: result, error } = await (supabase as any)
        .from('work')
        .insert({
          name: data.name,
          description: data.description,
          manager_id: managerId,
          status: data.status || 'active',
          keywords: data.keywords || [],
          meta: data.meta || {}
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    },
  });
}

export function useUpdateWorkJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      // Extract manager_id from meta.managers (first manager) if provided
      let managerId = data.manager_id;
      if (!managerId && data.meta?.managers && data.meta.managers.length > 0) {
        managerId = data.meta.managers[0].id;
      }

      const updateData: any = {
        name: data.name,
        description: data.description,
        status: data.status,
        keywords: data.keywords,
        meta: data.meta,
        updated_at: new Date().toISOString()
      };

      // Only update manager_id if provided
      if (managerId) {
        updateData.manager_id = managerId;
      }

      const { data: result, error } = await (supabase as any)
        .from('work')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    },
  });
}

export function useDeleteWorkJsonb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workId: string) => {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('User profile not found');

      // Get user resource ID
      const { data: resource } = await supabase
        .from('resource')
        .select('id')
        .eq('name', profile.name)
        .single();

      const currentUserResourceId = resource?.id;

      // Get work details
      const { data: work, error: workError } = await (supabase as any)
        .from('work')
        .select('id, meta')
        .eq('id', workId)
        .single();

      if (workError) throw workError;

      // Check permissions
      let canDelete = false;

      // Admin can delete any work
      if (profile.role === 'admin') {
        canDelete = true;
      }
      // Work manager can delete their own work
      else if (currentUserResourceId) {
        // meta.managers 체크
        if ((work as any).meta?.managers && Array.isArray((work as any).meta.managers)) {
          const isManager = (work as any).meta.managers.some((manager: any) =>
            manager.id === currentUserResourceId
          );
          if (isManager) {
            canDelete = true;
          }
        }
      }

      if (!canDelete) {
        throw new Error('권한이 없습니다. 업무를 삭제할 수 없습니다.');
      }

      // Clean up files before deleting work and tasks
      console.log(`🧹 Starting file cleanup for work deletion: ${workId}`);

      // 1. Clean up work files
      await TaskFileService.cleanupWorkFiles(workId);

      // 2. Clean up all task files for this work
      await TaskFileService.cleanupTaskFilesByWork(workId);

      // Then delete all tasks in this work
      await (supabase as any).from('task').delete().eq('event_id', workId);

      // Finally delete the work
      const { data, error } = await (supabase as any)
        .from('work')
        .delete()
        .eq('id', workId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
    },
  });
}

// ========================================
// Utility Functions
// ========================================

export function getCompletionStats(assigneesJsonb?: any) {
  return assigneesJsonb?.completion_stats || {
    total: 0,
    completed: 0,
    pending: 0,
    completion_percentage: 0
  };
}

// ========================================
// Task Due Dates for Schedule Calendar
// ========================================

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      if (!taskId) return null;

      const { data, error } = await (supabase as any)
        .from('task')
        .select(`
          *,
          work!inner(name, description, meta)
        `)
        .eq('id', taskId)
        .single();

      if (error) {
        console.error('Error fetching task:', error);
        throw error;
      }

      return data as Task;
    },
    enabled: !!taskId,
    staleTime: 2 * 60 * 1000,  // 2분간 fresh
    gcTime: 5 * 60 * 1000,     // 5분간 캐시 보관
  });
}

/** @param options.enabled false면 조회하지 않는다 (useScheduleEvents와 동일한 의미). */
export function useTaskDueDatesForSchedule(startDate?: Date, endDate?: Date, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['task-due-dates-schedule', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get user resource ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      if (!profile?.name) return [];

      const { data: resource } = await supabase
        .from('resource')
        .select('id')
        .eq('name', profile.name)
        .single();

      if (!resource?.id) return [];

      const currentUserResourceId = resource.id;

      // Build date range filter
      let query = (supabase as any)
        .from('task')
        .select(`
          *,
          work!inner(name, description)
        `)
        .not('due_date', 'is', null);

      // Add date range filter if provided — 다중 마감(meta.deadlines) task는 due_date(다음 마감)가
      // 범위 밖이어도 회차가 범위에 들 수 있어 함께 가져와 클라이언트에서 회차 필터링한다
      if (startDate && endDate) {
        const s = startDate.toISOString().split('T')[0];
        const e = endDate.toISOString().split('T')[0];
        query = query.or(`and(due_date.gte.${s},due_date.lte.${e}),meta->deadlines.not.is.null`);
      }

      const { data: tasks, error } = await query;

      if (error) {
        console.error('Error fetching tasks with due dates:', error);
        throw error;
      }

      if (!tasks || tasks.length === 0) return [];

      // Filter tasks where current user is in assignees_jsonb
      const filteredTasks = (tasks as any).filter((task: any) => {
        if (!(task as any).assignees_jsonb || !Array.isArray((task as any).assignees_jsonb)) {
          return false;
        }

        return (task as any).assignees_jsonb.some((assignee: any) =>
          assignee.id === currentUserResourceId
        );
      });

      // Transform to ScheduleEvent format — 다중 마감은 회차마다 캘린더 항목 생성(범위 내만)
      const rangeStart = startDate ? startDate.toISOString().split('T')[0] : null;
      const rangeEnd = endDate ? endDate.toISOString().split('T')[0] : null;
      return (filteredTasks as any).flatMap((task: any) => {
        const deadlines = getTaskDeadlines(task as any);
        return deadlines
          .filter((d) => (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd))
          .map((dateOnly) => ({
            id: deadlines.length > 1 ? `task-${(task as any).id}-${dateOnly}` : `task-${(task as any).id}`,
            kind: 'task' as const,
            title: `📋 ${(task as any).title}${deadlines.length > 1 ? ` (${deadlines.indexOf(dateOnly) + 1}/${deadlines.length}회)` : ''}`,
            starts_at: `${dateOnly}T09:00:00`,
            ends_at: `${dateOnly}T18:00:00`,
            status: (task as any).status || 'pending',
            created_by: (task as any).created_by || '',
            description: (task as any).description,
            date_only: true,
            meta: {
              original_task_id: (task as any).id,
              event_name: (task as any).work?.name,
              event_description: (task as any).work?.description,
              task_type: (task as any).type,
              source: 'task'
            }
          }));
      });
    },
    enabled: !!startDate && !!endDate && (options?.enabled ?? true),
    staleTime: 2 * 60 * 1000,  // 2분간 fresh
    gcTime: 5 * 60 * 1000,     // 5분간 캐시 보관
  });
}
