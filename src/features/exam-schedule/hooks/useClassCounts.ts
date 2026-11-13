import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Grade } from '../types';

/**
 * 학년별 반 수 (공통 과목 시험실 수의 기본값).
 * student_basic_info의 distinct class_num으로 집계하며, 사용자가 위저드에서
 * 직접 조정할 수 있다.
 */
export function useClassCounts() {
  return useQuery({
    queryKey: ['exam-schedule-class-counts'],
    queryFn: async (): Promise<Partial<Record<Grade, number>>> => {
      const { data, error } = await supabase
        .from('student_basic_info' as never)
        .select('grade, class_num');
      if (error) throw error;
      const sets = new Map<number, Set<number>>();
      for (const row of (data ?? []) as Array<{ grade: unknown; class_num: unknown }>) {
        const g = Number(row.grade);
        const c = Number(row.class_num);
        if (!Number.isInteger(g) || g < 1 || g > 3 || !Number.isInteger(c) || c < 1) continue;
        if (!sets.has(g)) sets.set(g, new Set());
        sets.get(g)!.add(c);
      }
      const out: Partial<Record<Grade, number>> = {};
      for (const g of [1, 2, 3] as Grade[]) {
        const size = sets.get(g)?.size ?? 0;
        if (size > 0) out[g] = size;
      }
      return out;
    },
    staleTime: 10 * 60 * 1000,
  });
}
