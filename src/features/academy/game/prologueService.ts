import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { PrologueProgress } from './prologueStory';
type PrologueDatabase = { public: { Tables: { academy_prologues: {
  Row: PrologueProgress; Insert: Partial<PrologueProgress> & { user_id: string }; Update: Partial<PrologueProgress>; Relationships: [];
} }; Views: Record<string, never>; Functions: { save_academy_prologue: { Args: { p_scene_index: number; p_finish?: string | null }; Returns: PrologueProgress } } } };
const db = supabase as unknown as SupabaseClient<PrologueDatabase>;
export async function fetchPrologue(userId: string) {
  const { data, error } = await db.from('academy_prologues').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('이야기의 책갈피를 불러오지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function savePrologue(sceneIndex: number, finish?: 'completed' | 'skipped') {
  const { data, error } = await db.rpc('save_academy_prologue', { p_scene_index: sceneIndex, p_finish: finish ?? null });
  if (error || !data) throw new Error('책갈피를 보관하지 못했어요. 이 장면에서 다시 시도할 수 있어요.');
  return data;
}
