import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { supabase } from '@/integrations/supabase/client';
import { toLocalDateKey } from '@/features/teacher-dashboard/utils/seatReservationOverview';
import { readStudentSeatHome } from './studentHomeData';

/** The briefing and reservation card share one bounded, student-scoped query. */
export function useStudentSeatHome(studentCode: string | null) {
  const { user, profile } = useAuth();
  const now = useCurrentTime();
  const today = toLocalDateKey(now);
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 6);
  const end = toLocalDateKey(endDate);
  const query = useQuery({
    queryKey: ['student-home', 'seats', user?.id, profile?.role, studentCode, today],
    enabled: !!user && !!studentCode,
    queryFn: async () => {
      if (!studentCode) throw new Error('학생 정보가 필요합니다.');
      let profileId = profile?.role === 'student' ? user?.id : null;
      if (!profileId) {
        const identity = await supabase.from('student_identity_map').select('profile_id').eq('student_code', studentCode).maybeSingle();
        if (identity.error) throw identity.error;
        profileId = identity.data?.profile_id;
      }
      if (!profileId) return null;
      return readStudentSeatHome(supabase, profileId, today, end);
    },
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
  return { ...query, today };
}
