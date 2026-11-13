import { supabase } from '@/integrations/supabase/client';
import type { RescueTagDefinition, RescueTag } from '../types/rescueTag';

export async function listTagDefinitions(): Promise<RescueTagDefinition[]> {
  const { data, error } = await supabase
    .from('rescue_tag_definitions')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    key: r.key,
    label: r.label,
    color: r.color,
    sortOrder: r.sort_order,
    active: r.active,
    description: r.description,
  }));
}

export async function listStudentTags(studentCode: string): Promise<RescueTag[]> {
  const { data, error } = await supabase
    .from('rescue_tags')
    .select('*')
    .eq('student_code', studentCode);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    studentCode: r.student_code,
    tagKey: r.tag_key,
    assignedBy: r.assigned_by,
    assignedAt: r.assigned_at,
    note: r.note,
  }));
}

export async function toggleRescueTag(
  studentCode: string,
  tagKey: string,
  action: 'add' | 'remove'
): Promise<void> {
  const { error } = await supabase.rpc('toggle_rescue_tag', {
    p_student_code: studentCode,
    p_tag_key: tagKey,
    p_action: action,
  });
  if (error) throw error;
}

export async function upsertTagDefinition(def: Omit<RescueTagDefinition, 'active'> & { active?: boolean }): Promise<void> {
  const { error } = await supabase.from('rescue_tag_definitions').upsert({
    key: def.key,
    label: def.label,
    color: def.color,
    sort_order: def.sortOrder,
    description: def.description ?? null,
    active: def.active ?? true,
  });
  if (error) throw error;
}
