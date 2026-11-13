import { isAgentAuthorization } from '../_shared/agentToken.js';

// 교실 기기 QR 세팅 (2026-10-13) — 상세 docs/features/classroom-link.md
//
// 두 부류가 부른다.
//   기기(교실 PC·전자칠판): start · poll · extend · end — 기기가 혼자 간직한 device_key 로 자기를 증명한다.
//                           CORS 없음(네이티브 호출).
//   교사(휴대폰 웹):        inspect · approve · stop — 스페이스기전 로그인 토큰(Bearer)으로 증명한다.
//                           정해 둔 웹 출처에만 CORS 를 연다.
//
// 🚨 승인 때 교사의 구글 토큰과 새 스페이스기전 세션이 DB(classroom_link.handoff)에 잠시 머문다.
//    기기가 받아 가면 DB 에서 지워지고, 오류·응답 어디에도 토큰·이메일을 싣지 않는다.
//    세션 발급 방식은 desktop-session 과 같다(magiclink 를 서버가 바로 소비 — 메일은 나가지 않는다).

export const ALLOWED_ORIGINS = ['https://spacekijun.lovable.app', 'http://localhost:8080'];
export const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
// 교실 기기의 «구글 수업 도구»(클래스룸 — 2026-10-14). 드라이브 범위와 함께 넘긴다. 슬라이드 발표·설문지는 드라이브 범위로 된다.
export const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.announcements',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  // 원래 클래스룸처럼(스트림 작성자 사진 · 수업 탭의 주제·자료 · 사용자 탭) — 2026-10-14
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.photos',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
];
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive',
];
// forget_profile: 수업 중 «이 PC 의 구글 로그인 지우기» — 보관 열쇠를 지운다(20261014100000)
// type_*: 휴대폰으로 구글 비밀번호 입력(2026-10-14) — 휴대폰이 기기 공개키로 암호화한 것만 맡아 두었다 넘긴다(20261014130000)
const DEVICE_ACTIONS = new Set(['start', 'poll', 'extend', 'end', 'forget_profile', 'type_start', 'type_poll', 'type_cancel']);
const TEACHER_ACTIONS = new Set(['inspect', 'approve', 'stop', 'type_inspect', 'type_submit']);
const B64URL = /^[A-Za-z0-9_-]+$/;
const KNOWN_ERRORS = ['rate_limited', 'link_expired', 'preset_not_found', 'not_allowed', 'invalid_minutes',
  'not_session_teacher', 'google_token_required', 'invalid_purpose', 'not_active', 'type_expired', 'invalid_payload'];
const DEVICE_KEY = /^[A-Za-z0-9_-]{32,128}$/;
const CODE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function jwtClaims(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4)));
  } catch {
    return {};
  }
}

export function createHandler(env, fetcher = fetch, now = () => Date.now()) {
  const base = env.url.replace(/\/$/, '');
  const clientId = env.googleClientId || GOOGLE_CLIENT_ID;

  const reply = (status, value, origin) => new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(origin ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
      } : {}),
    },
  });

  const call = (url, init) => fetcher(url, {...init, signal: AbortSignal.timeout(10000)});
  const service = {apikey: env.serviceKey, Authorization: 'Bearer ' + env.serviceKey, 'Content-Type': 'application/json'};

  async function rpc(name, args) {
    const res = await call(`${base}/rest/v1/rpc/${name}`, {method: 'POST', headers: service, body: JSON.stringify(args)});
    const text = await res.text();
    if (!res.ok) {
      const known = KNOWN_ERRORS.find(code => text.includes(code));
      const error = new Error(known || 'rpc_failed');
      error.known = known;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  }

  async function currentUser(authorization) {
    if (!authorization.startsWith('Bearer ')) return null;
    // MCP 에이전트 토큰(client_id 클레임)으로는 승인하지 않는다 — 승인이 교실 기기에 새 세션을 넘겨
    // DB 입구의 «에이전트는 mcp_* 만» 제한을 우회한다 (2026-10-18).
    if (isAgentAuthorization(authorization)) return null;
    const res = await call(`${base}/auth/v1/user`, {headers: {apikey: env.anonKey, Authorization: authorization}});
    if (!res.ok) return null;
    const user = await res.json();
    if (!user.id || !user.email || !user.email_confirmed_at || user.is_anonymous) return null;
    return user;
  }

  // desktop-session 과 같은 방식: 교사 본인 계정의 새 세션을 서버가 만든다.
  async function mintSession(user) {
    const auth = `${base}/auth/v1/`;
    const generated = await call(auth + 'admin/generate_link', {
      method: 'POST', headers: service, body: JSON.stringify({type: 'magiclink', email: user.email}),
    });
    if (!generated.ok) return null;
    const link = await generated.json();
    if (!link.hashed_token || link.id !== user.id) return null;
    const verified = await call(auth + 'verify', {
      method: 'POST',
      headers: {apikey: env.anonKey, Authorization: 'Bearer ' + env.anonKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({type: 'magiclink', token_hash: link.hashed_token}),
    });
    if (!verified.ok) return null;
    const session = await verified.json();
    if (session.user?.id !== user.id || !session.access_token || !session.refresh_token) return null;
    const sessionId = jwtClaims(session.access_token).session_id;
    if (!sessionId || !UUID.test(sessionId)) return null;
    session.expires_at ??= Math.floor(now() / 1000) + (session.expires_in || 3600);
    return {session, sessionId};
  }

  // 휴대폰이 넘긴 구글 토큰이 «이 앱(같은 클라이언트)이 이 교사에게 준 드라이브 토큰»인지 구글에 묻는다.
  async function checkGoogleToken(token, user) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
    const res = await call('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), {});
    if (!res.ok) return null;
    const info = await res.json();
    const scopes = String(info.scope || '').split(' ');
    const seconds = Number(info.expires_in) || 0;
    if (info.aud !== clientId && info.azp !== clientId) return null;
    if (String(info.email || '').toLowerCase() !== user.email.toLowerCase()) return null;
    if (!scopes.some(scope => DRIVE_SCOPES.includes(scope))) return null;
    if (seconds < 300) return null;
    // 범위를 함께 넘긴다 — 기기가 «전체 드라이브 탐색»이 되는지(drive) 고른 파일만인지(drive.file) 안다
    return {access_token: token, expires_at: Math.floor(now() / 1000) + seconds,
            scope: scopes.filter(scope => DRIVE_SCOPES.includes(scope) || CLASSROOM_SCOPES.includes(scope)).join(' ')};
  }

  async function device(action, body) {
    if (!DEVICE_KEY.test(body.device_key || '')) return [400, {error: 'invalid_device'}];
    const keyHash = await sha256Hex(body.device_key);
    if (action === 'start') {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
      const purpose = body.purpose ?? 'session';
      if (!name || !['windows', 'android'].includes(body.platform) || !['session', 'drive'].includes(purpose)) {
        return [400, {error: 'invalid_request'}];
      }
      return [200, await rpc('classroom_link_start', {p_key_hash: keyHash, p_name: name, p_platform: body.platform, p_purpose: purpose})];
    }
    if (!CODE.test(body.code || '')) return [400, {error: 'invalid_code'}];
    if (action === 'type_start') {
      // code = 지금 수업의 연결 코드. 기기 공개키(P-256, base64url)를 맡긴다
      const pub = typeof body.device_pub === 'string' ? body.device_pub : '';
      if (pub.length < 40 || pub.length > 200 || !B64URL.test(pub)) return [400, {error: 'invalid_request'}];
      return [200, await rpc('classroom_type_start', {p_key_hash: keyHash, p_session_code: body.code, p_device_pub: pub})];
    }
    if (action === 'type_poll') return [200, await rpc('classroom_type_poll', {p_key_hash: keyHash, p_code: body.code})];
    if (action === 'type_cancel') return [200, await rpc('classroom_type_cancel', {p_key_hash: keyHash, p_code: body.code})];
    if (action === 'poll') return [200, await rpc('classroom_link_poll', {p_key_hash: keyHash, p_code: body.code})];
    if (action === 'extend') {
      return [200, await rpc('classroom_link_extend', {p_key_hash: keyHash, p_code: body.code, p_minutes: Number(body.minutes) || 10})];
    }
    if (action === 'forget_profile') {
      return [200, await rpc('classroom_profile_forget', {p_key_hash: keyHash, p_code: body.code})];
    }
    return [200, await rpc('classroom_link_end', {p_key_hash: keyHash, p_code: body.code})];
  }

  async function teacher(action, body, authorization) {
    if (!CODE.test(body.code || '')) return [400, {error: 'invalid_code'}];
    const user = await currentUser(authorization);
    if (!user) return [401, {error: 'authentication_required'}];
    if (action === 'inspect') return [200, await rpc('classroom_link_inspect', {p_code: body.code, p_user: user.id})];
    if (action === 'type_inspect') return [200, await rpc('classroom_type_inspect', {p_code: body.code, p_user: user.id})];
    if (action === 'type_submit') {
      // 휴대폰에서 암호화한 것만(평문 비밀번호는 오지 않는다). 모양만 본다 — 내용은 서버가 풀 수 없다
      const p = body.payload && typeof body.payload === 'object' ? body.payload : {};
      const ok = [['epk', 40, 200], ['iv', 12, 32], ['ct', 20, 1400]]
        .every(([k, min, max]) => typeof p[k] === 'string' && p[k].length >= min && p[k].length <= max && B64URL.test(p[k]));
      if (!ok) return [400, {error: 'invalid_payload'}];
      return [200, await rpc('classroom_type_submit', {p_code: body.code, p_user: user.id, p_payload: {epk: p.epk, iv: p.iv, ct: p.ct}})];
    }
    if (action === 'stop') return [200, await rpc('classroom_link_stop', {p_code: body.code, p_user: user.id})];

    // preset_id 가 없으면 «드라이브 다시 연결» QR — 구글 토큰만 넘긴다(그 기기의 수업 교사인지는 RPC 가 본다)
    const presetId = body.preset_id ?? null;
    if (presetId !== null && !UUID.test(presetId)) return [400, {error: 'invalid_preset'}];
    let items = [];
    if (presetId !== null) {
      const found = await call(
        `${base}/rest/v1/classroom_preset?select=items&id=eq.${presetId}&owner_id=eq.${user.id}`, {headers: service});
      const rows = found.ok ? await found.json() : [];
      if (!rows.length) return [404, {error: 'preset_not_found'}];
      items = Array.isArray(rows[0].items) ? rows[0].items : [];
    }

    // 승인 화면의 «이 PC 에 구글 로그인 보관»(기본 켬). 끄면 RPC 가 열쇠를 넘기지 않고 있던 것도 지운다.
    const secrets = {keep_profile: body.keep_google !== false};
    // 토큰을 보냈으면 늘 검사한다. 드라이브 항목이 있거나 드라이브 QR 이면 꼭 있어야 한다.
    const google = body.google_token ? await checkGoogleToken(body.google_token, user) : null;
    if (google) secrets.google = google;
    else if (presetId === null || items.some(item => item.kind === 'drive')) return [400, {error: 'google_token_required'}];
    let minted = null;
    if (items.some(item => item.kind === 'space')) {
      // 이메일 세션으로 MFA 를 우회하지 않는다(desktop-session 과 같은 규칙)
      if ((user.factors || []).some(f => f.status === 'verified')) return [403, {error: 'use_website_mfa_login'}];
      minted = await mintSession(user);
      if (!minted) return [502, {error: 'session_creation_failed'}];
      secrets.space_session = minted.session;
    }
    try {
      const result = await rpc('classroom_link_approve', {
        p_code: body.code, p_user: user.id, p_preset_id: presetId,
        p_secrets: secrets, p_space_session: minted?.sessionId ?? null,
      });
      return [200, result];
    } catch (error) {
      if (minted) await rpc('classroom_link_revoke', {p_session: minted.sessionId}).catch(() => {});
      throw error;
    }
  }

  return async (request) => {
    const origin = request.headers.get('Origin');
    const corsOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
    if (request.method === 'OPTIONS') return reply(corsOrigin ? 200 : 403, {}, corsOrigin);
    if (request.method !== 'POST') return reply(405, {error: 'method_not_allowed'}, corsOrigin);
    let body;
    try { body = await request.json(); } catch { return reply(400, {error: 'invalid_request'}, corsOrigin); }
    if (!body || typeof body !== 'object') return reply(400, {error: 'invalid_request'}, corsOrigin);
    const action = body.action;
    try {
      if (DEVICE_ACTIONS.has(action)) {
        const [status, value] = await device(action, body);
        return reply(status, value);
      }
      if (TEACHER_ACTIONS.has(action)) {
        // 교사 동작은 스페이스기전 웹에서만 — 다른 사이트가 로그인한 교사의 브라우저로 승인시키지 못하게
        if (!corsOrigin) return reply(403, {error: 'origin_not_allowed'});
        const [status, value] = await teacher(action, body, request.headers.get('Authorization') || '');
        return reply(status, value, corsOrigin);
      }
      return reply(400, {error: 'invalid_action'}, corsOrigin);
    } catch (error) {
      // 토큰·이메일·공급자 응답을 싣지 않는다
      const known = error?.known;
      const status = known === 'rate_limited' ? 429 : known === 'not_allowed' || known === 'not_session_teacher' ? 403
        : known === 'google_token_required' || known === 'invalid_purpose' || known === 'invalid_payload' ? 400
        : known === 'type_expired' || known === 'not_active' ? 410
        : known === 'preset_not_found' ? 404 : known ? 409 : 502;
      return reply(status, {error: known || 'server_error'}, corsOrigin);
    }
  };
}
