import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { teacherSectionName } from '@/lib/timetableSource';

/** 이번 학기 내 수업 이름(«과목 학년-반») — 프리셋을 반에 묶을 때 고르는 목록 */
export function useMyClassSections(resourceId: string | null | undefined) {
  const { term, isLoading } = useTimetableTerm();
  return useQuery({
    queryKey: ['classroom-link-sections', resourceId, term?.year ?? null, term?.semester ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_timetable')
        .select('grade, subject_name, class_label')
        .eq('academic_year', term!.year)
        .eq('semester', term!.semester)
        .eq('teacher_resource_id', resourceId!);
      if (error) throw error;
      const names = new Set((data ?? []).map((slot) => teacherSectionName(slot)));
      return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
    },
    enabled: !!resourceId && !isLoading && !!term,
    staleTime: 30 * 60 * 1000,
  });
}
