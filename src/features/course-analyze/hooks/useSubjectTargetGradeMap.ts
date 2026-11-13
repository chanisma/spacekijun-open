/**
 * Hook to fetch subject → target_grade mapping for the current round.
 * Used by SubjectCountTab to separate 2학년/3학년 subjects when viewing 1학년 data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SubjectTargetGradeMap {
  /** subject_name → group.target_grade */
  map: Record<string, number>;
  /** distinct target grades available (e.g. [2, 3]) */
  targetGrades: number[];
}

async function fetchSubjectTargetGradeMap(
  academicYear: number,
  currentGrade: number
): Promise<SubjectTargetGradeMap> {
  const { data, error } = await supabase
    .from('course_selection_round')
    .select('id')
    .eq('academic_year', academicYear)
    .eq('target_grade', currentGrade);

  if (error) throw error;
  if (!data || data.length === 0) return { map: {}, targetGrades: [] };

  const roundIds = data.map((r) => r.id);

  const { data: mappingData, error: mappingError } = await supabase
    .rpc('get_subject_target_grade_map', { p_round_ids: roundIds });

  if (mappingError) {
    // RPC doesn't exist yet — fallback to direct query
    return await fetchSubjectTargetGradeMapFallback(roundIds);
  }

  const map: Record<string, number> = {};
  const grades = new Set<number>();
  for (const row of (mappingData ?? []) as { subject_name: string; target_grade: number }[]) {
    map[row.subject_name] = row.target_grade;
    grades.add(row.target_grade);
  }

  return { map, targetGrades: [...grades].sort() };
}

async function fetchSubjectTargetGradeMapFallback(
  roundIds: string[]
): Promise<SubjectTargetGradeMap> {
  const { data, error } = await supabase
    .from('course_selection_group')
    .select(`
      target_grade,
      course_selection_slot (
        course_selection_slot_subject (
          selectable_subject:course_selectable_subject ( name )
        )
      )
    `)
    .in('round_id', roundIds);

  if (error) throw error;

  const map: Record<string, number> = {};
  const grades = new Set<number>();

  for (const group of data ?? []) {
    const tg = group.target_grade;
    if (typeof tg !== 'number') continue;
    grades.add(tg);
    for (const slot of (group as any).course_selection_slot ?? []) {
      for (const ss of slot.course_selection_slot_subject ?? []) {
        const name = ss.selectable_subject?.name;
        if (name) map[name] = tg;
      }
    }
  }

  return { map, targetGrades: [...grades].sort() };
}

export function useSubjectTargetGradeMap(
  academicYear: number | null,
  currentGrade: number
) {
  return useQuery({
    queryKey: ['subject-target-grade-map', academicYear, currentGrade],
    queryFn: () => fetchSubjectTargetGradeMap(academicYear!, currentGrade),
    enabled: !!academicYear && currentGrade > 0,
    staleTime: 5 * 60 * 1000,
  });
}
