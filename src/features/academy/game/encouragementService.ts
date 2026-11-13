import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
export interface Encouragement { day: string; message: string | null; status: 'generating' | 'ready' | 'failed'; lease_until: string | null }
export interface EncouragementState { day: string; entries: Encouragement[] }
const db = supabase as unknown as SupabaseClient;
export async function fetchEncouragement(studentCode: string | null): Promise<EncouragementState> {
  const { data, error } = await db.rpc('academy_encouragement_read', { p_student_code: studentCode });
  if (error) throw new Error('루온의 격려를 불러오지 못했어요.');
  return data;
}
export async function generateEncouragement(): Promise<Encouragement> {
  const { data, error } = await db.functions.invoke('academy-encouragement', { body: {} });
  if (error || !data?.entry) throw new Error('루온의 말이 잠시 끊겼어요. 다시 불러 주세요.');
  return data.entry;
}
