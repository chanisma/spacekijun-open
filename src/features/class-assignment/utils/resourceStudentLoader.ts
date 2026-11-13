/**
 * Resource-based Student Loader
 *
 * Master student list = resource (type='student').
 * Academic grade = student_basic_info.academic_development (weighted average).
 * Course selections = course_selection_* (LEFT JOIN; non-applicants get empty arrays).
 *
 * Used by class-assignment hooks (useStudentData / useCourseStudentData /
 * useCourseIntegration) to keep the source-of-truth consistent across
 * class mode, subject mode, and special-class configuration.
 */

import { supabase } from '@/integrations/supabase/client';

const ID_CHUNK = 100;
const SUB_CHUNK = 50;
const PAGE_SIZE = 1000;

export interface ResourceStudent {
  resourceId: string;       // resource.id (UUID)
  studentCode: string;      // resource.meta.id, e.g. "00-00476" (== student_basic_info.id)
  name: string;
  grade: number;            // 학년 (from resource.meta.grade)
  classNum: number;         // 반 (from resource.meta.class)
  number: number;           // 번호 (from resource.meta.number)
  gender?: 'M' | 'F';       // resource.meta.gender if present (defaults handled by callers)
  averageGrade: number;     // weighted avg from student_basic_info.academic_development
  semester1: string[];      // empty array if no submission
  semester2: string[];
  round: number;            // latest course_selection round_number for this student's grade, 0 if none
  /** 이 학생의 selection이 작성된 학년도 (academic_year). selection이 없으면 0. */
  selectionAcademicYear: number;
}

export interface LoadResourceStudentsOptions {
  /** Filter by 학년 via resource.meta->>grade. Undefined = all grades. */
  grade?: number;
  /** Skip course_selection joins entirely (Class Mode doesn't need them). */
  includeSelections?: boolean;
}

interface ResourceRow {
  id: string;
  name: string;
  meta: Record<string, unknown> | null;
}

interface BasicInfoRow {
  id: string;
  academic_development: AcademicRecord[] | null;
}

interface AcademicRecord {
  category?: string;
  rank?: number | null;
  units?: number | null;
}

interface RoundRow {
  id: string;
  target_grade: number;
  round_number: number;
  academic_year: number;
}

interface SubmissionRow {
  id: string;
  round_id: string;
  student_code: string | null;
}

interface ItemRow {
  submission_id: string;
  subject_name: string;
  semester: number;
}

interface SelectionEntry {
  semester1: string[];
  semester2: string[];
  round: number;
  /**
   * Round.target_grade: which grade level this selection submission belongs to.
   * Used to ignore stale selections from a prior school year — e.g. a student
   * who is currently 2학년 but appears in last year's target_grade=1 round.
   */
  targetGrade: number;
  /** Round.academic_year — 신청이 작성된 학년도 (UI 표시용). */
  academicYear: number;
}

type SelectionMap = Map<string, SelectionEntry>;

const toNumber = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

/**
 * Mid-band fallback per 학년: 1·2학년은 5등급제(중앙값 3), 3학년은 9등급제(중앙값 5).
 * 0(=학년 미상)도 9등급제 가정으로 5 사용.
 */
function gradeMidpoint(grade: number): number {
  return grade > 0 && grade <= 2 ? 3 : 5;
}

/**
 * Weighted average of regular-category subjects.
 * Mirrors databaseGradeService.calculateWeightedAverage so Class Mode and
 * Subject Mode agree on what "성적" means.
 *
 * Returns the grade-appropriate mid-band when no graded record exists so
 * 1·2학년(5등급제) 코호트가 9등급제 기준 5로 잘못 채워지지 않음.
 */
function calculateAverageGrade(
  records: AcademicRecord[] | null | undefined,
  grade: number,
): number {
  const fallback = gradeMidpoint(grade);
  if (!records || records.length === 0) return fallback;
  const valid = records.filter(
    (r) => r.category === 'regular' && r.rank != null && (r.units ?? 0) > 0,
  );
  if (valid.length === 0) return fallback;
  let totalUnits = 0;
  let weighted = 0;
  for (const r of valid) {
    const units = r.units ?? 0;
    totalUnits += units;
    weighted += (r.rank ?? 0) * units;
  }
  return totalUnits > 0 ? weighted / totalUnits : fallback;
}

/**
 * For each target_grade, pick the latest (academic_year, round_number) pair.
 * Returns the round IDs to query and a map of round_id → round_number.
 */
function pickLatestRoundsByGrade(rounds: RoundRow[]): {
  roundIds: string[];
  roundNumberById: Map<string, number>;
  targetGradeById: Map<string, number>;
  academicYearById: Map<string, number>;
} {
  const byGrade = new Map<number, RoundRow[]>();
  for (const r of rounds) {
    const list = byGrade.get(r.target_grade) ?? [];
    list.push(r);
    byGrade.set(r.target_grade, list);
  }

  const roundIds: string[] = [];
  const roundNumberById = new Map<string, number>();
  const targetGradeById = new Map<string, number>();
  const academicYearById = new Map<string, number>();
  for (const list of byGrade.values()) {
    const latestYear = Math.max(...list.map((r) => r.academic_year));
    const sameYear = list.filter((r) => r.academic_year === latestYear);
    const latestRound = Math.max(...sameYear.map((r) => r.round_number));
    for (const r of sameYear.filter((r) => r.round_number === latestRound)) {
      roundIds.push(r.id);
      roundNumberById.set(r.id, r.round_number);
      targetGradeById.set(r.id, r.target_grade);
      academicYearById.set(r.id, r.academic_year);
    }
  }
  return { roundIds, roundNumberById, targetGradeById, academicYearById };
}

async function fetchSubmissionsByRounds(roundIds: string[]): Promise<SubmissionRow[]> {
  if (roundIds.length === 0) return [];
  const { count } = await supabase
    .from('course_selection_submission')
    .select('id', { count: 'exact', head: true })
    .in('round_id', roundIds);
  const total = count ?? 0;
  if (total === 0) return [];

  const pages = Math.ceil(total / PAGE_SIZE);
  const promises = Array.from({ length: pages }, (_, p) =>
    supabase
      .from('course_selection_submission')
      .select('id, round_id, student_code')
      .in('round_id', roundIds)
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1),
  );
  const results = await Promise.all(promises);
  const out: SubmissionRow[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    if (data) out.push(...(data as SubmissionRow[]));
  }
  return out;
}

async function fetchItemsBySubmissions(submissionIds: string[]): Promise<ItemRow[]> {
  if (submissionIds.length === 0) return [];
  const out: ItemRow[] = [];
  for (let i = 0; i < submissionIds.length; i += SUB_CHUNK) {
    const chunk = submissionIds.slice(i, i + SUB_CHUNK);
    const { count } = await supabase
      .from('course_selection_item')
      .select('id', { count: 'exact', head: true })
      .in('submission_id', chunk);
    const total = count ?? 0;
    if (total === 0) continue;
    const pages = Math.ceil(total / PAGE_SIZE);
    const promises = Array.from({ length: pages }, (_, p) =>
      supabase
        .from('course_selection_item')
        .select('submission_id, subject_name, semester')
        .in('submission_id', chunk)
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1),
    );
    const results = await Promise.all(promises);
    for (const { data, error } of results) {
      if (error) throw error;
      if (data) out.push(...(data as ItemRow[]));
    }
  }
  return out;
}

/**
 * Build a student_code → { semester1, semester2, round, targetGrade } map.
 *
 * **선택과목 신청 정책 (한국 고등학교 표준):**
 * 학생은 진급 직전에 다음 학년 과목을 미리 신청합니다.
 * 즉 `target_grade = N` 회차의 응답자는 신청 당시 N학년이었고,
 * 이 selection은 다음 해 **N+1학년 분반**에서 사용됩니다.
 *
 * 따라서 "현재 N학년"이 사용할 selection은 `target_grade = N-1` 회차에 있습니다.
 * 호출자가 `grade=N`을 넘기면 내부적으로 `target_grade = N-1`을 조회합니다.
 *
 * For each target_grade, only the latest (year, round) submissions are considered.
 */
async function fetchSelectionMap(grade?: number): Promise<SelectionMap> {
  let q = supabase
    .from('course_selection_round')
    .select('id, target_grade, round_number, academic_year');
  // 현재 grade의 학생은 한 학년 전(=grade-1)의 신청을 사용.
  // grade가 명시되지 않으면 모든 회차를 가져와서, 머지 단계에서 학생별로 매칭.
  if (grade != null) q = q.eq('target_grade', grade - 1);
  const { data: roundsRaw, error: roundsErr } = await q;
  if (roundsErr) throw roundsErr;
  const rounds = (roundsRaw ?? []) as RoundRow[];
  if (rounds.length === 0) return new Map();

  const { roundIds, roundNumberById, targetGradeById, academicYearById } =
    pickLatestRoundsByGrade(rounds);
  const submissions = await fetchSubmissionsByRounds(roundIds);
  if (submissions.length === 0) return new Map();

  const items = await fetchItemsBySubmissions(submissions.map((s) => s.id));

  const subMeta = new Map<
    string,
    { code: string; round: number; targetGrade: number; academicYear: number }
  >();
  for (const s of submissions) {
    // student_code가 NULL인 행은 resource 매칭 실패 — selection map에서 제외
    if (!s.student_code) continue;
    subMeta.set(s.id, {
      code: s.student_code,
      round: roundNumberById.get(s.round_id) ?? 0,
      targetGrade: targetGradeById.get(s.round_id) ?? 0,
      academicYear: academicYearById.get(s.round_id) ?? 0,
    });
  }

  const map: SelectionMap = new Map();
  const ensure = (
    code: string,
    round: number,
    targetGrade: number,
    academicYear: number,
  ): SelectionEntry => {
    let entry = map.get(code);
    if (!entry) {
      entry = { semester1: [], semester2: [], round, targetGrade, academicYear };
      map.set(code, entry);
    }
    return entry;
  };

  // Pre-seed even submissions with zero items so we still record the round.
  for (const meta of subMeta.values())
    ensure(meta.code, meta.round, meta.targetGrade, meta.academicYear);

  for (const item of items) {
    const meta = subMeta.get(item.submission_id);
    if (!meta) continue;
    const entry = ensure(meta.code, meta.round, meta.targetGrade, meta.academicYear);
    if (item.semester === 1) entry.semester1.push(item.subject_name);
    else if (item.semester === 2) entry.semester2.push(item.subject_name);
  }
  return map;
}

/**
 * Bulk-fetch student_basic_info.academic_development for the given IDs.
 * Returns a map keyed by student_basic_info.id (== resource.meta.id).
 */
async function fetchAcademicMap(studentCodes: string[]): Promise<Map<string, AcademicRecord[]>> {
  const map = new Map<string, AcademicRecord[]>();
  if (studentCodes.length === 0) return map;
  for (let i = 0; i < studentCodes.length; i += ID_CHUNK) {
    const chunk = studentCodes.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from('student_basic_info')
      .select('id, academic_development')
      .in('id', chunk);
    if (error) throw error;
    for (const row of (data ?? []) as BasicInfoRow[]) {
      map.set(row.id, row.academic_development ?? []);
    }
  }
  return map;
}

/**
 * Load the merged student list. Sorted by (classNum, number).
 *
 * Students missing a `meta.id` are skipped (we have no key to join with);
 * students missing student_basic_info get averageGrade = 5 fallback;
 * students missing a course_selection submission get empty semester arrays
 * and round = 0 (per design choice: 미신청자도 포함).
 */
export async function loadResourceStudents(
  options: LoadResourceStudentsOptions = {},
): Promise<ResourceStudent[]> {
  const { grade, includeSelections = true } = options;

  let q = supabase.from('resource').select('id, name, meta').eq('type', 'student');
  if (grade != null) q = q.eq('meta->>grade', String(grade));
  const { data: resourceRaw, error: resErr } = await q;
  if (resErr) throw resErr;
  const resources = (resourceRaw ?? []) as ResourceRow[];
  if (resources.length === 0) return [];

  const studentCodes: string[] = [];
  for (const r of resources) {
    const meta = r.meta ?? {};
    const code = meta['id'];
    if (typeof code === 'string' && code.length > 0) studentCodes.push(code);
  }

  const [academicMap, selectionMap] = await Promise.all([
    fetchAcademicMap(studentCodes),
    includeSelections ? fetchSelectionMap(grade) : Promise.resolve<SelectionMap>(new Map()),
  ]);

  const students: ResourceStudent[] = [];
  for (const row of resources) {
    const meta = row.meta ?? {};
    const studentCode = typeof meta['id'] === 'string' ? (meta['id'] as string) : '';
    if (!studentCode) continue;

    const genderRaw = (typeof meta['gender'] === 'string' ? (meta['gender'] as string) : '').toUpperCase();
    const gender = genderRaw === 'M' ? 'M' : genderRaw === 'F' ? 'F' : undefined;

    const academic = academicMap.get(studentCode);
    const studentGrade = toNumber(meta['grade'], 0);

    // 선택과목 신청 정책: 학생은 진급 직전에 다음 학년 과목을 미리 신청.
    // 따라서 "현재 N학년"의 selection은 target_grade=N-1 회차에 있음.
    // 가드: selection.targetGrade + 1 === studentGrade 일 때만 사용.
    // 이로써 진급한 학생의 작년 회차 데이터가 올해 새로 들어온 신입생
    // (이름·snum 우연 충돌)에게 잘못 따라붙는 것을 방지.
    const rawSelection = selectionMap.get(studentCode);
    const selection =
      rawSelection && rawSelection.targetGrade > 0 && rawSelection.targetGrade + 1 === studentGrade
        ? rawSelection
        : undefined;

    students.push({
      resourceId: row.id,
      studentCode,
      name: row.name,
      grade: studentGrade,
      classNum: toNumber(meta['class'], 0),
      number: toNumber(meta['number'], 0),
      gender,
      averageGrade: calculateAverageGrade(academic, studentGrade),
      semester1: selection?.semester1 ?? [],
      semester2: selection?.semester2 ?? [],
      round: selection?.round ?? 0,
      selectionAcademicYear: selection?.academicYear ?? 0,
    });
  }

  students.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    if (a.classNum !== b.classNum) return a.classNum - b.classNum;
    return a.number - b.number;
  });
  return students;
}
