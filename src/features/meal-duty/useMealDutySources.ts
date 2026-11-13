// 급식지도 명단 생성기의 입력 5종을 한 번에 모은다. 판정은 전부 `@/lib/mealDuty` 가 한다.
//
// ⚠ 과거 명단은 `meeting` 을 직접 읽지 않고 RPC `get_meal_duty_history` 로 읽는다.
// duty 행의 SELECT 정책이 "만든 사람·담당자 본인"에게만 보여서, 직접 읽으면 다른 사람이 만든
// 명단이 통째로 빠지고 모두가 "한 번도 안 한 사람"으로 보인다 — 오류 없이 순환이 틀어진다.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { parseNoClassGrades } from '@/lib/schoolDay';
import type { AcademicTerm } from '@/hooks/useAcademicTerm';
import {
  MEAL_DUTY_BLOCKING_PERIOD,
  MEAL_DUTY_EXCLUDED_TAGS,
  busyKey,
  mealDutyExclusion,
  toDateKey,
  type ExistingMealDutyRow,
  type MealDutyExclusion,
  type SchoolCalendarEntry,
} from '@/lib/mealDuty';

export interface MealDutyCandidate {
  resourceId: string;
  name: string;
  weeklyPeriods: number;
  exclusion: MealDutyExclusion | null;
}

/** 그날 그 사람에게 걸린 다른 일정(출장·연수) — 칸에 표시만 하고 배정을 막지는 않는다 */
export interface MealDutyAbsence {
  kind: 'event' | 'training';
  title: string;
}

export interface MealDutySources {
  term: AcademicTerm;
  candidates: MealDutyCandidate[];
  busy: Set<string>;
  history: ExistingMealDutyRow[];
  calendar: SchoolCalendarEntry[];
  /** `date|name` → 그날의 출장·연수. ⚠ 연수는 RLS 상 내가 만들었거나 맡은 것만 보인다 — 전부가 아니다 */
  absences: Map<string, MealDutyAbsence[]>;
}

/** 순환 위치를 되짚을 때 볼 과거 범위 — 한 바퀴(약 2달)보다 넉넉히 */
const HISTORY_LOOKBACK_DAYS = 400;
/** PostgREST 는 요청당 1000행에서 조용히 자른다 */
const PAGE = 1000;

async function fetchTimetable(term: AcademicTerm) {
  const rows: { teacher_name: string; day_of_week: number; period: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('teacher_timetable')
      .select('teacher_name, day_of_week, period')
      .eq('academic_year', term.year)
      .eq('semester', term.semester)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function fetchSources(term: AcademicTerm, year: number, month: number): Promise<MealDutySources> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const since = new Date(monthStart);
  since.setDate(since.getDate() - HISTORY_LOOKBACK_DAYS);
  const refDate = toDateKey(monthStart);

  const [resources, adminTags, seats, timetable, history, calendar, trips] = await Promise.all([
    supabase.from('resource').select('id, name, type, status').in('type', ['teacher', 'staff']),
    supabase.from('resource_tags').select('id').in('name', MEAL_DUTY_EXCLUDED_TAGS as unknown as string[]),
    supabase.from('duty_seat_holder').select('resource_id, start_date, end_date'),
    fetchTimetable(term),
    supabase.rpc('get_meal_duty_history', { p_since: toDateKey(since), p_until: toDateKey(monthEnd) }),
    supabase
      .from('meeting')
      .select('starts_at, meta')
      .eq('kind', 'schedule')
      .gte('starts_at', monthStart.toISOString())
      .lt('starts_at', new Date(year, month, 1).toISOString()),
    // 여러 날짜 출장이 달 경계를 넘을 수 있으므로 끝이 이 달에 걸치는 것까지
    supabase
      .from('meeting')
      .select('kind, starts_at, ends_at, meta')
      .in('kind', ['event', 'training'])
      .lt('starts_at', new Date(year, month, 1).toISOString())
      .gte('ends_at', monthStart.toISOString()),
  ]);
  for (const res of [resources, adminTags, seats, history, calendar, trips]) if (res.error) throw res.error;

  const tagIds = (adminTags.data ?? []).map((t) => t.id);
  const adminIds = new Set<string>();
  if (tagIds.length > 0) {
    const { data, error } = await supabase.from('resource_tag_assignments').select('resource_id').in('tag_id', tagIds);
    if (error) throw error;
    for (const row of data ?? []) adminIds.add(row.resource_id);
  }

  const seatHolders = new Set(
    (seats.data ?? [])
      .filter((s) => s.resource_id && (!s.start_date || s.start_date <= refDate) && (!s.end_date || s.end_date >= refDate))
      .map((s) => s.resource_id as string),
  );

  const weekly = new Map<string, number>();
  const busy = new Set<string>();
  for (const row of timetable) {
    weekly.set(row.teacher_name, (weekly.get(row.teacher_name) ?? 0) + 1);
    if (row.period === MEAL_DUTY_BLOCKING_PERIOD) busy.add(busyKey(row.teacher_name, row.day_of_week));
  }

  const candidates: MealDutyCandidate[] = (resources.data ?? [])
    .map((r) => {
      const weeklyPeriods = weekly.get(r.name) ?? 0;
      return {
        resourceId: r.id,
        name: r.name,
        weeklyPeriods,
        exclusion: mealDutyExclusion({
          name: r.name,
          type: r.type,
          status: r.status,
          tags: adminIds.has(r.id) ? [...MEAL_DUTY_EXCLUDED_TAGS] : [],
          weeklyPeriods,
          hasDutySeat: seatHolders.has(r.id),
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const calendarEntries: SchoolCalendarEntry[] = (calendar.data ?? []).map((row) => {
    const meta = (row.meta ?? {}) as { title?: string; sbtr_dd_sc_nm?: string; no_class_grades?: unknown };
    // 일부 학년만 수업이 없는 날(«수업 없는 날 · 2학년»)은 급식지도를 쉬지 않는다 — 다른 학년은 급식을 먹는다
    const partial = parseNoClassGrades(meta.no_class_grades).length > 0;
    return { date: toDateKey(new Date(row.starts_at)), title: meta.title ?? '', dayKind: partial ? null : meta.sbtr_dd_sc_nm ?? null };
  });

  const absences = new Map<string, MealDutyAbsence[]>();
  for (const row of trips.data ?? []) {
    const meta = (row.meta ?? {}) as { title?: string; assignee?: unknown };
    const names = meta.assignee && typeof meta.assignee === 'object' && !Array.isArray(meta.assignee)
      ? Object.keys(meta.assignee as Record<string, unknown>)
      : [];
    if (names.length === 0) continue;
    const entry: MealDutyAbsence = { kind: row.kind as 'event' | 'training', title: meta.title ?? '' };
    const cursor = new Date(row.starts_at);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(row.ends_at);
    for (let guard = 0; cursor <= end && guard < 62; guard++, cursor.setDate(cursor.getDate() + 1)) {
      const day = toDateKey(cursor);
      for (const name of names) {
        const key = `${day}|${name}`;
        absences.set(key, [...(absences.get(key) ?? []), entry]);
      }
    }
  }

  return {
    term,
    absences,
    candidates,
    busy,
    history: (history.data ?? []).map((row) => ({ date: row.duty_date, names: row.names ?? [] })),
    calendar: calendarEntries,
  };
}

export function useMealDutySources(year: number, month: number, enabled: boolean) {
  const { term, isLoading: termLoading } = useTimetableTerm();
  const query = useQuery({
    queryKey: ['meal-duty-sources', term?.year, term?.semester, year, month],
    queryFn: () => fetchSources(term as AcademicTerm, year, month),
    enabled: enabled && !!term,
    staleTime: 60 * 1000,
  });
  return { ...query, term, termLoading };
}
