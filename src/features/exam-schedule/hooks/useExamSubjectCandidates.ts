import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Grade, SubjectCandidate } from '../types';

export function useExamSubjectCandidates(grade: Grade | null) {
  return useQuery({
    queryKey: ['exam-subject-candidates', grade],
    enabled: grade !== null,
    queryFn: async (): Promise<SubjectCandidate[]> => {
      if (grade === null) return [];
      const { data, error } = await (supabase.rpc as any)('get_exam_subject_candidates', {
        p_grade: grade,
      });
      if (error) throw error;
      return (data ?? []) as SubjectCandidate[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
