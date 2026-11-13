// ========================================
// Task Order Index Hook
// 태스크의 order_index 정보를 가져오는 hook
// ========================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTaskOrders(taskIds: string[]) {
  return useQuery({
    queryKey: ['task-orders', taskIds],
    queryFn: async () => {
      if (taskIds.length === 0) return {};

      try {
        const { data, error } = await (supabase as any)
          .from('task')
          .select('id, order_index')
          .in('id', taskIds);

        if (error) throw error;

        const orderMap: {[key: string]: number} = {};
        (data as any).forEach((task: any) => {
          if (task.order_index !== null) {
            orderMap[task.id] = task.order_index;
          }
        });

        return orderMap;
      } catch (error) {
        console.error('Failed to fetch task orders:', error);
        return {};
      }
    },
    enabled: taskIds.length > 0,
    staleTime: 5 * 60 * 1000,     // 5분간 fresh - order_index는 자주 변경되지 않음
    gcTime: 10 * 60 * 1000,       // 10분간 캐시 보관
  });
}