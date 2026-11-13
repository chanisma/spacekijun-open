import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type CurriculumRow = Database['public']['Tables']['school_curriculum']['Row'];
export type CurriculumInsert = Database['public']['Tables']['school_curriculum']['Insert'];
export type CurriculumUpdate = Database['public']['Tables']['school_curriculum']['Update'];

export const SEMESTER_KEYS = [
  { grade: 1, semester: 1, label: '1-1' },
  { grade: 1, semester: 2, label: '1-2' },
  { grade: 2, semester: 1, label: '2-1' },
  { grade: 2, semester: 2, label: '2-2' },
  { grade: 3, semester: 1, label: '3-1' },
  { grade: 3, semester: 2, label: '3-2' },
] as const;

export const CATEGORY_ORDER = [
  '국어', '수학', '영어', '사회', '과학', '체육', '예술',
  '기술·가정', '기술·가정/정보', '제2외국어', '제2외국어/한문',
  '한문', '한국사', '교양', '정보·통신',
];

const categoryRank = (cat: string) => {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? 999 : idx;
};

export function useCurriculumAdmissionYears() {
  return useQuery({
    queryKey: ['curriculum', 'admission_years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_curriculum')
        .select('admission_year');
      if (error) throw error;
      const years = Array.from(new Set((data ?? []).map(r => r.admission_year)));
      return years.sort((a, b) => b - a);
    },
  });
}

export function useCurriculumByCohort(admissionYear: number | null) {
  return useQuery({
    queryKey: ['curriculum', 'cohort', admissionYear],
    queryFn: async () => {
      if (admissionYear == null) return [] as CurriculumRow[];
      const { data, error } = await supabase
        .from('school_curriculum')
        .select('*')
        .eq('admission_year', admissionYear)
        .order('grade')
        .order('semester')
        .order('subject');
      if (error) throw error;
      return data ?? [];
    },
    enabled: admissionYear != null,
  });
}

export interface MatrixCell {
  subjects: CurriculumRow[];
  totalCredits: number;
  totalHours: number;
}

export type CurriculumMatrix = Record<string, Record<string, MatrixCell>>;

export function buildMatrix(rows: CurriculumRow[]): {
  matrix: CurriculumMatrix;
  categories: string[];
} {
  const matrix: CurriculumMatrix = {};
  for (const r of rows) {
    const cat = r.category;
    const key = `${r.grade}-${r.semester}`;
    if (!matrix[cat]) matrix[cat] = {};
    if (!matrix[cat][key]) matrix[cat][key] = { subjects: [], totalCredits: 0, totalHours: 0 };
    matrix[cat][key].subjects.push(r);
    matrix[cat][key].totalCredits += r.credits;
    matrix[cat][key].totalHours += r.hours ?? 0;
  }
  const categories = Object.keys(matrix).sort((a, b) => categoryRank(a) - categoryRank(b));
  return { matrix, categories };
}

export function useUpdateCurriculumRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CurriculumUpdate }) => {
      const { data, error } = await supabase
        .from('school_curriculum')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['curriculum', 'cohort', row.admission_year] });
    },
  });
}

export function useDeleteCurriculumRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, admissionYear }: { id: string; admissionYear: number }) => {
      const { error } = await supabase.from('school_curriculum').delete().eq('id', id);
      if (error) throw error;
      return admissionYear;
    },
    onSuccess: (admissionYear) => {
      qc.invalidateQueries({ queryKey: ['curriculum', 'cohort', admissionYear] });
      qc.invalidateQueries({ queryKey: ['curriculum', 'admission_years'] });
    },
  });
}

export function useUpsertCurriculumBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: CurriculumInsert[]) => {
      const { data, error } = await supabase
        .from('school_curriculum')
        .upsert(rows, { onConflict: 'academic_year,grade,semester,subject' })
        .select();
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['curriculum'] });
    },
  });
}
