import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { canAdvance, type GameProgress, type QuestStep } from './progress';

// Isolated schema slice until the project's generated client is regenerated.
type GameDatabase = { public: { Tables: { academy_game_progress: {
  Row: GameProgress;
  Insert: GameProgress;
  Update: Partial<GameProgress>;
  Relationships: [];
} }; Views: Record<string, never>; Functions: Record<string, never> } };
const db = supabase as unknown as SupabaseClient<GameDatabase>;

export async function fetchGameProgress(userId: string) {
  const { data, error } = await db.from('academy_game_progress').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('여행 기록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  return data;
}

export async function advanceGameProgress(userId: string, current: GameProgress | null, next: QuestStep, activityId = current?.activity_id ?? null, question = current?.question ?? '') {
  if (!canAdvance(current?.quest_step, next, activityId, question)) throw new Error('의뢰의 다음 단계를 먼저 확인해 주세요.');
  const row: GameProgress = { user_id: userId, quest_step: next, activity_id: activityId, question: question.trim(), updated_at: new Date().toISOString() };
  // Compare the previous step so a stale tab cannot overwrite newer progress.
  const result = current
    ? await db.from('academy_game_progress').update(row).eq('user_id', userId).eq('quest_step', current.quest_step).select().maybeSingle()
    : await db.from('academy_game_progress').insert(row).select().single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) {
    const latest = await fetchGameProgress(userId);
    if (latest) return latest;
  }
  if (result.error || !result.data) throw new Error('기록을 저장하지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.');
  return result.data;
}
