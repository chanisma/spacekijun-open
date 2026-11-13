// ========================================
// 제출 받기 작업(submit.*) 훅 (2026-10-01)
// 판(board)은 입력 받기와 같은 키 아래에 둔다 — 요청·명단 RPC(보내기·다시 계산·마감)가
// 입력 받기 훅의 무효화([COLLECT_KEY])를 그대로 쓰므로 키가 갈리면 화면이 낡는다.
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COLLECT_KEY } from './useCollectInput';
import { taskActionKeys } from './useTaskActions';
import {
  deleteActionSubmission,
  getSubmitBoard,
  markActionReceived,
  submitActionDocument,
  submitActionFile,
} from '../services/submitActionService';
import type { SubmissionRow } from '@/lib/submitAction';

export function useSubmitBoard(actionId: string | null) {
  return useQuery({
    queryKey: [COLLECT_KEY, 'submit-board', actionId],
    enabled: Boolean(actionId),
    queryFn: () => getSubmitBoard(actionId!),
  });
}

/** 제출은 담당자 완료를 바꾼다 — 할 일 목록·내 할 일도 함께 다시 읽는다 */
function useInvalidateAfterSubmit() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: [COLLECT_KEY] }),
    queryClient.invalidateQueries({ queryKey: taskActionKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
    queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
    queryClient.invalidateQueries({ queryKey: ['work-detail'] }),
  ]);
}

export function useSubmitActionFiles() {
  const invalidate = useInvalidateAfterSubmit();
  return useMutation({
    // 한 파일씩 순서대로 — 하나가 실패해도 앞의 것은 이미 제출됐다(화면이 실패한 것만 남긴다)
    mutationFn: async ({ actionId, taskId, files, unitKey }: { actionId: string; taskId: string; files: File[]; unitKey?: string | null }) => {
      const failed: { file: File; message: string }[] = [];
      for (const file of files) {
        try {
          await submitActionFile(actionId, taskId, file, unitKey);
        } catch (e) {
          failed.push({ file, message: e instanceof Error ? e.message : '올리지 못했습니다.' });
        }
      }
      return { failed };
    },
    onSettled: () => invalidate(),
  });
}

export function useSubmitActionDocument() {
  const invalidate = useInvalidateAfterSubmit();
  return useMutation({
    mutationFn: ({ actionId, documentId, unitKey }: { actionId: string; documentId: string; unitKey?: string | null }) =>
      submitActionDocument(actionId, documentId, unitKey),
    onSuccess: () => invalidate(),
  });
}

export function useMarkActionReceived() {
  const invalidate = useInvalidateAfterSubmit();
  return useMutation({
    mutationFn: ({ actionId, resourceId, received, unitKey }: { actionId: string; resourceId: string; received: boolean; unitKey?: string | null }) =>
      markActionReceived(actionId, resourceId, received, unitKey),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteActionSubmission() {
  const invalidate = useInvalidateAfterSubmit();
  return useMutation({
    mutationFn: (submission: Pick<SubmissionRow, 'id' | 'google_drive_id'>) => deleteActionSubmission(submission),
    onSuccess: () => invalidate(),
  });
}
