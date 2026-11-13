import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleNpc, npcHeaders, npcJson } from './handler.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: npcHeaders });
  if (req.method !== 'POST') return npcJson({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return npcJson({ error: '로그인이 필요합니다.' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } });
  const startedAt = Date.now();
  const logCtx = aiLogContext('academy-npc', 'academy', null, { action: 'npc' });
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return npcJson({ error: '다시 로그인해 주세요.' }, 401);
    logCtx.userId = user.id;
    const text = await req.text();
    if (text.length > 22_000) return npcJson({ error: '대화가 너무 깁니다.' }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return npcJson({ error: '대화 형식을 확인해 주세요.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return npcJson({ error: '대화 형식을 확인해 주세요.' }, 400);
    return await withAiFailureLog(logCtx, await handleNpc(db, user.id, body as Record<string, unknown>, aiLogFetch(logCtx)), startedAt);
  } catch (error) { logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 503 }); return npcJson({ error: '대화를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503); }
});
