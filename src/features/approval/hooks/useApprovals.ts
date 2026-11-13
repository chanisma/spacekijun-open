import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actOnApproval,
  cancelApprovalRequest,
  createApprovalRequest,
  fetchApprovalRequest,
  fetchApprovalsForSubject,
  fetchMyApprovals,
  type ActOnApprovalArgs,
  type CreateApprovalArgs,
} from '../services/approvalService';
import { isMyTurn, type ApprovalRequest } from '../types';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';

/** 쿼리 키 — 대상별 조회와 내 결재함이 같은 prefix를 공유해 한 번에 무효화된다. */
const KEY = ['approvals'] as const;
const subjectKey = (type: string, id: string) => [...KEY, 'subject', type, id] as const;
const mineKey = [...KEY, 'mine'] as const;
const oneKey = (id: string) => [...KEY, 'one', id] as const;

/**
 * 결재 한 건. `pollMs`를 주면 그동안 주기적으로 다시 읽는다 —
 * 데스크톱에서 QR을 띄워두고 휴대폰으로 서명하면 탭 전환이 없어
 * focus 기반 refetch가 걸리지 않기 때문.
 */
export const useApprovalRequest = (
  requestId: string | undefined,
  enabled = true,
  pollMs?: number,
) =>
  useQuery({
    queryKey: oneKey(requestId ?? ''),
    enabled: !!requestId && enabled,
    queryFn: () => fetchApprovalRequest(requestId!),
    // 이미 끝난 결재는 더 볼 것이 없으므로 스스로 멈춘다(모달을 열어둔 채 방치해도 계속 돌지 않게).
    refetchInterval: (query) => {
      if (!pollMs) return false;
      const data = query.state.data;
      if (data && data.status !== 'pending') return false;
      return pollMs;
    },
  });

export const useSubjectApprovals = (
  subjectType: string | undefined,
  subjectId: string | undefined,
  enabled = true,
) =>
  useQuery({
    queryKey: subjectKey(subjectType ?? '', subjectId ?? ''),
    enabled: !!subjectType && !!subjectId && enabled,
    queryFn: () => fetchApprovalsForSubject(subjectType!, subjectId!),
  });

export const useMyApprovals = (enabled = true) =>
  useQuery({
    queryKey: mineKey,
    enabled,
    queryFn: fetchMyApprovals,
  });

/**
 * 한 종류의 결재만(예: 보강 계획서). 내가 신청했거나 내 결재선에 있는 것 = RLS가 이미 거른 범위.
 * `useMyApprovals`와 같은 캐시를 공유하므로 화면을 여러 개 붙여도 요청이 늘지 않는다.
 */
export const useMyApprovalsBySubjectType = (subjectType: string, enabled = true) => {
  const query = useMyApprovals(enabled);
  const items = (query.data ?? []).filter((r) => r.subject_type === subjectType);
  return { ...query, data: items as ApprovalRequest[] };
};

/**
 * 지금 내가 결재할 차례인 것만.
 * 서버 판정과 같은 규칙(계정 없는 결재자는 이름으로 판정)을 `isMyTurn`이 공유한다.
 */
export const useMyPendingApprovals = (enabled = true) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const query = useMyApprovals(enabled);

  const items = (query.data ?? []).filter((r) => isMyTurn(r, user?.id, profile?.name));
  return { ...query, data: items as ApprovalRequest[] };
};

const invalidateAll = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: KEY });
};

export const useCreateApproval = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateApprovalArgs) => createApprovalRequest(args),
    onSuccess: () => invalidateAll(queryClient),
  });
};

export const useActOnApproval = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: ActOnApprovalArgs) => actOnApproval(args),
    onSuccess: () => invalidateAll(queryClient),
  });
};

export const useCancelApproval = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelApprovalRequest(requestId),
    onSuccess: () => invalidateAll(queryClient),
  });
};
