import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AcademyJourney } from '../../../../supabase/functions/_shared/academyJourney';
import type { SelfDiscovery, TutorialState } from '../../../../supabase/functions/_shared/academyDiscovery';
export interface GrowthState { journey: AcademyJourney | null; discoveries: SelfDiscovery[]; tutorial: TutorialState | null; hasNewsNote: boolean; hasSelfUnderstanding?: boolean }
const db = supabase as unknown as SupabaseClient;
export async function fetchGrowth(userId: string): Promise<GrowthState> {
  const rows = await Promise.all([
    db.from('academy_journeys').select('*').eq('user_id', userId).maybeSingle(),
    db.from('academy_self_discoveries').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    Promise.resolve({ data: null, error: null }),
    db.from('academy_self_assessments').select('id').eq('user_id', userId).limit(1),
    db.from('academy_roommate_conversations').select('question').eq('user_id', userId).not('question','is',null).limit(1),
    db.from('world_news_inquiries').select('news_id').eq('user_id', userId).limit(1),
  ]);
  for (const row of rows) if (row.error) throw row.error;
  return { journey: rows[0].data ? { ...rows[0].data, design_id: rows[0].data.trial_design_id ? `trial:${rows[0].data.trial_design_id}` : rows[0].data.design_id } : null, discoveries: rows[1].data ?? [], tutorial: rows[2].data, hasNewsNote: !!rows[5].data?.length, hasSelfUnderstanding: !!rows[3].data?.length || !!rows[4].data?.length };
}
export async function writeGrowth(body: Record<string, unknown>): Promise<{ journey?: AcademyJourney; discovery?: SelfDiscovery; tutorial?: TutorialState }> {
  const { data, error } = await db.functions.invoke('academy-journey', { body: { ...body, designId: typeof body.designId === 'string' ? body.designId.replace(/^trial:/, '') : body.designId } });
  if (error) {
    let message = '기록을 보관하지 못했어요. 작성한 내용으로 다시 시도해 주세요.';
    if (error.context instanceof Response) { try { const r = await error.context.clone().json(); if (typeof r.error === 'string') message = r.error; } catch { /* retain fallback */ } }
    throw Error(message);
  }
  if (!data || data.error) throw Error(data?.error ?? '보관한 기록을 확인하지 못했어요.');
  return data;
}
/**
 * 연속 탐구 쓰기(리아가 도서관에서 찾은 질문으로 이어 가는 연구) — 연구 수첩에서 바로 RPC 로 (2026-10-04, `academy_journey_write`).
 * start → observe(활동) → complete(회고) · abandon(어느 단계든 지우기). 사람은 서버가 auth.uid() 로 정한다.
 */
export async function writeJourney(action: 'start' | 'observe' | 'complete' | 'abandon', revision: number, extra: { activityId?: string; reflection?: string } = {}) {
  const { data, error } = await db.rpc('academy_journey_write', { p_action: action, p_revision: revision, p_activity: extra.activityId ?? null, p_reflection: extra.reflection ?? null });
  if (error) throw Error(error.message || '연속 탐구를 보관하지 못했어요. 다시 시도해 주세요.');
  return data as Record<string, unknown>;
}
