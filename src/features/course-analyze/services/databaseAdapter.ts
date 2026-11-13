/**
 * Database Adapter for course-analyze
 * DB의 course_selection_* 테이블 → 기존 UnifiedDataFormat (data.json 형식)으로 변환
 *
 * Phase 3 (현재): get_course_analyze_snapshot RPC로 단일 RTT 호출.
 *                 rounds + submissions + items + subjectConfig + realID JOIN을 서버에서 통합.
 * Legacy fallback: RPC 실패 시 기존 4-step 흐름(loadFromDatabaseLegacy)을 사용.
 *
 * 이 어댑터로 모든 분석 탭이 변경 없이 DB 데이터를 사용 가능
 */

import { supabase } from '@/integrations/supabase/client';
import type { UnifiedDataFormat, SubjectConfiguration } from '../types/course.types';
import { SUBJECT_CATEGORIES, type CategoryCode } from '@/features/course-selection/constants/categories';
import { SUBJECT_PREREQUISITES } from '@/features/course-selection/constants/prerequisites';
import {
  DEFAULT_SUBJECT_CATEGORIES,
  ETC_SUBCATEGORIES,
  normalizeSubjectName,
} from '../utils/subjectUtils';

const PAGE_SIZE = 1000;

/**
 * 분석 대상으로 삼을 라운드 status.
 *
 * `finalized`는 초기 data.json/xlsx import가 남긴 레거시 값이고, course-selection 관리자
 * UI(`RoundInspector`)의 상태 선택지는 draft/open/closed/archived 4개뿐이다(`RoundStatus`에도
 * finalized 없음). 그래서 관리자가 라운드를 한 번 열어 저장하면 finalized → closed로 조용히
 * 내려앉는다(실제로 2026-06-26·2026-07-20 감사 로그에 기록됨).
 *
 * ⇒ 마감된 라운드를 조회하는 곳은 반드시 이 상수를 공유할 것. 한쪽만 `finalized`로 필터하면
 *   관리자가 라운드를 저장하는 순간 그 기능만 조용히 빈 결과가 된다.
 */
export const ANALYSIS_READY_STATUSES = new Set(['closed', 'finalized']);

// 카탈로그(course_selectable_subject)의 비표준 category_code 보정 테이블.
// 일부 행이 표준 코드(MATH/ETC…) 대신 한글 카테고리명이나 별칭을 category_code로 갖고 있어
// (예: '경제 수학'→'수학', '기술·가정'→'기술·가정/정보'), snapshot RPC가 그대로 그룹핑하면
// 정식 카테고리에 못 들어가고 uncategorized→기타로 떨어진다. 여기서 표준 코드로 흡수한다.
// 한글 카테고리명(SUBJECT_CATEGORIES.name)은 자동 대조하고, 그 외 별칭만 명시 보완.
const CATEGORY_CODE_ALIASES: Record<string, CategoryCode> = {
  '예술': 'ETC',
  '체육': 'ETC',
  '기술·가정': 'ETC',
  '기술·가정/정보': 'ETC',
  '기술・가정/제2외국어/한문/교양': 'ETC',
  '제2외국어': 'ETC',
  '한문': 'ETC',
  '교양': 'ETC',
  '과학': 'ETC',
};

// 한글 카테고리명(name) → 표준 코드 역인덱스 ('수학'→'MATH', '영어'→'ENG' …)
const CODE_BY_KOREAN_NAME: Record<string, CategoryCode> = Object.fromEntries(
  (Object.entries(SUBJECT_CATEGORIES) as [CategoryCode, typeof SUBJECT_CATEGORIES[CategoryCode]][])
    .map(([code, cat]) => [cat.name, code])
);

/**
 * 카탈로그 category_code를 표준 CategoryCode로 정규화한다.
 * 이미 표준 코드면 그대로, 한글명/별칭이면 표준 코드로 변환, 알 수 없으면 null.
 */
function normalizeCategoryCode(rawCode: string): CategoryCode | null {
  if (rawCode in SUBJECT_CATEGORIES) return rawCode as CategoryCode;
  if (rawCode in CODE_BY_KOREAN_NAME) return CODE_BY_KOREAN_NAME[rawCode];
  if (rawCode in CATEGORY_CODE_ALIASES) return CATEGORY_CODE_ALIASES[rawCode];
  return null;
}

/**
 * 카테고리별 과목 객체(category_code → 과목[])를 표준 코드 기준으로 병합한다.
 * 비표준 코드는 normalizeCategoryCode로 흡수하고, 끝내 알 수 없는 코드의 과목만 남겨 반환.
 */
function mergeSubjectsByStandardCode(
  subjectsByCategory: Record<string, string[]>
): { byCode: Map<CategoryCode, string[]>; unresolved: string[] } {
  const byCode = new Map<CategoryCode, string[]>();
  const unresolved: string[] = [];
  for (const [rawCode, subjects] of Object.entries(subjectsByCategory)) {
    if (!Array.isArray(subjects)) continue;
    const code = normalizeCategoryCode(rawCode);
    if (code) {
      const arr = byCode.get(code) ?? [];
      arr.push(...subjects);
      byCode.set(code, arr);
    } else {
      unresolved.push(...subjects);
    }
  }
  return { byCode, unresolved };
}

interface RoundRow {
  id: string;
  academic_year: number | null;
  target_grade: number | null;
  round_number: number;
  status: string;
}

interface SubmissionRow {
  id: string;
  round_id: string;
  student_code: string | null;
  student_name: string;
  student_grade: number | null;
  student_class: number | null;
  student_no: number | null;
}

interface ItemRow {
  submission_id: string;
  subject_name: string;
  semester: number;
}

export interface LoadFromDatabaseOptions {
  academicYear?: number;
}

export interface LoadFromDatabaseResult {
  data: UnifiedDataFormat;
  meta: {
    rounds: number;
    submissions: number;
    items: number;
    academicYear: number | null;
    /** 사용 가능한 모든 학년도 (최신순) — fetchAvailableAcademicYears 중복 호출 제거용 */
    availableAcademicYears: number[];
  };
}

/**
 * course_selection_round에서 신청 이력이 있는 distinct 학년도 목록을 최신순으로 반환.
 * Sidebar의 YearSelector가 옵션 채우는 데 사용.
 */
export async function fetchAvailableAcademicYears(): Promise<number[]> {
  const rounds = await fetchCourseSelectionRounds();
  return getAvailableAcademicYears(rounds);
}

async function fetchCourseSelectionRounds(): Promise<RoundRow[]> {
  const { data, error } = await supabase
    .from('course_selection_round')
    .select('id, academic_year, target_grade, round_number, status');
  if (error) throw error;
  return (data ?? []) as RoundRow[];
}

function getAvailableAcademicYears(rounds: RoundRow[]): number[] {
  const years = new Set<number>();
  for (const row of rounds) {
    if (typeof row.academic_year === 'number') years.add(row.academic_year);
  }
  return [...years].sort((a, b) => b - a);
}

function pickDefaultAcademicYear(rounds: RoundRow[]): number | undefined {
  const readyYears = getAvailableAcademicYears(
    rounds.filter((round) => ANALYSIS_READY_STATUSES.has(round.status))
  );
  return readyYears[0] ?? getAvailableAcademicYears(rounds)[0];
}

async function resolveAcademicYear(
  requestedAcademicYear?: number
): Promise<{ academicYear: number | undefined; availableAcademicYears: number[] }> {
  const rounds = await fetchCourseSelectionRounds();
  return {
    academicYear: requestedAcademicYear ?? pickDefaultAcademicYear(rounds),
    availableAcademicYears: getAvailableAcademicYears(rounds),
  };
}

/**
 * Phase 3: 단일 RPC 호출로 snapshot 가져오기. RPC 실패 시 legacy로 fallback.
 */
export async function loadFromDatabase(
  options: LoadFromDatabaseOptions = {}
): Promise<LoadFromDatabaseResult | null> {
  // ★ Phase 3: 단일 snapshot RPC 우선 시도
  try {
    return await loadFromDatabaseSnapshot(options);
  } catch (err) {
    console.warn('Snapshot RPC failed, falling back to legacy multi-query path:', err);
    return await loadFromDatabaseLegacy(options);
  }
}

/**
 * Phase 3 신규 경로: get_course_analyze_snapshot RPC 단일 호출.
 * 학생ID/이름/학년/반/번호/차수/1학기/2학기/등급/realID 10컬럼 2D 배열로 평탄화됨.
 */
async function loadFromDatabaseSnapshot(
  options: LoadFromDatabaseOptions
): Promise<LoadFromDatabaseResult | null> {
  const yearScope = await resolveAcademicYear(options.academicYear);
  const { data, error } = await supabase.rpc('get_course_analyze_snapshot', {
    p_academic_year: yearScope.academicYear ?? null,
  });
  if (error) throw error;
  if (!data) return null;

  type SnapshotRow = [
    string,            // 0: 학생ID (raw, 10101 형식)
    string,            // 1: 이름
    string,            // 2: 학년
    number,            // 3: 반
    number,            // 4: 번호
    string,            // 5: 차수
    string,            // 6: 1학기 과목 (', ' join)
    string,            // 7: 2학기 과목 (', ' join)
    number,            // 8: grade (항상 0)
    string             // 9: realID (resource.meta->>'id' 또는 student_code)
  ];
  type Snapshot = {
    studentData: SnapshotRow[];
    subjectsByCategory: Record<string, string[]>;
    meta: {
      academicYear: number;
      availableAcademicYears: number[];
      studentCount: number;
    };
  };
  const snap = data as Snapshot;
  if (!snap.studentData || snap.studentData.length === 0) return null;
  const availableAcademicYears =
    snap.meta.availableAcademicYears?.length > 0
      ? snap.meta.availableAcademicYears
      : yearScope.availableAcademicYears;

  // UnifiedDataFormat 호환: 헤더 prepend (parseUnifiedData가 row[0]~row[8]만 읽음.
  // realID는 row[9]로 그대로 전달되어 loadFromRawData 단계에서 후처리)
  const HEADER = ['학생ID', '이름', '학년', '반', '번호', '차수', '1학기 과목', '2학기 과목', '등급', 'realID'];
  const studentData: (string | number)[][] = [HEADER, ...snap.studentData];

  // subjectConfiguration: snapshot의 카테고리별 과목 카탈로그를 legacy shape로 변환
  const subjectConfiguration = buildSubjectConfigurationFromSnapshot(snap.subjectsByCategory);

  return {
    data: {
      fileType: 'kijun_unified_export',
      version: '1.0-db-snapshot',
      studentData,
      subjectConfiguration,
    },
    meta: {
      rounds: 0, // snapshot은 round 정보를 평탄화하므로 별도 카운트 안함
      submissions: snap.meta.studentCount,
      items: 0,
      academicYear: snap.meta.academicYear,
      availableAcademicYears,
    },
  };
}

/**
 * snapshot RPC가 반환하는 카테고리별 과목 객체를 legacy SubjectConfiguration shape로 변환.
 * (TS 상수 SUBJECT_CATEGORIES + SUBJECT_PREREQUISITES와 결합)
 */
function buildSubjectConfigurationFromSnapshot(
  subjectsByCategory: Record<string, string[]>
): SubjectConfiguration {
  // 비표준 코드(한글명/별칭)를 표준 코드로 흡수 — '경제 수학'(수학)→MATH 등.
  const { byCode, unresolved } = mergeSubjectsByStandardCode(subjectsByCategory);
  return assembleSubjectConfiguration(byCode, unresolved);
}

/**
 * 표준 코드별 과목 Map + 미해결 과목으로 legacy SubjectConfiguration을 조립한다.
 * snapshot/legacy 두 경로가 공유. 표준+별칭 코드 병합 시 중복 과목을 제거한다.
 */
function assembleSubjectConfiguration(
  byCode: Map<CategoryCode, string[]>,
  unresolved: string[]
): SubjectConfiguration {
  const categories: SubjectConfiguration['categories'] = {};
  (Object.entries(SUBJECT_CATEGORIES) as [CategoryCode, typeof SUBJECT_CATEGORIES[CategoryCode]][])
    .forEach(([code, cat]) => {
      // 표준 코드 + 별칭 코드에서 모인 과목을 중복 제거 ('경제수학'+'경제 수학' 공존 가능)
      const subjects = [...new Set(byCode.get(code) ?? [])];
      const prereqEntries = subjects
        .filter((s) => SUBJECT_PREREQUISITES[s])
        .map((s) => [s, SUBJECT_PREREQUISITES[s]] as const);
      categories[cat.name] = {
        subjects,
        // @ts-expect-error legacy fields used by some analysis tabs
        name: cat.name,
        code,
        type: cat.type,
        maxSelections: cat.maxSelections,
        minSelections: cat.minSelections,
        description: cat.description,
        ...(prereqEntries.length > 0
          ? { prerequisites: Object.fromEntries(prereqEntries) }
          : {}),
      };
    });

  // 카탈로그의 단일 ETC 코드를 course-analyze 세분 카테고리로 재분배.
  const remainingUncategorized = splitEtcSubjects(categories, [...new Set(unresolved)]);

  // 끝내 표준 코드로도 세분 표로도 흡수 못한 과목만 uncategorized로 보존.
  // filterSubjectsByConfiguration이 catalog의 모든 활성 과목을 유효 셋에 포함시켜
  // 학생 selection에서 누락되지 않도록 한다.
  return { categories, uncategorized: remainingUncategorized };
}

/**
 * DB 카탈로그의 '기타'(ETC) 묶음을 course-analyze 세분 카테고리로 재분배한다.
 *
 * **왜 DB가 아니라 여기서 나누나**: `course_selectable_subject.category_code`에는
 * 세분 코드가 없고(전부 ETC), 그 코드는 수강신청 UI(course-selection)가 함께 쓰는
 * 스키마라 새 코드를 넣으면 그쪽 화면·검증까지 영향을 받는다. 분석에서만 필요한
 * 세분이므로 **course-analyze의 `DEFAULT_SUBJECT_CATEGORIES`를 단일 출처**로 삼아
 * 이름 매칭으로 나눈다. DB·수강신청 쪽은 무수정.
 *
 * 세분 표에 없는 과목은 '기타'/uncategorized에 그대로 남으므로, 카탈로그에 새 과목이
 * 생겨도 조용히 사라지지 않는다(잔여 버킷이 안전망).
 *
 * @returns 어느 세분 카테고리로도 못 옮긴 uncategorized 잔여 목록
 */
function splitEtcSubjects(
  categories: SubjectConfiguration['categories'],
  uncategorized: string[]
): string[] {
  const etc = categories['기타'];
  if (!etc) return uncategorized;

  // 정규화 과목명 → 세분 카테고리 (표기 흔들림 흡수: '기술·가정'≡'기술가정')
  const targetByName = new Map<string, string>();
  for (const sub of ETC_SUBCATEGORIES) {
    for (const name of DEFAULT_SUBJECT_CATEGORIES[sub] ?? []) {
      targetByName.set(normalizeSubjectName(name), sub);
    }
  }

  const moved = new Map<string, string[]>();
  const keep = (pool: string[]): string[] => {
    const rest: string[] = [];
    for (const subject of pool) {
      const target = targetByName.get(normalizeSubjectName(subject));
      if (!target) { rest.push(subject); continue; }
      const arr = moved.get(target) ?? [];
      arr.push(subject);
      moved.set(target, arr);
    }
    return rest;
  };

  const remainingEtc = keep(etc.subjects ?? []);
  const remainingUncategorized = keep(uncategorized);

  // 세분 카테고리는 ETC의 메타데이터(type·maxSelections 등)를 그대로 물려받는다.
  // 이 필드들은 course-analyze에서 읽는 곳이 없고 표시 이름만 갈라지면 된다.
  for (const sub of ETC_SUBCATEGORIES) {
    categories[sub] = Object.assign({}, etc, {
      subjects: [...new Set(moved.get(sub) ?? [])],
      name: sub,
    });
  }
  etc.subjects = [...new Set(remainingEtc)];

  return remainingUncategorized;
}

/**
 * Legacy fallback: 기존 4-step 흐름. RPC 실패 시에만 사용.
 */
async function loadFromDatabaseLegacy(
  options: LoadFromDatabaseOptions = {}
): Promise<LoadFromDatabaseResult | null> {
  // 1) Rounds 조회 — 항상 전체를 가져와 availableAcademicYears 부산물로 추출.
  //    (수십 행 규모이므로 필터링 없이도 비용 무시 가능. fetchAvailableAcademicYears 중복 호출 제거.)
  const rounds = await fetchCourseSelectionRounds();
  if (rounds.length === 0) return null;

  // 사용 가능한 학년도 목록 (최신순)
  const availableAcademicYears = getAvailableAcademicYears(rounds);

  // 가장 최근 학년도만 사용 (options에 명시 없으면)
  const targetYear = options.academicYear ?? pickDefaultAcademicYear(rounds);
  if (targetYear == null) return null;
  const filteredRounds = rounds.filter(
    (r): r is RoundRow & { academic_year: number; target_grade: number } =>
      r.academic_year === targetYear && typeof r.target_grade === 'number'
  );
  if (filteredRounds.length === 0) return null;
  const roundIds = filteredRounds.map((r) => r.id);

  // round_id → (target_grade, round_number) 매핑
  const roundMeta = new Map<string, { grade: number; round: number }>();
  for (const r of filteredRounds) {
    roundMeta.set(r.id, { grade: r.target_grade, round: r.round_number });
  }

  // 2) Submissions 조회 (cursor pagination — count() HEAD 사전요청 제거)
  const submissions: SubmissionRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('course_selection_submission')
      .select('id, round_id, student_code, student_name, student_grade, student_class, student_no')
      .in('round_id', roundIds)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    submissions.push(...(data as SubmissionRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  if (submissions.length === 0) return null;

  // 3) Items 조회 (chunk + range 이중 페이지네이션 — Supabase 1000-row 한계 우회)
  const submissionIds = submissions.map((s) => s.id);
  const items: ItemRow[] = [];
  {
    // chunk 50: 학생당 12~22 items(2026 4차부터 예술 묶음 포함 22) × 50 = 최대 ~1100 →
    // 한 청크가 1000행을 넘을 수 있으므로 fetchItemsForChunk 의 range 페이징(+정렬)이 필수다.
    const ID_CHUNK = 50;
    const chunkPromises = [];
    for (let i = 0; i < submissionIds.length; i += ID_CHUNK) {
      const chunk = submissionIds.slice(i, i + ID_CHUNK);
      chunkPromises.push(fetchItemsForChunk(chunk));
    }
    const results = await Promise.all(chunkPromises);
    for (const arr of results) items.push(...arr);
  }

  // 4) submission_id → semester1[]/semester2[] 매핑
  const bySub = new Map<string, { sem1: string[]; sem2: string[] }>();
  for (const it of items) {
    let g = bySub.get(it.submission_id);
    if (!g) { g = { sem1: [], sem2: [] }; bySub.set(it.submission_id, g); }
    (it.semester === 1 ? g.sem1 : g.sem2).push(it.subject_name);
  }

  // 5) 2D 배열로 변환 (data.json studentData 형식과 동일)
  const HEADER = ['학생ID', '이름', '학년', '반', '번호', '차수', '1학기 과목', '2학기 과목', '등급'];
  const studentData: (string | number)[][] = [HEADER];
  for (const sub of submissions) {
    const meta = roundMeta.get(sub.round_id);
    if (!meta) continue;
    // student_code가 NULL인 행은 resource 매칭 실패 케이스 — 분석에서 제외
    if (!sub.student_code) continue;
    const slots = bySub.get(sub.id) ?? { sem1: [], sem2: [] };
    // 학생ID는 학생코드 prefix 제거 (10101 형식 — JSON 호환)
    const rawId = sub.student_code.includes('-')
      ? sub.student_code.split('-')[1]
      : sub.student_code;
    studentData.push([
      rawId,
      sub.student_name,
      String(meta.grade),
      sub.student_class ?? 0,
      sub.student_no ?? 0,
      String(meta.round),
      slots.sem1.join(', '),
      slots.sem2.join(', '),
      0, // grade — JSON 평균등급 폐기. databaseGradeService가 DB grade 우선 사용 중
    ]);
  }

  // 6) subjectConfiguration 빌드 (TS 상수 + DB 카탈로그)
  const subjectConfiguration = await buildSubjectConfiguration();

  return {
    data: {
      fileType: 'kijun_unified_export',
      version: '1.0-db',
      studentData,
      subjectConfiguration,
    },
    meta: {
      rounds: filteredRounds.length,
      submissions: submissions.length,
      items: items.length,
      academicYear: targetYear,
      availableAcademicYears,
    },
  };
}

/**
 * 한 chunk 안에서도 1000-row 제한을 우회하기 위해 cursor 페이지네이션 (count() HEAD 제거).
 * 학생당 ~12 items × 50 chunk ≈ 600 items 이므로 보통 1페이지에서 종료됨.
 */
async function fetchItemsForChunk(submissionIds: string[]): Promise<ItemRow[]> {
  const all: ItemRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('course_selection_item')
      .select('submission_id, subject_name, semester')
      .in('submission_id', submissionIds)
      // 정렬 없는 OFFSET 페이징은 페이지 사이 순서가 보장되지 않아 중복·누락이 날 수 있다.
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ItemRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * TS 상수 + DB course_selectable_subject로 SubjectConfiguration 생성
 */
async function buildSubjectConfiguration(): Promise<SubjectConfiguration> {
  const { data, error } = await supabase
    .from('course_selectable_subject')
    .select('name, category_code, display_order')
    .eq('is_active', true)
    .order('category_code')
    .order('display_order');
  if (error) throw error;

  const byCategoryRaw: Record<string, string[]> = {};
  for (const r of data ?? []) {
    const arr = byCategoryRaw[r.category_code] ?? [];
    arr.push(r.name);
    byCategoryRaw[r.category_code] = arr;
  }

  // snapshot 경로와 동일하게 비표준 코드(한글명/별칭)를 표준 코드로 흡수한 뒤 조립.
  const { byCode, unresolved } = mergeSubjectsByStandardCode(byCategoryRaw);
  return assembleSubjectConfiguration(byCode, unresolved);
}
