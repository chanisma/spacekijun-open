import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleAcademyInterview } from '../openai-proxy/academyInterview.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: '로그인이 필요합니다.' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } });
  const startedAt = Date.now();
  const logCtx = aiLogContext('academy-interview', 'academy', null, { action: 'interview' });
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return json({ error: '다시 로그인해 주세요.' }, 401);
    logCtx.userId = user.id;
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const text = await req.text();
    if (text.length > 20000) return json({ error: '면담 내용이 너무 깁니다.' }, 413);
    const input = JSON.parse(text);
    if (!input || (profile?.role === 'student' ? input.studentId !== user.email?.split('@')[0] : !['teacher','admin'].includes(profile?.role) || input.academyExperience !== true || input.studentId !== '00-00001')) return json({ error: '게임 면담에서는 본인의 학생 자료만 사용할 수 있습니다.' }, 403);
    logCtx.action = typeof input.mode === 'string' ? `interview.${input.mode}` : 'interview';
    logCtx.studentId = typeof input.studentId === 'string' ? input.studentId : null;
    const response = await withAiFailureLog(logCtx, await handleAcademyInterview(db, input, 'solar-pro4', aiLogFetch(logCtx)), startedAt);
    if (response.ok && input.academyExperience === true && profile?.role !== 'student') {
      const result=await response.clone().json();
      const saved=await db.rpc('academy_experience_write',{p_kind:'interview',p_data:{input,result},p_id:null});
      if(saved.error) return json({error:'면담 결과를 내 체험 기록에 보관하지 못했어요.'},503);
    }
    return response;
  } catch (error) { logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 503 }); return json({ error: '면담을 준비하지 못했어요. 다시 시도해 주세요.' }, 503); }
});
