// 업무노트의 «내 업무» — 진행 중인 내가 책임자인 업무 + 할 일(진척·마감 판정용) (2026-11-12)
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { roomMetaOf, type RoomTask } from '../model/workRoom';

export interface MyWorkRow { id: string; name: string; targetDate: string | null; updated_at: string; tasks: RoomTask[] }

export const MY_WORKS_KEY = ['work-today', 'my-works'] as const;

export function useMyActiveWorks(myResourceId: string | null) {
  return useQuery({
    queryKey: [...MY_WORKS_KEY, myResourceId],
    enabled: !!myResourceId,
    queryFn: async (): Promise<MyWorkRow[]> => {
      const id = myResourceId!;
      const { data, error } = await (supabase as any).from('work')
        .select('id, name, meta, updated_at, tasks:task(id, title, status, due_date, meta)')
        .eq('status', 'active')
        .or(`manager_id.eq.${id},meta->managers.cs.${JSON.stringify([{ id }])}`)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((w: { id: string; name: string; meta: unknown; updated_at: string; tasks?: RoomTask[] | null }) => ({
        id: w.id, name: w.name, targetDate: roomMetaOf(w.meta).targetDate ?? null, updated_at: w.updated_at, tasks: w.tasks ?? [],
      }));
    },
    staleTime: 60_000,
  });
}
