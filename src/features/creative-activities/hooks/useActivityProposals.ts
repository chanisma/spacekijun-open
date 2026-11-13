// ========================================
// 활동 제안 · 관심 표시 hooks (Phase 3)
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  createProposal,
  deleteProposal,
  fetchProposals,
  reviewProposal,
  toggleInterest,
} from '../services/activityProposalService';
import type {
  ActivityProposalInput,
  InterestSubjectType,
  ProposalStatus,
} from '../types';

export const proposalKeys = {
  all: ['creative-activity-proposals'] as const,
  list: (studentCode: string | null) => [...proposalKeys.all, 'list', studentCode ?? ''] as const,
};

export function useActivityProposals(myStudentCode: string | null, refreshInterval?: number) {
  return useQuery({
    queryKey: proposalKeys.list(myStudentCode),
    queryFn: () => fetchProposals(myStudentCode),
    staleTime: 60_000,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useCreateProposal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: ActivityProposalInput) => createProposal(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      toast.success('제안을 등록했습니다. 선생님들이 검토합니다.');
    },
    onError: (error: Error) => {
      console.error('제안 등록 실패:', error);
      toast.error(error.message || '제안 등록에 실패했습니다.');
    },
  });
}

export function useReviewProposal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      id: string;
      status: ProposalStatus;
      reviewNote?: string | null;
      resultingActivityId?: string | null;
    }) => reviewProposal(payload),
    onSuccess: (_r, variables) => {
      qc.invalidateQueries({ queryKey: proposalKeys.all });
      const label: Record<ProposalStatus, string> = {
        submitted: '접수로 되돌렸습니다.',
        reviewing: '검토 중으로 표시했습니다.',
        accepted: '제안을 수락했습니다.',
        declined: '제안을 보류했습니다.',
      };
      toast.success(label[variables.status]);
    },
    onError: (error: Error) => {
      console.error('제안 검토 실패:', error);
      toast.error(error.message || '검토에 실패했습니다.');
    },
  });
}

export function useDeleteProposal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteProposal,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: proposalKeys.all });
    },
    onError: (error: Error) => {
      console.error('제안 삭제 실패:', error);
      toast.error(error.message || '삭제에 실패했습니다.');
    },
  });
}

export function useToggleInterest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      subjectType: InterestSubjectType;
      subjectId: string;
      studentCode: string;
      on: boolean;
    }) => toggleInterest(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: proposalKeys.all });
    },
    onError: (error: Error) => {
      console.error('관심 표시 실패:', error);
      toast.error(error.message || '관심 표시에 실패했습니다.');
    },
  });
}
