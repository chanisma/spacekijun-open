import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { DormGoal } from './dormitoryService';

export interface SkyChapterRecord { step: number; revision: number; sky_plan_id: string | null; sky_plan_title: string | null; sky_goal_id: string | null; started_at: string; completed_at: string | null }
export type SkyChapterAction = 'start' | 'next' | 'arrive' | 'light' | 'place';
export interface SkyPlacement { plan_id: string; x: number; y: number; goal_x: number; goal_y: number }
const db = supabase as unknown as SupabaseClient;
export async function writeSkyRegion(region: number, input: { goal?: DormGoal; x?: number; y?: number; name?: string; revision?: number }) {
  const { data, error } = await db.rpc('academy_sky_region_write', {
    p_region: region, p_goal: input.goal?.id ?? null, p_x: input.x ?? .5, p_y: input.y ?? .5,
    p_name: input.name ?? null, p_revision: input.goal?.constellation_revision ?? input.revision ?? 0,
  });
  if (error) throw Error(error.message);
  return data;
}
export async function writeSky(action: 'place_constellation' | 'place_star' | 'set_lines' | 'name', goal: DormGoal, input: { plan?: string; x?: number; y?: number; lines?: [string, string][]; name?: string } = {}): Promise<DormGoal> {
  const { data, error } = await db.rpc('academy_sky_write', { p_action: action, p_goal: goal.id, p_plan: input.plan ?? null, p_x: input.x ?? null, p_y: input.y ?? null, p_lines: input.lines ?? null, p_name: input.name ?? null, p_revision: goal.constellation_revision ?? 0 });
  if (error) throw Error(error.message);
  return data;
}
export async function writeSkyChapter(action: SkyChapterAction, revision: number, record: Partial<SkyPlacement> = {}): Promise<SkyChapterRecord> {
  const { data, error } = await db.rpc('academy_sky_chapter_write', { p_action: action, p_revision: revision, p_record: record });
  if (error) throw Error(error.message);
  return data;
}
