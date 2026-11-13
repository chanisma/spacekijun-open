import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type SelectableSubjectRow = Database['public']['Tables']['course_selectable_subject']['Row'];
export type RoundRow = Database['public']['Tables']['course_selection_round']['Row'];
export type SubmissionRow = Database['public']['Tables']['course_selection_submission']['Row'];
export type ItemRow = Database['public']['Tables']['course_selection_item']['Row'];

const PAGE_SIZE = 1000;

export function useSelectableSubjects() {
  return useQuery({
    queryKey: ['course_selectable_subject', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_selectable_subject')
        .select('*')
        .order('category_code')
        .order('display_order');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateSelectableSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SelectableSubjectRow> }) => {
      const { error } = await supabase
        .from('course_selectable_subject')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course_selectable_subject'] }),
  });
}

export function useSelectionRounds() {
  return useQuery({
    queryKey: ['course_selection_round', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_selection_round')
        .select('*')
        .order('academic_year', { ascending: false })
        .order('target_grade')
        .order('round_number');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface SubmissionsFilter {
  roundId: string | null;
  classNum?: number | null;
  search?: string;
}

export function useSubmissionsByRound(filter: SubmissionsFilter) {
  return useQuery({
    queryKey: ['course_selection_submission', 'list', filter],
    queryFn: async () => {
      if (!filter.roundId) return [] as SubmissionRow[];
      let q = supabase
        .from('course_selection_submission')
        .select('*')
        .eq('round_id', filter.roundId)
        .order('student_grade')
        .order('student_class')
        .order('student_no');
      if (filter.classNum != null) q = q.eq('student_class', filter.classNum);
      const { data, error } = await q;
      if (error) throw error;
      let rows = data ?? [];
      if (filter.search?.trim()) {
        const s = filter.search.trim();
        rows = rows.filter((r) => r.student_name.includes(s) || (r.student_code?.includes(s) ?? false));
      }
      return rows;
    },
    enabled: !!filter.roundId,
  });
}

export function useSubmissionItems(submissionIds: string[]) {
  return useQuery({
    queryKey: ['course_selection_item', 'by_subs', submissionIds],
    queryFn: async () => {
      if (submissionIds.length === 0) return [] as ItemRow[];
      // chunk 50: 학생당 ~12 items × 50 = ~600 < 1000 (Supabase row limit)
      // chunk 내부도 count + range로 안전 페이지네이션
      const ID_CHUNK = 50;
      const fetchChunk = async (chunk: string[]): Promise<ItemRow[]> => {
        const { count } = await supabase
          .from('course_selection_item')
          .select('id', { count: 'exact', head: true })
          .in('submission_id', chunk);
        const total = count ?? 0;
        if (total === 0) return [];
        const pages = Math.ceil(total / PAGE_SIZE);
        const promises = Array.from({ length: pages }, (_, p) =>
          supabase
            .from('course_selection_item')
            .select('*')
            .in('submission_id', chunk)
            .order('semester')
            .order('priority', { nullsFirst: false })
            .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
        );
        const results = await Promise.all(promises);
        const acc: ItemRow[] = [];
        for (const { data, error } of results) {
          if (error) throw error;
          if (data) acc.push(...data);
        }
        return acc;
      };

      const chunkPromises: Promise<ItemRow[]>[] = [];
      for (let i = 0; i < submissionIds.length; i += ID_CHUNK) {
        chunkPromises.push(fetchChunk(submissionIds.slice(i, i + ID_CHUNK)));
      }
      const results = await Promise.all(chunkPromises);
      return results.flat();
    },
    enabled: submissionIds.length > 0,
  });
}

export interface SubmissionWithItems extends SubmissionRow {
  semester1: ItemRow[];
  semester2: ItemRow[];
}

export function attachItems(subs: SubmissionRow[], items: ItemRow[]): SubmissionWithItems[] {
  const m = new Map<string, { semester1: ItemRow[]; semester2: ItemRow[] }>();
  for (const it of items) {
    let g = m.get(it.submission_id);
    if (!g) { g = { semester1: [], semester2: [] }; m.set(it.submission_id, g); }
    (it.semester === 1 ? g.semester1 : g.semester2).push(it);
  }
  return subs.map((s) => ({
    ...s,
    semester1: m.get(s.id)?.semester1 ?? [],
    semester2: m.get(s.id)?.semester2 ?? [],
  }));
}
