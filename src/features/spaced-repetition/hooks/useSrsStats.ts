/**
 * TanStack Query hooks for SRS user statistics and daily activity.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  fetchUserStats,
  fetchDailyActivity,
  updateDailyGoal,
  fetchConceptBreakdown,
  fetchRecentReviews,
} from '../services/srsService';

export const srsStatsKeys = {
  all: ['srs', 'stats'] as const,
  user: (userId: string) => [...srsStatsKeys.all, 'user', userId] as const,
  activity: (userId: string, year: number) =>
    [...srsStatsKeys.all, 'activity', userId, year] as const,
  concepts: (subjectId: string) => [...srsStatsKeys.all, 'concepts', subjectId] as const,
};

export function useSrsUserStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: srsStatsKeys.user(user?.id ?? ''),
    queryFn: () => fetchUserStats(user!.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useSrsDailyActivity(year?: number) {
  const { user } = useAuth();
  const currentYear = year ?? new Date().getFullYear();

  return useQuery({
    queryKey: srsStatsKeys.activity(user?.id ?? '', currentYear),
    queryFn: () => fetchDailyActivity(user!.id, currentYear),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useSrsConceptBreakdown(subjectId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: srsStatsKeys.concepts(subjectId ?? ''),
    queryFn: () => fetchConceptBreakdown(subjectId!, user!.id),
    enabled: !!subjectId && !!user?.id,
    staleTime: 30_000,
  });
}

export function useSrsRecentReviews(limit: number = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...srsStatsKeys.all, 'recent-reviews', user?.id ?? ''],
    queryFn: () => fetchRecentReviews(user!.id, limit),
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

export function useUpdateDailyGoal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (goal: number) => updateDailyGoal(user!.id, goal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: srsStatsKeys.user(user!.id) });
    },
  });
}
