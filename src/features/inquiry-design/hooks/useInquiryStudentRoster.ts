import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 학생 목록(탐구 설계 사이드바용). 재학생 명단의 단일 출처는 `resource`
 * (type='student') — student_basic_info는 졸업/전출/자퇴생의 생기부 기록도
 * 포함하므로 단순 명단 조회에는 쓰지 않는다.
 */
export interface InquiryRosterStudent {
  id: string; // resource.meta.id (학적 코드, 예: "00-00476")
  name: string;
  grade: number;
  class_num: number;
  number: number;
}

const rosterKeys = {
  all: ['inquiry-design', 'roster'] as const,
  classes: (grade: number) => [...rosterKeys.all, 'classes', grade] as const,
  students: (grade: number, classNum: number) => [...rosterKeys.all, 'list', grade, classNum] as const,
  search: (grade: number | null, query: string) => [...rosterKeys.all, 'search', grade, query] as const,
};

function toStudent(row: { name: string; meta: unknown }): InquiryRosterStudent | null {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const id = typeof meta['id'] === 'string' ? meta['id'] : '';
  const grade = Number(meta['grade']);
  const classNum = Number(meta['class']);
  if (!id || !Number.isFinite(grade) || !Number.isFinite(classNum)) return null;
  return {
    id,
    name: row.name,
    grade,
    class_num: classNum,
    number: Number(meta['number']) || 0,
  };
}

const GRADES = [1, 2, 3];

/** 학년 목록은 학교 표준 1~3학년 고정 (student-dashboard 사이드바와 동일 정책). */
export function useInquiryGrades() {
  return { data: GRADES, isFetching: false, refetch: async () => {} };
}

export function useInquiryClasses(grade: number | null) {
  return useQuery({
    queryKey: rosterKeys.classes(grade ?? 0),
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('meta')
        .eq('type', 'student')
        .eq('status', 'active')
        .eq('meta->>grade', String(grade));
      if (error) throw error;
      const classes = new Set<number>();
      for (const row of data ?? []) {
        const classNum = Number((row.meta as Record<string, unknown> | null)?.['class']);
        if (Number.isFinite(classNum)) classes.add(classNum);
      }
      return Array.from(classes).sort((a, b) => a - b);
    },
    enabled: grade !== null,
    staleTime: 10 * 60 * 1000,
  });
}

export function useInquiryStudents(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: rosterKeys.students(grade ?? 0, classNum ?? 0),
    queryFn: async (): Promise<InquiryRosterStudent[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('name, meta')
        .eq('type', 'student')
        .eq('status', 'active')
        .eq('meta->>grade', String(grade))
        .eq('meta->>class', String(classNum));
      if (error) throw error;
      const students = (data ?? [])
        .map(toStudent)
        .filter((s): s is InquiryRosterStudent => s !== null);
      students.sort((a, b) => a.number - b.number);
      return students;
    },
    enabled: grade !== null && classNum !== null,
    staleTime: 10 * 60 * 1000,
  });
}

export function useInquiryStudentsSearch(grade: number | null, searchQuery: string) {
  const trimmed = searchQuery.trim();
  return useQuery({
    queryKey: rosterKeys.search(grade, trimmed),
    queryFn: async (): Promise<InquiryRosterStudent[]> => {
      let query = supabase
        .from('resource')
        .select('name, meta')
        .eq('type', 'student')
        .eq('status', 'active')
        .ilike('name', `%${trimmed}%`)
        .limit(200);
      if (grade !== null) query = query.eq('meta->>grade', String(grade));

      const { data, error } = await query;
      if (error) throw error;
      const students = (data ?? [])
        .map(toStudent)
        .filter((s): s is InquiryRosterStudent => s !== null);
      students.sort((a, b) => a.grade - b.grade || a.class_num - b.class_num || a.number - b.number);
      return students;
    },
    enabled: trimmed.length > 0,
    staleTime: 60 * 1000,
  });
}
