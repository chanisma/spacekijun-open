// ========================================
// 업무분장 데이터 훅 — duty_seat / duty_seat_holder
// 쓰기는 관리자만(RLS). 판정 로직은 src/lib/dutySeats.ts.
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeAreas,
  type DutySeat,
  type DutySeatArea,
  type DutySeatHolder,
  type DutySeatKind,
} from '@/lib/dutySeats';

export const DUTY_SEATS_KEY = 'duty-seats';

export function useDutySeatYears() {
  return useQuery({
    queryKey: [DUTY_SEATS_KEY, 'years'],
    queryFn: async () => {
      // 학년도는 몇 개뿐 — 최신부터 한 행씩 내려가며 모은다(1000행 상한과 무관)
      const years: number[] = [];
      let upper: number | null = null;
      for (let i = 0; i < 20; i += 1) {
        let query = supabase.from('duty_seat').select('academic_year').order('academic_year', { ascending: false }).limit(1);
        if (upper !== null) query = query.lt('academic_year', upper);
        const { data, error } = await query;
        if (error) throw error;
        const year = data?.[0]?.academic_year;
        if (typeof year !== 'number') break;
        years.push(year);
        upper = year;
      }
      return years;
    },
  });
}

export function useDutySeats(academicYear: number | null) {
  return useQuery({
    queryKey: [DUTY_SEATS_KEY, academicYear],
    enabled: academicYear !== null,
    queryFn: async (): Promise<DutySeat[]> => {
      const { data, error } = await supabase
        .from('duty_seat')
        .select('id, academic_year, name, department_id, kind, areas, sort_order, note, meta, duty_seat_holder(id, seat_id, resource_id, holder_name, role, start_date, end_date, note)')
        .eq('academic_year', academicYear!)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        academic_year: row.academic_year,
        name: row.name,
        department_id: row.department_id,
        kind: row.kind as DutySeatKind,
        areas: normalizeAreas(row.areas),
        sort_order: row.sort_order,
        note: row.note,
        meta: (row.meta ?? {}) as Record<string, unknown>,
        holders: ((row.duty_seat_holder ?? []) as DutySeatHolder[]).slice().sort((a, b) =>
          (a.start_date ?? '').localeCompare(b.start_date ?? '') || (a.role === 'primary' ? -1 : 1),
        ),
      }));
    },
  });
}

export interface DutySeatDraft {
  id?: string;
  academic_year: number;
  name: string;
  department_id: string | null;
  kind: DutySeatKind;
  areas: DutySeatArea[];
  sort_order: number;
  note: string | null;
  holders: Array<Omit<DutySeatHolder, 'id' | 'seat_id'> & { id?: string }>;
}

export function useSaveDutySeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: DutySeatDraft) => {
      const seatPayload = {
        academic_year: draft.academic_year,
        name: draft.name.trim(),
        department_id: draft.department_id,
        kind: draft.kind,
        areas: draft.areas as unknown as never,
        sort_order: draft.sort_order,
        note: draft.note,
      };
      let seatId = draft.id;
      if (seatId) {
        const { error } = await supabase.from('duty_seat').update(seatPayload).eq('id', seatId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('duty_seat').insert(seatPayload).select('id').single();
        if (error) throw error;
        seatId = data.id;
      }

      // 담당자: 폼에 없는 기존 행 삭제 → 나머지 upsert
      const keepIds = draft.holders.map((h) => h.id).filter((id): id is string => Boolean(id));
      let del = supabase.from('duty_seat_holder').delete().eq('seat_id', seatId);
      if (keepIds.length > 0) del = del.not('id', 'in', `(${keepIds.join(',')})`);
      const { error: delError } = await del;
      if (delError) throw delError;

      for (const h of draft.holders) {
        const payload = {
          seat_id: seatId,
          resource_id: h.resource_id,
          holder_name: h.holder_name.trim(),
          role: h.role,
          start_date: h.start_date || null,
          end_date: h.end_date || null,
          note: h.note,
        };
        const { error } = h.id
          ? await supabase.from('duty_seat_holder').update(payload).eq('id', h.id)
          : await supabase.from('duty_seat_holder').insert(payload);
        if (error) throw error;
      }
      return seatId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DUTY_SEATS_KEY] }),
  });
}

export function useDeleteDutySeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (seatId: string) => {
      const { error } = await supabase.from('duty_seat').delete().eq('id', seatId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DUTY_SEATS_KEY] }),
  });
}

export function useCopyDutySeats() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { fromYear: number; toYear: number; keepHolders: boolean }) => {
      const { data, error } = await supabase.rpc('copy_duty_seats', {
        p_from_year: args.fromYear,
        p_to_year: args.toYear,
        p_keep_holders: args.keepHolders,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DUTY_SEATS_KEY] }),
  });
}

/** 이름에 '부장'이 든 태그(학년 부장 포함)의 보유자 — 정합 점검용 */
export function useHeadTagHolderIds() {
  return useQuery({
    queryKey: [DUTY_SEATS_KEY, 'head-tag-holders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource_tag_assignments')
        .select('resource_id, resource_tags!inner(name)')
        .like('resource_tags.name', '%부장%');
      if (error) throw error;
      return [...new Set((data ?? []).map((row) => row.resource_id))];
    },
  });
}
