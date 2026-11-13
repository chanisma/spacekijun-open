import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTimetablePlan,
  getTimetablePlan,
  listTimetablePlans,
  updateTimetablePlan,
} from '../services/timetablePlanService';
import type { SavedTimetablePlan } from '../types';

const KEY = ['timetable-plans'];

export function useSavedTimetablePlans() {
  return useQuery({
    queryKey: KEY,
    queryFn: listTimetablePlans,
    staleTime: 30 * 1000,
  });
}

export function useTimetablePlan(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: () => (id ? getTimetablePlan(id) : Promise.resolve(null)),
  });
}

export function useUpdateTimetablePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateTimetablePlan>[1] }) =>
      updateTimetablePlan(id, patch),
    onSuccess: (row: SavedTimetablePlan) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, row.id] });
    },
  });
}

export function useDeleteTimetablePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTimetablePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
