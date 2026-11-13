import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRescueNotes,
  createRescueNote,
  updateRescueNote,
  deleteRescueNote,
} from '../services/rescueNote';
import type { RescueNoteInput, RescueNote } from '../types/rescueNote';

export function useRescueNotes(studentCode: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'notes', studentCode],
    queryFn: () => listRescueNotes(studentCode!),
    enabled: !!studentCode,
    staleTime: 30_000,
  });
}

export function useCreateRescueNote(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RescueNoteInput) => createRescueNote(input),
    onSuccess: (_id, variables) => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'notes', studentCode] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'roster'] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'crisis-dashboard'] });
      (variables.coStudentCodes ?? []).forEach((code) => {
        qc.invalidateQueries({ queryKey: ['rescue-note', 'notes', code] });
      });
    },
  });
}

export function useUpdateRescueNote(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<RescueNote, 'occurredAt' | 'endAt' | 'title' | 'remarks' | 'content' | 'visibility' | 'meta'>>;
    }) => updateRescueNote(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'notes', studentCode] });
    },
  });
}

export function useDeleteRescueNote(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRescueNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'notes', studentCode] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'roster'] });
    },
  });
}
