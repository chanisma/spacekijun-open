import { supabase } from '@/integrations/supabase/client';
import type {
  WishlistItem,
  ProgramSearchResult,
  MajorSearchResult,
  NewWishlistInput,
  AdmissionTrack,
  CsatCheckValue,
  WishlistTier,
} from '../types';

// ---- 행 매핑 (snake_case RPC → camelCase 도메인) ----
function mapWishlistRow(r: any): WishlistItem {
  return {
    id: r.id,
    studentCode: r.student_code,
    track: r.track as AdmissionTrack,
    university: r.university,
    department: r.department ?? null,
    admissionName: r.admission_name ?? null,
    memo: r.memo ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    tier: (r.tier === 'interest' ? 'interest' : 'apply') as WishlistTier,
    convertedScore: r.converted_score ?? null,
    interviewDate: r.interview_date ?? null,
    firstAnnounceDate: r.first_announce_date ?? null,
    finalAnnounceDate: r.final_announce_date ?? null,
    csatCheck6: (r.csat_check_6 ?? null) as CsatCheckValue | null,
    csatCheck9: (r.csat_check_9 ?? null) as CsatCheckValue | null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    gyogwa: r.gyogwa ?? null,
    jonghap: r.jonghap ?? null,
    adiga: r.adiga ?? null,
  };
}

/**
 * 학생의 수시 지원 목록 + 참고 입시 데이터를 조회한다.
 * RLS(admission_wishlist)가 적용되므로, 권한 없는 교사/학생은 빈 배열을 받는다.
 */
export async function fetchWishlist(studentCode: string): Promise<WishlistItem[]> {
  const { data, error } = await supabase.rpc('get_admission_wishlist', {
    p_student_code: studentCode,
  });
  if (error) throw error;
  return (data ?? []).map(mapWishlistRow);
}

/** 입력 화면 검색 — 교과/종합 전형 프로그램 통합 검색 */
export async function searchPrograms(
  track: AdmissionTrack,
  query: string,
  limit = 30
): Promise<ProgramSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.rpc('search_admission_programs', {
    p_track: track,
    p_query: q,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    track: r.track as AdmissionTrack,
    refId: r.ref_id,
    university: r.university,
    department: r.department ?? null,
    admissionName: r.admission_name ?? null,
    region: r.region ?? null,
    extra: r.extra ?? {},
    score: r.score ?? null,
  }));
}

/**
 * 입력 화면 학과 검색 — adiga(대학×학과×전형) 단위. 커트라인·경쟁률 프리뷰 포함.
 * "major 를 선택할 수 있게" 하는 핵심 경로.
 */
export async function searchMajors(
  track: AdmissionTrack,
  query: string,
  limit = 40,
  offset = 0,
  options?: import('../types').MajorSearchOptions
): Promise<MajorSearchResult[]> {
  const q = query.trim();
  const regions = options?.regions ?? [];
  const hasFilter =
    regions.length > 0 ||
    options?.cutMin != null ||
    options?.cutMax != null ||
    options?.recruitMin != null;
  // 검색어가 비었고 필터도 없으면 호출 안 함(빈 결과). 필터만 있으면 빈 검색어로도 조회 허용.
  if (!q && !hasFilter) return [];
  const { data, error } = await supabase.rpc('search_admission_majors', {
    p_track: track,
    p_query: q,
    p_limit: limit,
    p_offset: offset,
    p_regions: regions.length > 0 ? regions : null,
    p_cut_min: options?.cutMin ?? null,
    p_cut_max: options?.cutMax ?? null,
    p_sort: options?.sort ?? 'grade70',
    p_recruit_min: options?.recruitMin ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    adigaId: r.adiga_id,
    university: r.university,
    major: r.major ?? null,
    program: r.program ?? null,
    field: r.field ?? null,
    domain: r.domain ?? null,
    region: r.region ?? null,
    grade50: r.grade50 != null ? Number(r.grade50) : null,
    grade70: r.grade70 != null ? Number(r.grade70) : null,
    competition2026: r.competition_2026 != null ? Number(r.competition_2026) : null,
    recruit2026: r.recruit_2026 != null ? Number(r.recruit_2026) : null,
    hasCsat: r.has_csat === true,
    csat: r.csat ?? null,
    csatStatus: r.csat_status ?? null,
    score: r.score ?? null,
  }));
}

/**
 * 지원 항목 추가 (학생 본인 전용 — RLS insert 정책이 owner 검증).
 * created_by 는 RLS WITH CHECK(created_by = auth.uid()) 충족을 위해 명시.
 */
export async function addWishlistItem(input: NewWishlistInput): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  const tier: WishlistTier = input.tier ?? 'apply';
  // 다음 sort_order = 그 **칸(tier) 안의** 현재 최대 + 1.
  // 지망 번호는 지원희망 칸 안에서만 의미가 있으므로 학생 전체가 아니라 칸별로 센다.
  const { data: maxRow } = await supabase
    .from('admission_wishlist')
    .select('sort_order')
    .eq('student_code', input.studentCode)
    .eq('tier', tier)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('admission_wishlist')
    .insert({
      student_code: input.studentCode,
      track: input.track,
      tier,
      university: input.university,
      department: input.department,
      admission_name: input.admissionName,
      gyogwa_id: input.gyogwaId,
      jonghap_code: input.jonghapCode,
      adiga_id: input.adigaId,
      memo: input.memo,
      sort_order: nextOrder,
      created_by: uid,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** 학생 최근 모의고사 영역별 등급 (수능최저 판정용 — get_wishlist_mock) */
export async function fetchStudentMock(studentCode: string) {
  const { data, error } = await supabase.rpc('get_wishlist_mock', {
    p_student_code: studentCode,
  });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return {
    academicYear: rows[0]?.academic_year ?? null,
    examMonth: rows[0]?.exam_month ?? null,
    subjects: rows
      .filter((r) => r.grade != null)
      .map((r) => ({ subject: r.subject as string, grade: Number(r.grade) })),
  };
}

/** 모의고사 한 회차 (RightPanel 회차 탐색용) */
export interface MockRound {
  academicYear: number | null;
  examMonth: number | null;
  subjects: { subject: string; grade: number }[];
}

/**
 * 학생 전 회차 모의고사 (영역별 등급) — 최신 → 과거 순.
 * (수능최저 판정용 get_wishlist_mock(최신 1회차)와 별개. 회차 탐색·추세 표시 전용.)
 */
export async function fetchStudentMockRounds(studentCode: string): Promise<MockRound[]> {
  const { data, error } = await supabase.rpc('get_wishlist_mock_rounds', {
    p_student_code: studentCode,
  });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // (연도, 월) 단위로 회차 그룹핑. RPC가 연도·월 내림차순 정렬해 주므로 등장 순서 = 최신순.
  const byRound = new Map<string, MockRound>();
  for (const r of rows) {
    if (r.grade == null) continue;
    const key = `${r.academic_year}-${r.exam_month}`;
    if (!byRound.has(key)) {
      byRound.set(key, { academicYear: r.academic_year ?? null, examMonth: r.exam_month ?? null, subjects: [] });
    }
    byRound.get(key)!.subjects.push({ subject: r.subject as string, grade: Number(r.grade) });
  }
  return Array.from(byRound.values());
}

/** 학급 전체 수시 지원 현황 — 학생 단위로 묶어 반환 (get_class_wishlist_summary) */
export async function fetchClassWishlist(
  grade: number,
  classNum: number
): Promise<import('../types').ClassWishlistStudent[]> {
  const { data, error } = await supabase.rpc('get_class_wishlist_summary', {
    p_grade: grade,
    p_class: classNum,
  });
  if (error) throw error;
  const rows = (data ?? []) as any[];

  // 행(학생×지원항목)을 학생 단위로 그룹화. 번호 순 유지.
  const byStudent = new Map<string, import('../types').ClassWishlistStudent>();
  for (const r of rows) {
    let s = byStudent.get(r.student_code);
    if (!s) {
      s = {
        studentCode: r.student_code,
        name: r.name ?? '',
        numberInClass: r.number_in_class ?? null,
        applications: [],
      };
      byStudent.set(r.student_code, s);
    }
    if (r.wishlist_id) {
      s.applications.push({
        wishlistId: r.wishlist_id,
        track: r.track,
        university: r.university,
        department: r.department ?? null,
        admissionName: r.admission_name ?? null,
        grade70: r.grade70 != null ? Number(r.grade70) : null,
        competition2026: r.competition_2026 != null ? Number(r.competition_2026) : null,
        field: r.field ?? null,
      });
    }
  }
  return Array.from(byStudent.values()).sort(
    (a, b) => (a.numberInClass ?? 999) - (b.numberInClass ?? 999)
  );
}

/** 학생 과목별 기록 (전형 맞춤 내신 계산용 — get_wishlist_subjects) */
export async function fetchStudentSubjects(studentCode: string) {
  const { data, error } = await supabase.rpc('get_wishlist_subjects', {
    p_student_code: studentCode,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    academicYear: r.academic_year,
    grade: r.grade,
    semester: r.semester,
    category: r.category ?? 'regular',
    subjectGroup: r.subject_group,
    subject: r.subject,
    units: r.units != null ? Number(r.units) : 0,
    rank: r.rank != null ? Number(r.rank) : null,
    achievement: r.achievement ?? null,
    score: r.score != null ? Number(r.score) : null,
  }));
}

/** 사용자가 직접 입력해 저장하는 원서 준비 항목 (비교표에서 편집) */
export interface WishlistPlanPatch {
  university: string;
  department: string | null;
  admissionName: string | null;
  memo: string | null;
  convertedScore: string | null;
  interviewDate: string | null;
  /** YYYY-MM-DD 또는 null(지움) */
  firstAnnounceDate: string | null;
  finalAnnounceDate: string | null;
  /** 수능최저 충족 수동 판정 — null 이면 자동 판정을 따른다 */
  csatCheck6: CsatCheckValue | null;
  csatCheck9: CsatCheckValue | null;
}

/**
 * 항목 수정 (본인 또는 쓰기 권한자 — RLS 가 판정).
 * RLS 차단은 오류가 아니라 **0행**이라 `.select('id')` 반환 행으로 실제 반영을 확인한다.
 */
export async function updateWishlistItem(
  id: string,
  patch: Partial<WishlistPlanPatch>
): Promise<void> {
  const { data, error } = await supabase
    .from('admission_wishlist')
    .update({
      ...(patch.university !== undefined ? { university: patch.university } : {}),
      ...(patch.department !== undefined ? { department: patch.department } : {}),
      ...(patch.admissionName !== undefined ? { admission_name: patch.admissionName } : {}),
      ...(patch.memo !== undefined ? { memo: patch.memo } : {}),
      ...(patch.convertedScore !== undefined ? { converted_score: patch.convertedScore } : {}),
      ...(patch.interviewDate !== undefined ? { interview_date: patch.interviewDate } : {}),
      ...(patch.firstAnnounceDate !== undefined ? { first_announce_date: patch.firstAnnounceDate } : {}),
      ...(patch.finalAnnounceDate !== undefined ? { final_announce_date: patch.finalAnnounceDate } : {}),
      ...(patch.csatCheck6 !== undefined ? { csat_check_6: patch.csatCheck6 } : {}),
      ...(patch.csatCheck9 !== undefined ? { csat_check_9: patch.csatCheck9 } : {}),
    })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장 권한이 없거나 항목을 찾을 수 없습니다.');
}

/**
 * 여러 항목의 계획 필드를 한 번에 저장 (비교표 [저장] 버튼).
 * 실패한 항목이 있으면 그 개수를 담아 던진다 — 부분 성공을 조용히 넘기지 않기 위함.
 */
export async function saveWishlistPlans(
  patches: Array<{ id: string; patch: Partial<WishlistPlanPatch> }>
): Promise<void> {
  const results = await Promise.allSettled(
    patches.map(({ id, patch }) => updateWishlistItem(id, patch))
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) throw new Error(`${patches.length}건 중 ${failed}건 저장 실패`);
}

/**
 * 항목의 칸(tier) 이동 — 지원희망 ↔ 관심대학.
 * 이동한 항목은 **대상 칸의 맨 뒤**로 붙인다(지망 순번 재배치는 reorder 가 담당).
 * 정원 검사는 호출부(`utils/tierRules.ts`)가 한다 — 서버는 값 도메인만 지킨다.
 */
export async function setWishlistTier(
  id: string,
  studentCode: string,
  tier: WishlistTier,
): Promise<void> {
  const { data: maxRow } = await supabase
    .from('admission_wishlist')
    .select('sort_order')
    .eq('student_code', studentCode)
    .eq('tier', tier)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('admission_wishlist')
    .update({ tier, sort_order: nextOrder })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('이동 권한이 없거나 항목을 찾을 수 없습니다.');
}

/**
 * 지망 순서 재배치 — `orderedIds` 순서대로 sort_order 를 0..n-1 로 다시 매긴다.
 * (지망 번호가 곧 sort_order 라, 위/아래 이동은 배열 순서를 바꿔 이 함수를 부른다.)
 */
export async function reorderWishlist(orderedIds: string[]): Promise<void> {
  const results = await Promise.allSettled(
    orderedIds.map(async (id, i) => {
      const { data, error } = await supabase
        .from('admission_wishlist')
        .update({ sort_order: i })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('순서 변경 권한이 없습니다.');
    })
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) throw new Error(`순서 변경 ${failed}건 실패`);
}

/** 항목 삭제 (학생 본인 전용) */
export async function deleteWishlistItem(id: string): Promise<void> {
  const { error } = await supabase.from('admission_wishlist').delete().eq('id', id);
  if (error) throw error;
}

/**
 * 대학별 전형 변경사항 (get_admission_changes).
 *
 * 대학 목록을 한 번에 넘겨 **한 번의 왕복**으로 받는다 — 항목마다 조회하면 N+1 이다.
 * 반환은 조회한 대학명(`query_university`) 기준 Map 이라 호출부가 위시리스트 항목의
 * `university` 로 바로 붙일 수 있다.
 */
export async function fetchAdmissionChanges(
  universities: string[]
): Promise<Map<string, import('../utils/admissionChange').AdmissionChange[]>> {
  const list = Array.from(new Set(universities.map((u) => (u ?? '').trim()).filter(Boolean)));
  const out = new Map<string, import('../utils/admissionChange').AdmissionChange[]>();
  if (list.length === 0) return out;

  const { data, error } = await supabase.rpc('get_admission_changes', { p_universities: list });
  if (error) throw error;

  const { mapChange } = await import('../utils/admissionChange');
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.query_university ?? '');
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(mapChange(row));
  }
  return out;
}

/**
 * 대학별 고사 일정 (get_admission_schedules).
 *
 * `year` 를 함께 돌려주는 이유: 원본이 월·일만 담고 있어 발표일 자동 채움이 연도를
 * 알아야 한다. 자료의 실제 날짜에서 뽑으므로 코드에 박지 않는다.
 */
export async function fetchAdmissionSchedules(universities: string[]): Promise<{
  byUniversity: Map<string, import('../utils/admissionSchedule').AdmissionSchedule[]>;
  year: number | undefined;
}> {
  const list = Array.from(new Set(universities.map((u) => (u ?? '').trim()).filter(Boolean)));
  const byUniversity = new Map<string, import('../utils/admissionSchedule').AdmissionSchedule[]>();
  if (list.length === 0) return { byUniversity, year: undefined };

  const { data, error } = await supabase.rpc('get_admission_schedules', { p_universities: list });
  if (error) throw error;

  const { mapSchedule } = await import('../utils/admissionSchedule');
  let year: number | undefined;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.query_university ?? '');
    if (!byUniversity.has(key)) byUniversity.set(key, []);
    const s = mapSchedule(row);
    byUniversity.get(key)!.push(s);
    if (year === undefined && s.examStart) year = Number(s.examStart.slice(0, 4));
  }
  return { byUniversity, year };
}

/**
 * 대학 기본 정보 — 입학처 사이트·복수지원 (get_admission_university_info).
 *
 * **정규화 키를 클라이언트가 만들어 넘긴다**(`univInfoQueryKeys`). 서버는 키로 행을
 * 돌려줄 뿐이고 어느 것을 고를지는 `resolveUnivInfo` 가 정한다 — 대학명 정규화 규칙을
 * SQL 에도 적으면 두 벌이 조용히 갈라지고, 갈라져도 화면에는 "자료 없음"으로만 보인다.
 *
 * 반환은 **매칭 후보 전체**다. 호출부가 항목마다 `resolveUnivInfo` 로 고른다.
 */
export async function fetchAdmissionUnivInfo(
  universities: string[]
): Promise<import('../utils/admissionUnivInfo').AdmissionUnivInfo[]> {
  const { univInfoQueryKeys, mapUnivInfo } = await import('../utils/admissionUnivInfo');
  const keys = univInfoQueryKeys(universities);
  if (keys.length === 0) return [];

  const { data, error } = await supabase.rpc('get_admission_university_info', { p_keys: keys });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapUnivInfo);
}

/**
 * 수능최저 구조화 규칙 (gyogwa_id → 규칙들).
 * 위시리스트가 참조하는 전형만 한 번에 읽는다.
 */
export async function fetchCsatRules(
  gyogwaIds: string[]
): Promise<Map<string, import('../utils/csatRule').CsatRule[]>> {
  const ids = Array.from(new Set(gyogwaIds.filter(Boolean)));
  const out = new Map<string, import('../utils/csatRule').CsatRule[]>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('admission_csat_rule')
    .select('*')
    .in('gyogwa_id', ids)
    .order('block_index');
  if (error) throw error;

  const { mapCsatRule } = await import('../utils/csatRule');
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.gyogwa_id ?? '');
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(mapCsatRule(row));
  }
  return out;
}
