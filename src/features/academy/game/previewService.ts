import { supabase } from '@/integrations/supabase/client';

export async function searchPreviewStudents(role: string | undefined, search: string, signal: AbortSignal) {
  if (role !== 'admin') throw new Error('관리자만 학생 미리보기를 선택할 수 있습니다.');
  const text = search.trim().slice(0, 50);
  if (text.length < 2) return [];
  const pattern = `%${text.replace(/[\\%_]/g, value => `\\${value}`)}%`;
  // Separate column filters keep user text out of PostgREST's OR expression syntax.
  // The normal authenticated client retains the administrator's existing RLS scope.
  const results = await Promise.all(['id', 'name'].map(column => supabase.from('student_basic_info')
    .select('id, name, grade, class_num').ilike(column, pattern).order('id').limit(12).abortSignal(signal)));
  const students = new Map<string, { id: string; name: string; grade: number | null; class_num: number | null }>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data ?? []) if (row.name) students.set(row.id, { ...row, name: row.name });
  }
  return [...students.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 12);
}
