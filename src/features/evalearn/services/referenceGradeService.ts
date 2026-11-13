/**
 * 학생 한 명의 **회차 × 과목 참고 등급** 계산 — 기능 간 공용 서비스.
 *
 * evalearn(개인·집단 분석)과 admission-wishlist(수능최저 판정)가 같은 값을 써야 한다.
 * 각자 계산하면 같은 학생의 9월 등급이 화면마다 다르게 나온다.
 *
 * 공식 등급이 있는 (회차, 과목)은 아예 계산하지 않는다 — 공식이 정본이다.
 * 배점이 덜 적재된 회차는 `computeReferenceGrade` 가 null 을 돌려주므로 결과에 담기지 않는다.
 */
import { supabase } from '@/integrations/supabase/client';
import type { MockMarkingEntry, MockExamResult } from '@/features/evalog/types/student';
import type { MockProblem } from '../types';
import { fetchGradeCuts } from './gradeCutService';
import { gradeMarkingSubject } from '../utils/mockGrading';
import { computeRawScore, computeReferenceGrade, type GradeCut, type ReferenceGrade } from '../utils/referenceGrade';
import { findExamGrade } from '../utils/mockResult';
import { resolveGrade3Split } from '../utils/grade3SubjectTrack';
import { toDbSubject } from '../utils/subjectAlias';

export type ReferenceGradeMap = Map<string, Map<string, ReferenceGrade>>;

export function examKey(year: number, month: number, grade: number): string {
  return `${year}-${month}-${grade}`;
}

interface PointRow {
  subject: string;
  major_category: string | null;
  problem_number: number;
  point: number | null;
  answer: string | null;
}

/** 한 회차의 전 과목 문항(배점·정답)을 한 번에 받는다 — (회차 × 과목)마다 부르면 왕복이 수십 번 된다. */
async function fetchExamProblems(year: number, month: number, grade: number): Promise<PointRow[]> {
  const { data, error } = await supabase
    .from('mock_problems')
    .select('subject, major_category, problem_number, point, answer')
    .eq('year', year)
    .eq('month', month)
    .eq('student_grade', grade);
  if (error) throw error;
  return (data as unknown as PointRow[]) ?? [];
}

/**
 * 마킹 과목 키 -> 그 과목의 문항 맵.
 * 3학년 국어·수학은 공통(1~34 / 1~22)과 선택(35~45 / 23~30)을 합쳐야 한 과목이 된다.
 */
function buildSubjectProblems(rows: PointRow[], dbSubject: string, grade: number, year: number) {
  const map = new Map<number, Pick<MockProblem, 'point' | 'answer'>>();
  const split = resolveGrade3Split(grade, year, dbSubject);
  for (const r of rows) {
    const isElective = r.subject === dbSubject;
    const isCommon =
      split != null &&
      r.subject === '공통' &&
      r.major_category != null &&
      split.commonMajorCategories.includes(r.major_category);
    if (!isElective && !isCommon) continue;
    map.set(r.problem_number, { point: r.point, answer: r.answer });
  }
  return map;
}

/** 마킹·성적이 이미 손에 있을 때(evalearn) 쓰는 경로. */
export async function computeReferenceGradesFor(
  marking: MockMarkingEntry[] | null | undefined,
  results: MockExamResult[] | null | undefined
): Promise<ReferenceGradeMap> {
  const out: ReferenceGradeMap = new Map();
  if (!marking?.length) return out;

  for (const entry of marking) {
    const { academic_year: year, exam_month: month, exam_grade: grade } = entry;

    const official = results?.find(
      (r) => r.academic_year === year && r.exam_month === month && r.exam_grade === grade
    );
    const targets = Object.keys(entry.subjects ?? {}).filter(
      (s) => findExamGrade(official?.subjects, s) === null
    );
    if (targets.length === 0) continue;

    let rows: PointRow[];
    let cuts: Map<string, GradeCut>;
    try {
      [rows, cuts] = await Promise.all([
        fetchExamProblems(year, month, grade),
        fetchGradeCuts(year, month, grade).catch(() => new Map<string, GradeCut>()),
      ]);
    } catch (e) {
      // 참고 등급은 부가 정보다 — 실패해도 화면 전체를 막지 않는다
      console.error('참고 등급 계산용 문항 조회 실패', e);
      continue;
    }
    if (cuts.size === 0) continue;

    const perSubject = new Map<string, ReferenceGrade>();
    for (const subjectKey of targets) {
      const dbSubject = toDbSubject(subjectKey);
      const cut = cuts.get(dbSubject);
      if (!cut) continue;

      const problems = buildSubjectProblems(rows, dbSubject, grade, year);
      if (problems.size === 0) continue;

      const graded = gradeMarkingSubject(entry.subjects[subjectKey], problems as Map<number, MockProblem>);
      const ref = computeReferenceGrade(computeRawScore(graded, problems), cut);
      if (ref) perSubject.set(subjectKey, ref);
    }

    if (perSubject.size > 0) out.set(examKey(year, month, grade), perSubject);
  }

  return out;
}

/**
 * **한 회차를 여러 학생에게** 한 번에 — 학년 단위 화면용.
 *
 * `computeReferenceGradesFor` 를 학생마다 부르면 회차 문항·등급컷을 학생 수만큼 다시 받는다
 * (3학년 217명 × 7회차 ≈ 1,500 왕복). 문항과 등급컷은 **회차 단위 참조 데이터**라 한 번만
 * 받으면 되고, 학생마다 달라지는 것은 마킹뿐이다.
 *
 * 판정은 단일 경로를 그대로 쓴다(`gradeMarkingSubject` → `computeRawScore` →
 * `computeReferenceGrade`) — 개인 화면과 학년 화면의 9월 등급이 어긋나면 안 된다.
 */
export async function computeReferenceGradesForCohort(
  students: { id: string; marking: MockMarkingEntry[] | null | undefined; results: MockExamResult[] | null | undefined }[],
  year: number,
  month: number,
  grade: number
): Promise<Map<string, Map<string, ReferenceGrade>>> {
  const out = new Map<string, Map<string, ReferenceGrade>>();
  if (students.length === 0) return out;

  let rows: PointRow[];
  let cuts: Map<string, GradeCut>;
  try {
    [rows, cuts] = await Promise.all([
      fetchExamProblems(year, month, grade),
      fetchGradeCuts(year, month, grade).catch(() => new Map<string, GradeCut>()),
    ]);
  } catch (e) {
    // 참고 등급은 부가 정보다 — 실패해도 화면 전체를 막지 않는다
    console.error('참고 등급(집단) 계산용 문항 조회 실패', e);
    return out;
  }
  // 등급컷이 없으면 원점수를 등급으로 옮길 근거가 없다
  if (cuts.size === 0 || rows.length === 0) return out;

  // 과목별 문항 맵은 회차 단위로 한 번만 만든다(학생마다 만들면 217배가 된다)
  const problemsByDbSubject = new Map<string, Map<number, MockProblem>>();
  const problemsFor = (dbSubject: string) => {
    const cached = problemsByDbSubject.get(dbSubject);
    if (cached) return cached;
    const built = buildSubjectProblems(rows, dbSubject, grade, year) as Map<number, MockProblem>;
    problemsByDbSubject.set(dbSubject, built);
    return built;
  };

  for (const s of students) {
    const entry = s.marking?.find(
      (e) => e.academic_year === year && e.exam_month === month && e.exam_grade === grade
    );
    if (!entry) continue;

    const official = s.results?.find(
      (r) => r.academic_year === year && r.exam_month === month && r.exam_grade === grade
    );

    const perSubject = new Map<string, ReferenceGrade>();
    for (const subjectKey of Object.keys(entry.subjects ?? {})) {
      // 공식 등급이 있으면 그것이 정본 — 계산하지 않는다
      if (findExamGrade(official?.subjects, subjectKey) !== null) continue;

      const cut = cuts.get(toDbSubject(subjectKey));
      if (!cut) continue;
      const problems = problemsFor(toDbSubject(subjectKey));
      if (problems.size === 0) continue;

      const graded = gradeMarkingSubject(entry.subjects[subjectKey], problems);
      const ref = computeReferenceGrade(computeRawScore(graded, problems), cut);
      if (ref) perSubject.set(subjectKey, ref);
    }
    if (perSubject.size > 0) out.set(s.id, perSubject);
  }

  return out;
}

/**
 * 학번(학적 코드)만 알 때 쓰는 경로 — admission-wishlist 처럼 evalearn 학생 객체가 없는 곳.
 * `student_basic_info` RLS 가 학생 본인·교사/admin 으로 이미 제한하므로 여기서 따로 게이트하지 않는다.
 */
export async function fetchStudentReferenceGrades(studentCode: string): Promise<ReferenceGradeMap> {
  const { data, error } = await supabase
    .from('student_basic_info' as never)
    .select('mock_marking, mock_result')
    .eq('id', studentCode)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { mock_marking: MockMarkingEntry[] | null; mock_result: MockExamResult[] | null } | null;
  if (!row) return new Map();
  return computeReferenceGradesFor(row.mock_marking, row.mock_result);
}
