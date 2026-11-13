import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface ClassStudentMemo {
  id: string;
  student_code: string;
  student_name: string | null;
  year: number;
  subject: string;
  teacher_name: string | null;
  grade: number | null;
  class_num: number | null;
  day_of_week: number;
  period: number;
  memo_date: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMemoParams {
  student_code: string;
  student_name: string | null;
  year: number;
  subject: string;
  teacher_name: string | null;
  grade: number | null;
  class_num: number | null;
  day_of_week: number;
  period: number;
  memo_date: string;
  content: string;
}

interface UseClassStudentMemosParams {
  subject: string | null;
  teacherName: string | null;
  year: number;
  dayOfWeek: number | null;
  period: number | null;
  memoDate: string | null;
  enabled?: boolean;
}

/**
 * 특정 수업(과목+교사+연도)의 모든 학생 메모를 한 번에 조회.
 * studentCode → memo 맵으로 반환해 카드별 즉시 매핑.
 */
export const useClassStudentMemos = ({
  subject,
  teacherName,
  year,
  dayOfWeek,
  period,
  memoDate,
  enabled = true,
}: UseClassStudentMemosParams) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['class-student-memos', subject, teacherName, year, dayOfWeek, period, memoDate, user?.id],
    queryFn: async (): Promise<Record<string, ClassStudentMemo>> => {
      if (!subject || !teacherName || !user?.id || !dayOfWeek || !period || !memoDate) return {};

      const { data, error } = await (supabase as any)
        .from('class_student_memos')
        .select('*')
        .eq('subject', subject)
        .eq('teacher_name', teacherName)
        .eq('year', year)
        .eq('day_of_week', dayOfWeek)
        .eq('period', period)
        .eq('memo_date', memoDate)
        .eq('created_by', user.id);

      if (error) throw error;

      const map: Record<string, ClassStudentMemo> = {};
      (data ?? []).forEach((memo: ClassStudentMemo) => {
        map[memo.student_code] = memo;
      });
      return map;
    },
    enabled: enabled && !!subject && !!teacherName && !!dayOfWeek && !!period && !!memoDate && !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  const queryClient = useQueryClient();

  const upsertMemo = useMutation({
    mutationFn: async (params: UpsertMemoParams) => {
      const { data, error } = await (supabase as any)
        .from('class_student_memos')
        .upsert(
          { ...params, created_by: user?.id },
          { onConflict: 'student_code,year,subject,created_by,day_of_week,period,memo_date' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // 해당 수업 슬롯 + 전체 학생 메모 쿼리 모두 무효화
      queryClient.invalidateQueries({
        queryKey: ['class-student-memos', subject, teacherName, year, dayOfWeek, period, memoDate, user?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['all-teacher-student-memos'],
      });
    },
  });

  return { ...query, upsertMemo };
};

/**
 * 현재 로그인 교사가 작성한 모든 학생 메모를 연도 기준으로 조회.
 * updated_at 내림차순 정렬 (최신 순).
 */
export const useAllTeacherStudentMemos = (year: number, enabled = true) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all-teacher-student-memos', year, user?.id],
    queryFn: async (): Promise<ClassStudentMemo[]> => {
      if (!user?.id) return [];

      const { data, error } = await (supabase as any)
        .from('class_student_memos')
        .select('*')
        .eq('year', year)
        .eq('created_by', user.id)
        .neq('content', '')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!user?.id,
    staleTime: 2 * 60 * 1000,
  });
};
