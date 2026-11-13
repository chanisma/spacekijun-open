import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';

export interface SectionStudent {
  resource_id: string;
  student_name: string | null;
  student_code: string | null;
  grade: number | null;
  class_num: number | null;
  number: number | null;
  picture: string | null;
  subject: string | null;
}

interface UseSectionStudentsParams {
  teacherName: string | null | undefined;
  dayOfWeek: number | null | undefined;
  period: number | null | undefined;
  enabled?: boolean;
}

/**
 * teacher_name + day_of_week + period 기준으로 해당 수업을 듣는 학생 목록을 조회한다.
 * 학기는 학사력(useTimetableTerm)이 결정한다.
 *
 * get_section_students RPC(SECURITY DEFINER) 경유 — student_timetable_flat MV 는
 * authenticated 에게 SELECT 권한이 없어(보안 하드닝) PostgREST 직접 조회 시 403.
 * MV 는 RLS 를 가질 수 없어 직접 GRANT 하면 학생도 전교생 명단을 긁을 수 있으므로,
 * 다른 민감 MV 와 동일하게 DEFINER RPC 로 읽고 RPC 내부에서 교사/admin 게이트를 적용한다.
 *
 * 2026-07-28: MV 를 student_timetable 기반으로 재정의하고 RPC 에 학년도·학기 파라미터를
 * 추가했다. 구 MV 는 resource.meta.timetable 을 펼쳐 학기 구분이 없었으므로 학기가 둘
 * 이상이면 명단이 뒤섞였다.
 */
export const useSectionStudents = ({
  teacherName,
  dayOfWeek,
  period,
  enabled = true,
}: UseSectionStudentsParams) => {
  const { term, isLoading: isTermLoading } = useTimetableTerm();

  return useQuery({
    queryKey: [
      'section-students',
      teacherName,
      dayOfWeek,
      period,
      term?.year ?? null,
      term?.semester ?? null,
    ],
    queryFn: async (): Promise<SectionStudent[]> => {
      if (!teacherName || !dayOfWeek || !period || !term) return [];

      const { data, error } = await supabase.rpc('get_section_students', {
        p_teacher_name: teacherName,
        p_day_of_week: dayOfWeek,
        p_period: period,
        p_academic_year: term.year,
        p_semester: term.semester,
      });

      if (error) throw error;
      return (data ?? []) as SectionStudent[];
    },
    enabled: enabled && !!teacherName && !!dayOfWeek && !!period && !isTermLoading && !!term,
    staleTime: 5 * 60 * 1000,
  });
};
