// MCP 전자서명 문서 받기 · 요청 만들기 (2026-10-25) — 도구 get_sign_file · create_sign_request 가 **에이전트 토큰을 그대로 실어** 이 함수를 부른다.
//   op 없음(받기)  = mcp_sign_file_target 이 정한 경로에 받기 주소
//   op 'create'   = mcp_create_sign_request(사용자 토큰)가 요청을 만들고 돌려준 두 경로로만 원본을 복사한다
//                   (task-work-documents/<나>/runs/<실행>/… → signatures/<요청>/source.hwpx). 복사가 실패하면 요청을 취소한다.
//
// ⚠️ 저장소(Storage)에 닿는 것만 service_role 이다(에이전트 토큰은 저장소가 막혀 있다 — mcp-docgen 과 같은 규약).
//    **무엇을 받을지는 사용자 토큰으로 부른 RPC `mcp_sign_file_target` 이 정한다**(그 사람이 볼 수 있는 요청의 원본·완성본,
//    경로 첫 세그먼트 = 요청 id 까지 RPC 가 확인한다). 요청은 경로를 고를 수 없다. 일반 로그인 토큰은 받지 않는다.
// 동작은 Node 회귀(scripts/mcp-agent-test/sign-file.mts)가 같은 파일을 부른다.

import { jwtClientId } from '../_shared/agentToken.js';

const BUCKET = 'signatures';
const DOCGEN_BUCKET = 'task-work-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOWNLOAD_TTL_SECONDS = 15 * 60;

class UserError extends Error {}

/** 받을 파일 이름 — 원본 이름을 살리고, 완성본이면 «(서명 완료)»를 붙인다 */
export function downloadName(fileName, title, which) {
  const raw = String(fileName || title || '문서').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || '문서';
  if (which !== 'signed') return raw.slice(0, 150);
  const dot = raw.lastIndexOf('.');
  return (dot > 0 ? `${raw.slice(0, dot)} (서명 완료)${raw.slice(dot)}` : `${raw} (서명 완료)`).slice(0, 150);
}

export function createSignFileHandler(env, { fetcher = fetch } = {}) {
  const base = env.url.replace(/\/$/, '');
  const svc = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };
  const json = (status, value) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

  async function userRpc(token, fn, args) {
    const res = await fetcher(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args ?? {}),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) throw new UserError((body && typeof body === 'object' && body.message) || `요청이 실패했습니다 (${res.status}).`);
    return body;
  }

  async function signedUrl(path, fileName) {
    const res = await fetcher(`${base}/storage/v1/object/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: DOWNLOAD_TTL_SECONDS }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`storage sign ${res.status}`);
    const { signedURL } = await res.json();
    return `${base}/storage/v1${signedURL}${signedURL.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;
  }

  async function verify(request) {
    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    let clientId = null;
    try { clientId = jwtClientId(token); } catch { clientId = null; }
    if (!clientId) return null; // 에이전트 토큰만
    const res = await fetcher(`${base}/auth/v1/user`, {
      headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!res?.ok) return null;
    const user = await res.json().catch(() => null);
    return user?.id && UUID.test(user.id) ? { token, userId: user.id.toLowerCase() } : null;
  }

  const storagePath = (bucket, path) => `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;

  /** 요청 만들기 — RPC 가 요청을 만들고 복사할 두 경로를 정한다. 여기는 그 경로의 모양만 다시 보고 옮긴다 */
  async function create(auth, body) {
    const args = body.args ?? {};
    const out = await userRpc(auth.token, 'mcp_create_sign_request', args);
    if (!out?.saved) return out;
    const id = String(out.request_id || '').toLowerCase();
    const runId = String(args.p_run_id || '').toLowerCase();
    if (!UUID.test(id) || out.copy_to !== `${id}/source.hwpx`
        || typeof out.copy_from !== 'string' || !out.copy_from.startsWith(`${auth.userId}/runs/${runId}/`) || out.copy_from.includes('..')) {
      throw new Error('create path shape');
    }
    try {
      const got = await fetcher(storagePath(DOCGEN_BUCKET, out.copy_from), { headers: svc, signal: AbortSignal.timeout(20000) });
      if (!got.ok) throw new Error(`storage get ${got.status}`);
      const bytes = new Uint8Array(await got.arrayBuffer());
      const put = await fetcher(storagePath(BUCKET, out.copy_to), {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/haansofthwpx', 'x-upsert': 'true' },
        body: bytes,
        signal: AbortSignal.timeout(20000),
      });
      if (!put.ok) throw new Error(`storage put ${put.status}`);
    } catch (e) {
      // 원본 없는 요청은 열 수 없는 껍데기다 — 웹과 같이 취소한다
      await userRpc(auth.token, 'mcp_cancel_sign_request', { p_kind: 'signature', p_request_id: id }).catch(() => {});
      throw e;
    }
    const { copy_from: _f, copy_to: _t, ...rest } = out;
    return rest;
  }

  return async (request) => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const auth = await verify(request);
    if (!auth) return json(401, { error: 'MCP 에이전트 토큰이 필요합니다.' });
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'JSON 을 읽을 수 없습니다.' }); }
    if (body?.op === 'create') {
      try {
        return json(200, await create(auth, body));
      } catch (e) {
        if (e instanceof UserError) return json(422, { error: e.message });
        console.error('mcp-sign create', e?.message ?? e);
        return json(500, { error: '서명 요청을 만들지 못했습니다(원본 복사 실패 — 요청은 취소했습니다). 잠시 뒤 다시 시도해 주세요.' });
      }
    }
    if (!body || typeof body.request_id !== 'string' || !UUID.test(body.request_id)) {
      return json(400, { error: 'request_id 가 필요합니다 (list_sign_requests 가 돌려준 id).' });
    }
    const which = ['auto', 'original', 'signed'].includes(body.which) ? body.which : 'auto';
    try {
      const target = await userRpc(auth.token, 'mcp_sign_file_target', { p_request_id: body.request_id, p_which: which });
      // 경로는 사용자 토큰으로 확인된 행의 것 — 형식만 한 번 더 본다(첫 세그먼트 = 요청 id)
      if (typeof target?.path !== 'string' || target.path.split('/')[0] !== body.request_id.toLowerCase() || target.path.includes('..')) {
        throw new Error('sign path shape');
      }
      const fileName = downloadName(target.file_name, target.title, target.which);
      return json(200, {
        which: target.which,
        which_label: target.which === 'signed' ? '서명 완료본' : '원본',
        title: target.title,
        file_name: fileName,
        expires_in_minutes: DOWNLOAD_TTL_SECONDS / 60,
        download_url: await signedUrl(target.path, fileName),
      });
    } catch (e) {
      if (e instanceof UserError) return json(422, { error: e.message });
      console.error('mcp-sign', e?.message ?? e);
      return json(500, { error: '파일 주소를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
    }
  };
}
