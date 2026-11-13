// ========================================
// Weekly Schedule Hook
// 주간 일정을 가져오는 최적화된 hook
// ========================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { isUserAssignee } from '@/lib/assigneeUtils';

export function useWeeklySchedule(currentResourceId: string | null) {
  const { profile } = useAuth();
  const userName = profile?.name ?? null;

  return useQuery({
    queryKey: ['weekly-schedule', currentResourceId, userName],
    queryFn: async () => {
      if (!currentResourceId) return [];

      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // 이번 주 일요일
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7); // 다음 주 일요일

      const { data: weeklyMeetings, error } = await supabase
        .from('meeting')
        .select(`
          *,
          section(name)
        `)
        .gte('starts_at', startOfWeek.toISOString())
        .lt('starts_at', endOfWeek.toISOString())
        .order('starts_at', { ascending: true });

      if (error) {
        console.error('Error fetching weekly schedule:', error);
        return [];
      }

      // NEIS 학사일정(kind='schedule')은 학교 공통이라 항상 노출.
      // 그 외에는 meta.assignee에 본인 이름이 있는 경우만 (admin 포함 모든 사용자에게 동일 적용).
      // created_by는 사용하지 않는다 — admin이 일괄 등록한 일정까지 통과하는 부작용 때문.
      return (weeklyMeetings || []).filter((m: any) => {
        if (m.kind === 'schedule') return true;
        if (userName && isUserAssignee(m.meta?.assignee, userName)) return true;
        return false;
      });
    },
    enabled: !!currentResourceId,
    staleTime: 30 * 60 * 1000,    // 30분간 fresh - 주간 일정은 안정적
    gcTime: 60 * 60 * 1000,       // 1시간간 캐시 보관
    refetchOnMount: true,         // 마운트 시 항상 최신 데이터 가져오기
    refetchOnWindowFocus: true,   // 탭 전환 시 staleTime 초과하면 refetch
    refetchOnReconnect: true,
  });
}