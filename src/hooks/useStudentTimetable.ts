import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';

export interface StudentTimetableEntry {
  teacher_name: string;
  section_name: string;
  subject: string;
  room_name: string | null;
  day_of_week: number;
  period: number;
}

/**
 * 학생 개인 시간표를 정규화 테이블 `student_timetable`(해당 학기)에서 읽는다.
 *
 * 학생 리소스는 이메일 prefix ↔ `meta->>'id'` 로 해석한다(admin 학생 미리보기는 viewAsStudentId).
 *
 * 2026-07-28: 소스를 `resource.meta.timetable` → `student_timetable` 로 전환했다.
 * meta 는 학기 필드가 없어 2학기를 올리면 1학기를 덮어썼고, 실제로 meta.timetable 이
 * 비어 시간표가 안 보이는 학생이 1명 있었다(정규화 테이블에는 32슬롯 정상 존재).
 *
 * `enabled: false` — 교사 화면처럼 학생 시간표가 없는 사람에게는 조회하지 않는다(다마고찌가 교사에게도 열리며 추가, 2026-10-07).
 * 넘기지 않으면 종전과 같다.
 */
export function useStudentTimetable(options: { enabled?: boolean } = {}) {
  const { user, viewAsStudentId } = useAuth();
  const { term, isLoading: isTermLoading } = useTimetableTerm();

  // Admin preview mode: use selected student ID; otherwise derive from email
  const emailPrefix = viewAsStudentId || (user?.email?.split('@')[0] || '');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student-timetable', emailPrefix, term?.year ?? null, term?.semester ?? null],
    queryFn: async () => {
      if (!term) return null;

      const { data: resourceRow, error: resourceError } = await supabase
        .from('resource')
        .select('id, meta')
        .eq('type', 'student')
        .eq('meta->>id', emailPrefix)
        .single();

      if (resourceError) throw resourceError;
      if (!resourceRow) return null;

      const { data: rows, error: rowsError } = await supabase
        .from('student_timetable')
        .select('day_of_week, period, subject, teacher_name')
        .eq('academic_year', term.year)
        .eq('semester', term.semester)
        .eq('resource_id', resourceRow.id)
        .order('day_of_week')
        .order('period');

      if (rowsError) throw rowsError;

      const meta = resourceRow.meta as Record<string, unknown> | null;
      return {
        entries: rows ?? [],
        grade: meta?.grade ? Number(meta.grade) : undefined,
        classNum: meta?.class ? Number(meta.class) : undefined,
      };
    },
    enabled: (options.enabled ?? true) && !!emailPrefix && !isTermLoading && !!term,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const timetable: StudentTimetableEntry[] = (data?.entries ?? []).map((entry) => ({
    day_of_week: entry.day_of_week,
    period: entry.period,
    subject: entry.subject || '',
    teacher_name: entry.teacher_name || '',
    section_name: '',
    room_name: null,
  }));

  return {
    timetable,
    loading: isLoading || isTermLoading,
    error,
    refetch,
    studentGrade: data?.grade,
    studentClassNum: data?.classNum,
  };
}
