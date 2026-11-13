import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StudentBasicInfo {
  studentCode: string;
  name: string;
  grade: number;
  classNum: number;
  numberInClass: number | null;
}

async function fetchStudentBasicInfo(code: string): Promise<StudentBasicInfo | null> {
  const { data, error } = await supabase
    .from('student_basic_info')
    .select('id, name, grade, class_num, number')
    .eq('id', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    studentCode: data.id as string,
    name: (data.name as string) ?? '',
    grade: data.grade as number,
    classNum: data.class_num as number,
    numberInClass: (data.number as number | null) ?? null,
  };
}

export function useStudentBasicInfo(code: string | null) {
  return useQuery({
    queryKey: ['rescue-note', 'student-basic-info', code],
    queryFn: () => fetchStudentBasicInfo(code!),
    enabled: !!code,
    staleTime: 5 * 60 * 1000,
  });
}
