// ========================================
// Today Meetings Hook
// 오늘의 미팅/일정을 가져오는 최적화된 hook
// ========================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTodayMeetings(currentResourceId: string | null) {
  return useQuery({
    queryKey: ['today-meetings', currentResourceId],
    queryFn: async () => {
      if (!currentResourceId) return [];

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const { data: meetings, error } = await supabase
        .from('meeting')
        .select(`
          *,
          section(name)
        `)
        .gte('starts_at', todayStart)
        .lt('starts_at', todayEnd)
        .order('starts_at', { ascending: true });

      if (error) {
        console.error('Error fetching today meetings:', error);
        return [];
      }

      return meetings || [];
    },
    enabled: !!currentResourceId,
    staleTime: 15 * 60 * 1000,    // 15분간 fresh - 미팅은 비교적 자주 변경될 수 있음
    gcTime: 30 * 60 * 1000,       // 30분간 캐시 보관
    refetchOnMount: true,         // 마운트 시 항상 최신 데이터 가져오기
    refetchOnWindowFocus: true,   // 탭 전환 시 staleTime 초과하면 refetch
    refetchOnReconnect: true,
  });
}