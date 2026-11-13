/**
 * 전자서명 TanStack Query 훅.
 *
 * 목록·상세가 **같은 키 뿌리**(`['signature-requests']`)를 쓰므로, 서명 한 번이면
 * 목록 배지와 상세가 함께 갱신된다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  actOnSignatureRequest, cancelSignatureRequest, createSignatureRequest, setSignatureDue,
  deleteSignatureRequest,
  fetchSignatureRequest, fetchSignatureRequests, fetchSignatureRequestsBySubject,
  type CreateSignatureRequestInput,
} from '../services/signatureService';
import type { SignatureRequest } from '../types';

const ROOT = ['signature-requests'] as const;

export function useSignatureRequests() {
  return useQuery({
    queryKey: [...ROOT, 'all'],
    queryFn: fetchSignatureRequests,
    staleTime: 30 * 1000,
  });
}

/**
 * 상세.
 *
 * 휴대폰에서 서명해도 **데스크톱 탭에는 focus 이벤트가 없어** 자동 갱신이 걸리지 않는다.
 * 그래서 상세가 열려 있고 아직 진행 중일 때만 폴링하고, 끝나면 스스로 멈춘다(결재와 같은 처리).
 */
export function useSignatureRequest(id: string | null, enabled = true, pollMs = 0) {
  return useQuery({
    queryKey: [...ROOT, 'one', id],
    queryFn: () => fetchSignatureRequest(id!),
    enabled: enabled && !!id,
    refetchInterval: (query) =>
      pollMs > 0 && query.state.data?.status === 'pending' ? pollMs : false,
  });
}

export function useSignatureRequestsBySubject(subjectType: string | null, subjectId?: string) {
  return useQuery({
    queryKey: [...ROOT, 'subject', subjectType, subjectId ?? null],
    queryFn: () => fetchSignatureRequestsBySubject(subjectType!, subjectId),
    enabled: !!subjectType,
    staleTime: 30 * 1000,
  });
}

export function useCreateSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSignatureRequestInput) => createSignatureRequest(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROOT });
      toast.success('서명을 요청했습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '서명 요청에 실패했습니다.'),
  });
}

export function useSetSignatureDue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; dueAt: string }) => setSignatureDue(v.requestId, v.dueAt),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ROOT }); },
    onError: (e: Error) => toast.error(e.message || '마감일을 바꾸지 못했습니다.'),
  });
}

export function useActOnSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      requestId: string;
      action: 'sign' | 'reject';
      signature?: unknown;
      comment?: string | null;
    }) => actOnSignatureRequest(v.requestId, v.action, v.signature ?? null, v.comment),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ROOT });
      toast.success(v.action === 'sign' ? '서명했습니다.' : '거절했습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '처리에 실패했습니다.'),
  });
}

export function useDeleteSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: SignatureRequest) => deleteSignatureRequest(request),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROOT });
    },
    onError: (e: Error) => toast.error(e.message || '삭제하지 못했습니다.'),
  });
}

export function useCancelSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelSignatureRequest(requestId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROOT });
    },
    onError: (e: Error) => toast.error(e.message || '취소에 실패했습니다.'),
  });
}
