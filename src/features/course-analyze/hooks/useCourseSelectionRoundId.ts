import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * course-analyze 컨텍스트의 (학년도, 학년, 차수)로 course_selection_round.id 조회.
 * 매칭되는 라운드가 없으면 null (모달에서 편집 불가 안내).
 */
export function useCourseSelectionRoundId(
  academicYear: number | null,
  grade: number | null,
  roundNumber: number | null,
) {
  return useQuery({
    queryKey: ['ca-cs-round-id', academicYear, grade, roundNumber],
    queryFn: async (): Promise<string | null> => {
      if (academicYear == null || grade == null || roundNumber == null) return null;
      const { data, error } = await supabase
        .from('course_selection_round')
        .select('id')
        .eq('academic_year', academicYear)
        .eq('target_grade', grade)
        .eq('round_number', roundNumber)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: academicYear != null && grade != null && roundNumber != null,
    staleTime: 5 * 60_000,
  });
}
