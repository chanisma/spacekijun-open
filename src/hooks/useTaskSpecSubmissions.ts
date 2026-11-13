// 스펙 기반 값 제출 훅 (2026-09-03).
//
// **무효화는 파일 제출과 같은 것을 쓴다**(`useInvalidateAfterSubmissionChange`) — 제출은
// 곧 담당자 완료라, 카드·목록·업무 집계가 같이 갱신되지 않으면 "제출했는데 미완료로
// 보인다". 복붙하면 한쪽만 늘어나는 사고가 난다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchTaskSpecSubmissionsFlat, getSpecDocumentById, submitTaskSpecSubmission, getTaskSubmissionWork,
  type SpecSubmissionFlatRow,
} from '@/services/taskSpecSubmissionService';
import { useInvalidateAfterSubmissionChange } from './useTaskSubmissions';

export const specSubmissionFlatKey = (taskId: string) => ['task-spec-submissions', taskId] as const;

export function useTaskSubmissionWork(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['task-submission-action', taskId],
    queryFn: () => getTaskSubmissionWork(taskId),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}

/** 매니저 현황·분석용 평탄 행 — 뷰가 security_invoker 라 담당자는 본인 행만 받는다 */
export function useTaskSpecSubmissionsFlat(taskId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: specSubmissionFlatKey(taskId ?? ''),
    queryFn: () => fetchTaskSpecSubmissionsFlat(taskId!),
    enabled: !!taskId && enabled,
    staleTime: 15_000,
  });
}

export function useSubmitTaskSpecSubmission(taskId: string | undefined) {
  const invalidate = useInvalidateAfterSubmissionChange(taskId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { documentId: string; unitKey?: string | null }) =>
      submitTaskSpecSubmission({ taskId: taskId!, documentId: v.documentId, unitKey: v.unitKey ?? null }),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: specSubmissionFlatKey(taskId ?? '') });
      // 러너의 "저장된 완성 문서" 목록도 새 버전을 보여야 한다
      await qc.invalidateQueries({ queryKey: ['spec-documents'] });
    },
  });
}

/** 제출된 문서 1건(미리보기·내려받기용) — 새 SELECT 정책이 열람 범위를 정한다 */
export function useSpecDocument(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['task-spec-document', documentId],
    queryFn: () => getSpecDocumentById(documentId!),
    enabled: !!documentId,
    staleTime: 60_000,
  });
}

/**
 * 제출용 실행 단건 — 러너를 열려면 `action` 객체가 필요하다.
 *
 * 담당자도 읽을 수 있어야 한다: `origin='submission'` 이라 `task_action_select_teachers` 의
 * docgen 분기(비공개면 차단)에 걸리지 않고 교직원 전체 읽기가 된다.
 */
export function useTaskActionById(actionId: string | null | undefined) {
  return useQuery({
    queryKey: ['task-action-by-id', actionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_action')
        .select('*')
        .eq('id', actionId!)
        .maybeSingle();
      if (error) throw new Error(`제출용 양식 조회 실패: ${error.message}`);
      return data;
    },
    enabled: !!actionId,
    staleTime: 60_000,
  });
}

export type { SpecSubmissionFlatRow };
