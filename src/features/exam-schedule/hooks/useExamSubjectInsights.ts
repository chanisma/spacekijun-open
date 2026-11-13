import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ExamSubject, Grade } from '../types';
import {
  calculateWeightedAverage,
  type AcademicRecord,
} from '@/features/course-analyze/services/databaseGradeService';

interface GradeRow {
  id: string;
  student_id: string | null;
  student_no: string | null;
  academic_development: unknown;
}

export interface ExamCountBucket {
  examCount: number;
  studentCount: number;
}

export interface SubjectCombinationInsight {
  subjects: string[];
  studentCount: number;
  averageGrade: number | null;
}

export interface GradeInsight {
  loadedCount: number;
  averageGrade: number | null;
  minGrade: number | null;
  maxGrade: number | null;
}

export interface SubjectGradeInsight {
  subjectId: string;
  subjectName: string;
  studentCount: number;
  gradeLoadedCount: number;
  averageGrade: number | null;
}

export interface ExamSubjectInsights {
  studentCount: number;
  totalSubjectEnrollments: number;
  averageExamCount: number;
  examCountBuckets: ExamCountBucket[];
  topCombinations: SubjectCombinationInsight[];
  subjectGrades: SubjectGradeInsight[];
  grade: GradeInsight;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rowKeys(row: GradeRow): string[] {
  return [row.id, row.student_id, row.student_no]
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * 학생 코드 → 평균 성적. id → student_id → student_no 순서로 폴백 매칭하되,
 * 두 가지 오염 경로를 차단한다:
 * 1. `grade` 필터 — student_basic_info에는 타학년·이전 연도(grade NULL) 행이
 *    공존하고, 일부 행의 student_id/student_no가 다른 학년의 현재 학번과
 *    충돌할 수 있다 (실제 사례: 2학년 행의 student_id에 1학년 학번 입력).
 * 2. resolved 추적 — 행에 매칭됐지만 성적이 비어 있는 코드(예: 성적 없는
 *    1학년)를 더 약한 키 컬럼으로 재시도하면서 남의 행에 붙는 것을 방지.
 */
async function fetchAverageGrades(
  studentCodes: string[],
  grade: Grade,
): Promise<Map<string, number>> {
  const wanted = Array.from(new Set(studentCodes));
  const wantedSet = new Set(wanted);
  const out = new Map<string, number>();
  const resolved = new Set<string>();
  if (wanted.length === 0) return out;

  for (const column of ['id', 'student_id', 'student_no'] as const) {
    const missing = wanted.filter((code) => !resolved.has(code));
    if (missing.length === 0) break;

    for (const part of chunk(missing, 100)) {
      const { data, error } = await (supabase as any)
        .from('student_basic_info')
        .select('id, student_id, student_no, academic_development')
        .eq('grade', grade)
        .in(column, part);

      if (error) throw new Error(`성적 데이터 조회 실패: ${error.message}`);

      for (const row of (data ?? []) as GradeRow[]) {
        const records = (row.academic_development as AcademicRecord[] | null) ?? [];
        const average = calculateWeightedAverage(records);

        for (const key of rowKeys(row)) {
          if (!wantedSet.has(key)) continue;
          resolved.add(key);
          if (average > 0) out.set(key, average);
        }
      }
    }
  }

  return out;
}

function buildInsights(
  subjects: ExamSubject[],
  gradeByStudent: Map<string, number>,
): ExamSubjectInsights {
  const subjectNamesByStudent = new Map<string, string[]>();

  for (const subject of subjects) {
    for (const code of subject.studentCodes) {
      const list = subjectNamesByStudent.get(code) ?? [];
      list.push(subject.name);
      subjectNamesByStudent.set(code, list);
    }
  }

  const examCountMap = new Map<number, number>();
  const comboMap = new Map<string, { subjects: string[]; studentCodes: string[] }>();
  let totalSubjectEnrollments = 0;

  for (const [code, names] of subjectNamesByStudent.entries()) {
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    totalSubjectEnrollments += sorted.length;
    examCountMap.set(sorted.length, (examCountMap.get(sorted.length) ?? 0) + 1);

    const key = sorted.join(' / ');
    const entry = comboMap.get(key) ?? { subjects: sorted, studentCodes: [] };
    entry.studentCodes.push(code);
    comboMap.set(key, entry);
  }

  const studentCount = subjectNamesByStudent.size;
  const grades = Array.from(gradeByStudent.values());
  const subjectGrades = subjects.map((subject) => {
    const uniqueCodes = Array.from(new Set(subject.studentCodes));
    const subjectGradeValues = uniqueCodes
      .map((code) => gradeByStudent.get(code))
      .filter((x): x is number => typeof x === 'number' && x > 0);

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      studentCount: uniqueCodes.length,
      gradeLoadedCount: subjectGradeValues.length,
      averageGrade:
        subjectGradeValues.length > 0
          ? subjectGradeValues.reduce((acc, x) => acc + x, 0) / subjectGradeValues.length
          : null,
    };
  });
  const topCombinations = Array.from(comboMap.values())
    .map((entry) => {
      const comboGrades = entry.studentCodes
        .map((code) => gradeByStudent.get(code))
        .filter((x): x is number => typeof x === 'number' && x > 0);
      return {
        subjects: entry.subjects,
        studentCount: entry.studentCodes.length,
        averageGrade:
          comboGrades.length > 0
            ? comboGrades.reduce((acc, x) => acc + x, 0) / comboGrades.length
            : null,
      };
    })
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 8);

  return {
    studentCount,
    totalSubjectEnrollments,
    averageExamCount: studentCount > 0 ? totalSubjectEnrollments / studentCount : 0,
    examCountBuckets: Array.from(examCountMap.entries())
      .map(([examCount, count]) => ({ examCount, studentCount: count }))
      .sort((a, b) => a.examCount - b.examCount),
    topCombinations,
    subjectGrades,
    grade: {
      loadedCount: grades.length,
      averageGrade:
        grades.length > 0 ? grades.reduce((acc, x) => acc + x, 0) / grades.length : null,
      minGrade: grades.length > 0 ? Math.min(...grades) : null,
      maxGrade: grades.length > 0 ? Math.max(...grades) : null,
    },
  };
}

export function useExamSubjectInsights(subjects: ExamSubject[], grade: Grade) {
  const studentCodes = useMemo(
    () => Array.from(new Set(subjects.flatMap((subject) => subject.studentCodes))).sort(),
    [subjects],
  );

  const grades = useQuery({
    queryKey: ['exam-subject-insight-grades', grade, studentCodes],
    enabled: studentCodes.length > 0,
    queryFn: () => fetchAverageGrades(studentCodes, grade),
    staleTime: 5 * 60 * 1000,
  });

  const insights = useMemo(
    () => buildInsights(subjects, grades.data ?? new Map()),
    [grades.data, subjects],
  );

  return {
    insights,
    isLoadingGrades: grades.isLoading,
    gradeError: grades.error instanceof Error ? grades.error.message : null,
  };
}
