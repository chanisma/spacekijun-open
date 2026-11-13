// ========================================
// 입력 받기(collect.input) 훅
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AudienceAxis, AudienceRule } from '@/lib/audienceRule';
import type { CollectValues } from '@/lib/collectInput';
import {
  getCollectBoard,
  listMyCollectRequests,
  remindCollectPending,
  resolveAudience,
  resolveTaskAudience,
  setCollectRequestStatus,
  startCollectRequest,
  submitCollectResponse,
  syncCollectTargets,
  updateCollectConfig,
} from '../services/collectInputService';
import { taskActionKeys } from './useTaskActions';

export const COLLECT_KEY = 'collect-input';

export function useCollectBoard(actionId: string | null) {
  return useQuery({
    queryKey: [COLLECT_KEY, 'board', actionId],
    enabled: Boolean(actionId),
    queryFn: () => getCollectBoard(actionId!),
  });
}

export function useMyCollectRequests(enabled = true) {
  return useQuery({
    queryKey: [COLLECT_KEY, 'mine'],
    enabled,
    queryFn: listMyCollectRequests,
    staleTime: 30 * 1000,
  });
}

/**
 * 규칙 미리보기 — 규칙·축이 바뀔 때마다 서버가 다시 푼다.
 * `taskId` 를 주면 «이 할 일의 담당자» 조건을 그 할 일로 풀어 계산한다(2026-10-01) — 안 주면 그 조건은 비어 보인다.
 */
export function useAudiencePreview(rule: AudienceRule, axis: AudienceAxis, enabled: boolean, taskId?: string | null) {
  return useQuery({
    queryKey: [COLLECT_KEY, 'preview', axis, taskId ?? null, JSON.stringify(rule)],
    enabled: enabled && rule.include.length > 0,
    queryFn: () => (taskId ? resolveTaskAudience(rule, taskId, axis) : resolveAudience(rule, axis)),
    staleTime: 60 * 1000,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [COLLECT_KEY] });
}

export function useSaveCollectConfig() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, config }: { actionId: string; config: Record<string, unknown> }) =>
      updateCollectConfig(actionId, config),
    onSuccess: () => {
      invalidate();
      // 작업 제목·설정이 바뀌었다 — 작업 목록도 다시 읽는다
      queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

export function useStartCollectRequest() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: startCollectRequest, onSuccess: invalidate });
}

export function useSyncCollectTargets() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ actionId, apply }: { actionId: string; apply: boolean }) => syncCollectTargets(actionId, apply),
    onSuccess: (_d, v) => v.apply && invalidate(),
  });
}

export function useSubmitCollectResponse() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { actionId: string; unitKey: string; dimensionKey: string; values: CollectValues }) =>
      submitCollectResponse(input),
    onSuccess: invalidate,
  });
}

export function useSetCollectRequestStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: 'open' | 'closed' }) =>
      setCollectRequestStatus(actionId, status),
    onSuccess: invalidate,
  });
}

export function useRemindCollectPending() {
  return useMutation({ mutationFn: remindCollectPending });
}
