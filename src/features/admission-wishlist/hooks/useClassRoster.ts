import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RosterStudent {
  studentCode: string;
  name: string;
  grade: number;
  classNum: number;
  numberInClass: number | null;
}

/**
 * 반 단위 학생 목록. student_basic_info 의 RLS 가 교사 열람 범위를 통제하므로
 * (rescue-note 의 get_rescue_roster 를 끌어오지 않고) 자체적으로 조회한다.
 */
async function fetchClassRoster(grade: number, classNum: number): Promise<RosterStudent[]> {
  const { data, error } = await supabase
    .from('student_basic_info')
    .select('id, name, grade, class_num, number')
    .eq('grade', grade)
    .eq('class_num', classNum)
    .order('number', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    studentCode: r.id,
    name: r.name ?? '',
    grade: r.grade,
    classNum: r.class_num,
    numberInClass: r.number ?? null,
  }));
}

export function useClassRoster(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: ['admission-wishlist', 'roster', grade, classNum],
    queryFn: () => fetchClassRoster(grade!, classNum!),
    enabled: grade !== null && classNum !== null,
    staleTime: 60_000,
  });
}
