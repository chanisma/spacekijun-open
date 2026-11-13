import { supabase } from '@/integrations/supabase/client';
import { EvalearnStudent, MockProblem } from '../types';
import { resolveGrade3Split } from '../utils/grade3SubjectTrack';

const PROBLEM_CACHE_LIMIT = 100;
const problemCache = new Map<string, MockProblem[]>();

function cacheKey(year: number, month: number, grade: number, subject: string): string {
  return `${year}-${month}-${grade}-${subject}`;
}

function rememberInCache(key: string, value: MockProblem[]) {
  if (problemCache.size >= PROBLEM_CACHE_LIMIT) {
    const oldest = problemCache.keys().next().value;
    if (oldest !== undefined) problemCache.delete(oldest);
  }
  problemCache.set(key, value);
}

interface MarkingRow {
  id: string;
  mock_marking: EvalearnStudent['mock_marking'];
  mock_result: EvalearnStudent['mock_result'];
}

/**
 * Fetch the roster (재학생 전체) for a given grade/class from `resource`
 * (type='student') — NOT student_basic_info, which also holds graduated/
 * transferred/withdrawn students' records. mock_marking/mock_result live only
 * on student_basic_info, so they're joined in afterward by student code
 * (resource.meta.id). Students without marking data are still included
 * (mock_marking/mock_result come back null) so the roster always reflects
 * who's currently enrolled.
 */
export async function fetchStudentsWithMocking(
  grade: number,
  /** null 이면 그 학년 전체(집단 분석에서 학년 단위로 쓴다) */
  classNum: number | null
): Promise<EvalearnStudent[]> {
  let query = supabase
    .from('resource')
    .select('id, name, meta')
    .eq('type', 'student')
    .eq('status', 'active')
    .eq('meta->>grade', String(grade));
  if (classNum != null) query = query.eq('meta->>class', String(classNum));

  const { data: resourceRows, error: resourceError } = await query;

  if (resourceError) throw resourceError;
  if (!resourceRows || resourceRows.length === 0) return [];

  const codes: string[] = [];
  const byCode = new Map<string, { id: string; name: string; number: number; classNum: number }>();
  for (const row of resourceRows) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const code = typeof meta['id'] === 'string' ? (meta['id'] as string) : '';
    if (!code) continue;
    codes.push(code);
    byCode.set(code, {
      id: code,
      name: row.name,
      number: Number(meta['number']) || 0,
      // 학년 전체를 받을 때는 학생마다 반이 다르므로 meta 에서 읽어야 한다
      classNum: Number(meta['class']) || 0,
    });
  }

  const markingByCode = new Map<string, { mock_marking: unknown; mock_result: unknown }>();
  if (codes.length > 0) {
    const { data: markingRows, error: markingError } = await supabase
      .from('student_basic_info' as any)
      .select('id, mock_marking, mock_result')
      .in('id', codes);
    if (markingError) throw markingError;
    for (const row of (markingRows as MarkingRow[]) ?? []) {
      markingByCode.set(row.id, { mock_marking: row.mock_marking, mock_result: row.mock_result });
    }
  }

  const students: EvalearnStudent[] = [];
  for (const code of codes) {
    const info = byCode.get(code)!;
    const marking = markingByCode.get(code);
    students.push({
      id: info.id,
      name: info.name,
      grade,
      classNum: classNum ?? info.classNum,
      number: info.number,
      mock_marking: (marking?.mock_marking as EvalearnStudent['mock_marking']) ?? null,
      mock_result: (marking?.mock_result as EvalearnStudent['mock_result']) ?? null,
    });
  }

  students.sort((a, b) => (a.classNum - b.classNum) || (a.number - b.number));
  return students;
}

/**
 * Search the active roster by name (`resource`, type='student') across all
 * grades/classes — used by the sidebar's search box. mock_marking/mock_result
 * are joined in the same way as fetchStudentsWithMocking.
 */
export async function searchStudentsByName(query: string): Promise<EvalearnStudent[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data: resourceRows, error: resourceError } = await supabase
    .from('resource')
    .select('id, name, meta')
    .eq('type', 'student')
    .eq('status', 'active')
    .ilike('name', `%${trimmed}%`)
    .limit(50);

  if (resourceError) throw resourceError;
  if (!resourceRows || resourceRows.length === 0) return [];

  const codes: string[] = [];
  const byCode = new Map<string, { id: string; name: string; grade: number; classNum: number; number: number }>();
  for (const row of resourceRows) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const code = typeof meta['id'] === 'string' ? (meta['id'] as string) : '';
    if (!code) continue;
    codes.push(code);
    byCode.set(code, {
      id: code,
      name: row.name,
      grade: Number(meta['grade']) || 0,
      classNum: Number(meta['class']) || 0,
      number: Number(meta['number']) || 0,
    });
  }

  const markingByCode = new Map<string, { mock_marking: unknown; mock_result: unknown }>();
  if (codes.length > 0) {
    const { data: markingRows, error: markingError } = await supabase
      .from('student_basic_info' as any)
      .select('id, mock_marking, mock_result')
      .in('id', codes);
    if (markingError) throw markingError;
    for (const row of (markingRows as MarkingRow[]) ?? []) {
      markingByCode.set(row.id, { mock_marking: row.mock_marking, mock_result: row.mock_result });
    }
  }

  const students: EvalearnStudent[] = codes.map((code) => {
    const info = byCode.get(code)!;
    const marking = markingByCode.get(code);
    return {
      id: info.id,
      name: info.name,
      grade: info.grade,
      classNum: info.classNum,
      number: info.number,
      mock_marking: (marking?.mock_marking as EvalearnStudent['mock_marking']) ?? null,
      mock_result: (marking?.mock_result as EvalearnStudent['mock_result']) ?? null,
    };
  });

  students.sort((a, b) => a.grade - b.grade || a.classNum - b.classNum || a.number - b.number);
  return students;
}

/**
 * Fetch mock problem metadata for a specific exam.
 *
 * 2026년 3학년 시험까지는 국어·수학 선택과목이 공통(subject='공통')과 분리 저장되어
 * 있어, 이 경우 두 쿼리(공통 + 선택과목)를 병렬로 가져와 problem_number로 머지한다.
 * 2027년부터 통합형 전환 시 split 분기는 grade3SubjectTrack.ts와 함께 제거.
 */
export async function fetchMockProblems(
  year: number,
  month: number,
  studentGrade: number,
  subject: string
): Promise<MockProblem[]> {
  const key = cacheKey(year, month, studentGrade, subject);
  const cached = problemCache.get(key);
  if (cached) return cached;

  const split = resolveGrade3Split(studentGrade, year, subject);

  if (split) {
    const baseFilter = (qb: ReturnType<typeof supabase.from>) =>
      qb
        .select('*')
        .eq('year', year)
        .eq('month', month)
        .eq('student_grade', studentGrade);

    const [commonRes, electiveRes] = await Promise.all([
      baseFilter(supabase.from('mock_problems' as any))
        .eq('subject', '공통')
        .in('major_category', [...split.commonMajorCategories])
        .order('problem_number', { ascending: true }),
      baseFilter(supabase.from('mock_problems' as any))
        .eq('subject', split.electiveSubject)
        .order('problem_number', { ascending: true }),
    ]);

    if (commonRes.error) throw commonRes.error;
    if (electiveRes.error) throw electiveRes.error;

    const merged = [
      ...((commonRes.data as any[]) || []),
      ...((electiveRes.data as any[]) || []),
    ];
    merged.sort((a, b) => a.problem_number - b.problem_number);
    const result = merged as MockProblem[];
    rememberInCache(key, result);
    return result;
  }

  const { data, error } = await supabase
    .from('mock_problems' as any)
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .eq('student_grade', studentGrade)
    .eq('subject', subject)
    .order('problem_number', { ascending: true });

  if (error) throw error;
  const result = ((data as any[]) || []) as MockProblem[];
  rememberInCache(key, result);
  return result;
}

/**
 * Fetch all distinct subjects available in mock_problems for a specific exam
 */
export async function fetchAvailableSubjects(
  year: number,
  month: number,
  studentGrade: number
): Promise<string[]> {
  const { data, error } = await supabase
    .from('mock_problems' as any)
    .select('subject')
    .eq('year', year)
    .eq('month', month)
    .eq('student_grade', studentGrade);

  if (error) throw error;
  if (!data) return [];

  // Extract unique subjects
  const subjects = new Set((data as any[]).map((r) => r.subject));
  return Array.from(subjects).sort();
}
