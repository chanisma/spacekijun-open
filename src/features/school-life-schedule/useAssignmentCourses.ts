import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import type { AssignmentCourse, SchoolLifeContext } from './types';

export function useAssignmentCourses(context: SchoolLifeContext | undefined, enabled: boolean) {
  const term = useAcademicTerm();
  const courses = useQuery({
    queryKey: ['school-life-assignment-courses', context?.user_id, context?.classes, term.data?.year, term.data?.semester],
    enabled: enabled && context?.role === 'student' && !!term.data,
    queryFn: async (): Promise<AssignmentCourse[]> => {
      const { data, error } = await supabase.rpc('get_school_life_assignment_courses');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
  return { ...courses, term: term.data, isLoading: term.isLoading || courses.isLoading };
}
