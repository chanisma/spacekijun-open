import { supabase } from '@/integrations/supabase/client';
import type { RescueStudentStatus, RescueStatusHistoryEntry } from '../types/rescueStatus';
import type { RescueStatus } from '../constants';

export async function getStudentStatus(studentCode: string): Promise<RescueStudentStatus | null> {
  const { data, error } = await supabase
    .from('rescue_student_status')
    .select('*')
    .eq('student_code', studentCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    studentCode: data.student_code,
    status: data.status,
    updatedBy: data.updated_by,
    updatedAt: data.updated_at,
    reason: data.reason,
  };
}

export async function setStudentStatus(
  studentCode: string,
  status: RescueStatus,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc('set_rescue_status', {
    p_student_code: studentCode,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function listStatusHistory(studentCode: string): Promise<RescueStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('rescue_status_history')
    .select('*')
    .eq('student_code', studentCode)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    studentCode: r.student_code,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
    reason: r.reason,
  }));
}
