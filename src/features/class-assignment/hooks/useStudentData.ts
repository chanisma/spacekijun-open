/**
 * Student Data Hook (Class Mode)
 *
 * Master list comes from `resource` (type='student').
 * Average grade joined from `student_basic_info.academic_development`.
 * Course selections are not loaded here — Subject Mode uses useCourseStudentData.
 */

import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { StudentData } from '../types/class-assignment.types';
import {
  loadResourceStudents,
  type ResourceStudent,
} from '../utils/resourceStudentLoader';

export type StudentDataWithGrade = StudentData & { averageGrade: number };

function toStudentData(s: ResourceStudent): StudentDataWithGrade {
  return {
    student_code: s.studentCode,
    name: s.name,
    grade: s.grade,
    class_num: s.classNum,
    number: s.number,
    // 여학교이므로 gender 미지정 시 'F' 기본값 (기존 useStudentData 동작 유지)
    gender: s.gender ?? 'F',
    averageGrade: s.averageGrade,
  };
}

/** 학생 리스트에서 가장 빈도 높은 selectionAcademicYear를 추출. */
function dominantAcademicYear(items: ResourceStudent[]): number {
  const counts = new Map<number, number>();
  for (const s of items) {
    if (s.selectionAcademicYear > 0) {
      counts.set(s.selectionAcademicYear, (counts.get(s.selectionAcademicYear) ?? 0) + 1);
    }
  }
  let bestYear = 0;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      bestYear = year;
      bestCount = count;
    }
  }
  return bestYear;
}

export interface UseStudentDataOptions {
  grade?: number;
  enabled?: boolean;
}

/**
 * Supabase에서 학생 데이터 조회 훅
 * resource 테이블 + student_basic_info academic_development 조인.
 * 헤더에 academic_year 뱃지를 표시하기 위해 selection도 함께 조회.
 */
export function useStudentData(options: UseStudentDataOptions = {}) {
  const { grade, enabled = true } = options;
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['class-assignment-students', grade],
    queryFn: async () => {
      const raw = await loadResourceStudents({
        grade,
        includeSelections: true,
      });
      return {
        students: raw.map(toStudentData),
        selectionAcademicYear: dominantAcademicYear(raw),
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const refreshData = async () => {
    try {
      await query.refetch();
      toast({
        title: '데이터 갱신 완료',
        description: '학생 데이터를 새로 불러왔습니다.',
      });
    } catch {
      toast({
        title: '데이터 갱신 실패',
        description: '학생 데이터를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  return {
    students: query.data?.students ?? [],
    selectionAcademicYear: query.data?.selectionAcademicYear ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refreshData,
  };
}

/**
 * 학년별 학생 수 / 반 수 집계 (resource 기준)
 */
export function useStudentCounts() {
  return useQuery({
    queryKey: ['class-assignment-student-counts'],
    queryFn: async () => {
      const students = await loadResourceStudents({ includeSelections: false });
      const counts = new Map<number, { total: number; classes: Set<number> }>();
      for (const s of students) {
        if (s.grade <= 0) continue;
        let entry = counts.get(s.grade);
        if (!entry) {
          entry = { total: 0, classes: new Set() };
          counts.set(s.grade, entry);
        }
        entry.total++;
        if (s.classNum > 0) entry.classes.add(s.classNum);
      }
      return Array.from(counts.entries())
        .map(([g, info]) => ({
          grade: g,
          studentCount: info.total,
          classCount: info.classes.size,
        }))
        .sort((a, b) => a.grade - b.grade);
    },
    staleTime: 10 * 60 * 1000,
  });
}
