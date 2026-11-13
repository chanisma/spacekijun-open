// MCP 문서 쓰기 (2026-10-20) — 이미 있는 «생성 방식»(스펙)으로 에이전트가 쓴 값을 한글 문서로 만들고 DB 에 올린다.
//
// MCP 서버(`mcp`)의 도구 get_document_generation · create_document 가 **에이전트 토큰을 그대로 실어** 이 함수를 부른다.
//   describe — 양식을 읽어 채울 칸(계획 스키마)을 돌려준다
//   fill     — 칸 값 검사 → 웹 엔진으로 채움·검증 → (check_only 가 아니면) 실행 기록 + 완성 문서 저장 + 한글 파일 + 1회용 받기 주소
//
// ⚠️ 저장소(Storage)에 닿는 것만 service_role 이다(사용자 결정 2026-10-20 — 에이전트 토큰은 저장소가 막혀 있다).
//    **무엇을 읽을지·어디에 쓸지는 사용자 토큰으로 부른 RPC 가 정한다**:
//      읽기 = mcp_docgen_target 이 돌려준 양식 경로(그 사람이 웹에서 쓸 수 있는 생성 방식의 기본 양식)
//      쓰기 = <확인된 사용자 id>/runs/<mcp_docgen_run_start 가 만든 실행 id>/… (mcp_docgen_run_finish 가 다시 확인한다)
//    DB 쓰기(실행 기록·완성 문서)는 전부 사용자 토큰 — RLS·감사 규칙이 그대로다. 요청은 경로를 고를 수 없다.
//    일반 로그인 토큰은 받지 않는다(이 함수의 입구는 MCP 서버뿐).
//
// 동작은 Node 회귀(scripts/mcp-agent-test/docgen-fill.mts)가 같은 파일을 부른다 — zip 라이브러리는 밖에서 넣는다.

import { jwtClientId } from '../_shared/agentToken.js';
import { HwpxError, loadHwpx, packHwpx, sha256Hex } from '../_shared/hwpxZip.js';
import { describeForFill, fillAgentPlan, prepareAgentPlan, runChecksOf } from '../_shared/docgenAgentSpec.bundle.js';

const BUCKET = 'task-work-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOWNLOAD_TTL_SECONDS = 15 * 60;

class UserError extends Error {}

/** 파일 이름 — 윈도 금지 글자·줄바꿈을 빼고 120자 */
export function safeFileName(title) {
  const base = String(title || '문서').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || '문서';
  return `${base}.hwpx`;
}

export function createDocgenHandler(env, { JSZip, fetcher = fetch }) {
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

  async function storageGet(path) {
    const res = await fetcher(`${base}/storage/v1/object/${BUCKET}/${path}`, { headers: svc, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`storage get ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  async function storagePut(path, bytes) {
    const res = await fetcher(`${base}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/hwp+zip', 'x-upsert': 'false' },
      body: bytes,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`storage put ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  async function signedUrl(path, fileName) {
    const res = await fetcher(`${base}/storage/v1/object/sign/${BUCKET}/${path}`, {
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

  async function loadTarget(token, actionId) {
    const target = await userRpc(token, 'mcp_docgen_target', { p_action_id: actionId });
    // 경로는 사용자 토큰으로 읽은 양식 행의 것 — 형식만 한 번 더 본다
    if (typeof target?.storage_path !== 'string' || !/^[0-9a-f-]{36}\/templates\//.test(target.storage_path)) {
      throw new Error('template path shape');
    }
    const src = await loadHwpx(JSZip, await storageGet(target.storage_path));
    return { target, src };
  }

  async function fill(auth, body) {
    const { target, src } = await loadTarget(auth.token, body.action_id);
    const prepared = prepareAgentPlan(target.spec, src.sections, body.plan);
    const problems = [...prepared.problems];
    if (prepared.people.teacher.length || prepared.people.student.length) {
      const bad = await userRpc(auth.token, 'mcp_docgen_check_people', {
        p_teachers: prepared.people.teacher, p_students: prepared.people.student,
      });
      for (const [role, list] of Object.entries(bad ?? {})) {
        for (const p of list ?? []) {
          problems.push(`${role === 'teacher' ? '교직원' : '학생'} «${p.name}» — ${p.matches === 0 ? '명단에 없습니다(재직·재학 중인 사람의 이름을 정확히)' : `같은 이름이 ${p.matches}명입니다(웹에서 골라 주세요)`}`);
        }
      }
    }
    if (problems.length) return { ok: false, saved: false, problems };

    const result = await fillAgentPlan(prepared.spec, src.sections, prepared.plan);
    const failed = result.failed.map((c) => `${c.key}: ${c.message}`);
    if (failed.length) {
      return { ok: false, saved: false, problems: failed.map((f) => `검증 실패 — ${f}`), note: '값을 고쳐 다시 부르세요. 저장하지 않았습니다.' };
    }
    const warnings = result.checks.filter((c) => c.status === 'warn').map((c) => `${c.key}: ${c.message}`);
    if (result.knowledgeMissing.length) warnings.push(`이 경로에서 못 채우는 자료: ${result.knowledgeMissing.join(', ')} (웹에서 만들 때만 채워진다)`);
    if (body.check_only) {
      return { ok: true, saved: false, warnings, filled_targets: result.filled.report.filter((r) => r.status === 'filled').length };
    }

    const title = String(body.title || '').trim() || `${target.title}_${prepared.spec.documentType}`;
    const fileName = safeFileName(title);
    const runId = await userRpc(auth.token, 'mcp_docgen_run_start', {
      p_action_id: target.action_id,
      p_snapshot: {
        templateId: target.template_id, documentType: prepared.spec.documentType,
        targetCount: prepared.spec.targets.length, plan: prepared.plan,
        authoring: { note: String(body.note || '').slice(0, 4000), contexts: [], mode: 'strict' },
      },
    });
    if (typeof runId !== 'string' || !UUID.test(runId)) throw new Error('run id');
    const path = `${auth.userId}/runs/${runId.toLowerCase()}/${crypto.randomUUID()}.hwpx`;
    try {
      const bytes = await packHwpx(JSZip, src, result.filled.sections);
      await storagePut(path, bytes);
      const sha = await sha256Hex(bytes);
      const saved = await userRpc(auth.token, 'mcp_docgen_run_finish', {
        p_run_id: runId, p_status: 'needs_review',
        p_output_summary: { documentType: prepared.spec.documentType, fileName, sizeBytes: bytes.length, failedChecks: 0, targetCount: prepared.spec.targets.length },
        p_error: null,
        p_checks: runChecksOf(result.checks),
        p_artifacts: [{
          key: 'generated-hwpx', type: 'file', label: fileName,
          locator: { bucket: BUCKET, path, fileName, templateId: target.template_id },
          mimeType: 'application/hwp+zip', sizeBytes: bytes.length, contentSha256: sha, metadata: { failedChecks: 0, via: 'mcp' },
        }],
        p_document: {
          title, template_version_id: target.template_id, plan: prepared.plan, knowledge: result.knowledge,
          field_values: result.filled.values, row_values: result.filled.rows, user_context: body.note || null,
        },
      });
      return {
        ok: true, saved: true,
        run_id: runId, document_id: saved?.document_id ?? null,
        file_name: fileName, size_bytes: bytes.length,
        download_url: await signedUrl(path, fileName),
        download_expires_in_seconds: DOWNLOAD_TTL_SECONDS,
        warnings,
      };
    } catch (e) {
      // 실행은 열려 있으면 안 된다 — 실패로 닫는다(웹 러너와 같다). 이미 올린 파일은 남는다(실행 폴더 안)
      await userRpc(auth.token, 'mcp_docgen_run_finish', {
        p_run_id: runId, p_status: 'failed', p_output_summary: {}, p_error: String(e?.message ?? e).slice(0, 500),
        p_checks: [], p_artifacts: [], p_document: null,
      }).catch(() => {});
      throw e;
    }
  }

  return async (request) => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const auth = await verify(request);
    if (!auth) return json(401, { error: 'MCP 에이전트 토큰이 필요합니다.' });
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'JSON 을 읽을 수 없습니다.' }); }
    if (!body || typeof body.action_id !== 'string' || !UUID.test(body.action_id)) {
      return json(400, { error: 'action_id 가 필요합니다 (list_document_generations 가 돌려준 id).' });
    }
    try {
      if (body.op === 'describe') {
        const { target, src } = await loadTarget(auth.token, body.action_id);
        return json(200, {
          action_id: target.action_id, title: target.title, template_name: target.template_name, mine: target.mine,
          ...describeForFill(target.spec, src.sections),
        });
      }
      if (body.op === 'fill') return json(200, await fill(auth, body));
      return json(400, { error: 'op 는 describe · fill 입니다.' });
    } catch (e) {
      if (e instanceof UserError || e instanceof HwpxError) return json(422, { error: e.message });
      console.error('mcp-docgen', e?.message ?? e);
      return json(500, { error: '문서를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
    }
  };
}
