import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AssessmentKind, RoommateConversation, RoommateState, SelfAssessment } from '../../../../supabase/functions/_shared/academyRoommate';

const db = supabase as unknown as SupabaseClient;
export async function fetchRoommate(studentCode: string | null = null): Promise<RoommateState> {
  const { data, error } = await db.rpc('academy_roommate_read', { p_student_code: studentCode });
  if (error || !data) throw Error('세린의 수첩을 불러오지 못했어요. 다시 펼쳐 주세요.');
  return data;
}
async function write(body: Record<string, unknown>) {
  const { data, error } = await db.functions.invoke('academy-roommate', { body });
  if (error) {
    let message = '기록을 이어가지 못했어요. 작성한 내용으로 다시 시도해 주세요.';
    if (error.context instanceof Response) { try { const payload = await error.context.clone().json(); if (typeof payload.error === 'string') message = payload.error; } catch { /* Keep fallback. */ } }
    throw Error(message);
  }
  if (!data || data.error) throw Error(data?.error || '수첩을 다시 펼쳐 주세요.');
  return data;
}
export async function saveSelfAssessment(kind: AssessmentKind, answers: Record<string, number>, requestId: string): Promise<SelfAssessment> {
  return (await write({ action: 'assessment', kind, answers, requestId })).assessment;
}
export async function continueRoommate(day: string, revision: number, message: string | null): Promise<RoommateConversation> {
  return (await write({ action: 'daily', day, revision, message })).conversation;
}
export async function deleteSelfAssessment(id: string) {
  const { error } = await db.from('academy_self_assessments').delete().eq('id', id);
  if (error) throw Error('검사 기록을 지우지 못했어요.');
}
