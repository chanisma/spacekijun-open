import { supabase } from '@/integrations/supabase/client';
import type {
  SchoolExamCohort,
  SchoolExamQuestionRow,
  SchoolExamResultRow,
} from '../utils/schoolExamAnalysis';
import type {
  SchoolExamAnswerRecord,
  SchoolExamQuestionRecord,
  RosterEntry,
} from '../utils/schoolExamCsv';
import {
  QUESTION_CONFLICT_TARGET,
  RESULT_CONFLICT_TARGET,
  toQuestionRow,
  toResultRow,
} from '../utils/schoolExamRows';

export { toQuestionRow, toResultRow };

// `school_exam_*` 테이블은 아직 생성 타입(integrations/supabase/types.ts)에 없어
// evalearn의 기존 mock_problems 접근과 같은 방식으로 캐스팅한다.
const questionTable = () => supabase.from('school_exam_question' as never);
const resultTable = () => supabase.from('school_exam_result' as never);

/** 학생이 응시한 고사 하나 */
export interface SchoolExamOption {
  academicYear: number;
  semester: number;
  examRound: number;
  examName: string;
  label: string;
}

/** 그 고사에서 학생이 응시한 과목 하나 */
export interface SchoolExamSubjectOption {
  subjectSection: string;
  subjectName: string;
  /**
   * 응시 당시 학년. **학생의 현재 학년을 쓰면 안 된다** — `subject_section`이 학년 간
   * 겹치기 때문이다(라이브: '인공지능 수학(3)'을 2·3학년이 각각 다른 시험으로 본다).
   * 지난 학년도 고사를 열 때도 이 값이 있어야 그 시절 문항을 찾는다.
   */
  grade: number;
  totalScore: number | null;
}

interface ResultKeyRow {
  academic_year: number;
  semester: number;
  exam_round: number;
  exam_name: string;
  grade: number;
  subject_section: string;
  subject_name: string;
  total_score: number | null;
}

/**
 * 학생이 응시한 전 과목 결과의 "키"만 가볍게 가져온다.
 * 고사 드롭다운과 과목 목록을 한 번의 왕복으로 만들기 위해서다 — 답안 배열(문항 수만큼
 * 긴 text[])까지 끌어오면 과목 20개 기준 수백 KB가 되고, 목록에는 쓰이지도 않는다.
 */
export async function fetchStudentExamIndex(studentCode: string): Promise<{
  exams: SchoolExamOption[];
  subjectsByExam: Map<string, SchoolExamSubjectOption[]>;
}> {
  const { data, error } = await resultTable()
    .select('academic_year, semester, exam_round, exam_name, grade, subject_section, subject_name, total_score')
    .eq('student_code', studentCode);

  if (error) throw error;
  const rows = ((data ?? []) as unknown) as ResultKeyRow[];

  const examMap = new Map<string, SchoolExamOption>();
  const subjectsByExam = new Map<string, SchoolExamSubjectOption[]>();

  for (const row of rows) {
    const key = examKey(row.academic_year, row.semester, row.exam_round);
    if (!examMap.has(key)) {
      examMap.set(key, {
        academicYear: row.academic_year,
        semester: row.semester,
        examRound: row.exam_round,
        examName: row.exam_name,
        label: `${row.academic_year}년 ${row.semester}학기 ${row.exam_name}`,
      });
    }
    const list = subjectsByExam.get(key) ?? [];
    list.push({
      subjectSection: row.subject_section,
      subjectName: row.subject_name,
      grade: row.grade,
      totalScore: row.total_score,
    });
    subjectsByExam.set(key, list);
  }

  for (const list of subjectsByExam.values()) {
    list.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'));
  }

  // 최근 고사가 위로
  const exams = Array.from(examMap.values()).sort(
    (a, b) =>
      b.academicYear - a.academicYear || b.semester - a.semester || b.examRound - a.examRound
  );
  return { exams, subjectsByExam };
}

export function examKey(academicYear: number, semester: number, examRound: number): string {
  return `${academicYear}-${semester}-${examRound}`;
}

export interface SubjectDetailArgs {
  studentCode: string;
  academicYear: number;
  semester: number;
  examRound: number;
  /** 응시 당시 학년 (SchoolExamSubjectOption.grade). 학생의 현재 학년이 아니다. */
  grade: number;
  subjectSection: string;
}

/**
 * 한 과목의 상세 — 학생 결과 · 문항 메타 · 학년 통계를 병렬로 가져온다.
 *
 * 학년 통계(RPC)는 SECURITY INVOKER라 RLS가 그대로 적용된다. 교사가 아니면 조용히
 * 빈 결과가 오므로 호출부는 cohort가 null인 경우를 항상 다뤄야 한다.
 *
 * **grade는 세 조회 모두에 걸어야 한다.** `subject_section`은 학년 간 겹친다
 * ('인공지능 수학(3)'을 2·3학년이 각각 다른 시험으로 본다) — 빼면 두 시험의 답안이
 * 같은 problem_number에 섞여 정답률·석차가 통째로 오염된다.
 */
export async function fetchSubjectDetail(args: SubjectDetailArgs): Promise<{
  result: SchoolExamResultRow | null;
  questions: SchoolExamQuestionRow[];
  cohort: SchoolExamCohort | null;
}> {
  const [resultRes, questionRes, cohortRes] = await Promise.all([
    resultTable()
      .select('*')
      .eq('student_code', args.studentCode)
      .eq('academic_year', args.academicYear)
      .eq('semester', args.semester)
      .eq('exam_round', args.examRound)
      .eq('grade', args.grade)
      .eq('subject_section', args.subjectSection)
      .maybeSingle(),
    questionTable()
      .select('*')
      .eq('academic_year', args.academicYear)
      .eq('semester', args.semester)
      .eq('exam_round', args.examRound)
      .eq('grade', args.grade)
      .eq('subject_section', args.subjectSection)
      .order('problem_number', { ascending: true }),
    supabase.rpc('get_school_exam_subject_analysis' as never, {
      p_student_code: args.studentCode,
      p_academic_year: args.academicYear,
      p_semester: args.semester,
      p_exam_round: args.examRound,
      p_grade: args.grade,
      p_subject_section: args.subjectSection,
    } as never),
  ]);

  if (resultRes.error) throw resultRes.error;
  if (questionRes.error) throw questionRes.error;
  if (cohortRes.error) throw cohortRes.error;

  return {
    result: ((resultRes.data ?? null) as unknown) as SchoolExamResultRow | null,
    questions: ((questionRes.data ?? []) as unknown) as SchoolExamQuestionRow[],
    cohort: ((cohortRes.data ?? null) as unknown) as SchoolExamCohort | null,
  };
}

/** get_school_exam_student_overview 한 행 — 과목 하나의 학년 분포 + 본인 위치 */
export interface SchoolExamSubjectOverview {
  subjectSection: string;
  subjectName: string;
  grade: number;
  totalScore: number | null;
  selectiveScore: number | null;
  descriptiveScore: number | null;
  /** 분포 계산에 실제로 들어간 인원 = 총점이 있는 학생 수 */
  cohortCount: number;
  /** 그 과목을 응시한 전체 인원. cohortCount보다 크면 아직 채점 중이라 분포가 편향돼 있다. */
  takenCount: number;
  lo: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  hi: number | null;
  avg: number | null;
  rank: number | null;
  /** 상위 몇 % (1 = 최상위) */
  percentile: number | null;
}

interface OverviewRaw {
  subject_section: string;
  subject_name: string;
  grade: number;
  total_score: string | number | null;
  selective_score: string | number | null;
  descriptive_score: string | number | null;
  cohort_count: number;
  taken_count: number;
  lo: string | number | null;
  q1: string | number | null;
  median: string | number | null;
  q3: string | number | null;
  hi: string | number | null;
  avg: string | number | null;
  rank: number | null;
  percentile: string | number | null;
}

/**
 * 경계에서 한 번에 숫자로 정규화한다.
 *
 * jsonb 안의 numeric은 JSON 숫자로 오지만, 이 값들은 곧바로 `toFixed()`와 정렬 비교에
 * 쓰인다 — 문자열이 하나라도 섞이면 `toFixed`는 던지고 정렬은 문자열 비교로 새어
 * "9 > 80"이 된다. RPC 반환 형태가 바뀌어도 화면이 조용히 틀리지 않도록 여기서 막는다.
 */
function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 한 고사에서 학생이 본 **전 과목**의 분포 요약을 한 번에 가져온다(상자그림용).
 *
 * 과목마다 fetchSubjectDetail을 부르면 10~20회 왕복이 되고, 그쪽은 개요 화면이 쓰지도 않는
 * 문항·영역·성취기준까지 계산한다.
 */
export async function fetchStudentOverview(
  studentCode: string,
  academicYear: number,
  semester: number,
  examRound: number
): Promise<SchoolExamSubjectOverview[]> {
  const { data, error } = await supabase.rpc('get_school_exam_student_overview' as never, {
    p_student_code: studentCode,
    p_academic_year: academicYear,
    p_semester: semester,
    p_exam_round: examRound,
  } as never);
  if (error) throw error;

  const rows = ((data ?? []) as unknown) as OverviewRaw[];
  return rows.map((row) => ({
    subjectSection: row.subject_section,
    subjectName: row.subject_name,
    grade: row.grade,
    totalScore: num(row.total_score),
    selectiveScore: num(row.selective_score),
    descriptiveScore: num(row.descriptive_score),
    cohortCount: row.cohort_count ?? 0,
    takenCount: row.taken_count ?? row.cohort_count ?? 0,
    lo: num(row.lo),
    q1: num(row.q1),
    median: num(row.median),
    q3: num(row.q3),
    hi: num(row.hi),
    avg: num(row.avg),
    rank: row.rank ?? null,
    percentile: num(row.percentile),
  }));
}

// ── 적재 ────────────────────────────────────────────────────

/** 학생 매칭에 쓸 재학생 명단 (resource가 정본 — student_basic_info는 졸업생도 포함한다) */
export async function fetchRoster(): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from('resource')
    .select('name, meta')
    .eq('type', 'student')
    .eq('status', 'active');
  if (error) throw error;

  const roster: RosterEntry[] = [];
  for (const row of data ?? []) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const grade = Number(meta['grade']);
    const classNum = Number(meta['class']);
    const number = Number(meta['number']);
    const code = typeof meta['id'] === 'string' ? (meta['id'] as string) : '';
    if (!code || !grade || !classNum || !number) continue;
    roster.push({ grade, classNum, number, code, name: row.name });
  }
  return roster;
}

/** upsert 한 번에 보낼 행 수. 요청 본문 크기와 왕복 수의 절충값. */
const UPSERT_CHUNK = 400;

async function upsertInChunks<T>(
  table: () => ReturnType<typeof supabase.from>,
  rows: T[],
  conflictTarget: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await table().upsert(chunk as never, { onConflict: conflictTarget });
    if (error) throw error;
    done += chunk.length;
    onProgress?.(done, rows.length);
  }
  return done;
}

export async function upsertQuestions(
  records: SchoolExamQuestionRecord[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  return upsertInChunks(
    questionTable as never,
    records.map(toQuestionRow),
    QUESTION_CONFLICT_TARGET,
    onProgress
  );
}

export async function upsertResults(
  records: Array<SchoolExamAnswerRecord & { studentCode: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  return upsertInChunks(
    resultTable as never,
    records.map(toResultRow),
    RESULT_CONFLICT_TARGET,
    onProgress
  );
}
