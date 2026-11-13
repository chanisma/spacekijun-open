import { supabase } from '@/integrations/supabase/client';
import type { RescueNote, RescueNoteInput } from '../types/rescueNote';

function mapRow(r: any): RescueNote {
  return {
    id: r.id,
    studentCode: r.student_code,
    noteNo: r.note_no ?? null,
    title: r.title ?? '',
    occurredAt: r.occurred_at,
    endAt: r.end_at ?? null,
    content: r.content,
    remarks: r.remarks ?? null,
    visibility: r.visibility,
    coStudentCodes: (r.co_student_codes as string[] | null) ?? [],
    linkedNoteId: r.linked_note_id ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    meta: r.meta ?? {},
  };
}

export async function listRescueNotes(studentCode: string): Promise<RescueNote[]> {
  const { data, error } = await supabase
    .from('rescue_notes')
    .select('*')
    .eq('student_code', studentCode)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createRescueNote(input: RescueNoteInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_rescue_note_with_companions', {
    p_student_code: input.studentCode,
    p_co_student_codes: input.coStudentCodes ?? [],
    p_occurred_at: input.occurredAt,
    p_content: input.content,
    p_end_at: input.endAt ?? null,
    p_title: input.title ?? '',
    p_remarks: input.remarks ?? null,
    p_visibility: input.visibility,
    p_meta: (input.meta ?? {}) as any,
  } as any);
  if (error) throw error;
  return data as unknown as string;
}

export async function updateRescueNote(
  id: string,
  patch: Partial<Pick<RescueNote, 'occurredAt' | 'endAt' | 'title' | 'remarks' | 'content' | 'visibility' | 'meta'>>
): Promise<RescueNote> {
  const updates: any = { updated_at: new Date().toISOString() };
  if (patch.occurredAt !== undefined) updates.occurred_at = patch.occurredAt;
  if (patch.endAt !== undefined) updates.end_at = patch.endAt;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.remarks !== undefined) updates.remarks = patch.remarks;
  if (patch.content !== undefined) updates.content = patch.content;
  if (patch.visibility !== undefined) updates.visibility = patch.visibility;
  if (patch.meta !== undefined) updates.meta = patch.meta;
  const { data, error } = await supabase
    .from('rescue_notes')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteRescueNote(id: string): Promise<void> {
  const { error } = await supabase.from('rescue_notes').delete().eq('id', id);
  if (error) throw error;
}
