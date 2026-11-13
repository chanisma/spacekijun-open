import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 가용 감독 인원의 기본값으로 쓰는 교사 리소스 수.
 * 실제 가용 인원(출제·결강 제외)은 사용자가 위저드에서 조정한다.
 */
export function useTeacherCount() {
  return useQuery({
    queryKey: ['exam-schedule-teacher-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('resource')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'teacher');
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 10 * 60 * 1000,
  });
}
