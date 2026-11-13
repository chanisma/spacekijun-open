/**
 * TanStack Query hooks for SRS study sessions.
 * Manages the lifecycle: start → review cards → end → summary.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { startSession, endSession, recordCardReview } from '../services/srsService';
import { srsCardKeys } from './useSrsCards';
import { srsSubjectKeys } from './useSrsSubjects';
import { srsStatsKeys } from './useSrsStats';
import type { RecordReviewParams } from '../types/srs.types';

export function useStartSession() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => startSession(user!.id),
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (params: {
      sessionId: string;
      cards_reviewed: number;
      cards_correct: number;
      retention_gain?: number;
      avg_recall_time_ms?: number;
      meta?: Record<string, unknown>;
    }) => endSession(params.sessionId, params),
    onSuccess: () => {
      // Invalidate everything after session ends — stats, cards, subjects all change
      queryClient.invalidateQueries({ queryKey: srsCardKeys.all });
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
      queryClient.invalidateQueries({ queryKey: srsStatsKeys.all });
    },
  });
}

export function useRecordReview() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: (params: RecordReviewParams) => recordCardReview(user!.id, params),
    // Don't invalidate on each review — wait until session ends for batch invalidation
  });
}
