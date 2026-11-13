import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleDaily, headers, json } from './handler.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: '로그인이 필요합니다.' }, 401);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } });
  const startedAt = Date.now();
  const logCtx = aiLogContext('academy-daily', 'academy', null, { action: 'daily' });
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return json({ error: '다시 로그인해 주세요.' }, 401);
    logCtx.userId = user.id;
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: '대화가 너무 깁니다.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: '대화 형식을 확인해 주세요.' }, 400); }
    // This client is isolated to atomic daily writes. The handler derives ownership
    // from getUser(); no user id or NPC supplied by the browser is trusted.
    const writer = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
    return await withAiFailureLog(logCtx, await handleDaily(db, writer, user, body, aiLogFetch(logCtx)), startedAt);
  } catch (error) { logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 503 }); return json({ error: '대화를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503); }
});
