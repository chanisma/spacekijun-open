import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRescueScholarships,
  createRescueScholarship,
  updateRescueScholarship,
  deleteRescueScholarship,
} from '../services/rescueScholarship';
import type { RescueScholarship, RescueScholarshipInput } from '../types/rescueScholarship';

export function useRescueScholarships(studentCode: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'scholarships', studentCode],
    queryFn: () => listRescueScholarships(studentCode!),
    enabled: !!studentCode,
    staleTime: 30_000,
  });
}

export function useCreateRescueScholarship(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RescueScholarshipInput) => createRescueScholarship(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'scholarships', studentCode] });
    },
  });
}

export function useUpdateRescueScholarship(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<RescueScholarship, 'name' | 'awardedOn' | 'remarks' | 'meta'>>;
    }) => updateRescueScholarship(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'scholarships', studentCode] });
    },
  });
}

export function useDeleteRescueScholarship(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRescueScholarship(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'scholarships', studentCode] });
    },
  });
}
