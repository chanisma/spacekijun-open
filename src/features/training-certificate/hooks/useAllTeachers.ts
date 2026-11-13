import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TeacherResourceRow {
  id: string;
  name: string;
  meta: {
    grade?: string | number | null;
    class_number?: string | number | null;
    email?: string | null;
  } | null;
}

export function useAllTeachers() {
  return useQuery({
    queryKey: ['training-cert', 'all-teachers'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TeacherResourceRow[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'teacher')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeacherResourceRow[];
    },
  });
}

export function teacherLabel(t: TeacherResourceRow): string {
  const g = t.meta?.grade;
  const c = t.meta?.class_number;
  if (g && c) return `${g}학년 ${c}반`;
  if (g) return `${g}학년`;
  return '—';
}

export function teacherGradeBucket(t: TeacherResourceRow): string {
  const g = t.meta?.grade;
  if (!g) return '기타';
  return `${g}학년`;
}
