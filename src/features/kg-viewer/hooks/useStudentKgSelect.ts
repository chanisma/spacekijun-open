import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 학생 기본 정보 (KG 뷰어 셀렉터용)
 */
export interface KgStudentItem {
  id: string;         // student_basic_info.id (UUID)
  name: string;
  grade: number;
  class_num: number;
  number: number;
}

// ─── Query Keys ───
export const kgSelectKeys = {
  all: ['kg-viewer', 'students'] as const,
  grades: () => [...kgSelectKeys.all, 'grades'] as const,
  classes: (grade: number) => [...kgSelectKeys.all, 'classes', grade] as const,
  students: (grade: number, classNum: number) =>
    [...kgSelectKeys.all, 'list', grade, classNum] as const,
  search: (grade: number | null, query: string) =>
    [...kgSelectKeys.all, 'search', grade, query] as const,
};

/**
 * 사용 가능한 학년 목록을 조회합니다.
 * Fetches distinct grades from student_basic_info.
 */
export function useKgGrades() {
  return useQuery({
    queryKey: kgSelectKeys.grades(),
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from('student_basic_info')
        .select('grade')
        .order('grade');

      if (error) {
        console.error('[KG Select] 학년 목록 조회 실패:', error);
        throw error;
      }

      // Extract unique grades, filtering out nulls
      const grades = [...new Set(
        (data ?? []).map((row) => row.grade).filter((g): g is number => g != null)
      )];
      return grades.sort((a, b) => a - b);
    },
    staleTime: 10 * 60 * 1000, // 10분
  });
}

/**
 * 특정 학년의 사용 가능한 반 목록을 조회합니다.
 * Fetches distinct class_num values for a given grade.
 */
export function useKgClasses(grade: number | null) {
  return useQuery({
    queryKey: kgSelectKeys.classes(grade!),
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from('student_basic_info')
        .select('class_num')
        .eq('grade', grade!)
        .order('class_num');

      if (error) {
        console.error('[KG Select] 반 목록 조회 실패:', error);
        throw error;
      }

      const classes = [...new Set(
        (data ?? []).map((row) => row.class_num).filter((c): c is number => c != null)
      )];
      return classes.sort((a, b) => a - b);
    },
    enabled: grade !== null,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * 특정 학년/반의 학생 목록을 조회합니다.
 * Fetches students for a given grade and class, ordered by student number.
 */
export function useKgStudents(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: kgSelectKeys.students(grade!, classNum!),
    queryFn: async (): Promise<KgStudentItem[]> => {
      const { data, error } = await supabase
        .from('student_basic_info')
        .select('id, name, grade, class_num, number')
        .eq('grade', grade!)
        .eq('class_num', classNum!)
        .order('number');

      if (error) {
        console.error('[KG Select] 학생 목록 조회 실패:', error);
        throw error;
      }

      return (data ?? []).filter(
        (row) => row.id != null && row.grade != null && row.class_num != null
      ) as KgStudentItem[];
    },
    enabled: grade !== null && classNum !== null,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * 학년/반 미선택 상태에서도 이름으로 학생을 검색합니다.
 * Server-side ILIKE so we never overfetch the full roster.
 */
export function useKgStudentsSearch(grade: number | null, searchQuery: string) {
  const trimmed = searchQuery.trim();
  return useQuery({
    queryKey: kgSelectKeys.search(grade, trimmed),
    queryFn: async (): Promise<KgStudentItem[]> => {
      let query = supabase
        .from('student_basic_info')
        .select('id, name, grade, class_num, number')
        .ilike('name', `%${trimmed}%`)
        .order('grade')
        .order('class_num')
        .order('number')
        .limit(200);

      if (grade !== null) query = query.eq('grade', grade);

      const { data, error } = await query;
      if (error) {
        console.error('[KG Select] 이름 검색 실패:', error);
        throw error;
      }
      return (data ?? []).filter(
        (row) => row.id != null && row.grade != null && row.class_num != null
      ) as KgStudentItem[];
    },
    enabled: trimmed.length > 0,
    staleTime: 60 * 1000,
  });
}
