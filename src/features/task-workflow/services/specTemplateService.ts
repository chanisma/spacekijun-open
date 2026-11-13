// Action Spec 템플릿 저장·조회 + 브라우저 HWPX 섹션 IO + 생성 결과 업로드.
// spec 컬럼(20260725003603)은 생성 타입에 반영됨 — Json↔WorkSpec 경계 캐스트만 사용.

import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { reorderAndExport } from '@/features/issue-register/hwpx/generateVolunteerHwpx';
import { normalizeHwpxLayout } from '@/lib/rhwp/coreEngine';
import { sha256Hex, HWPX_MIME_TYPE } from '../document/hwpxTemplateEngine';
import { normalizeSpecPlanKeys, type WorkSpec } from '../document/spec';

const TEMPLATE_BUCKET = 'task-work-documents';
const SECTION_RE = /^Contents\/section\d+\.xml$/;

export interface HwpxSectionSource {
  zip: JSZip;
  sectionNames: string[];
  sections: string[];
}

/** HWPX(zip)에서 섹션 XML들을 문서 순서로 추출 */
export async function loadHwpxSections(source: Blob): Promise<HwpxSectionSource> {
  const zip = await JSZip.loadAsync(await source.arrayBuffer());
  const sectionNames = Object.keys(zip.files)
    .filter((n) => SECTION_RE.test(n))
    .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
  if (!sectionNames.length) throw new Error('HWPX 본문 섹션을 찾을 수 없습니다.');
  const sections: string[] = [];
  for (const n of sectionNames) sections.push(await zip.file(n)!.async('text'));
  return { zip, sectionNames, sections };
}

/**
 * 수정된 섹션들을 같은 zip에 반영해 유효한 HWPX Blob 생성(mimetype STORE 선두).
 * 이어서 줄 레이아웃 캐시를 재계산한다 — 스펙 엔진이 편집 문단의 캐시를 지우기 때문에
 * 그대로 두면 rhwp Studio가 "HWPX 비표준 감지"를 띄운다(`normalizeHwpxLayout` 주석 참조).
 * core 출력도 mimetype STORE 선두를 유지하므로 재포장이 필요 없다(실측).
 */
export async function exportHwpxSections(src: HwpxSectionSource, sections: string[]): Promise<Blob> {
  src.sectionNames.forEach((name, i) => src.zip.file(name, sections[i]));
  const packed = await reorderAndExport(src.zip);
  const normalized = await normalizeHwpxLayout(packed);
  return new Blob([normalized as BlobPart], { type: HWPX_MIME_TYPE });
}

export interface SpecTemplateRow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  family_id: string;
  source_file_name: string;
  storage_path: string;
  content_sha256: string;
  archived_at: string | null;
  created_at: string;
  /** 만든 사람 — 스펙 저장·보관 권한 판정(읽기는 전 교사 공유) */
  created_by: string;
  spec: WorkSpec;
}

const SPEC_SELECT =
  'id, name, description, version, family_id, source_file_name, storage_path, content_sha256, archived_at, created_at, created_by, spec';

function parseSpec(value: unknown): WorkSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const spec = value as WorkSpec;
  return spec.specVersion === 1 && Array.isArray(spec.targets) ? spec : null;
}

const specTable = () => supabase.from('task_action_document_template');

/** spec이 등록된 템플릿(현재 버전만) */
export async function listSpecTemplates(): Promise<SpecTemplateRow[]> {
  const { data, error } = await specTable()
    .select(SPEC_SELECT)
    .is('archived_at', null)
    .not('spec', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`스펙 템플릿 조회 실패: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const spec = parseSpec(row.spec);
    return spec ? [{ ...row, spec }] : [];
  });
}

/** 특정 템플릿 "버전 행" 조회(보관본 포함) — 완성 문서가 고정 참조하는 버전 재구성용 */
export async function getSpecTemplateById(id: string): Promise<SpecTemplateRow> {
  const { data, error } = await specTable().select(SPEC_SELECT).eq('id', id).single();
  if (error) throw new Error(`템플릿 버전 조회 실패: ${error.message}`);
  const spec = parseSpec(data.spec);
  if (!spec) throw new Error('이 템플릿 버전에는 스펙이 없습니다.');
  return { ...data, spec };
}

/** 새 스펙 템플릿 등록: 원본 업로드 + spec 저장 (v1 계보 규칙 준수) */
export async function createSpecTemplate(input: {
  name: string;
  description?: string;
  file: File;
  spec: WorkSpec;
}): Promise<SpecTemplateRow> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('로그인이 필요합니다.');
  const user = auth.user;
  const id = crypto.randomUUID();
  const storagePath = `${user.id}/templates/${id}/template.hwpx`;
  const contentSha256 = await sha256Hex(input.file);

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(storagePath, input.file, { contentType: HWPX_MIME_TYPE, upsert: false });
  if (uploadError) throw new Error(`템플릿 업로드 실패: ${uploadError.message}`);

  const { data, error } = await specTable()
    .insert({
      id,
      created_by: user.id,
      family_id: id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      source_file_name: input.file.name.slice(0, 255),
      storage_path: storagePath,
      mime_type: HWPX_MIME_TYPE,
      size_bytes: input.file.size,
      content_sha256: contentSha256,
      fields: [],
      spec: normalizeSpecPlanKeys(input.spec) as unknown as Json,
    })
    .select(SPEC_SELECT)
    .single();
  if (error) {
    await supabase.storage.from(TEMPLATE_BUCKET).remove([storagePath]);
    throw new Error(`스펙 템플릿 등록 실패: ${error.message}`);
  }
  return { ...data, spec: parseSpec(data.spec) ?? input.spec };
}

/**
 * confirm 단계의 스펙 수정 저장(spec 컬럼은 확정 전 편집 가능 — 설계 §6).
 * 쓰기 RLS는 생성자 전용 — 비소유자의 UPDATE는 **에러 없이 0행**이라 그냥 두면
 * "저장됨"으로 보인다. 반환 행으로 실제 반영을 확인한다.
 */
export async function updateTemplateSpec(id: string, spec: WorkSpec): Promise<void> {
  const { data, error } = await specTable()
    .update({ spec: normalizeSpecPlanKeys(spec) as unknown as Json })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(`스펙 저장 실패: ${error.message}`);
  if (!data?.length) throw new Error('이 양식을 만든 사람만 스펙을 저장할 수 있습니다.');
}

/**
 * 양식 스펙 보관(목록에서 제거): 템플릿 버전은 불변·삭제 불가(과거 RUN·완성 문서
 * 재구성 보호 — delete 권한 자체가 없음)라 archived_at 설정이 "삭제"의 실체다.
 * 보관돼도 이 버전을 참조하는 완성 문서의 재구성은 계속 동작한다.
 */
export async function archiveSpecTemplate(id: string): Promise<void> {
  const { data, error } = await specTable()
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(`양식 보관 실패: ${error.message}`);
  // updateTemplateSpec과 같은 이유 — RLS 차단은 0행이지 오류가 아니다
  if (!data?.length) throw new Error('이 양식을 만든 사람만 보관할 수 있습니다.');
}

/** 템플릿 원본 다운로드(비공개 Storage) */
export async function downloadSpecTemplateSource(row: SpecTemplateRow): Promise<Blob> {
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(row.storage_path);
  if (error || !data) throw new Error(`템플릿 원본 다운로드 실패: ${error?.message ?? ''}`);
  return data;
}

export interface UploadedSpecHwpx {
  bucket: typeof TEMPLATE_BUCKET;
  path: string;
  fileName: string;
  mimeType: typeof HWPX_MIME_TYPE;
  sizeBytes: number;
  contentSha256: string;
}

/** 생성 결과 업로드({userId}/runs/{runId}/...) — template_fill과 동일한 위치·locator 규약 */
export async function uploadGeneratedSpecHwpx(input: {
  runId: string;
  blob: Blob;
  fileName: string;
}): Promise<UploadedSpecHwpx> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('로그인이 필요합니다.');
  const path = `${auth.user.id}/runs/${input.runId}/${crypto.randomUUID()}.hwpx`;
  const contentSha256 = await sha256Hex(input.blob);
  const { error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, input.blob, {
    cacheControl: '3600',
    contentType: HWPX_MIME_TYPE,
    upsert: false,
  });
  if (error) throw new Error(`생성 문서 업로드 실패: ${error.message}`);
  const safe = input.fileName.replace(/[<>:"/\\|?*]/g, '_').replace(/\.hwpx$/i, '').slice(0, 120);
  return {
    bucket: TEMPLATE_BUCKET,
    path,
    fileName: `${safe || '생성문서'}.hwpx`,
    mimeType: HWPX_MIME_TYPE,
    sizeBytes: input.blob.size,
    contentSha256,
  };
}
