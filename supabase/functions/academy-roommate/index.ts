import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleRoommate, headers, json } from './handler.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: '로그인이 필요해요.' }, 401);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } });
  const startedAt = Date.now();
  const logCtx = aiLogContext('academy-roommate', 'academy', null, { action: 'roommate' });
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return json({ error: '다시 로그인해 주세요.' }, 401);
    logCtx.userId = user.id;
    const raw = await req.text();
    if (raw.length > 12000) return json({ error: '기록이 너무 길어요.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: '기록 형식을 확인해 주세요.' }, 400); }
    const writer = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
    return await withAiFailureLog(logCtx, await handleRoommate(db, writer, user, body, aiLogFetch(logCtx)), startedAt);
  } catch (error) { logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 503 }); return json({ error: '세린의 수첩을 열지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503); }
});
