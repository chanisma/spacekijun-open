import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleInterviewPrep, headers, json } from './handler.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';

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
  const logCtx = aiLogContext('interview-prep', 'interview-prep', null, { action: 'interview-prep' });
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return json({ error: '다시 로그인해 주세요.' }, 401);
    logCtx.userId = user.id;
    const raw = await req.text();
    // 답변 상한 6,000자 + 여유. 본문 길이를 먼저 막지 않으면 파싱 전에 메모리를 쓴다.
    if (raw.length > 16_000) return json({ error: '답변이 너무 깁니다.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return json({ error: '요청 형식을 확인해 주세요.' }, 400); }
    // 이 클라이언트는 원자적 쓰기 RPC 전용이다. 소유자는 getUser() 에서만 오고,
    // 브라우저가 보낸 user id·학적 코드는 어느 것도 신뢰하지 않는다.
    const writer = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const mode = (body as { mode?: unknown } | null)?.mode;
    if (typeof mode === 'string') logCtx.action = `interview-prep.${mode}`;
    return await withAiFailureLog(logCtx, await handleInterviewPrep(db, writer, user, body, aiLogFetch(logCtx)), startedAt);
  } catch (error) {
    logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 503 });
    return json({ error: '면접 준비를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
});
