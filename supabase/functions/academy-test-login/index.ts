// 별빛 아카데미 단독 사본(orca academy)의 테스트 로그인 (2026-10-04 사용자 요청 — «00-00001 계정으로 실제 데이터 연동»).
//
// 운영 Supabase 의 이메일 로그인은 꺼져 있고 켜지 않는다(사용자 결정 — 켜면 누구나 이메일로 가입할 수 있는데, 새 사용자 트리거가
// 학생 형식이 아닌 이메일에 teacher 역할을 주므로 학생 자료가 열린다). 대신 이 함수가:
//   ① 아이디가 테스트 계정(00-00001) 하나인지, 비밀번호가 서버 비밀값 ACADEMY_TEST_PASSWORD 와 같은지 확인하고
//   ② 맞으면 그 계정의 **일회용 매직링크 토큰**(token_hash)을 발급한다 — 메일은 보내지 않는다(관리 API generate_link).
//   ③ 앱이 supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) 로 바꿔 진짜 세션을 얻는다.
// 이메일 로그인이 꺼진 상태에서도 ②→③ 이 통한다(2026-10-04 실측). 다른 계정의 토큰은 절대 만들지 않는다(이메일 고정).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TEST_LOGIN_ID = '00-00001';
const TEST_EMAIL = 'user369@example.com';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

/** 길이·내용을 한 글자씩 끝까지 비교 — 맞는 앞부분 길이로 비밀번호를 짐작하지 못하게. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('ACADEMY_TEST_PASSWORD');
  if (!secret) return json({ error: '테스트 로그인이 준비되지 않았어요.' }, 503);
  let body: { loginId?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json({ error: '로그인 요청을 확인해 주세요.' }, 400); }
  const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (loginId !== TEST_LOGIN_ID || !sameSecret(password, secret)) {
    await new Promise(r => setTimeout(r, 700)); // 틀린 시도는 늦게 답한다 — 대입 시도를 느리게
    return json({ error: '아이디 또는 비밀번호를 확인해 주세요.' }, 401);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: TEST_EMAIL });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) { console.error('academy-test-login generateLink failed', error?.message); return json({ error: '로그인 토큰을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502); }
  return json({ token_hash: tokenHash, email: TEST_EMAIL });
});
