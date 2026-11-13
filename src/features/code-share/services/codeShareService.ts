/**
 * 코드 공유 — 데이터 계층 (Supabase 표 2개 + 비공개 버킷 `code-projects`).
 *
 * 판정은 전부 `@/lib/codeShare` 에 있다. 여기는 읽고 쓰는 일만 한다.
 *
 * 저장 규칙
 *  - 텍스트 파일 = `code_project_file.content`, 이진 = 버킷 `<project_id>/<path>` + `storage_path`
 *  - 프로젝트 생성은 **행 먼저, 파일 나중** — 파일 쓰기가 실패하면 행을 지워(cascade) 고아를 남기지 않는다
 *  - 상세 조회는 RPC `get_code_project` — 목록 SELECT 정책은 '링크를 아는 사람' 공개를 빼므로
 *    표를 직접 읽으면 링크 공유가 열리지 않는다
 */
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import {
  CODE_SHARE_LIMITS,
  isTextPath,
  planUpload,
  type CodeFileDraft,
  type CodeProjectKind,
  type CodeProjectVisibility,
} from '@/lib/codeShare';

export const CODE_BUCKET = 'code-projects';

export interface CodeProjectOwner {
  id: string;
  name: string;
  type: string;
}

export interface CodeProject {
  id: string;
  owner_resource_id: string;
  created_by: string;
  title: string;
  description: string | null;
  visibility: CodeProjectVisibility;
  kind: CodeProjectKind;
  entry_path: string | null;
  origin_tool: string | null;
  tags: string[];
  forked_from: string | null;
  file_count: number;
  total_bytes: number;
  created_at: string;
  updated_at: string;
  owner?: CodeProjectOwner | null;
}

export interface CodeProjectFile {
  id: string;
  project_id: string;
  path: string;
  content: string | null;
  storage_path: string | null;
  is_binary: boolean;
  size_bytes: number;
}

/** 올리기 단계의 파일 — 이진이면 `blob` 을 들고 있다 */
export interface CodeFileUpload extends CodeFileDraft {
  blob?: Blob;
}

export interface CodeProjectInput {
  title: string;
  description?: string | null;
  visibility: CodeProjectVisibility;
  kind: CodeProjectKind;
  entryPath?: string | null;
  originTool?: string | null;
  tags?: string[];
  forkedFrom?: string | null;
}

const OWNER_SELECT = 'owner:resource!code_project_owner_resource_id_fkey(id,name,type)';

function toProject(row: Record<string, unknown>): CodeProject {
  const owner = row.owner as CodeProjectOwner | null | undefined;
  return { ...(row as unknown as CodeProject), owner: owner ?? null };
}

// ── 조회 ─────────────────────────────────────────────────────────────────

export async function listCodeProjects(opts: { scope: 'all' | 'mine'; myResourceId?: string | null }): Promise<CodeProject[]> {
  let query = supabase
    .from('code_project')
    .select(`*, ${OWNER_SELECT}`)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (opts.scope === 'mine') {
    if (!opts.myResourceId) return [];
    query = query.eq('owner_resource_id', opts.myResourceId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => toProject(r as Record<string, unknown>));
}

export async function getCodeProject(id: string): Promise<CodeProject | null> {
  const { data, error } = await supabase.rpc('get_code_project', { p_project_id: id });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  const { data: owner } = await supabase
    .from('resource')
    .select('id,name,type')
    .eq('id', row.owner_resource_id)
    .maybeSingle();
  return toProject({ ...row, owner: owner ?? null });
}

export async function getCodeProjectForkCount(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('code_project_fork_count', { p_project_id: id });
  if (error) throw error;
  return data ?? 0;
}

export async function listCodeProjectFiles(projectId: string): Promise<CodeProjectFile[]> {
  const { data, error } = await supabase
    .from('code_project_file')
    .select('id,project_id,path,content,storage_path,is_binary,size_bytes')
    .eq('project_id', projectId)
    .order('path');
  if (error) throw error;
  return (data ?? []) as CodeProjectFile[];
}

export async function downloadBinary(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(CODE_BUCKET).download(storagePath);
  if (error) throw error;
  return data;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

// ── 쓰기 ─────────────────────────────────────────────────────────────────

async function removeProjectObjects(projectId: string): Promise<void> {
  const { data } = await supabase.storage.from(CODE_BUCKET).list(projectId, { limit: 1000 });
  const names = (data ?? []).map((o) => `${projectId}/${o.name}`);
  // 하위 폴더는 list 가 폴더로만 돌려주므로 한 단계 더 내려간다(한도 안이라 깊이 2면 충분)
  for (const o of data ?? []) {
    if (!o.id) {
      const { data: inner } = await supabase.storage.from(CODE_BUCKET).list(`${projectId}/${o.name}`, { limit: 1000 });
      names.push(...(inner ?? []).map((i) => `${projectId}/${o.name}/${i.name}`));
    }
  }
  if (names.length) await supabase.storage.from(CODE_BUCKET).remove(names);
}

async function writeFiles(projectId: string, files: CodeFileUpload[]): Promise<void> {
  const rows: Array<{
    project_id: string; path: string; content: string | null; storage_path: string | null; is_binary: boolean; size_bytes: number;
  }> = [];
  for (const f of files) {
    if (f.isBinary) {
      if (!f.blob) throw new Error(`${f.path}: 이진 파일 본문이 없습니다.`);
      const storagePath = `${projectId}/${f.path}`;
      const { error } = await supabase.storage.from(CODE_BUCKET).upload(storagePath, f.blob, { upsert: true });
      if (error) throw new Error(`${f.path} 업로드 실패: ${error.message}`);
      rows.push({ project_id: projectId, path: f.path, content: null, storage_path: storagePath, is_binary: true, size_bytes: f.size });
    } else {
      rows.push({ project_id: projectId, path: f.path, content: f.content ?? '', storage_path: null, is_binary: false, size_bytes: f.size });
    }
  }
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from('code_project_file').insert(rows.slice(i, i + 50));
    if (error) throw error;
  }
}

export async function createCodeProject(
  ownerResourceId: string,
  input: CodeProjectInput,
  files: CodeFileUpload[],
): Promise<CodeProject> {
  const { data: row, error } = await supabase
    .from('code_project')
    .insert({
      owner_resource_id: ownerResourceId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      visibility: input.visibility,
      kind: input.kind,
      entry_path: input.entryPath ?? null,
      origin_tool: input.originTool?.trim() || null,
      tags: input.tags ?? [],
      forked_from: input.forkedFrom ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  try {
    await writeFiles(row.id, files);
  } catch (e) {
    await removeProjectObjects(row.id).catch(() => undefined);
    await supabase.from('code_project').delete().eq('id', row.id);
    throw e;
  }
  return toProject(row as Record<string, unknown>);
}

export async function updateCodeProject(
  id: string,
  patch: Partial<Pick<CodeProjectInput, 'title' | 'description' | 'visibility' | 'kind' | 'entryPath' | 'originTool' | 'tags'>>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.description !== undefined) body.description = patch.description?.trim() || null;
  if (patch.visibility !== undefined) body.visibility = patch.visibility;
  if (patch.kind !== undefined) body.kind = patch.kind;
  if (patch.entryPath !== undefined) body.entry_path = patch.entryPath;
  if (patch.originTool !== undefined) body.origin_tool = patch.originTool?.trim() || null;
  if (patch.tags !== undefined) body.tags = patch.tags;
  const { data, error } = await supabase.from('code_project').update(body).eq('id', id).select('id');
  if (error) throw error;
  // RLS 차단은 오류가 아니라 0행이다
  if (!data || data.length === 0) throw new Error('수정 권한이 없습니다.');
}

/** 텍스트 파일 한 장 저장(없으면 추가) */
export async function saveCodeProjectTextFile(projectId: string, path: string, content: string): Promise<void> {
  const size = new TextEncoder().encode(content).length;
  if (size > CODE_SHARE_LIMITS.maxTextBytes) throw new Error(`${path}: 파일이 너무 큽니다.`);
  const { error } = await supabase
    .from('code_project_file')
    .upsert(
      { project_id: projectId, path, content, storage_path: null, is_binary: false, size_bytes: size },
      { onConflict: 'project_id,path' },
    );
  if (error) throw error;
}

export async function deleteCodeProjectFile(file: CodeProjectFile): Promise<void> {
  if (file.storage_path) await supabase.storage.from(CODE_BUCKET).remove([file.storage_path]);
  const { data, error } = await supabase.from('code_project_file').delete().eq('id', file.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제 권한이 없습니다.');
}

export async function addCodeProjectFiles(projectId: string, files: CodeFileUpload[]): Promise<void> {
  // 같은 경로가 이미 있으면 바꿔치기 — 행은 upsert, 이진은 upsert 업로드
  const { data: existing } = await supabase
    .from('code_project_file')
    .select('id,path')
    .eq('project_id', projectId)
    .in('path', files.map((f) => f.path));
  if (existing?.length) {
    await supabase.from('code_project_file').delete().in('id', existing.map((e) => e.id));
  }
  await writeFiles(projectId, files);
}

export async function deleteCodeProject(id: string): Promise<void> {
  await removeProjectObjects(id);
  const { data, error } = await supabase.from('code_project').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제 권한이 없습니다.');
}

/**
 * 가져가기(포크). 텍스트는 행 복사, 이진은 버킷 안에서 복사(`copy` — 내려받아 다시 올리지 않는다).
 * 실패하면 새 행을 지워 반쪽 사본을 남기지 않는다.
 */
export async function forkCodeProject(
  ownerResourceId: string,
  source: CodeProject,
  files: CodeProjectFile[],
  opts: { title: string; visibility: CodeProjectVisibility },
): Promise<CodeProject> {
  const { data: row, error } = await supabase
    .from('code_project')
    .insert({
      owner_resource_id: ownerResourceId,
      title: opts.title.trim(),
      description: source.description,
      visibility: opts.visibility,
      kind: source.kind,
      entry_path: source.entry_path,
      origin_tool: source.origin_tool,
      tags: source.tags,
      forked_from: source.id,
    })
    .select()
    .single();
  if (error) throw error;
  try {
    const rows = [] as Array<{
      project_id: string; path: string; content: string | null; storage_path: string | null; is_binary: boolean; size_bytes: number;
    }>;
    for (const f of files) {
      if (f.is_binary && f.storage_path) {
        const to = `${row.id}/${f.path}`;
        const { error: copyError } = await supabase.storage.from(CODE_BUCKET).copy(f.storage_path, to);
        if (copyError) throw new Error(`${f.path} 복사 실패: ${copyError.message}`);
        rows.push({ project_id: row.id, path: f.path, content: null, storage_path: to, is_binary: true, size_bytes: f.size_bytes });
      } else {
        rows.push({ project_id: row.id, path: f.path, content: f.content ?? '', storage_path: null, is_binary: false, size_bytes: f.size_bytes });
      }
    }
    for (let i = 0; i < rows.length; i += 50) {
      const { error: insErr } = await supabase.from('code_project_file').insert(rows.slice(i, i + 50));
      if (insErr) throw insErr;
    }
  } catch (e) {
    await removeProjectObjects(row.id).catch(() => undefined);
    await supabase.from('code_project').delete().eq('id', row.id);
    throw e;
  }
  return toProject(row as Record<string, unknown>);
}

// ── 올리기 입력 → 초안 ───────────────────────────────────────────────────

/** 파일·폴더 선택 / 드롭에서 온 File 목록을 저장 초안으로 */
export async function draftsFromFiles(files: File[]): Promise<{ drafts: CodeFileUpload[]; ignored: Array<{ path: string; reason: string }> }> {
  const entries = files.map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string; path?: string }).webkitRelativePath
      || (file as File & { path?: string }).path
      || file.name,
    size: file.size,
  }));
  const plan = planUpload(entries);
  const drafts: CodeFileUpload[] = [];
  for (const k of plan.kept) {
    if (isTextPath(k.path)) {
      drafts.push({ path: k.path, content: await k.file.text(), isBinary: false, size: k.size });
    } else {
      drafts.push({ path: k.path, content: null, isBinary: true, size: k.size, blob: k.file });
    }
  }
  return { drafts, ignored: plan.ignored };
}

/** zip 한 개를 풀어 저장 초안으로 */
export async function draftsFromZip(file: File | Blob): Promise<{ drafts: CodeFileUpload[]; ignored: Array<{ path: string; reason: string }> }> {
  const zip = await JSZip.loadAsync(file);
  const entries: Array<{ entry: JSZip.JSZipObject; path: string; size: number }> = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    entries.push({ entry, path: relPath, size: 0 });
  });
  const plan = planUpload(entries);
  const drafts: CodeFileUpload[] = [];
  for (const k of plan.kept) {
    if (isTextPath(k.path)) {
      const content = await k.entry.async('string');
      drafts.push({ path: k.path, content, isBinary: false, size: new TextEncoder().encode(content).length });
    } else {
      const blob = await k.entry.async('blob');
      drafts.push({ path: k.path, content: null, isBinary: true, size: blob.size, blob });
    }
  }
  return { drafts, ignored: plan.ignored };
}

/** 붙여넣은 코드 한 장 */
export function draftFromPastedCode(code: string, filename: string): CodeFileUpload {
  return { path: filename, content: code, isBinary: false, size: new TextEncoder().encode(code).length };
}

// ── 내려받기 ─────────────────────────────────────────────────────────────

export async function buildProjectZip(project: CodeProject, files: CodeProjectFile[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    if (f.is_binary && f.storage_path) {
      zip.file(f.path, await downloadBinary(f.storage_path));
    } else {
      zip.file(f.path, f.content ?? '');
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

export function safeZipName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '-');
  return `${base || 'code-project'}.zip`;
}
