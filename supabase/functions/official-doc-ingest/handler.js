// 공문 판단함 입구 (2026-10-30) — 설계 = docs/plans/2026-10-30-official-doc-triage.md
//
// 학교 서버 PC 가 부른다(사람 로그인 없음). 자동화 업무와 같은 실행기 키(`x-runner-key`, 64자 hex)로
// 자기를 증명하고, 서버는 그 sha256 만 갖고 있다.
//
//   knowledge  {year?}           → 판정용 학교 지식 묶음(업무 후보·올해 업무·분장 자리·승인 규칙·최근 결정·이미 판정한 문서번호)
//   ingest     {docs: [...≤300]} → {inserted, updated, triaged}
//   unassigned {}                → [{doc_no, registered_at}] 담당(결재권자) 미지정, 최근 30일 — cron 이 대장을 다시 읽어 고친다
//   refs       {numbers: [...≤50]} → 그 시행번호로 받은 공문(원 공문 — 후속 공문 연결용) + 마지막 판정·결정
//
// 이 함수가 할 수 있는 일은 위 네 RPC 뿐이다(service_role 이지만 다른 표를 건드리지 않는다).
// CORS 없음 — 브라우저가 부를 일이 없다.

const ACTIONS = new Set(['knowledge', 'ingest', 'unassigned', 'refs']);
const KEY = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

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
      method: 'POST', headers: service, body: JSON.stringify(args), signal: AbortSignal.timeout(60000),
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

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, {error: 'too_large'});
    let body;
    try { body = JSON.parse(raw); } catch { return reply(400, {error: 'invalid_json'}); }
    const action = body && typeof body.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) return reply(400, {error: 'unknown_action'});

    const keyHash = await sha256Hex(key);
    let result;
    if (action === 'knowledge') {
      const year = Number.isInteger(body.year) && body.year >= 2000 && body.year <= 2100 ? body.year : null;
      result = await rpc('official_doc_knowledge', {p_key_hash: keyHash, p_year: year});
    } else if (action === 'unassigned') {
      result = await rpc('official_doc_unassigned', {p_key_hash: keyHash});
    } else if (action === 'refs') {
      const numbers = Array.isArray(body.numbers) ? body.numbers.filter(n => typeof n === 'string' && n.length <= 80).slice(0, 50) : [];
      result = await rpc('official_doc_refs', {p_key_hash: keyHash, p_numbers: numbers});
    } else {
      if (!Array.isArray(body.docs)) return reply(400, {error: 'docs_required'});
      if (body.docs.length > 300) return reply(400, {error: 'too_many_docs'});
      result = await rpc('official_doc_ingest', {p_key_hash: keyHash, p_docs: body.docs});
    }

    if (result.ok) return reply(200, result.data);
    // RPC 가 던진 이유를 기계가 알아볼 이름으로만 돌려준다(DB 내부 문구를 그대로 싣지 않는다)
    const message = String(result.data?.message || '');
    if (message.includes('알 수 없는 실행기')) return reply(401, {error: 'unknown_runner'});
    console.error('[official-doc-ingest]', action, result.status, message);
    return reply(502, {error: 'server_error'});
  };
}
