import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  groupAfterschoolByTerm,
  totalAfterschoolCourseCount,
  type AfterschoolEnrollmentLike,
} from '@/features/student-dashboard/utils/afterschoolTerms';

// Types
export interface StudentDashboardData {
  student_code: string;
  resource_id: string | null;
  name: string;
  grade: number;
  class_num: number;
  number: number;
  student_no: string;
  picture: string | null;
  career: string | null;
  major: string | null;
  birthday: string | null;
  academic_development: any[] | null;
  attendance: {
    total_days?: number;
    absent_days?: number;
    late_count?: number;
  } | null;
  volunteer: any | null;
  reading: any | null;
  total_reservations: number;
  attended_count: number;
  attendance_rate: number;
}

export interface StudentDashboardFilters {
  grade?: number;
  classNum?: number;
  searchTerm?: string;
  studentCode?: string;
}

// Query Keys
export const studentDashboardKeys = {
  all: ['student-dashboard'] as const,
  lists: () => [...studentDashboardKeys.all, 'list'] as const,
  list: (filters: StudentDashboardFilters) => [...studentDashboardKeys.lists(), filters] as const,
  detail: (studentCode: string) => [...studentDashboardKeys.all, 'detail', studentCode] as const,
};

// Main hook - 학생 대시보드 목록 조회
// 학년 선택 또는 학년+반 선택 또는 특정 학생 코드 또는 검색어 필요
export function useStudentDashboard(filters: StudentDashboardFilters = {}) {
  // 학년이 선택되었거나 특정 학생 코드가 있거나 검색어가 있을 때 fetch
  const hasRequiredFilters =
    filters.grade !== undefined ||
    filters.studentCode !== undefined ||
    (filters.searchTerm !== undefined && filters.searchTerm.trim() !== '');

  return useQuery({
    queryKey: studentDashboardKeys.list(filters),
    queryFn: async (): Promise<StudentDashboardData[]> => {
      const { data, error } = await supabase.rpc('get_student_dashboard_data', {
        p_grade: filters.grade ?? null,
        p_class_num: filters.classNum ?? null,
        p_search_term: filters.searchTerm ?? null,
        p_student_code: filters.studentCode ?? null,
      });

      if (error) {
        console.error('Student dashboard fetch error:', error);
        throw new Error('학생 데이터를 불러올 수 없습니다.');
      }

      return (data as StudentDashboardData[]) || [];
    },
    staleTime: 5 * 60 * 1000, // 5분
    enabled: hasRequiredFilters, // 필수 필터가 있을 때만 활성화
  });
}

// Detail hook - 개별 학생 상세 조회
export function useStudentDetail(studentCode: string) {
  return useQuery({
    queryKey: studentDashboardKeys.detail(studentCode),
    queryFn: async (): Promise<StudentDashboardData | null> => {
      const { data, error } = await supabase.rpc('get_student_dashboard_data', {
        p_student_code: studentCode,
      });

      if (error) {
        console.error('Student detail fetch error:', error);
        throw new Error('학생 정보를 불러올 수 없습니다.');
      }

      return (data as StudentDashboardData[])?.[0] || null;
    },
    staleTime: 10 * 60 * 1000, // 10분
    enabled: !!studentCode,
  });
}

// 학년별 학생 수 통계
export function useStudentStats() {
  return useQuery({
    queryKey: [...studentDashboardKeys.all, 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_basic_info')
        .select('grade, class_num');

      if (error) throw error;

      // 학년별, 반별 학생 수 집계
      const stats = {
        total: data?.length || 0,
        byGrade: {} as Record<number, number>,
        byClass: {} as Record<string, number>,
      };

      data?.forEach((student) => {
        if (student.grade) {
          stats.byGrade[student.grade] = (stats.byGrade[student.grade] || 0) + 1;
        }
        if (student.grade && student.class_num) {
          const key = `${student.grade}-${student.class_num}`;
          stats.byClass[key] = (stats.byClass[key] || 0) + 1;
        }
      });

      return stats;
    },
    staleTime: 30 * 60 * 1000, // 30분
  });
}

// Types for afterschool enrollments
export interface AfterSchoolEnrollment {
  id: string;
  student_number: string;
  student_name: string | null;
  course_name: string;
  is_paid: boolean;
  cate_id: number;
  my_id: string | null;
  student_id: string | null;
  collected_at: string;
}

// Types for career submissions
export interface CareerSubmission {
  id: string;
  my_id: string;
  student_name: string | null;
  assignment_name: string;
  board_name: string | null;
  teacher_in_charge: string | null;
  deadline: string | null;
  submission_datetime: string | null;
  material_link_url: string | null;
  collected_at: string;
}

// Hook - 방과후 수강 내역 조회
export function useAfterSchoolEnrollments(studentCode: string | null) {
  return useQuery({
    queryKey: [...studentDashboardKeys.all, 'afterschool', studentCode],
    queryFn: async (): Promise<AfterSchoolEnrollment[]> => {
      if (!studentCode) return [];

      const { data, error } = await supabase
        .from('afterschool_enrollments')
        .select('*')
        .eq('student_id', studentCode)
        .order('course_name', { ascending: true });

      if (error) {
        console.error('Afterschool enrollments fetch error:', error);
        throw new Error('방과후 수강 내역을 불러올 수 없습니다.');
      }

      return (data as AfterSchoolEnrollment[]) || [];
    },
    staleTime: 10 * 60 * 1000, // 10분
    enabled: !!studentCode,
  });
}

// Hook - 리로스쿨 과제 제출 내역 조회
export function useCareerSubmissions(studentCode: string | null) {
  return useQuery({
    queryKey: [...studentDashboardKeys.all, 'career-submissions', studentCode],
    queryFn: async (): Promise<CareerSubmission[]> => {
      if (!studentCode) return [];

      const { data, error } = await supabase
        .from('student_career_submissions')
        .select('*')
        .eq('my_id', studentCode)
        .order('collected_at', { ascending: false });

      if (error) {
        console.error('Career submissions fetch error:', error);
        throw new Error('리로스쿨 과제 내역을 불러올 수 없습니다.');
      }

      return (data as CareerSubmission[]) || [];
    },
    staleTime: 10 * 60 * 1000, // 10분
    enabled: !!studentCode,
  });
}

// Types for resource snum data
export interface StudentResourceMeta {
  snum1?: string;
  snum2?: string;
  snum3?: string;
  [key: string]: unknown;
}

export interface StudentResource {
  id: string;
  name: string;
  meta: StudentResourceMeta | null;
}

// Hook - 학생 리소스 정보 조회 (snum1, snum2, snum3)
export function useStudentResource(resourceId: string | null) {
  return useQuery({
    queryKey: [...studentDashboardKeys.all, 'resource', resourceId],
    queryFn: async (): Promise<StudentResource | null> => {
      if (!resourceId) return null;

      const { data, error } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('id', resourceId)
        .single();

      if (error) {
        console.error('Student resource fetch error:', error);
        return null;
      }

      return data as StudentResource;
    },
    staleTime: 30 * 60 * 1000, // 30분
    enabled: !!resourceId,
  });
}

// PostgREST가 요청당 1000행에서 **오류 없이** 잘라내므로 페이지로 나눠 받는다.
// afterschool_enrollments는 이미 1,396행이라 한 번에 받으면 뒤쪽 학생이 조용히 0건이 된다.
const AFTERSCHOOL_PAGE_SIZE = 1000;

async function fetchAllAfterschoolRows(): Promise<AfterschoolEnrollmentLike[]> {
  const rows: AfterschoolEnrollmentLike[] = [];
  for (let from = 0; ; from += AFTERSCHOOL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('afterschool_enrollments')
      .select('id, student_id, student_number, course_name, cate_id')
      .order('id', { ascending: true }) // 페이지 경계가 흔들리지 않도록 결정적 정렬
      .range(from, from + AFTERSCHOOL_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as AfterschoolEnrollmentLike[]));
    if (data.length < AFTERSCHOOL_PAGE_SIZE) break;
  }
  return rows;
}

// Hook - 여러 학생의 방과후 수강 과목수 조회 (배치)
// 세는 기준은 상세 화면과 **같아야 한다** — 같은 `groupAfterschoolByTerm`을 거쳐
// 카테고리 복제(`- 복사`)를 제외한 과목 수를 낸다. 기준이 갈리면 학급 카드가 17,
// 상세 패널이 12를 말하는 상태가 된다.
export function useAfterSchoolCounts(studentCodes: string[]) {
  return useQuery({
    queryKey: [...studentDashboardKeys.all, 'afterschool-counts', studentCodes.join(',')],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!studentCodes.length) return {};

      let rows: AfterschoolEnrollmentLike[];
      try {
        rows = await fetchAllAfterschoolRows();
      } catch (error) {
        console.error('Afterschool counts fetch error:', error);
        return {};
      }

      const wanted = new Set(studentCodes);
      const byStudent = new Map<string, AfterschoolEnrollmentLike[]>();
      for (const row of rows) {
        if (!row.student_id || !wanted.has(row.student_id)) continue;
        const bucket = byStudent.get(row.student_id);
        if (bucket) bucket.push(row);
        else byStudent.set(row.student_id, [row]);
      }

      const counts: Record<string, number> = {};
      for (const code of studentCodes) {
        counts[code] = totalAfterschoolCourseCount(
          groupAfterschoolByTerm(byStudent.get(code) ?? []),
        );
      }
      return counts;
    },
    staleTime: 10 * 60 * 1000, // 10분
    enabled: studentCodes.length > 0,
  });
}

// Types for yearly reservation stats
export interface YearlyReservationStats {
  year: number;
  total_reservations: number;
  attended_count: number;
  attendance_rate: number;
}

// Hook - 학생별 연도별 자습실 예약 통계 조회
export function useStudentReservationsByYear(studentCode: string | null) {
  return useQuery({
    queryKey: [...studentDashboardKeys.all, 'reservations-by-year', studentCode],
    queryFn: async (): Promise<YearlyReservationStats[]> => {
      if (!studentCode) return [];

      const { data, error } = await supabase.rpc('get_student_reservations_by_year', {
        p_student_code: studentCode,
      });

      if (error) {
        console.error('Yearly reservations fetch error:', error);
        return [];
      }

      return (data as YearlyReservationStats[]) || [];
    },
    staleTime: 10 * 60 * 1000, // 10분
    enabled: !!studentCode,
  });
}
