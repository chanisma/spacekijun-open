/**
 * 교실 기기 QR 세팅 — Edge Function `classroom-link` 핸들러 회귀 (2026-10-13)
 *
 * 네트워크 없이 fetcher 를 바꿔 끼워 돌린다. 지키는 것:
 *  - 교사 동작은 정해 둔 웹 출처에서만, 기기 동작에는 CORS 를 붙이지 않는다
 *  - 드라이브가 든 프리셋은 «같은 클라이언트·같은 교사·드라이브 범위» 구글 토큰이 있어야 승인된다
 *  - 승인이 실패하면 막 만든 스페이스기전 세션을 지운다, 응답에 토큰이 실리지 않는다
 *
 *   npx tsx scripts/classroom-link-test/handler.mts
 */
// @ts-expect-error — 순수 JS 모듈(Deno 함수)이라 타입이 없다
import { createHandler, GOOGLE_CLIENT_ID } from '../../supabase/functions/classroom-link/handler.js';

let fails = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
};

const ORIGIN = 'https://spacekijun.lovable.app';
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'teacher@myschool.hs.kr', email_confirmed_at: '2026-01-01' };
const PRESET = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE_KEY = 'k'.repeat(43);
const CODE = 'c'.repeat(24);
const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const ACCESS = `h.${b64({ session_id: SESSION_ID })}.s`;

type Call = { url: string; body?: any };
function setup(opts: { items?: any[]; tokeninfo?: any; user?: any; approveError?: string } = {}) {
  const calls: Call[] = [];
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status });
  const fetcher = async (url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/auth/v1/user')) return json(200, opts.user ?? USER);
    if (url.includes('/rest/v1/classroom_preset')) return json(200, [{ items: opts.items ?? [] }]);
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) return json(200, opts.tokeninfo ?? {});
    if (url.endsWith('/auth/v1/admin/generate_link')) return json(200, { id: USER.id, hashed_token: 'h' });
    if (url.endsWith('/auth/v1/verify')) return json(200, { user: { id: USER.id }, access_token: ACCESS, refresh_token: 'r', expires_in: 3600 });
    if (url.endsWith('/rpc/classroom_link_approve') && opts.approveError) {
      return new Response(JSON.stringify({ message: opts.approveError }), { status: 400 });
    }
    if (url.includes('/rest/v1/rpc/')) return json(200, { status: 'ok' });
    return json(404, {});
  };
  const handler = createHandler({ url: 'https://x.supabase.co', anonKey: 'anon', serviceKey: 'service' }, fetcher, () => 0);
  const send = (body: object, headers: Record<string, string> = {}) =>
    handler(new Request('https://x/functions/v1/classroom-link', { method: 'POST', body: JSON.stringify(body), headers }));
  return { calls, send, handler };
}
const teacherHeaders = { Origin: ORIGIN, Authorization: 'Bearer user-jwt' };
const goodToken = { aud: GOOGLE_CLIENT_ID, email: USER.email, scope: 'https://www.googleapis.com/auth/drive.file', expires_in: '3500' };

console.log('① 기기 동작');
{
  const t = setup();
  const res = await t.send({ action: 'start', device_key: DEVICE_KEY, name: '  2-3 교실 ', platform: 'windows' });
  const call = t.calls.find(c => c.url.endsWith('/rpc/classroom_link_start'));
  check('start → RPC 에 키가 아니라 sha256 을 넘긴다', /^[0-9a-f]{64}$/.test(call?.body?.p_key_hash) && !JSON.stringify(call?.body).includes(DEVICE_KEY));
  check('기기 이름 앞뒤 공백 제거', call?.body?.p_name === '2-3 교실');
  check('기기 응답에는 CORS 가 없다', res.status === 200 && !res.headers.get('Access-Control-Allow-Origin'));
  check('짧은 기기 키 거절', (await t.send({ action: 'poll', device_key: 'short', code: CODE })).status === 400);
  check('모르는 플랫폼 거절', (await t.send({ action: 'start', device_key: DEVICE_KEY, name: 'a', platform: 'ios' })).status === 400);
}

console.log('② 교사 동작은 스페이스기전 웹에서만');
{
  const t = setup();
  check('출처 없음 → 403', (await t.send({ action: 'inspect', code: CODE }, { Authorization: 'Bearer x' })).status === 403);
  check('다른 출처 → 403', (await t.send({ action: 'inspect', code: CODE }, { Origin: 'https://evil.example', Authorization: 'Bearer x' })).status === 403);
  const pre = await t.handler(new Request('https://x', { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
  check('사전 요청 → 200 + 그 출처만', pre.status === 200 && pre.headers.get('Access-Control-Allow-Origin') === ORIGIN);
  const ok = await t.send({ action: 'inspect', code: CODE }, teacherHeaders);
  check('inspect → RPC 에 확인된 사용자 id', ok.status === 200 && t.calls.some(c => c.body?.p_user === USER.id));
}

console.log('③ 드라이브 프리셋 승인');
{
  const items = [{ kind: 'drive', id: 'abcdefghijkl', name: '수업.pptx' }];
  let t = setup({ items });
  check('구글 토큰 없으면 거절', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET }, teacherHeaders)).status === 400);

  t = setup({ items, tokeninfo: { ...goodToken, aud: 'other-client' } });
  check('다른 클라이언트의 토큰 거절', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 400);

  t = setup({ items, tokeninfo: { ...goodToken, email: 'someone@myschool.hs.kr' } });
  check('다른 사람의 토큰 거절', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 400);

  t = setup({ items, tokeninfo: { ...goodToken, scope: 'https://www.googleapis.com/auth/calendar' } });
  check('드라이브 범위 없는 토큰 거절', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 400);

  t = setup({ items, tokeninfo: { ...goodToken, scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/calendar' } });
  await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders);
  check('클래스룸 범위는 기기에 넘기고 그 밖(캘린더)은 뺀다',
    t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'))?.body?.p_secrets?.google?.scope
      === 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/classroom.courses.readonly');

  t = setup({ items, tokeninfo: { ...goodToken, scope: 'https://www.googleapis.com/auth/classroom.courses.readonly' } });
  check('클래스룸 범위만 있고 드라이브가 없으면 거절', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 400);

  t = setup({ items, tokeninfo: { ...goodToken, expires_in: '100' } });
  check('곧 만료될 토큰 거절', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 400);

  t = setup({ items, tokeninfo: goodToken });
  const res = await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders);
  const approve = t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'));
  check('승인 → 200', res.status === 200);
  check('구글 토큰이 handoff 로', approve?.body?.p_secrets?.google?.access_token === 'g'.repeat(40));
  check('스페이스기전 화면이 없으면 세션을 만들지 않는다', !t.calls.some(c => c.url.endsWith('generate_link')) && approve?.body?.p_space_session === null);
}

console.log('④ 스페이스기전 화면 프리셋');
{
  const items = [{ kind: 'space', path: '/timetable' }];
  let t = setup({ items });
  let res = await t.send({ action: 'approve', code: CODE, preset_id: PRESET }, teacherHeaders);
  const approve = t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'));
  check('세션을 만들어 handoff 로', res.status === 200 && approve?.body?.p_secrets?.space_session?.refresh_token === 'r');
  check('세션 id 를 함께 기록(끝날 때 서버가 끊는다)', approve?.body?.p_space_session === SESSION_ID);

  t = setup({ items, approveError: 'link_expired' });
  res = await t.send({ action: 'approve', code: CODE, preset_id: PRESET }, teacherHeaders);
  const text = await res.text();
  check('QR 만료 → 409 link_expired', res.status === 409 && text.includes('link_expired'));
  check('승인 실패 → 막 만든 세션을 지운다', t.calls.some(c => c.url.endsWith('/rpc/classroom_link_revoke') && c.body?.p_session === SESSION_ID));
  check('오류 응답에 토큰이 없다', !text.includes(ACCESS) && !text.includes('"r"'));

  t = setup({ items, user: { ...USER, factors: [{ status: 'verified' }] } });
  check('MFA 계정은 이메일 세션을 만들지 않는다', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET }, teacherHeaders)).status === 403);
}

console.log('⑤ 드라이브 다시 연결 QR');
{
  let t = setup();
  await t.send({ action: 'start', device_key: DEVICE_KEY, name: '2-3', platform: 'windows', purpose: 'drive' });
  check('start 에 목적(drive)을 넘긴다', t.calls.find(c => c.url.endsWith('/rpc/classroom_link_start'))?.body?.p_purpose === 'drive');
  check('모르는 목적 거절', (await t.send({ action: 'start', device_key: DEVICE_KEY, name: '2-3', platform: 'windows', purpose: 'x' })).status === 400);

  t = setup({ tokeninfo: goodToken });
  check('세팅 없는 승인은 구글 토큰이 꼭 있어야', (await t.send({ action: 'approve', code: CODE }, teacherHeaders)).status === 400);
  const res = await t.send({ action: 'approve', code: CODE, google_token: 'g'.repeat(40) }, teacherHeaders);
  const approve = t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'));
  check('세팅 없이 승인 → RPC 에 preset null', res.status === 200 && approve?.body?.p_preset_id === null);
  check('토큰 범위를 기기에 넘긴다', approve?.body?.p_secrets?.google?.scope === 'https://www.googleapis.com/auth/drive.file');
  check('세팅 조회를 하지 않는다', !t.calls.some(c => c.url.includes('/rest/v1/classroom_preset')));

  t = setup({ items: [{ kind: 'url', url: 'https://a.b' }], tokeninfo: goodToken });
  await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders);
  check('드라이브 항목이 없어도 보낸 토큰은 넘긴다(독의 «내 드라이브»)',
    !!t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'))?.body?.p_secrets?.google);

  t = setup({ items: [{ kind: 'url', url: 'https://a.b' }], tokeninfo: { ...goodToken, aud: 'x' } });
  check('드라이브 항목이 없으면 잘못된 토큰은 버리고 승인', (await t.send({ action: 'approve', code: CODE, preset_id: PRESET, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 200
    && !t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'))?.body?.p_secrets?.google);

  t = setup({ tokeninfo: goodToken, approveError: 'not_session_teacher' });
  check('수업 교사가 아니면 403', (await t.send({ action: 'approve', code: CODE, google_token: 'g'.repeat(40) }, teacherHeaders)).status === 403);
}

console.log('⑥ 구글 로그인 보관(A+)');
{
  let t = setup({ items: [{ kind: 'url', url: 'https://a.b' }] });
  await t.send({ action: 'approve', code: CODE, preset_id: PRESET }, teacherHeaders);
  check('기본 = 보관', t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'))?.body?.p_secrets?.keep_profile === true);
  t = setup({ items: [{ kind: 'url', url: 'https://a.b' }] });
  await t.send({ action: 'approve', code: CODE, preset_id: PRESET, keep_google: false }, teacherHeaders);
  check('끄면 keep_profile=false', t.calls.find(c => c.url.endsWith('/rpc/classroom_link_approve'))?.body?.p_secrets?.keep_profile === false);
  t = setup();
  const res = await t.send({ action: 'forget_profile', device_key: DEVICE_KEY, code: CODE });
  const call = t.calls.find(c => c.url.endsWith('/rpc/classroom_profile_forget'));
  check('기기의 «지우기» → forget RPC(키 해시·code)', res.status === 200 && /^[0-9a-f]{64}$/.test(call?.body?.p_key_hash) && call?.body?.p_code === CODE);
}

console.log('⑦ 휴대폰으로 구글 비밀번호 입력(암호문만 오간다)');
{
  const PUB = 'B'.repeat(87);
  let t = setup();
  let res = await t.send({ action: 'type_start', device_key: DEVICE_KEY, code: CODE, device_pub: PUB });
  const start = t.calls.find(c => c.url.endsWith('/rpc/classroom_type_start'));
  check('기기: 수업 코드·공개키로 start', res.status === 200 && start?.body?.p_session_code === CODE && start?.body?.p_device_pub === PUB);
  check('기기 동작엔 CORS 없음', !res.headers.get('Access-Control-Allow-Origin'));
  t = setup();
  check('공개키 모양이 이상하면 400', (await t.send({ action: 'type_start', device_key: DEVICE_KEY, code: CODE, device_pub: 'x y' })).status === 400);
  t = setup();
  const payload = { epk: 'E'.repeat(87), iv: 'I'.repeat(16), ct: 'C'.repeat(40) };
  res = await t.send({ action: 'type_submit', code: CODE, payload: { ...payload, password: 'should-not-pass' } }, teacherHeaders);
  const submit = t.calls.find(c => c.url.endsWith('/rpc/classroom_type_submit'));
  check('휴대폰: 암호문 세 칸만 맡긴다(다른 칸은 버린다)',
    res.status === 200 && JSON.stringify(submit?.body?.p_payload) === JSON.stringify(payload) && submit?.body?.p_user === USER.id);
  t = setup();
  check('출처가 다르면 거절', (await t.send({ action: 'type_submit', code: CODE, payload }, { Origin: 'https://evil.example', Authorization: 'Bearer x' })).status === 403);
  t = setup();
  check('평문만 보내면 400', (await t.send({ action: 'type_submit', code: CODE, payload: { password: 'pw' } }, teacherHeaders)).status === 400);
  t = setup({ user: {} });
  check('로그인 안 하면 401', (await t.send({ action: 'type_submit', code: CODE, payload }, teacherHeaders)).status === 401);
}

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 모두 통과');
process.exit(fails ? 1 : 0);
