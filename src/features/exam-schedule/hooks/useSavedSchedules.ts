import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExamSchedule,
  createMockExamSchedule,
  deleteExamSchedule,
  getExamSchedule,
  listExamSchedules,
  updateExamSchedule,
  type CreateExamScheduleArgs,
} from '../services/examScheduleService';

const KEY = ['exam-schedules'] as const;

export function useSavedSchedules() {
  return useQuery({
    queryKey: KEY,
    queryFn: listExamSchedules,
    staleTime: 30 * 1000,
  });
}

export function useSavedSchedule(id: string | null) {
  return useQuery({
    queryKey: ['exam-schedule', id],
    enabled: !!id,
    queryFn: () => (id ? getExamSchedule(id) : null),
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateExamScheduleArgs) => createExamSchedule(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateMockSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof createMockExamSchedule>[0]) =>
      createMockExamSchedule(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateExamSchedule>[1] }) =>
      updateExamSchedule(args.id, args.patch),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['exam-schedule', vars.id] });
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExamSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
