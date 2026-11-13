import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStudentStatus, setStudentStatus, listStatusHistory } from '../services/rescueStatus';
import type { RescueStatus } from '../constants';

export function useStudentStatus(studentCode: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'student-status', studentCode],
    queryFn: () => getStudentStatus(studentCode!),
    enabled: !!studentCode,
    staleTime: 30_000,
  });
}

export function useStatusHistory(studentCode: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'status-history', studentCode],
    queryFn: () => listStatusHistory(studentCode!),
    enabled: !!studentCode,
    staleTime: 60_000,
  });
}

export function useSetStudentStatus(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, reason }: { status: RescueStatus; reason?: string }) =>
      setStudentStatus(studentCode, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'student-status', studentCode] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'status-history', studentCode] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'roster'] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'crisis-dashboard'] });
    },
  });
}
