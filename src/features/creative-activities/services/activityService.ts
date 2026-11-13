// ========================================
// 창의적 체험활동 — 데이터 서비스
//
// RLS 차단은 오류가 아니라 0행이다. 그래서 모든 mutation은 `.select('id')`
// 반환 행으로 실제 반영을 확인하고, 아니면 던진다. 확인하지 않으면
// "저장됨" 토스트가 뜨면서 아무 일도 일어나지 않는다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import type {
  Activity,
  ActivityFilters,
  ActivityHost,
  ActivityHostKind,
  ActivityListItem,
  ActivityHostRef,
  ActivityHostInput,
  ActivityHostMemberRow,
  ActivityInput,
  ActivityParticipantRow,
  ActivityTeacherRole,
  ActivityWithContext,
  ParticipantInput,
} from '../types';
import { buildLineageIndex, getLineageGeneration } from '../utils/lineage';
import { isSimilarActivityName, normalizeActivityName } from '../utils/activityDuplicates';
import { fetchAllPages } from '../utils/fetchAllPages';

/** PostgREST `.or()`에서 예약 문자가 필터를 깨뜨리지 않게 이스케이프 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()\\]/g, ' ').trim();
}

// ----------------------------------------
// 활동 목록 · 상세
// ----------------------------------------

/**
 * 주최는 다대다(`activity_host_link`)다.
 *
 * 주최로 **거를 때만** `!inner`를 쓴다 — 항상 붙이면 주최가 없는 활동
 * (개별 교사 활동)이 목록에서 통째로 사라진다.
 */
function activitySelect(filterByHost: boolean, withParticipantCount = true): string {
  const link = filterByHost ? 'activity_host_link!inner' : 'activity_host_link';
  return `
    *,
    ${link} ( role, host:host_id ( id, name, kind, category ) ),
    activity_teacher ( teacher_resource_id, role, resource:teacher_resource_id ( id, name ) )
    ${withParticipantCount ? ', activity_participation ( count )' : ''}
  `;
}

const ACTIVITY_SELECT = activitySelect(false);
/** 참여자 수를 세지 않는 전체 조회 — 학생 시점용(§ fetchActivity) */
const ACTIVITY_SELECT_NO_COUNT = activitySelect(false, false);

/**
 * 목록 전용 열 — **`content` 와 `meta` 를 빼고 `content_excerpt`(계산 필드)를 넣는다.**
 *
 * 실측(1,000행, brotli 후): `select *` 217 KB → 이 목록 **117 KB (-46.2%)**.
 * `content` 는 목록이 한 줄만 그리는데 전문이 오고, `meta` 는 목록·상세 어디서도 쓰지 않는다.
 *
 * ⚠️ **열이 늘면 여기에도 넣어야 한다** — 안 넣으면 그 값이 목록에서 조용히 undefined 가 된다.
 * 회귀 `npx tsx scripts/activity-select-test/run.mts` 가 DB 열 목록과 대조해 잡는다.
 */
const ACTIVITY_LIST_COLUMNS = [
  'id', 'name', 'area', 'purpose', 'outcome', 'academic_year', 'semester',
  'starts_on', 'ends_on', 'hours', 'place', 'lineage_parent_id', 'lineage_note',
  'operator_type', 'operator_name', 'scale', 'budget_source', 'budget_program',
  'budget_planned', 'budget_spent', 'keywords', 'related_subjects', 'career_fields',
  'target_grades', 'department', 'status', 'visibility', 'source', 'meeting_id',
  'attachments', 'created_by', 'created_at', 'updated_at',
  'content_excerpt',
] as const;

function activityListSelect(filterByHost: boolean, withParticipantCount: boolean): string {
  const link = filterByHost ? 'activity_host_link!inner' : 'activity_host_link';
  return `
    ${ACTIVITY_LIST_COLUMNS.join(', ')},
    ${link} ( role, host:host_id ( id, name, kind, category ) ),
    activity_teacher ( teacher_resource_id, role, resource:teacher_resource_id ( id, name ) )
    ${withParticipantCount ? ', activity_participation ( count )' : ''}
  `;
}

export { ACTIVITY_LIST_COLUMNS };

/** 목록 조회가 돌려주는 행 — `content`·`meta` 가 없다(위 ACTIVITY_LIST_COLUMNS). */
export type RawActivityListRow = Omit<Activity, 'content' | 'meta'> & {
  content_excerpt: string | null;
  activity_host_link: {
    role: 'primary' | 'co';
    host: { id: string; name: string; kind: ActivityHostKind; category: string | null } | null;
  }[] | null;
  activity_teacher: {
    teacher_resource_id: string;
    role: ActivityTeacherRole;
    resource: { id: string; name: string } | null;
  }[] | null;
  activity_participation: { count: number }[] | null;
};

export type RawActivityRow = Activity & {
  activity_host_link: {
    role: 'primary' | 'co';
    host: { id: string; name: string; kind: ActivityHostKind; category: string | null } | null;
  }[] | null;
  activity_teacher: {
    teacher_resource_id: string;
    role: ActivityTeacherRole;
    resource: { id: string; name: string } | null;
  }[] | null;
  activity_participation: { count: number }[] | null;
};

/**
 * 계보 연차를 붙여 활동 목록을 만든다.
 *
 * 연차는 **불러온 목록 안에서** 계산된다 — 필터로 2026만 보고 있으면 부모가
 * 목록에 없어 1년째로 보인다. 그래서 카드에 배지를 띄우는 화면은
 * `fetchActivities`를 연도 필터 없이 부르거나 `fetchLineageNodes`로
 * 계보 인덱스를 따로 받아야 한다(§ fetchLineageNodes).
 */
function decorate(rows: RawActivityRow[], lineageNodes?: LineageSeed[]): ActivityWithContext[] {
  const index = buildLineageIndex(
    lineageNodes ??
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        academic_year: r.academic_year,
        lineage_parent_id: r.lineage_parent_id,
      }))
  );

  return rows.map((r) => {
    // 대표 주최가 먼저 오도록 정렬 — 카드·행은 첫 건만 보여 준다
    const hosts: ActivityHostRef[] = (r.activity_host_link ?? [])
      .filter((l) => !!l.host)
      .map((l) => ({ ...l.host!, role: l.role }))
      .sort((a, b) =>
        a.role === b.role ? a.name.localeCompare(b.name, 'ko') : a.role === 'primary' ? -1 : 1
      );

    return {
    ...r,
    hosts,
    primaryHost: hosts.find((h) => h.role === 'primary') ?? hosts[0] ?? null,
    teachers: (r.activity_teacher ?? []).map((t) => ({
      resource_id: t.teacher_resource_id,
      name: t.resource?.name ?? '',
      role: t.role,
    })),
    // **세지 않았으면 null** — "0명"과 "묻지 않았다"는 다른 사실이다(학생 시점).
    participant_count: r.activity_participation ? (r.activity_participation[0]?.count ?? 0) : null,
    lineage_generation: getLineageGeneration(r.id, index),
    };
  });
}

export interface LineageSeed {
  id: string;
  name: string;
  academic_year: number;
  lineage_parent_id: string | null;
}

/**
 * 계보 계산 전용 경량 목록 — 전 연도의 (id, 이름, 연도, 부모)만 가져온다.
 *
 * 활동 전체를 전 연도 불러오면 무겁지만 계보는 연도를 넘어야만 의미가 있다.
 * 네 컬럼만 읽어 그 간극을 메운다.
 */
export async function fetchLineageNodes(): Promise<LineageSeed[]> {
  return fetchAllPages<LineageSeed>((from, to) => supabase
    .from('activity')
    .select('id, name, academic_year, lineage_parent_id')
    .order('id')
    .range(from, to));
}

/**
 * 목록 조회 + 계보 장식을 한 번에 — 훅을 쓰지 않는 곳(공지 링크 피커)용.
 *
 * 본문 전문이 필요하면 이걸 쓰지 말고 `fetchActivity(id)` 를 쓸 것 —
 * 여기서 오는 행에는 `content` 가 없다(`ActivityListItem`).
 */
export async function fetchActivities(
  filters: ActivityFilters = {},
  lineageNodes?: LineageSeed[],
  withParticipantCount = true
): Promise<ActivityListItem[]> {
  return decorateActivities(await fetchActivitiesRaw(filters, withParticipantCount), lineageNodes);
}

/** 받은 목록 행에 계보를 붙인다(순수 변환) — 훅의 `select` 가 쓴다. */
export function decorateActivities(
  rows: RawActivityListRow[],
  lineageNodes?: LineageSeed[]
): ActivityListItem[] {
  return decorate(rows as unknown as RawActivityRow[], lineageNodes) as unknown as ActivityListItem[];
}

/**
 * 장식 없이 원시 행만 — 계보는 **받은 뒤에** 붙인다(`decorateActivities`).
 *
 * 왜 갈랐나: `useActivities` 가 계보를 queryKey 에 넣고 있어서, 계보가 도착하는 순간
 * 키가 바뀌어 **목록 전체를 한 번 더 받았다**(콜드 로드마다 같은 2 MB 를 두 번). 계보 장식은
 * 순수 클라이언트 변환이라 조회 키에 들어갈 이유가 없다 — 훅의 `select` 로 옮겼다.
 */
export async function fetchActivitiesRaw(
  filters: ActivityFilters = {},
  /**
   * 참여자 수를 함께 셀지. **학생에게는 세지 않는다** — RLS 상 자기 행만 보이므로
   * 30명짜리 활동도 "1명"으로 나온다. 느린 것보다 **틀린 것이 문제**다
   * (그 집계가 학생 시점 조회 시간의 대부분이기도 했다 — 실측 500행 214ms 중 204ms).
   */
  withParticipantCount = true
): Promise<RawActivityListRow[]> {
  let query = supabase
    .from('activity')
    .select(activityListSelect(!!filters.hostId, withParticipantCount))
    .order('starts_on', { ascending: false })
    .order('id');

  if (filters.academicYear) query = query.eq('academic_year', filters.academicYear);
  if (filters.area) query = query.eq('area', filters.area);
  // 조인 표 필터 — 공동 주최도 함께 잡힌다(단일 host_id였을 때는 빠졌다)
  if (filters.hostId) query = query.eq('activity_host_link.host_id', filters.hostId);
  if (filters.operatorType) query = query.eq('operator_type', filters.operatorType);
  if (filters.budgetSource) query = query.eq('budget_source', filters.budgetSource);

  const term = filters.search ? sanitizeSearchTerm(filters.search) : '';
  if (term) {
    query = query.or(
      [
        `name.ilike.%${term}%`,
        `content.ilike.%${term}%`,
        `purpose.ilike.%${term}%`,
        `outcome.ilike.%${term}%`,
        `place.ilike.%${term}%`,
        `operator_name.ilike.%${term}%`,
        // 키워드는 화면에 칩으로 보이는 값이라 검색도 되어야 한다. `keywords` 가 `text[]` 라
        // ilike 를 바로 못 걸어 **PostgREST 계산 필드** `keywords_text` 를 쓴다(DB 함수).
        // 컬럼이 아니므로 `select *` 에 실려 나가지 않고 필터에만 쓰인다.
        `keywords_text.ilike.%${term}%`,
      ].join(',')
    );
  }

  return (await fetchAllPages((from, to) => query.range(from, to))) as unknown as RawActivityListRow[];
}

export async function fetchActivity(
  id: string,
  /** 목록과 같은 기준 — 학생에게는 참여자 수를 세지 않는다(RLS 상 자기 행만 보여 틀린다) */
  withParticipantCount = true
): Promise<ActivityWithContext | null> {
  const { data, error } = await supabase
    .from('activity')
    .select(withParticipantCount ? ACTIVITY_SELECT : ACTIVITY_SELECT_NO_COUNT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // 상세는 계보 전체가 필요하다 — 목록 한 건만으로는 연차를 못 센다.
  const lineage = await fetchLineageNodes();
  return decorate([data as unknown as RawActivityRow], lineage)[0];
}

// ----------------------------------------
// 활동 쓰기
// ----------------------------------------

export async function createActivity(input: ActivityInput): Promise<Activity> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('activity')
    // RLS WITH CHECK가 created_by = auth.uid()를 요구한다.
    .insert({ ...input, created_by: userId })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as Activity;
}

export async function updateActivity(
  id: string,
  patch: Partial<ActivityInput>
): Promise<void> {
  const { data, error } = await supabase
    .from('activity')
    .update(patch)
    .eq('id', id)
    .select('id');

  if (error) throw error;
  // RLS가 막으면 오류가 아니라 0행이다.
  if (!data || data.length === 0) {
    throw new Error('이 활동을 수정할 권한이 없습니다.');
  }
}

export async function deleteActivity(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('activity')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('이 활동을 삭제할 권한이 없습니다.');
  }
}

// ----------------------------------------
// 담당교사
// ----------------------------------------

/**
 * 담당교사 목록을 통째로 맞춘다(없애고 다시 넣는 대신 차집합만 건드린다).
 *
 * 전부 지우고 다시 넣으면 그 찰나에 `can_manage_activity`가 false가 되어
 * 자기가 자기 활동을 잠글 수 있다 — 실제로 위험한 순서다.
 */
export async function setActivityTeachers(
  activityId: string,
  teachers: { resource_id: string; role: ActivityTeacherRole }[]
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('activity_teacher')
    .select('teacher_resource_id, role')
    .eq('activity_id', activityId);
  if (readError) throw readError;

  const current = new Map((existing ?? []).map((r) => [r.teacher_resource_id, r.role]));
  const next = new Map(teachers.map((t) => [t.resource_id, t.role]));

  const toRemove = [...current.keys()].filter((id) => !next.has(id));
  const toUpsert = teachers.filter((t) => current.get(t.resource_id) !== t.role);

  if (toUpsert.length > 0) {
    const { error } = await supabase.from('activity_teacher').upsert(
      toUpsert.map((t) => ({
        activity_id: activityId,
        teacher_resource_id: t.resource_id,
        role: t.role,
      })),
      { onConflict: 'activity_id,teacher_resource_id' }
    );
    if (error) throw error;
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('activity_teacher')
      .delete()
      .eq('activity_id', activityId)
      .in('teacher_resource_id', toRemove);
    if (error) throw error;
  }
}

// ----------------------------------------
// 참여자
// ----------------------------------------

export async function fetchParticipants(activityId: string): Promise<ActivityParticipantRow[]> {
  const { data, error } = await supabase
    .from('activity_participation')
    .select('*, student:student_resource_id ( id, name, status )')
    .eq('activity_id', activityId)
    .order('grade', { ascending: true })
    .order('class_num', { ascending: true })
    .order('student_code', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as (ActivityParticipantRow & {
    student: { name: string } | null;
  })[]).map((row) => ({
    ...row,
    // 이름은 조인으로만 얻는다 — 졸업생 익명화(YYYY입학NNN)가 자동으로 따라온다.
    student_name: row.student?.name ?? null,
  }));
}

/**
 * 참여자 명단을 통째로 맞춘다.
 *
 * 빠진 학생은 **삭제**한다(상태 변경이 아니라). 참여하지 않은 사람이
 * withdrawn으로 남으면 "중도 이탈"이라는 없던 사실이 기록되기 때문이다.
 * 실제로 중간에 그만둔 학생은 명단에 남기고 status를 withdrawn으로 바꾼다.
 */
export async function setParticipants(
  activityId: string,
  participants: ParticipantInput[]
): Promise<{ added: number; removed: number }> {
  const { data: existing, error: readError } = await supabase
    .from('activity_participation')
    .select('id, student_code')
    .eq('activity_id', activityId);
  if (readError) throw readError;

  const currentCodes = new Set((existing ?? []).map((r) => r.student_code));
  const nextCodes = new Set(participants.map((p) => p.student_code));

  const toAdd = participants.filter((p) => !currentCodes.has(p.student_code));
  const toRemove = (existing ?? []).filter((r) => !nextCodes.has(r.student_code));

  if (toAdd.length > 0) {
    const { data, error } = await supabase
      .from('activity_participation')
      .insert(
        toAdd.map((p) => ({
          activity_id: activityId,
          student_code: p.student_code,
          student_resource_id: p.student_resource_id ?? null,
          grade: p.grade ?? null,
          class_num: p.class_num ?? null,
          role: p.role ?? 'member',
          status: p.status ?? 'active',
          hours: p.hours ?? null,
          note: p.note ?? null,
        }))
      )
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('참여자를 등록할 권한이 없습니다.');
    }
  }

  if (toRemove.length > 0) {
    const { data, error } = await supabase
      .from('activity_participation')
      .delete()
      .in('id', toRemove.map((r) => r.id))
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('참여자를 삭제할 권한이 없습니다.');
    }
  }

  return { added: toAdd.length, removed: toRemove.length };
}

export async function updateParticipation(
  id: string,
  patch: Partial<Pick<ParticipantInput, 'role' | 'status' | 'hours' | 'note'>>
): Promise<void> {
  const { data, error } = await supabase
    .from('activity_participation')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('이 참여 기록을 수정할 권한이 없습니다.');
  }
}

// ----------------------------------------
// 주최 맥락 (동아리 등)
// ----------------------------------------

export async function fetchHosts(): Promise<ActivityHost[]> {
  const { data, error } = await supabase
    .from('activity_host')
    .select('*')
    .eq('status', 'active')
    .order('kind', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ActivityHost[];
}

export async function createHost(input: ActivityHostInput): Promise<ActivityHost> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('activity_host')
    .insert({ ...input, created_by: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as ActivityHost;
}

/** 소속 명단. 참여자 선택의 기본값 씨앗이다. */
export async function fetchHostMembers(
  hostId: string,
  academicYear: number
): Promise<ActivityHostMemberRow[]> {
  const { data, error } = await supabase
    .from('activity_host_member')
    .select('*, student:student_resource_id ( id, name, status )')
    .eq('host_id', hostId)
    .eq('academic_year', academicYear)
    .order('grade', { ascending: true })
    .order('class_num', { ascending: true })
    .order('number', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as (ActivityHostMemberRow & {
    student: { name: string; status: string } | null;
  })[]).map((row) => ({
    ...row,
    student_name: row.student?.name ?? null,
    student_status: row.student?.status ?? null,
  }));
}

// ----------------------------------------
// 학생 개인 뷰
// ----------------------------------------

/** 내가 참여한 활동 전체(연도 무관). 학생 '내 활동' 탭·대시보드 타임라인이 쓴다. */
export async function fetchMyActivities(studentCode: string): Promise<{
  participations: ActivityParticipantRow[];
  activities: ActivityWithContext[];
}> {
  const { data: parts, error } = await supabase
    .from('activity_participation')
    .select('*')
    .eq('student_code', studentCode);
  if (error) throw error;

  const ids = [...new Set((parts ?? []).map((p) => p.activity_id))];
  if (ids.length === 0) return { participations: [], activities: [] };

  const [{ data: rows, error: actError }, lineage] = await Promise.all([
    supabase.from('activity').select(ACTIVITY_SELECT).in('id', ids),
    fetchLineageNodes(),
  ]);
  if (actError) throw actError;

  return {
    participations: ((parts ?? []) as unknown as ActivityParticipantRow[]).map((p) => ({
      ...p,
      student_name: null,
    })),
    activities: decorate((rows ?? []) as unknown as RawActivityRow[], lineage),
  };
}

// ----------------------------------------
// 주최 (다대다) — 여러 동아리가 함께 연 활동
// ----------------------------------------

/**
 * 주최 목록을 통째로 맞춘다.
 *
 * `setActivityTeachers`와 같은 이유로 **차집합만 건드린다** — 전부 지우고 다시 넣으면
 * 그 찰나에 `can_manage_activity`(주최 담당교사 갈래)가 false가 되어 자기가 자기
 * 활동을 잠글 수 있다.
 *
 * 첫 번째 항목이 대표 주최(`primary`)다. 부분 UNIQUE 인덱스가 활동당 하나를 강제하므로
 * **대표를 바꿀 때는 옛 대표를 먼저 co로 내려야** 23505가 나지 않는다.
 */
export async function setActivityHosts(activityId: string, hostIds: string[]): Promise<void> {
  const next = [...new Set(hostIds.filter(Boolean))];

  const { data: existing, error: readError } = await supabase
    .from('activity_host_link')
    .select('host_id, role')
    .eq('activity_id', activityId);
  if (readError) throw readError;

  const current = new Map((existing ?? []).map((r) => [r.host_id, r.role as 'primary' | 'co']));
  const nextRole = new Map(next.map((id, i) => [id, i === 0 ? 'primary' : 'co'] as const));

  const toRemove = [...current.keys()].filter((id) => !nextRole.has(id));

  // ① 없어질 주최를 먼저 지운다(옛 대표가 여기 있으면 UNIQUE가 풀린다)
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('activity_host_link')
      .delete()
      .eq('activity_id', activityId)
      .in('host_id', toRemove);
    if (error) throw error;
  }

  // ② 남아 있는 옛 대표를 co로 내린다 — 새 대표를 넣기 전에 자리를 비워야 한다
  const staleprimary = [...current.entries()].find(
    ([id, role]) => role === 'primary' && nextRole.get(id) !== 'primary'
  );
  if (staleprimary) {
    const { error } = await supabase
      .from('activity_host_link')
      .update({ role: 'co' })
      .eq('activity_id', activityId)
      .eq('host_id', staleprimary[0]);
    if (error) throw error;
  }

  // ③ 추가·역할 변경
  const toUpsert = next.filter((id) => current.get(id) !== nextRole.get(id));
  if (toUpsert.length > 0) {
    const { data, error } = await supabase
      .from('activity_host_link')
      .upsert(
        toUpsert.map((id) => ({ activity_id: activityId, host_id: id, role: nextRole.get(id)! })),
        { onConflict: 'activity_id,host_id' }
      )
      .select('host_id');
    if (error) throw error;
    // RLS 차단은 0행이다 — 학생이 자기 소속 아닌 동아리를 걸려 할 때 여기서 걸린다
    if (!data || data.length === 0) {
      throw new Error('이 동아리를 주최로 연결할 권한이 없습니다. 소속된 동아리만 연결할 수 있습니다.');
    }
  }
}

/** 내가 그 해 소속된 주최(동아리) — 학생이 활동을 기록할 때 고를 수 있는 범위 */
export async function fetchMyHosts(
  studentCode: string,
  academicYear: number
): Promise<ActivityHost[]> {
  const { data: links, error } = await supabase
    .from('activity_host_member')
    .select('host_id')
    .eq('student_code', studentCode)
    .eq('academic_year', academicYear);
  if (error) throw error;

  const ids = [...new Set((links ?? []).map((l) => l.host_id))];
  if (ids.length === 0) return [];

  const { data, error: hostError } = await supabase
    .from('activity_host')
    .select('*')
    .in('id', ids)
    .order('name');
  if (hostError) throw hostError;
  return (data ?? []) as unknown as ActivityHost[];
}

// ----------------------------------------
// 중복 감지 — "이미 같은 활동이 있는 경우"
// ----------------------------------------

export interface SimilarActivity {
  id: string;
  name: string;
  academic_year: number;
  starts_on: string;
  /** 같은 학년도면 '합류', 지난 학년도면 '이어받기'가 답이다 */
  sameYear: boolean;
  hostNames: string[];
  participantCount: number;
}

/**
 * 이름이 비슷한 기존 활동을 찾는다.
 *
 * **두 경우의 답이 다르다.**
 *   같은 학년도 → 여러 동아리가 함께 하는 활동이므로 **합류**(주최·참여자 추가)
 *   지난 학년도 → **계보 연결**(이어받기)
 * 화면이 이 구분을 그대로 보여 줘야 교사가 옳은 길을 고른다.
 */
export async function findSimilarActivities(
  name: string,
  academicYear: number,
  excludeId?: string
): Promise<SimilarActivity[]> {
  const core = normalizeActivityName(name);
  if (core.length < 2) return [];

  // 핵심어(2글자 이상)로 부분 일치 — 정규화한 이름끼리는 DB에서 비교할 수 없다
  const term = sanitizeSearchTerm(name).slice(0, 40);
  if (!term) return [];

  const { data, error } = await supabase
    .from('activity')
    .select(
      'id, name, academic_year, starts_on, activity_host_link ( host:host_id ( name ) ), activity_participation ( count )'
    )
    .ilike('name', `%${term}%`)
    .limit(20);
  if (error) {
    console.error('중복 활동 조회 실패:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string;
    name: string;
    academic_year: number;
    starts_on: string;
    activity_host_link: { host: { name: string } | null }[] | null;
    activity_participation: { count: number }[] | null;
  }[])
    .filter((r) => r.id !== excludeId)
    .filter((r) => isSimilarActivityName(r.name, name))
    .map((r) => ({
      id: r.id,
      name: r.name,
      academic_year: r.academic_year,
      starts_on: r.starts_on,
      sameYear: r.academic_year === academicYear,
      hostNames: (r.activity_host_link ?? []).map((l) => l.host?.name).filter((n): n is string => !!n),
      participantCount: r.activity_participation?.[0]?.count ?? 0,
    }))
    .sort((a, b) => Number(b.sameYear) - Number(a.sameYear) || b.academic_year - a.academic_year);
}
