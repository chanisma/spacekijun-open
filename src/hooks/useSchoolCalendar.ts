import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import {
  classifySchoolDay,
  expandScheduleRows,
  indexCalendar,
  toDateKey,
  type SchoolCalendarEntry,
  type SchoolDayInfo,
  type TermPeriod,
} from '@/lib/schoolDay';

/**
 * 범위 안의 학사일정(NEIS + 직접 넣은 학사일정)과 그 날짜들의 판정 (2026-10-11).
 * 학사일정(`kind='schedule'`)은 학생까지 모두 읽을 수 있다(RLS).
 *
 * `applyTerm` = 학기 기간 밖을 방학으로 볼 것인가. 오늘·이번 주처럼 «지금 학기»를 보는
 * 화면은 켜고, 다른 학기를 넘겨 보는 화면(자습 감독 배정의 다음 달 등)은 학기 경계가
 * 맞지 않을 수 있어 화면이 정한다.
 */
export function useSchoolCalendar(
  rangeStart: Date,
  rangeEnd: Date,
  options: { applyTerm?: boolean; enabled?: boolean; /** 보는 사람의 학년 — 일부 학년 «수업 없는 날» 판정. 생략 = 학교 전체 */ grade?: number | null } = {},
) {
  const { applyTerm = true, enabled = true, grade = null } = options;
  const startKey = toDateKey(rangeStart);
  const endKey = toDateKey(rangeEnd);
  const { data: academicTerm } = useAcademicTerm();

  const query = useQuery({
    queryKey: ['school-calendar', startKey, endKey],
    enabled,
    queryFn: async (): Promise<SchoolCalendarEntry[]> => {
      const { data, error } = await supabase
        .from('meeting')
        .select('starts_at, ends_at, meta')
        .eq('kind', 'schedule')
        .lt('starts_at', `${endKey}T23:59:59+09:00`)
        .gte('ends_at', `${startKey}T00:00:00+09:00`);
      if (error) throw error;
      return expandScheduleRows(data ?? []).filter((e) => e.date >= startKey && e.date <= endKey);
    },
    staleTime: 10 * 60 * 1000,
  });

  const term: TermPeriod | null = applyTerm && academicTerm?.startDate && academicTerm?.endDate
    ? { start: academicTerm.startDate, end: academicTerm.endDate }
    : null;
  const termKey = term ? `${term.start}~${term.end}` : '';

  const days = useMemo(() => {
    const index = indexCalendar(query.data ?? []);
    const map = new Map<string, SchoolDayInfo>();
    const [y, m, d] = startKey.split('-').map(Number);
    for (let i = 0; i < 400; i++) {
      const key = toDateKey(new Date(y, m - 1, d + i));
      if (key > endKey) break;
      map.set(key, classifySchoolDay(key, index.get(key) ?? [], term, grade));
    }
    return map;
    // term 은 termKey 로 대신 본다(객체가 렌더마다 새로 만들어진다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, startKey, endKey, termKey, grade]);

  return { entries: query.data ?? [], days, term, isLoading: query.isLoading, isError: query.isError };
}

/** 오늘 하루 판정 — 학사일정을 아직 못 읽었으면 null(아무것도 숨기지 않는다) */
export function useSchoolDay(date: Date = new Date(), grade: number | null = null): SchoolDayInfo | null {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const { days, isLoading, isError } = useSchoolCalendar(day, day, { grade });
  if (isLoading || isError) return null;
  return days.get(toDateKey(day)) ?? null;
}
