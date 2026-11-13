// ========================================
// 할 일 파일 제출 훅 (2026-08-11)
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTaskSubmission,
  fetchTaskSubmissions,
  submitTaskFile,
} from '@/services/taskSubmissionService';
import type { TaskSubmission } from '@/types/tasks';
import { supabase } from '@/integrations/supabase/client';

export const taskSubmissionKey = (taskId: string) => ['task-submissions', taskId] as const;

export function useTaskSubmissions(taskId: string | undefined, enabled = true) {
  return useQuery<TaskSubmission[]>({
    queryKey: taskSubmissionKey(taskId ?? ''),
    queryFn: () => fetchTaskSubmissions(taskId as string),
    enabled: Boolean(taskId) && enabled,
  });
}

/**
 * 제출·철회는 담당자 상태(그리고 전원 완료 시 task.status)까지 서버에서 함께 바꾸므로,
 * 제출물 목록뿐 아니라 할 일 목록 캐시도 같이 무효화해야 카드의 완료 표시가 즉시 맞는다.
 */
/**
 * 제출이 바뀐 뒤 다시 읽어야 할 쿼리 5종.
 *
 * **export 한 이유**(2026-09-03): 값 제출(`useTaskSpecSubmissions`)도 **정확히 같은 5개**를
 * 무효화해야 카드의 완료 표시가 즉시 맞는다. 복붙하면 한쪽만 늘어나는 사고가 난다.
 */
export function useInvalidateAfterSubmissionChange(taskId: string | undefined) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: taskSubmissionKey(taskId ?? '') }),
      queryClient.invalidateQueries({ queryKey: ['task-spec-submissions', taskId ?? ''] }),
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
      queryClient.invalidateQueries({ queryKey: ['work-jsonb'] }),
      queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
    ]);
  };
}

export function useSubmitTaskFile(taskId: string | undefined) {
  const invalidate = useInvalidateAfterSubmissionChange(taskId);

  return useMutation({
    mutationFn: async ({ files, unitKey }: { files: File[]; unitKey?: string | null }) => {
      if (!taskId) throw new Error('할 일 정보가 없습니다.');
      // 여러 파일은 순차 업로드한다. Drive 폴더 생성이 선행되어야 하는데 동시에 보내면
      // 같은 이름의 폴더가 중복 생성될 수 있다(findOrCreateFolder가 원자적이지 않음).
      const results = [];
      for (const file of files) {
        results.push(await submitTaskFile(taskId, file, unitKey));
      }
      return results;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTaskSubmission(taskId: string | undefined) {
  const invalidate = useInvalidateAfterSubmissionChange(taskId);

  return useMutation({
    // 드라이브 원본 정리에 google_drive_id가 필요해 id가 아니라 행 자체를 받는다
    mutationFn: (submission: Pick<TaskSubmission, 'id' | 'google_drive_id'>) =>
      deleteTaskSubmission(submission),
    onSuccess: invalidate,
  });
}

/**
 * 실물 제출 [받음] / [받음 취소] — 매니저 전용 (2026-10-01).
 * 받음 = 서버가 kind 'physical' 행을 만들고 그 담당자를 완료로 전이한다(취소는 그 반대).
 * 권한·방식 검사는 전부 `mark_task_physical_submission` 이 한다.
 */
export function useMarkPhysicalSubmission(taskId: string | undefined) {
  const invalidate = useInvalidateAfterSubmissionChange(taskId);

  return useMutation({
    mutationFn: async ({ assigneeResourceId, received }: { assigneeResourceId: string; received: boolean }) => {
      if (!taskId) throw new Error('할 일을 알 수 없습니다.');
      const { error } = await supabase.rpc('mark_task_physical_submission', {
        p_task_id: taskId,
        p_assignee_resource_id: assigneeResourceId,
        p_received: received,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
