/**
 * 수업 교체 후보의 수강생 판정 (2026-10-12).
 *
 * 시간표의 학년-반 표기는 학급일 때도 선택과목 분반 번호일 때도 있어, 표기가 같다고
 * 수강생이 같지 않다. 서버 `get_swap_roster_fit` 이 내 수업(교사·요일·교시)과 학생이 겹치거나
 * 표기가 같은 수업마다 "맞바꾸면 시간이 겹치는 학생"을 양방향으로 센다.
 *
 * 판정 자체(상태 유도·후보 선정)는 순수 모듈 `timetableSwapUtils` 가 한다 — 이 훅은 운반만.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import type { TimetableEntry } from '@/hooks/useTimetableData';
import { lessonKey, type RosterFitIndex } from '@/utils/timetableSwapUtils';

interface RosterFitRow {
  teacher_resource_id: string;
  day_of_week: number;
  period: number;
  my_count: number;
  their_count: number;
  shared_count: number;
  their_conflict_count: number;
  their_conflict_names: string[] | null;
  my_conflict_count: number;
  my_conflict_names: string[] | null;
}

export function useSwapRosterFit(targetEntry: TimetableEntry | null, enabled: boolean = true) {
  const { term, isLoading: isTermLoading } = useTimetableTerm();

  return useQuery({
    queryKey: [
      'swap-roster-fit',
      targetEntry?.resource_id ?? null,
      targetEntry?.weekday ?? null,
      targetEntry?.period ?? null,
      term?.year ?? null,
      term?.semester ?? null,
    ],
    queryFn: async (): Promise<RosterFitIndex> => {
      if (!targetEntry || !term) return new Map();

      // 새 RPC 라 생성 타입에 아직 없다 — 행 모양은 위 인터페이스로 고정한다.
      const { data, error } = await supabase.rpc('get_swap_roster_fit' as never, {
        p_teacher_resource_id: targetEntry.resource_id,
        p_day_of_week: targetEntry.weekday,
        p_period: targetEntry.period,
        p_academic_year: term.year,
        p_semester: term.semester,
      } as never);
      if (error) throw error;

      const index: RosterFitIndex = new Map();
      for (const row of (data as RosterFitRow[] | null) ?? []) {
        index.set(lessonKey(row.teacher_resource_id, row.day_of_week, row.period), {
          myCount: row.my_count,
          theirCount: row.their_count,
          sharedCount: row.shared_count,
          theirConflictCount: row.their_conflict_count,
          theirConflictNames: row.their_conflict_names ?? [],
          myConflictCount: row.my_conflict_count,
          myConflictNames: row.my_conflict_names ?? [],
        });
      }
      return index;
    },
    enabled:
      enabled &&
      !!targetEntry?.resource_id &&
      !!targetEntry.weekday &&
      !!targetEntry.period &&
      !isTermLoading &&
      !!term,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    // 실패하면 표기 판정으로 내려가며 화면이 그 사실을 말한다 — 재시도로 모달을 붙잡지 않는다
    retry: 1,
  });
}
