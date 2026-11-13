// MCP 한글 양식 올리기 (2026-10-20) — 에이전트가 1회용 주소로 HWPX 를 올린다.
//
// 흐름: MCP 도구 start_template_upload 가 티켓을 발급(mcp_docgen_upload_begin) → 에이전트가 셸에서
//       `curl -X PUT --data-binary @양식.hwpx <이 함수>/<티켓>` → 여기서 저장소에 넣고 섹션 XML 을 기록
//       → 에이전트는 MCP 도구 read_template_upload 로 문서 지도를 읽는다.
//
// ⚠️ 이 함수만 service_role 을 쓴다(사용자 결정 2026-10-20). curl 은 사용자 토큰을 갖지 않기 때문이다.
//    쓰는 곳은 **티켓이 정한 경로 하나**(<uid>/templates/<올리기 id>/template.hwpx)뿐이고, 경로·사람은 DB 가 정한다
//    (docgen_upload_claim). 요청이 경로를 고를 수 없다. 티켓은 15분·한 번 — 원문은 저장하지 않고 해시로 찾는다.
//    MCP 서버(`mcp`)는 여전히 service_role 을 쓰지 않는다.
//
// 동작은 Node 회귀(scripts/mcp-agent-test/docgen.mts)가 같은 파일을 부른다 — zip 라이브러리는 밖에서 넣는다.

import { HwpxError, readHwpxSections, sha256Hex } from '../_shared/hwpxZip.js';

export { HwpxError, readHwpxSections, sha256Hex };
export const MAX_BYTES = 20 * 1024 * 1024;          // 버킷 한도와 같다
const BUCKET = 'task-work-documents';
const TICKET = /^[0-9a-f]{64}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, content-length',
};

export function createUploadHandler(env, { JSZip, fetcher = fetch }) {
  const base = env.url.replace(/\/$/, '');
  const svc = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` };

  const json = (status, value) => new Response(JSON.stringify(value), {
    status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

  async function rpc(fn, args) {
    const res = await fetcher(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${fn}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  async function storagePut(path, bytes) {
    const res = await fetcher(`${base}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      // 경로는 올리기 id 마다 하나라 덮어써도 남의 파일이 아니다(집기가 끝나기 전에 함수가 죽은 재시도)
      headers: { ...svc, 'Content-Type': 'application/hwp+zip', 'x-upsert': 'true' },
      body: bytes,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`storage: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  async function forgetAbandoned(list) {
    if (!Array.isArray(list) || list.length === 0) return;
    try {
      const res = await fetcher(`${base}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { ...svc, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: list.map((a) => a.storage_path) }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) await rpc('docgen_upload_forget', { p_ids: list.map((a) => a.id) });
    } catch (e) {
      console.warn('mcp-upload: 오래된 올리기 정리 실패', e?.message ?? e);
    }
  }

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'PUT' && request.method !== 'POST') {
      return json(405, { ok: false, error: 'PUT 으로 파일을 올리세요: curl -X PUT --data-binary @양식.hwpx <주소>' });
    }
    const ticket = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
    if (!TICKET.test(ticket)) return json(404, { ok: false, error: '올리기 주소가 아닙니다.' });

    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) return json(413, { ok: false, error: '파일이 20MB 를 넘습니다.' });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0) return json(400, { ok: false, error: '파일이 비었습니다. --data-binary "@경로" 로 보냈는지 확인하세요(@ 를 빠뜨리면 경로 글자가 올라간다).' });
    if (bytes.length > MAX_BYTES) return json(413, { ok: false, error: '파일이 20MB 를 넘습니다.' });

    let claim;
    try {
      claim = await rpc('docgen_upload_claim', { p_ticket_hash: await sha256Hex(ticket) });
    } catch (e) {
      console.error('mcp-upload: claim', e?.message ?? e);
      return json(502, { ok: false, error: '잠시 뒤 다시 올려 주세요.' });
    }
    if (!claim) return json(410, { ok: false, error: '이 주소는 만료됐거나(15분) 이미 썼습니다. start_template_upload 로 새 주소를 받으세요.' });

    try {
      const sections = await readHwpxSections(JSZip, bytes);
      await storagePut(claim.storage_path, bytes);
      await rpc('docgen_upload_complete', {
        p_id: claim.id, p_size: bytes.length, p_sha: await sha256Hex(bytes), p_sections: sections,
      });
      await forgetAbandoned(claim.abandoned);
      return json(200, {
        ok: true,
        upload_id: claim.id,
        file_name: claim.file_name,
        sections: sections.length,
        size_bytes: bytes.length,
        next: `올렸습니다. MCP 도구 read_template_upload 에 upload_id "${claim.id}" 를 넘겨 문서 구조를 읽으세요.`,
      });
    } catch (e) {
      await rpc('docgen_upload_release', { p_id: claim.id }).catch(() => {});
      if (e instanceof HwpxError) return json(400, { ok: false, error: e.message });
      console.error('mcp-upload: store', e?.message ?? e);
      return json(500, { ok: false, error: '저장하지 못했습니다. 같은 주소로 다시 올려 보세요(15분 안).' });
    }
  };
}
