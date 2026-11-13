// MCP 서류함·코드 공유 파일 (2026-11-04) — 도구가 **에이전트 토큰을 그대로 실어** 이 함수를 부른다.
//   doc_upload_begin  = mcp_document_upload_begin 이 정한 경로(library/<나>/…)에 서명된 올리기 주소 + 올리다 만 내 파일 정리
//   doc_get           = mcp_document_file_target 이 정한 서버 파일에 받기 주소(드라이브·링크 문서는 그 주소를 그대로)
//   doc_delete        = mcp_delete_document 가 행을 지우고 돌려준 객체 하나를 지운다
//   code_upload_begin = mcp_code_file_upload_begin 이 정한 경로(<프로젝트>/<path>)마다 올리기 주소 + 올리다 만 파일 정리
//   code_get          = mcp_code_file_targets 이 정한 이진 파일마다 받기 주소
//   code_delete       = mcp_delete_code_project 가 행을 지우고 돌려준 폴더 객체를 지운다
//   code_cleanup      = mcp_code_orphan_objects 가 고른 객체(행이 가리키지 않는 것)를 지운다 — update_code_project 뒤
//   code_fork         = mcp_fork_code_project 가 만든 사본으로 이진 객체를 버킷 안에서 복사하고 mcp_finish_code_file_upload 로 등록
//
// ⚠️ 저장소(Storage)에 닿는 것만 service_role 이다(에이전트 토큰은 저장소가 막혀 있다 — mcp-sign·mcp-docgen 과 같은 규약).
//    **무엇을 다룰지는 사용자 토큰으로 부른 RPC 가 정한다** — 요청은 경로를 고를 수 없다. RPC 가 준 경로도 모양(첫 세그먼트)을
//    한 번 더 본다. 일반 로그인 토큰은 받지 않는다(jwtClientId).
// 동작은 Node 회귀(scripts/mcp-agent-test/files.mts)가 같은 파일을 부른다.

import { jwtClientId } from '../_shared/agentToken.js';

const DOC_BUCKET = 'documents';
const CODE_BUCKET = 'code-projects';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOWNLOAD_TTL_SECONDS = 15 * 60;
export const UPLOAD_TTL_MINUTES = 120; // Storage 서명된 올리기 주소의 수명(고정 2시간)

class UserError extends Error {}

/** 셸 한 줄 — 경로 자리는 에이전트가 실제 파일 경로로 바꾼다(@ 를 빼면 경로 글자가 올라간다) */
export function uploadCommand(url, mime) {
  return `curl -sS -X PUT -H "Content-Type: ${mime}" -H "x-upsert: true" --data-binary "@<파일 경로>" "${url}"`;
}

/** 받을 파일 이름 — 경로 글자를 지운다 */
export function safeFileName(name, fallback = '파일') {
  return (String(name || fallback).replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback).slice(0, 150);
}

const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
const docPathOk = (path, userId) => typeof path === 'string' && !path.includes('..') && path.startsWith(`library/${userId}/`) && path.split('/').length === 3;
const underProject = (path, projectId) => typeof path === 'string' && !path.includes('..') && path.startsWith(`${projectId}/`) && path.length > projectId.length + 1;

export function createFilesHandler(env, { fetcher = fetch } = {}) {
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

  async function signedDownload(bucket, path, fileName) {
    const res = await fetcher(`${base}/storage/v1/object/sign/${bucket}/${enc(path)}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: DOWNLOAD_TTL_SECONDS }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`storage sign ${res.status}`);
    const { signedURL } = await res.json();
    return `${base}/storage/v1${signedURL}${signedURL.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;
  }

  async function signedUpload(bucket, path) {
    const res = await fetcher(`${base}/storage/v1/object/upload/sign/${bucket}/${enc(path)}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`storage upload sign ${res.status}`);
    const { url } = await res.json();
    if (typeof url !== 'string' || !url.includes('token=')) throw new Error('storage upload sign shape');
    return `${base}/storage/v1${url}`;
  }

  /** 지우기 — 실패는 기록만(행은 이미 정리됐다. 남은 객체는 다음 올리기 시작 때 «올리다 만 파일»로 치운다) */
  async function removeObjects(bucket, paths) {
    if (!paths.length) return 0;
    try {
      const res = await fetcher(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...svc, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`storage delete ${res.status}`);
      return paths.length;
    } catch (e) {
      console.warn('mcp-files: 저장소 정리 실패', bucket, paths.length, e?.message ?? e);
      return 0;
    }
  }

  async function copyObject(from, to) {
    const res = await fetcher(`${base}/storage/v1/object/copy`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: CODE_BUCKET, sourceKey: from, destinationKey: to }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`storage copy ${res.status}`);
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

  const projectIdOf = (body) => {
    const id = String(body?.args?.p_project_id ?? '').toLowerCase();
    if (!UUID.test(id)) throw new UserError('project_id 가 필요합니다.');
    return id;
  };

  const ops = {
    async doc_upload_begin(auth, body) {
      const out = await userRpc(auth.token, 'mcp_document_upload_begin', { p_file_name: body?.args?.p_file_name ?? null });
      if (!docPathOk(out?.storage_path, auth.userId)) throw new Error('doc upload path shape');
      const url = await signedUpload(DOC_BUCKET, out.storage_path);
      const orphans = (Array.isArray(out.orphans) ? out.orphans : []).filter((p) => docPathOk(p, auth.userId));
      const cleaned = await removeObjects(DOC_BUCKET, orphans);
      return {
        upload_path: out.storage_path,
        file_name: out.file_name,
        content_type: out.mime,
        expires_in_minutes: UPLOAD_TTL_MINUTES,
        command: uploadCommand(url, out.mime),
        next: '셸에서 command 의 <파일 경로> 를 실제 경로로 바꿔 올린 뒤(@ 를 지우지 말 것) finish_document_upload 에 upload_path·file_name·제목·폴더를 넘긴다.',
        ...(cleaned ? { cleaned_abandoned: cleaned } : {}),
      };
    },

    async doc_get(auth, body) {
      const target = await userRpc(auth.token, 'mcp_document_file_target', { p_document_id: body?.args?.p_document_id ?? null });
      if (target?.stored !== 'server') {
        return { stored: target?.stored, title: target?.title, link: target?.link,
          note: '구글 드라이브·링크 문서는 서버 파일이 없다 — link 를 사용자에게 건넨다(드라이브 파일은 그 계정 권한으로 열린다).' };
      }
      const path = String(target.path || '');
      if (path.includes('..') || !(path.startsWith('library/') || path.startsWith(`${auth.userId}/`))) throw new Error('doc get path shape');
      const fileName = safeFileName(target.file_name, target.title || '문서');
      return {
        stored: 'server', title: target.title, file_name: fileName,
        expires_in_minutes: DOWNLOAD_TTL_SECONDS / 60,
        download_url: await signedDownload(DOC_BUCKET, path, fileName),
      };
    },

    async doc_delete(auth, body) {
      const out = await userRpc(auth.token, 'mcp_delete_document', { p_document_id: body?.args?.p_document_id ?? null });
      const path = out?.storage_path;
      const { storage_path: _p, ...rest } = out ?? {};
      if (typeof path === 'string' && !path.includes('..') && /^(library\/)?[0-9a-f-]{36}\/[^/]+$/i.test(path)) {
        rest.file_removed = (await removeObjects(DOC_BUCKET, [path])) === 1;
      }
      return rest;
    },

    async code_upload_begin(auth, body) {
      const projectId = projectIdOf(body);
      const out = await userRpc(auth.token, 'mcp_code_file_upload_begin', { p_project_id: projectId, p_paths: body?.args?.p_paths ?? null });
      const files = Array.isArray(out?.files) ? out.files : [];
      const uploads = [];
      for (const f of files) {
        if (!underProject(f?.storage_path, projectId) || f.storage_path !== `${projectId}/${f.path}`) throw new Error('code upload path shape');
        uploads.push({ path: f.path, content_type: f.mime, command: uploadCommand(await signedUpload(CODE_BUCKET, f.storage_path), f.mime) });
      }
      const orphans = (Array.isArray(out?.orphans) ? out.orphans : []).filter((p) => underProject(p, projectId));
      const cleaned = await removeObjects(CODE_BUCKET, orphans);
      return {
        project_id: projectId, files: uploads, expires_in_minutes: UPLOAD_TTL_MINUTES,
        next: '파일마다 command 의 <파일 경로> 를 실제 경로로 바꿔 올린 뒤 finish_code_file_upload 에 project_id·paths 를 넘긴다(같은 경로는 바뀐다).',
        ...(cleaned ? { cleaned_abandoned: cleaned } : {}),
      };
    },

    async code_get(auth, body) {
      const projectId = projectIdOf(body);
      const out = await userRpc(auth.token, 'mcp_code_file_targets', { p_project_id: projectId, p_paths: body?.args?.p_paths ?? null });
      const files = [];
      for (const f of Array.isArray(out?.files) ? out.files : []) {
        if (!underProject(f?.storage_path, projectId)) throw new Error('code get path shape');
        const name = safeFileName(String(f.path).split('/').pop(), '파일');
        files.push({ path: f.path, size: f.size, file_name: name, download_url: await signedDownload(CODE_BUCKET, f.storage_path, name) });
      }
      const { files: _f, ...rest } = out ?? {};
      return { ...rest, files, expires_in_minutes: DOWNLOAD_TTL_SECONDS / 60 };
    },

    async code_delete(auth, body) {
      const projectId = projectIdOf(body);
      const out = await userRpc(auth.token, 'mcp_delete_code_project', { p_project_id: projectId });
      const paths = (Array.isArray(out?.storage_paths) ? out.storage_paths : []).filter((p) => underProject(p, projectId));
      const { storage_paths: _s, ...rest } = out ?? {};
      if (paths.length) rest.files_removed = await removeObjects(CODE_BUCKET, paths);
      return rest;
    },

    async code_cleanup(auth, body) {
      const projectId = projectIdOf(body);
      const out = await userRpc(auth.token, 'mcp_code_orphan_objects', { p_project_id: projectId, p_paths: body?.args?.p_paths ?? null });
      const paths = (Array.isArray(out?.objects) ? out.objects : []).filter((p) => underProject(p, projectId));
      return { removed: await removeObjects(CODE_BUCKET, paths) };
    },

    async code_fork(auth, body) {
      const sourceId = projectIdOf(body);
      const out = await userRpc(auth.token, 'mcp_fork_code_project', {
        p_project_id: sourceId, p_title: body?.args?.p_title ?? null, p_visibility: body?.args?.p_visibility ?? 'private',
      });
      const newId = String(out?.project?.project_id ?? '').toLowerCase();
      if (!UUID.test(newId)) throw new Error('fork shape');
      const copies = Array.isArray(out.copies) ? out.copies : [];
      const copied = [];
      try {
        for (const c of copies) {
          if (!underProject(c?.from, sourceId) || c.to !== `${newId}/${c.path}` || !underProject(c.to, newId)) throw new Error('fork copy shape');
          await copyObject(c.from, c.to);
          copied.push(c.to);
        }
        let project = out.project;
        if (copies.length) {
          const fin = await userRpc(auth.token, 'mcp_finish_code_file_upload', { p_project_id: newId, p_paths: copies.map((c) => c.path) });
          project = fin?.project ?? project;
        }
        const { copies: _c, ...rest } = out;
        return { ...rest, project, binary_copied: copied.length };
      } catch (e) {
        // 반쪽 사본을 남기지 않는다(웹 forkCodeProject 와 같다)
        await userRpc(auth.token, 'mcp_delete_code_project', { p_project_id: newId }).catch(() => {});
        await removeObjects(CODE_BUCKET, copied);
        throw e;
      }
    },
  };

  return async (request) => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const auth = await verify(request);
    if (!auth) return json(401, { error: 'MCP 에이전트 토큰이 필요합니다.' });
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'JSON 을 읽을 수 없습니다.' }); }
    const op = ops[body?.op];
    if (!op || !Object.hasOwn(ops, body.op)) return json(400, { error: '알 수 없는 op 입니다.' });
    try {
      return json(200, await op(auth, body));
    } catch (e) {
      if (e instanceof UserError) return json(422, { error: e.message });
      console.error('mcp-files', body.op, e?.message ?? e);
      return json(500, { error: '파일을 다루지 못했습니다(저장소). 잠시 뒤 다시 시도해 주세요.' });
    }
  };
}
