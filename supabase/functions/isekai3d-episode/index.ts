import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleIsekai3dEpisode, headers, json } from './handler.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';

// 이세계 사회인 직장 에피소드 (2026-10-25) — 설계 handler.ts 머리말과 _shared/isekai3dEpisode.ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: '로그인이 필요합니다.' }, 401);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
  });
  const startedAt = Date.now();
  const logCtx = aiLogContext('isekai3d-episode', 'isekai3d', null, { action: 'isekai3d-episode' });
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return json({ error: '다시 로그인해 주세요.' }, 401);
    logCtx.userId = user.id;
    const raw = await req.text();
    if (raw.length > 8_000) return json({ error: '요청이 너무 깁니다.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return json({ error: '요청 형식을 확인해 주세요.' }, 400); }
    // 쓰기 RPC(isekai3d_episode_add) 전용. 소유자는 getUser() 에서만 온다.
    const writer = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return await withAiFailureLog(logCtx, await handleIsekai3dEpisode(db, writer, user, body, aiLogFetch(logCtx)), startedAt);
  } catch (error) {
    logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 503 });
    return json({ error: '이야기를 만들지 못했어요. 잠시 후 다시 해 주세요.' }, 503);
  }
});
