/**
 * TanStack Query hooks for SRS cards.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  fetchCards,
  fetchDueCards,
  createCard,
  bulkCreateCards,
  updateCard,
  deleteCard,
} from '../services/srsService';
import { srsSubjectKeys } from './useSrsSubjects';
import { srsStatsKeys } from './useSrsStats';
import type { CreateCardParams, UpdateCardParams } from '../types/srs.types';

export const srsCardKeys = {
  all: ['srs', 'cards'] as const,
  bySubject: (subjectId: string) => [...srsCardKeys.all, 'subject', subjectId] as const,
  due: (userId: string) => [...srsCardKeys.all, 'due', userId] as const,
  dueBySubject: (userId: string, subjectId: string) =>
    [...srsCardKeys.all, 'due', userId, subjectId] as const,
};

export function useSrsCards(subjectId: string | null) {
  return useQuery({
    queryKey: srsCardKeys.bySubject(subjectId ?? ''),
    queryFn: () => fetchCards(subjectId!),
    enabled: !!subjectId,
    staleTime: 30_000,
  });
}

export function useSrsDueCards(subjectId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: subjectId
      ? srsCardKeys.dueBySubject(user?.id ?? '', subjectId)
      : srsCardKeys.due(user?.id ?? ''),
    queryFn: () => fetchDueCards(user!.id, subjectId),
    enabled: !!user?.id,
    staleTime: 10_000, // Due cards change frequently
  });
}

export function useCreateCard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (params: CreateCardParams) => createCard(user!.id, params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: srsCardKeys.bySubject(variables.subject_id) });
      queryClient.invalidateQueries({ queryKey: srsCardKeys.due(user!.id) });
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
      queryClient.invalidateQueries({ queryKey: srsStatsKeys.concepts(variables.subject_id) });
    },
  });
}

export function useBulkCreateCards() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (cards: CreateCardParams[]) => bulkCreateCards(user!.id, cards),
    onSuccess: (_data, variables) => {
      const subjectId = variables.length > 0 ? variables[0].subject_id : '';
      queryClient.invalidateQueries({ queryKey: srsCardKeys.bySubject(subjectId) });
      queryClient.invalidateQueries({ queryKey: srsCardKeys.due(user!.id) });
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
      if (subjectId) {
        queryClient.invalidateQueries({ queryKey: srsStatsKeys.concepts(subjectId) });
      }
    },
  });
}

export function useUpdateCard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (params: UpdateCardParams) => updateCard(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: srsCardKeys.all });
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
      queryClient.invalidateQueries({ queryKey: srsStatsKeys.all });
    },
  });
}

export function useDeleteCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cardId: string) => deleteCard(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: srsCardKeys.all });
      queryClient.invalidateQueries({ queryKey: srsSubjectKeys.all });
      queryClient.invalidateQueries({ queryKey: srsStatsKeys.all });
    },
  });
}
