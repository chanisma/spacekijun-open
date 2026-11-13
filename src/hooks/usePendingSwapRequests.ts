/**
 * Hook to fetch pending incoming swap requests count
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';

export function usePendingSwapRequestsCount() {
  const { resourceId } = useCurrentResourceId();

  return useQuery({
    queryKey: ['pending-swap-count', resourceId],
    queryFn: async () => {
      if (!resourceId) return 0;

      const { data, error, count } = await (supabase as any)
        .from('class_swap')
        .select('id', { count: 'exact', head: false })
        .eq('approver_resource_id', resourceId)
        .eq('status', 'pending');

      if (error) {
        console.error('미처리 교체 요청 개수 조회 오류:', error);
        return 0;
      }

      // Return count if available, otherwise data length
      return count !== null ? count : (data?.length || 0);
    },
    enabled: !!resourceId,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000, // Consider fresh for 10 seconds
  });
}
