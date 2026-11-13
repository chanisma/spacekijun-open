// 자동화 업무 실행기 입구 (2026-10-23) — 계약 = docs/plans/2026-10-23-automation-scheduler.md §6
//
// 학교 서버 PC(쿨메신저 기전봇)가 부른다. 사람이 아니라 기계라 로그인 토큰이 없다 —
// 관리자가 발급한 실행기 키(`x-runner-key`, 64자 hex)로 자기를 증명한다. 서버는 그 sha256 만 갖고 있다.
//
//   heartbeat  {version?}                                     → {ok, paused_all}
//   claim      {max?: 1..20}                                  → {runs:[…], paused_all}
//   report     {run_id, status, message_key?, arrival?, error?} → {ok}
//
// 이 함수가 할 수 있는 일은 위 세 RPC 뿐이다(service_role 이지만 다른 표를 건드리지 않는다).
// CORS 없음 — 브라우저가 부를 일이 없다.

const ACTIONS = new Set(['heartbeat', 'claim', 'report']);
const KEY = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_STATUS = new Set(['sent', 'unknown', 'failed']);

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createHandler(env, fetcher = fetch) {
  const base = env.url.replace(/\/$/, '');
  const service = {apikey: env.serviceKey, Authorization: 'Bearer ' + env.serviceKey, 'Content-Type': 'application/json'};

  const reply = (status, value) => new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
  });

  async function rpc(name, args) {
    const res = await fetcher(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: service, body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return {ok: res.ok, status: res.status, data};
  }

  return async function handle(req) {
    if (req.method !== 'POST') return reply(405, {error: 'method_not_allowed'});
    const key = (req.headers.get('x-runner-key') || '').trim().toLowerCase();
    if (!KEY.test(key)) return reply(401, {error: 'runner_key_required'});

    let body;
    try { body = await req.json(); } catch { return reply(400, {error: 'invalid_json'}); }
    const action = body && typeof body.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) return reply(400, {error: 'unknown_action'});

    const keyHash = await sha256Hex(key);
    let result;
    if (action === 'heartbeat') {
      const version = typeof body.version === 'string' ? body.version.slice(0, 40) : null;
      result = await rpc('automation_runner_heartbeat', {p_key_hash: keyHash, p_version: version});
    } else if (action === 'claim') {
      const max = Number.isInteger(body.max) ? Math.max(1, Math.min(20, body.max)) : 1;
      result = await rpc('automation_runner_claim', {p_key_hash: keyHash, p_max: max});
    } else {
      if (typeof body.run_id !== 'string' || !UUID.test(body.run_id)) return reply(400, {error: 'invalid_run_id'});
      if (!REPORT_STATUS.has(body.status)) return reply(400, {error: 'invalid_status'});
      const messageKey = Number.isSafeInteger(body.message_key) ? body.message_key : null;
      result = await rpc('automation_runner_report', {
        p_key_hash: keyHash,
        p_run_id: body.run_id,
        p_status: body.status,
        p_message_key: messageKey,
        p_arrival: typeof body.arrival === 'string' ? body.arrival.slice(0, 40) : null,
        p_error: typeof body.error === 'string' ? body.error.slice(0, 1000) : null,
      });
    }

    if (result.ok) return reply(200, result.data);
    // RPC 가 던진 이유를 기계가 알아볼 이름으로만 돌려준다(DB 내부 문구를 그대로 싣지 않는다)
    const message = String(result.data?.message || '');
    if (message.includes('알 수 없는 실행기')) return reply(401, {error: 'unknown_runner'});
    if (message.includes('이 실행기가 가져간 회차가 아닙니다')) return reply(409, {error: 'run_not_claimed_by_runner'});
    console.error('[automation-runner]', action, result.status, message);
    return reply(502, {error: 'server_error'});
  };
}
