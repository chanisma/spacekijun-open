import { supabase } from '@/integrations/supabase/client';
import type { RescueScholarship, RescueScholarshipInput } from '../types/rescueScholarship';

function mapRow(r: any): RescueScholarship {
  return {
    id: r.id,
    studentCode: r.student_code,
    scholarshipNo: r.scholarship_no ?? null,
    name: r.name,
    awardedOn: r.awarded_on,
    remarks: r.remarks ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    meta: r.meta ?? {},
  };
}

export async function listRescueScholarships(studentCode: string): Promise<RescueScholarship[]> {
  const { data, error } = await supabase
    .from('rescue_scholarships')
    .select('*')
    .eq('student_code', studentCode)
    .order('awarded_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createRescueScholarship(input: RescueScholarshipInput): Promise<string> {
  // 번호 생성·권한검사·insert를 한 번에 처리하는 SECURITY DEFINER RPC.
  const { data, error } = await supabase.rpc('create_rescue_scholarship', {
    p_student_code: input.studentCode,
    p_name: input.name,
    p_awarded_on: input.awardedOn,
    p_remarks: input.remarks ?? null,
    p_meta: (input.meta ?? {}) as any,
  } as any);
  if (error) throw error;
  return data as unknown as string;
}

export async function updateRescueScholarship(
  id: string,
  patch: Partial<Pick<RescueScholarship, 'name' | 'awardedOn' | 'remarks' | 'meta'>>
): Promise<RescueScholarship> {
  const updates: any = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.awardedOn !== undefined) updates.awarded_on = patch.awardedOn;
  if (patch.remarks !== undefined) updates.remarks = patch.remarks;
  if (patch.meta !== undefined) updates.meta = patch.meta;
  const { data, error } = await supabase
    .from('rescue_scholarships')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteRescueScholarship(id: string): Promise<void> {
  const { error } = await supabase.from('rescue_scholarships').delete().eq('id', id);
  if (error) throw error;
}
