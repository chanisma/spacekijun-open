import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseJourneyInput } from '../_shared/academyJourney.ts';
import { parseDiscoveryInput } from '../_shared/academyDiscovery.ts';
export const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
export async function handleJourney(writer: SupabaseClient, userId: string, raw: unknown) {
  if (raw && typeof raw === 'object' && ['discover', 'tutorial'].includes(String((raw as Record<string, unknown>).action))) {
    try {
      const v = parseDiscoveryInput(raw);
      const { data, error } = v.action === 'tutorial'
        ? await writer.rpc('academy_tutorial_write', { p_user: userId, p_event: v.event })
        : await writer.rpc('academy_discovery_write', { p_user: userId, p_source: v.source, p_revision: v.revision, p_statement: v.statement, p_memory: v.memory });
      if (error) return json({ error: ['P0001', '42501'].includes(error.code) ? error.message : '기록을 저장하지 못했어요.' }, error.code === '42501' ? 403 : 409);
      return json({ [v.action === 'tutorial' ? 'tutorial' : 'discovery']: data });
    } catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  let input: ReturnType<typeof parseJourneyInput>;
  try { input = parseJourneyInput(raw); } catch(e) { return json({ error: (e as Error).message },400); }
  const { data, error } = await writer.rpc('academy_journey_transition', { p_user: userId, p_action: input.action, p_revision: input.revision, p_design: input.designId, p_reflection: input.reflection });
  if (error) return json({ error: error.code === 'P0001' || error.code === '42501' ? error.message : '의뢰 기록을 저장하지 못했어요. 다시 시도해 주세요.' }, error.code === '42501' ? 403 : 409);
  return json({ journey: data });
}
