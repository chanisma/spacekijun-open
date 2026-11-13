import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listStudentTags, toggleRescueTag } from '../services/rescueTag';

export function useStudentTags(studentCode: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'student-tags', studentCode],
    queryFn: () => listStudentTags(studentCode!),
    enabled: !!studentCode,
    staleTime: 30_000,
  });
}

export function useToggleRescueTag(studentCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagKey, action }: { tagKey: string; action: 'add' | 'remove' }) =>
      toggleRescueTag(studentCode, tagKey, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rescue-note', 'student-tags', studentCode] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'roster'] });
      qc.invalidateQueries({ queryKey: ['rescue-note', 'crisis-dashboard'] });
    },
  });
}
