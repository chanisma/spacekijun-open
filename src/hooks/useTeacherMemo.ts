import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export interface TeacherMemo {
  id: string;
  resource_id: string;
  memo_date: string;
  period: number;
  content: string;
  created_at: string;
  updated_at: string;
}

interface UpsertMemoParams {
  resource_id: string;
  memo_date: string;
  period: number;
  content: string;
}

const QUERY_KEY = 'teacher-memo';

/**
 * 주간 단위로 교사 메모를 조회하는 hook
 */
export const useTeacherMemos = (resourceId: string | undefined, currentDate: Date) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(weekEnd, 'yyyy-MM-dd');

  return useQuery({
    queryKey: [QUERY_KEY, resourceId, startStr, endStr],
    queryFn: async (): Promise<TeacherMemo[]> => {
      if (!resourceId) return [];

      const { data, error } = await (supabase as any)
        .from('teacher_memo')
        .select('*')
        .eq('resource_id', resourceId)
        .gte('memo_date', startStr)
        .lte('memo_date', endStr)
        .order('memo_date')
        .order('period');

      if (error) throw error;
      return data || [];
    },
    enabled: !!resourceId,
  });
};

/**
 * 메모 생성/수정 (upsert)
 */
export const useUpsertMemo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpsertMemoParams) => {
      const { data, error } = await (supabase as any)
        .from('teacher_memo')
        .upsert(
          {
            resource_id: params.resource_id,
            memo_date: params.memo_date,
            period: params.period,
            content: params.content,
          },
          { onConflict: 'resource_id,memo_date,period' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

/**
 * 메모 삭제
 */
export const useDeleteMemo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memoId: string) => {
      const { error } = await (supabase as any)
        .from('teacher_memo')
        .delete()
        .eq('id', memoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

/**
 * 특정 날짜+교시의 메모를 빠르게 찾는 유틸
 */
export const findMemoForSlot = (
  memos: TeacherMemo[],
  date: Date,
  period: number
): TeacherMemo | undefined => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return memos.find(m => m.memo_date === dateStr && m.period === period);
};
