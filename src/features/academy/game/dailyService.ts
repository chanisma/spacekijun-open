import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { DailyConversation, DailyState } from '../../../../supabase/functions/_shared/academyDaily';

const db = supabase as unknown as SupabaseClient;
export async function fetchDailyState(): Promise<DailyState> {
  const { data, error } = await db.rpc('academy_daily_state');
  if (error) throw error;
  return data;
}
export async function fetchDailyHistory(userId: string): Promise<DailyConversation[]> {
  const { data, error } = await db.from('academy_daily_conversations').select('user_id,day,npc,question,status,turns,revision,lease_until,pending_message').eq('user_id', userId).order('day', { ascending: false }).limit(60);
  if (error) throw error;
  return data ?? [];
}
export async function continueDaily(day: string, revision: number, message: string | null): Promise<DailyConversation> {
  const { data, error } = await db.functions.invoke('academy-daily', { body: { day, revision, message } });
  if (error) {
    let text = '대화를 이어가지 못했어요. 다시 시도해 주세요.';
    if (error.context instanceof Response) { try { const body = await error.context.clone().json(); if (typeof body.error === 'string') text = body.error; } catch { /* retain fallback */ } }
    throw new Error(text);
  }
  if (!data?.conversation) throw new Error('대화 기록을 다시 불러와 주세요.');
  return data.conversation;
}
