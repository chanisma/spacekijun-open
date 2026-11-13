/**
 * 새 종 · 창고 · 통신(2026-10-26) — 서버 = 20261027030000_tamagotchi_species_storage_link.sql.
 * 창고 쓰기·알 표 깨우기는 펫 저장소(petService)가 한다(펫 행을 바꾸므로). 여기는 읽기와 통신.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { parseLinks, parseSpecies, type LinkData, type LinkStatus, type SpeciesData } from '../model/link';

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  tama_species_read: { Args: Record<string, never>; Returns: unknown };
  tama_link_read: { Args: Record<string, never>; Returns: unknown };
  tama_link_write: { Args: { p_action: 'offer' | 'accept' | 'decline' | 'cancel'; p_payload: Record<string, unknown> }; Returns: { status?: LinkStatus; first_contact?: boolean; id?: string } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

function unwrap<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export const speciesService = {
  read: async (): Promise<SpeciesData> => parseSpecies(unwrap(await db.rpc('tama_species_read'))),
  links: async (): Promise<LinkData> => parseLinks(unwrap(await db.rpc('tama_link_read'))),
  link: async (action: 'offer' | 'accept' | 'decline' | 'cancel', payload: Record<string, unknown>) =>
    unwrap(await db.rpc('tama_link_write', { p_action: action, p_payload: payload })),
};
