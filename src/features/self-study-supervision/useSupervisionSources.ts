// 자습 감독 배정의 입력을 한 번에 모은다. 판정은 전부 `@/lib/selfStudySupervision` 이 한다.
//
// ⚠ 과거 감독은 `meeting` 을 직접 읽지 않고 RPC `get_self_study_supervision_history` 로 읽는다 —
// duty 행은 만든 사람·담당자에게만 보여서, 직접 읽으면 다른 선생님이 만든 감독이 빠지고 누적 횟수가
// **오류 없이** 틀린다(급식지도 `get_meal_duty_history` 와 같은 이유).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { expandScheduleRows, toDateKey } from '@/lib/schoolDay';
import {
  SCHOOL_GRADE,
  academicYearOf,
  findCsatDate,
  gradeSlotConfig,
  schoolMorningConfig,
  type UnavailabilityRule,
  type GradeSlotConfig,
  type StudyRoomRow,
  type SupervisionHistoryRow,
  type SupervisionSlot,
} from '@/lib/selfStudySupervision';

export interface SupervisionPoolMember {
  resourceId: string;
  name: string;
  /** 어디서 왔나 — 학년부 소속 / 담임·학년부장 태그 */
  source: 'department' | 'tag';
  /** 소속 학년 — 전 학년 통합 명단에서 «3학년 선생님»을 가려낸다 */
  grades: number[];
}

export interface SupervisionHistoryItem extends SupervisionHistoryRow {
  meetingId: string;
  withMorning: boolean;
}

export interface SupervisionSources {
  academicYear: number;
  pool: SupervisionPoolMember[];
  config: GradeSlotConfig;
  /** 학년도 시작 ~ 그 달 끝 */
  history: SupervisionHistoryItem[];
  /** `date|name` — 그날 출장·연수. ⚠ 연수는 RLS 상 내가 만들었거나 맡은 것만 보인다 */
  absent: Set<string>;
  absentTitles: Map<string, string[]>;
  /** 이 달에 이미 있는 전 학년 아침 당번 날짜 — 학년별 화면이 그날 아침 칸을 다시 만들지 않는다 */
  schoolMorningDates: Set<string>;
  /** 이 학년도에 전 학년 아침 당번을 쓴 적이 있나 — 학년별 화면의 아침 방식 기본값 */
  schoolMorningInYear: boolean;
  /** 그 학년도 수능일(전 학년 아침에서 3학년 제외 기본 시작일) */
  csatDate: string | null;
}

const SLOTS = new Set<SupervisionSlot>(['morning', 'evening', 'saturday']);

async function fetchPool(grade: number, academicYear: number): Promise<SupervisionPoolMember[]> {
  const [dept, tags] = await Promise.all([
    supabase.from('department').select('id').eq('name', `${grade}학년부`).maybeSingle(),
    supabase.from('resource_tags').select('id, name'),
  ]);
  if (dept.error) throw dept.error;
  if (tags.error) throw tags.error;

  const members = new Map<string, SupervisionPoolMember['source']>();
  if (dept.data?.id) {
    const { data, error } = await supabase
      .from('department_member')
      .select('resource_id')
      .eq('department_id', dept.data.id)
      .eq('academic_year', academicYear);
    if (error) throw error;
    for (const row of data ?? []) members.set(row.resource_id, 'department');
  }

  // 학년부 명단이 그해에 비어 있어도 담임·학년부장은 빠지지 않게 태그로 보탠다
  const gradeTagRe = new RegExp(`^${grade}학년\\s*(부장|\\d+반)$`);
  const tagIds = (tags.data ?? []).filter((t) => gradeTagRe.test(t.name.trim())).map((t) => t.id);
  if (tagIds.length > 0) {
    const { data, error } = await supabase.from('resource_tag_assignments').select('resource_id').in('tag_id', tagIds);
    if (error) throw error;
    for (const row of data ?? []) if (!members.has(row.resource_id)) members.set(row.resource_id, 'tag');
  }
  if (members.size === 0) return [];

  const { data: resources, error } = await supabase
    .from('resource')
    .select('id, name, type, status')
    .in('id', [...members.keys()]);
  if (error) throw error;
  return (resources ?? [])
    .filter((r) => (r.type === 'teacher' || r.type === 'staff') && (!r.status || r.status === 'active'))
    .map((r) => ({ resourceId: r.id, name: r.name, source: members.get(r.id) ?? 'tag', grades: [grade] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 전 학년 통합 명단 — 세 학년 명단의 합. 두 학년에 걸친 사람은 한 번만, 학년은 모두 */
async function fetchSchoolPool(academicYear: number): Promise<SupervisionPoolMember[]> {
  const lists = await Promise.all([1, 2, 3].map((g) => fetchPool(g, academicYear)));
  const byId = new Map<string, SupervisionPoolMember>();
  for (const member of lists.flat()) {
    const prev = byId.get(member.resourceId);
    if (!prev) byId.set(member.resourceId, { ...member, grades: [...member.grades] });
    else prev.grades = [...new Set([...prev.grades, ...member.grades])].sort();
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function poolOf(grade: number, academicYear: number) {
  return grade === SCHOOL_GRADE ? fetchSchoolPool(academicYear) : fetchPool(grade, academicYear);
}

/** 그 학년도의 수능일 — 학사일정(NEIS `대학수학능력시험`)에서 */
async function fetchCsatDate(academicYear: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('meeting')
    .select('starts_at, ends_at, meta')
    .eq('kind', 'schedule')
    .gte('starts_at', `${academicYear}-09-01T00:00:00+09:00`)
    .lt('starts_at', `${academicYear}-12-31T23:59:59+09:00`);
  if (error) throw error;
  return findCsatDate(expandScheduleRows(data ?? []));
}

async function fetchSources(grade: number, year: number, month: number): Promise<SupervisionSources> {
  const academicYear = academicYearOf(year, month);
  const monthStart = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month, 1);
  const monthEnd = new Date(year, month, 0);

  const isSchool = grade === SCHOOL_GRADE;
  const [pool, rooms, history, trips, schoolMorning, csatDate] = await Promise.all([
    poolOf(grade, academicYear),
    supabase.from('study_rooms').select('name, grades, operating_days, operating_periods').eq('is_active', true),
    supabase.rpc('get_self_study_supervision_history', {
      p_grade: grade,
      p_since: `${academicYear}-03-01`,
      p_until: toDateKey(monthEnd),
    }),
    supabase
      .from('meeting')
      .select('kind, starts_at, ends_at, meta')
      .in('kind', ['event', 'training'])
      .lt('starts_at', nextMonth.toISOString())
      .gte('ends_at', monthStart.toISOString()),
    // 학년별 화면이 전 학년 아침 당번과 겹치지 않게
    isSchool
      ? Promise.resolve(null)
      : supabase.rpc('get_self_study_supervision_history', {
        p_grade: SCHOOL_GRADE,
        p_since: `${academicYear}-03-01`,
        p_until: toDateKey(monthEnd),
      }),
    isSchool ? fetchCsatDate(academicYear) : Promise.resolve(null),
  ]);
  for (const res of [rooms, history, trips]) if (res.error) throw res.error;
  if (schoolMorning?.error) throw schoolMorning.error;
  const monthPrefix = toDateKey(monthStart).slice(0, 7);
  const schoolMorningRows = (schoolMorning?.data ?? []).filter((row) => row.slot === 'morning');

  const absent = new Set<string>();
  const absentTitles = new Map<string, string[]>();
  for (const row of trips.data ?? []) {
    const meta = (row.meta ?? {}) as { title?: string; assignee?: unknown };
    const names = meta.assignee && typeof meta.assignee === 'object' && !Array.isArray(meta.assignee)
      ? Object.keys(meta.assignee as Record<string, unknown>)
      : [];
    const cursor = new Date(row.starts_at);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(row.ends_at);
    for (let guard = 0; cursor <= end && guard < 62; guard++, cursor.setDate(cursor.getDate() + 1)) {
      const day = toDateKey(cursor);
      for (const name of names) {
        const key = `${day}|${name}`;
        absent.add(key);
        absentTitles.set(key, [...(absentTitles.get(key) ?? []), meta.title ?? (row.kind === 'event' ? '출장' : '연수')]);
      }
    }
  }

  return {
    academicYear,
    pool,
    config: isSchool
      ? schoolMorningConfig((rooms.data ?? []) as StudyRoomRow[])
      : gradeSlotConfig((rooms.data ?? []) as StudyRoomRow[], grade),
    history: (history.data ?? [])
      .filter((row) => SLOTS.has(row.slot as SupervisionSlot))
      .map((row) => ({
        meetingId: row.meeting_id,
        date: row.duty_date,
        slot: row.slot as SupervisionSlot,
        withMorning: row.with_morning ?? false,
        names: row.names ?? [],
      })),
    absent,
    absentTitles,
    schoolMorningDates: new Set(schoolMorningRows.map((row) => row.duty_date).filter((d) => d.startsWith(monthPrefix))),
    schoolMorningInYear: schoolMorningRows.length > 0,
    csatDate,
  };
}

export function useSupervisionSources(grade: number | null, year: number, month: number, enabled: boolean) {
  return useQuery({
    queryKey: ['self-study-supervision-sources', grade, year, month],
    queryFn: () => fetchSources(grade as number, year, month),
    enabled: enabled && grade != null,
    staleTime: 60 * 1000,
  });
}

/** 한 학년의 앞으로 남은 감독(교체 상대 고르기용) */
export function useUpcomingSupervision(grade: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['self-study-supervision-upcoming', grade],
    enabled: enabled && grade != null,
    queryFn: async (): Promise<SupervisionHistoryItem[]> => {
      const today = new Date();
      const until = new Date(today.getFullYear(), today.getMonth() + 3, 0);
      const { data, error } = await supabase.rpc('get_self_study_supervision_history', {
        p_grade: grade as number,
        p_since: toDateKey(today),
        p_until: toDateKey(until),
      });
      if (error) throw error;
      return (data ?? [])
        .filter((row) => SLOTS.has(row.slot as SupervisionSlot))
        .map((row) => ({
          meetingId: row.meeting_id,
          date: row.duty_date,
          slot: row.slot as SupervisionSlot,
          withMorning: row.with_morning ?? false,
          names: row.names ?? [],
        }));
    },
    staleTime: 30 * 1000,
  });
}

export interface SupervisionSwapRow {
  id: string;
  grade: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message: string | null;
  created_at: string;
  i_am_requester: boolean;
  requester_name: string;
  partner_name: string;
  requester_meeting_id: string;
  requester_date: string;
  requester_slot: SupervisionSlot;
  partner_meeting_id: string | null;
  partner_date: string | null;
  partner_slot: SupervisionSlot | null;
}

export function useMySupervisionSwaps(enabled: boolean) {
  return useQuery({
    queryKey: ['self-study-supervision-swaps'],
    enabled,
    queryFn: async (): Promise<SupervisionSwapRow[]> => {
      const { data, error } = await supabase.rpc('list_my_supervision_swaps');
      if (error) throw error;
      return (data ?? []) as SupervisionSwapRow[];
    },
    staleTime: 15 * 1000,
  });
}

/** 한 학년의 감독 대상(학년부 + 담임·학년부장) — 교체의 «대신 맡아 주세요» 상대 */
export function useSupervisionPool(grade: number | null, enabled: boolean) {
  const now = new Date();
  const academicYear = academicYearOf(now.getFullYear(), now.getMonth() + 1);
  return useQuery({
    queryKey: ['self-study-supervision-pool', grade, academicYear],
    enabled: enabled && grade != null,
    queryFn: () => poolOf(grade as number, academicYear),
    staleTime: 5 * 60 * 1000,
  });
}

/** 내가 맡은 앞으로의 감독 — duty RLS 상 담당자 본인에게는 보인다 */
export function useMyUpcomingSupervision(myName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['self-study-supervision-mine', myName],
    enabled: enabled && !!myName,
    queryFn: async (): Promise<(SupervisionHistoryItem & { grade: number })[]> => {
      const { data, error } = await supabase
        .from('meeting')
        .select('id, starts_at, meta')
        .eq('kind', 'duty')
        .not('meta->supervision', 'is', null)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at');
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const meta = (row.meta ?? {}) as { assignee?: Record<string, unknown>; supervision?: { grade?: number; slot?: string; with_morning?: boolean } };
        const names = meta.assignee && typeof meta.assignee === 'object' ? Object.keys(meta.assignee) : [];
        const slot = meta.supervision?.slot as SupervisionSlot | undefined;
        if (!myName || !names.includes(myName) || !slot || !SLOTS.has(slot) || !meta.supervision?.grade) return [];
        return [{
          meetingId: row.id,
          date: new Date(row.starts_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
          slot,
          withMorning: meta.supervision.with_morning ?? false,
          names,
          grade: Number(meta.supervision.grade),
        }];
      });
    },
    staleTime: 15 * 1000,
  });
}

// ─────────────────────────────── 못 하는 날 ───────────────────────────────

interface UnavailabilityRow {
  id: string;
  resource_id: string;
  weekday: number | null;
  on_date: string | null;
  slots: string[];
  valid_from: string | null;
  valid_until: string | null;
  note: string | null;
  resource: { name: string } | null;
}

export const UNAVAILABILITY_QUERY_KEY = ['self-study-supervision-unavailability'] as const;

/**
 * 못 하는 날 전부 — 행이 적고(교사 수 × 몇 줄) 배정 화면은 명단 전체를 본다. 이름은 resource 에서
 * (배정·이력이 이름으로 돌아가므로 규칙도 이름으로 맞춘다).
 */
export function useSupervisionUnavailability(enabled: boolean) {
  return useQuery({
    queryKey: UNAVAILABILITY_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<UnavailabilityRule[]> => {
      const { data, error } = await supabase
        // 새 표 — 생성 타입에 아직 없다
        .from('supervision_unavailability' as never)
        .select('id, resource_id, weekday, on_date, slots, valid_from, valid_until, note, resource:resource_id(name)')
        .order('created_at');
      if (error) throw error;
      return ((data ?? []) as unknown as UnavailabilityRow[])
        .filter((row) => row.resource?.name)
        .map((row) => ({
          id: row.id,
          resourceId: row.resource_id,
          name: row.resource!.name,
          weekday: row.weekday,
          date: row.on_date,
          from: row.valid_from,
          until: row.valid_until,
          slots: row.slots.filter((s): s is SupervisionSlot => SLOTS.has(s as SupervisionSlot)),
          note: row.note,
        }));
    },
    staleTime: 60 * 1000,
  });
}

export interface NewUnavailability {
  resourceId: string;
  weekday: number | null;
  date: string | null;
  from: string | null;
  until: string | null;
  slots: SupervisionSlot[];
  note: string | null;
}

export async function addUnavailability(input: NewUnavailability) {
  const { error } = await supabase.from('supervision_unavailability' as never).insert({
    resource_id: input.resourceId,
    weekday: input.date ? null : input.weekday,
    on_date: input.date,
    slots: input.slots,
    valid_from: input.date ? null : input.from,
    valid_until: input.date ? null : input.until,
    note: input.note?.trim() || null,
  } as never);
  if (error) throw error;
}

export async function deleteUnavailability(id: string) {
  // RLS 가 남의 행을 0행 삭제로 조용히 거른다 — 지워졌는지 행으로 확인한다
  const { data, error } = await supabase.from('supervision_unavailability' as never).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || (data as unknown[]).length === 0) throw new Error('지울 권한이 없거나 이미 지워졌습니다');
}
