import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseDailyReply } from '../_shared/academyDaily.ts';
import { luonEncouragementThemes, luonEncouragementVoice } from './voice.ts';

export const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
export async function handleEncouragement(db: SupabaseClient, writer: SupabaseClient, user: Pick<User, 'id'>, aiFetch: typeof fetch = fetch) {
  const { data: profile, error } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error) return json({ error: '계정을 확인하지 못했어요.' }, 503);
  if (!['student','teacher','admin'].includes(profile?.role)) return json({ error: '학생 본인만 오늘의 격려를 받을 수 있어요.' }, 403);
  const { data: claim, error: claimError } = await writer.rpc('academy_encouragement_claim', { p_user: user.id });
  if (claimError) return json({ error: '루온의 편지를 다시 열어 주세요.' }, 409);
  if (!claim.claimed) return json({ entry: claim.entry });
  const finish = (message: string | null) => writer.rpc('academy_encouragement_finish', { p_user: user.id, p_day: claim.entry.day, p_token: claim.token, p_message: message });
  try {
    const key = Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY');
    if (!key) throw Error('AI unavailable');
    const { data: state, error: readError } = await db.rpc('academy_encouragement_read');
    if (readError) throw readError;
    const themes = luonEncouragementThemes;
    const theme = themes[crypto.getRandomValues(new Uint32Array(1))[0] % themes.length];
    const response = await aiFetch('https://api.upstage.ai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ model: 'solar-pro4', reasoning_effort: 'none', max_tokens: 900, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: luonEncouragementVoice },
      { role: 'user', content: JSON.stringify({ day: claim.entry.day, theme, previous: state.entries.filter((e: { day: string; message: string | null }) => e.day !== claim.entry.day && e.message).slice(0, 3).map((e: { day: string; message: string }) => ({ day: e.day, message: e.message })) }) },
    ] }) });
    if (!response.ok) throw Error('Provider unavailable');
    const payload = await response.json();
    if (payload.choices?.[0]?.finish_reason === 'length') throw Error('Incomplete reply');
    const reply = parseDailyReply(JSON.parse(payload.choices?.[0]?.message?.content));
    const result = await finish(reply);
    if (result.error) throw result.error;
    return json({ entry: result.data });
  } catch {
    const { data } = await finish(null);
    return json({ error: '말을 전하려다 잠시 연결이 끊겼어요. 준비되면 다시 불러 주세요.', entry: data }, 502);
  }
}
