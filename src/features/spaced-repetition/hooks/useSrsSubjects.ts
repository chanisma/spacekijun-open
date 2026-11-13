/**
 * TanStack Query hooks for SRS subjects.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  fetchSubjects,
  fetchSubjectsWithStats,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../services/srsService';
import type { CreateSubjectParams, UpdateSubjectParams } from '../types/srs.types';

export const srsSubjectKeys = {
  all: ['srs', 'subjects'] as const,
  list: (userId: string) => [...srsSubjectKeys.all, 'list', userId] as const,
  withStats: (userId: string) => [...srsSubjectKeys.all, 'with-stats', userId] as const,
};

export function useSrsSubjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: srsSubjectKeys.list(user?.id ?? ''),
    queryFn: () => fetchSubjects(user!.id),
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export function useSrsSubjectsWithStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: srsSubjectKeys.withStats(user?.id ?? ''),
    queryFn: () => fetchSubjectsWithStats(user!.id),
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (params: CreateSubjectParams) => createSubject(user!.id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
    },
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateSubjectParams) => updateSubject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
    },
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (subjectId: string) => deleteSubject(subjectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
    },
  });
}
