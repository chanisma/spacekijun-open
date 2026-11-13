/**
 * 서류함 데이터 서비스 — documents 테이블·Storage·Drive 정리 로직의 단일 출처.
 *
 * 설계 노트 (2026-08-11 개편):
 * - 로컬 업로드는 비공개 `documents` 버킷의 `library/{uid}/...` 경로에 저장하고
 *   storage_path에 **상대 경로**를 기록한다 (열람은 signed URL).
 * - 레거시 행(2026-08 이전)은 storage_path가 http URL(대부분 Drive 링크)이라
 *   읽기·열람·삭제 경로에 URL 분기를 유지한다.
 * - RLS 차단은 오류가 아니라 0행으로 나타나므로 update/delete는 `.select('id')`
 *   반환 행 수로 실제 반영을 확인한다 (프로젝트 공통 패턴).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Document, DocumentFilters, DocumentUploadMetadata, DocumentWithUploader } from '../types';

/** 서류함 로컬 업로드 버킷 (비공개) */
export const DOCUMENT_BUCKET = 'documents';
/** 버킷 내 서류함 경로 prefix */
export const LIBRARY_PREFIX = 'library';

/**
 * 한 번에 가져오는 문서 상한. PostgREST는 무제한 select를 1000행에서 조용히
 * 자르므로(2026-08-11 편성 관리 버그와 동일 함정) 명시적 상한 + count로
 * 잘림을 감지한다. 현재 데이터 80행 — 상한 초과 시 UI에 경고를 띄운다.
 */
export const DOCUMENT_FETCH_LIMIT = 2000;

const DOCUMENT_COLUMNS =
  'id, title, file_name, file_type, file_size, storage_path, upload_status, user_id, created_at, updated_at, meta';

/**
 * PostgREST `.or()` 조립용 검색어 정리.
 * or() 문자열 문법에서 `,`·`(`·`)`는 구분자라 검색어에 섞이면 쿼리가 깨진다
 * (구 searchDocumentsAdvanced의 결함). 해당 문자는 공백으로 치환한다.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"]/g, ' ').trim();
}

export interface FetchDocumentsResult {
  documents: DocumentWithUploader[];
  /** 서버 총 행 수 — DOCUMENT_FETCH_LIMIT보다 크면 목록이 잘린 것 */
  totalCount: number;
}

/**
 * 문서 목록 조회 (교사/admin 전용 — RLS가 보장).
 * 통합 검색·필터는 서버 사이드로 적용하고, 폴더(가상 경로) 필터는
 * 트리 집계와 함께 클라이언트에서 처리한다.
 */
export async function fetchDocuments(filters: DocumentFilters = {}): Promise<FetchDocumentsResult> {
  let query = supabase
    .from('documents')
    .select(`${DOCUMENT_COLUMNS}, profiles!documents_user_id_fkey ( name, email )`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, DOCUMENT_FETCH_LIMIT - 1);

  const q = filters.q ? sanitizeSearchTerm(filters.q) : '';
  if (q) {
    // meta->>keywords 는 배열의 JSON 직렬화 텍스트라 ilike 부분 일치가 동작한다
    query = query.or(
      [
        `file_name.ilike.%${q}%`,
        `title.ilike.%${q}%`,
        `meta->>department.ilike.%${q}%`,
        `meta->>category.ilike.%${q}%`,
        `meta->>keywords.ilike.%${q}%`,
        `meta->>search_keywords.ilike.%${q}%`,
      ].join(','),
    );
  }
  if (filters.department) {
    query = query.eq('meta->>department', filters.department);
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom.toISOString());
  }
  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte('created_at', endOfDay.toISOString());
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    documents: (data ?? []) as unknown as DocumentWithUploader[],
    totalCount: count ?? data?.length ?? 0,
  };
}

/** 폴더 registry 경로 목록 (빈 폴더 포함용) */
export async function fetchFolderPaths(): Promise<string[]> {
  const { data, error } = await supabase
    .from('document_folders')
    .select('path')
    .order('path')
    .range(0, DOCUMENT_FETCH_LIMIT - 1);
  if (error) throw error;
  return (data ?? []).map((row) => row.path);
}

/** 빈 폴더 생성 (admin 전용 — RLS가 거부하면 오류) */
export async function createFolder(path: string): Promise<void> {
  const trimmed = path.replace(/^\/+|\/+$/g, '').trim();
  if (!trimmed) throw new Error('폴더 경로가 비어 있습니다.');
  const { data, error } = await supabase
    .from('document_folders')
    .insert({ path: trimmed })
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('폴더 생성 권한이 없습니다.');
}

/**
 * 폴더 이동/이름변경 — 하위 문서 경로까지 원자적 prefix 치환 (admin 전용 RPC).
 * @returns 경로가 갱신된 문서 수
 */
export async function moveFolder(oldPath: string, newPath: string): Promise<number> {
  const { data, error } = await supabase.rpc('move_document_folder', {
    p_old_path: oldPath,
    p_new_path: newPath,
  });
  if (error) throw error;
  return data ?? 0;
}

/** 서류함 로컬 파일 업로드: Storage(비공개) 저장 + documents 행 생성 */
export async function uploadDocument(
  file: File,
  userId: string,
  metadata: DocumentUploadMetadata,
  directoryPath?: string | null,
): Promise<Document> {
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const objectPath = `${LIBRARY_PREFIX}/${userId}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(objectPath, file);
  if (uploadError) throw uploadError;

  // 표시용 가상 폴더 경로: 선택된 폴더가 있으면 그대로, 없으면 연도/서류함/부서/분류
  const year = metadata.creation_year || new Date().getFullYear().toString();
  const defaultPath = [year, '서류함', metadata.department, metadata.category]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join('/');

  const documentData = {
    title: metadata.title?.trim() || file.name.replace(/\.[^/.]+$/, ''),
    file_name: file.name,
    file_type: file.type || 'application/octet-stream',
    file_size: file.size,
    storage_path: objectPath,
    upload_status: 'completed',
    user_id: userId,
    meta: {
      ...metadata,
      uploaded_from: 'document_upload',
      upload_source: 'manual_upload' as const,
      uploaded_by_user: true,
      original_filename: file.name,
      file_extension: fileExt,
      upload_timestamp: new Date().toISOString(),
      directory_path: directoryPath || defaultPath,
      storage_bucket: DOCUMENT_BUCKET,
      keywords: metadata.search_keywords ?? metadata.tags ?? [],
    },
  };

  const { data, error } = await supabase.from('documents').insert([documentData]).select().single();
  if (error) {
    // 행 생성 실패 시 고아 파일 정리
    await supabase.storage.from(DOCUMENT_BUCKET).remove([objectPath]);
    throw error;
  }
  return data as unknown as Document;
}

/** 문서 메타 수정 (이름변경·분류 등). RLS 차단(0행)을 오류로 승격 */
export async function updateDocument(
  documentId: string,
  updates: { file_name?: string; title?: string; meta?: Document['meta'] },
): Promise<void> {
  const { data, error } = await supabase
    .from('documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('수정 권한이 없거나 문서를 찾을 수 없습니다.');
  }
}

/** storage_path가 Supabase 공개 URL이면 [버킷, 경로]를 추출 (레거시 행 정리용) */
function parseSupabasePublicUrl(url: string): { bucket: string; path: string } | null {
  const parts = url.split('/storage/v1/object/public/');
  if (parts.length !== 2) return null;
  const [bucket, ...pathParts] = parts[1].split('/');
  if (!bucket || pathParts.length === 0) return null;
  return { bucket, path: decodeURIComponent(pathParts.join('/')) };
}

export type DeleteBlockReason = 'linked_source' | 'external_upload' | null;

/** 서류함에서 삭제할 수 없는 문서인지 판정 (업무/이벤트 연결분·타 시스템 등록분) */
export function getDeleteBlockReason(doc: Document): DeleteBlockReason {
  if (doc.meta?.source) return 'linked_source';
  const uploadedFrom = doc.meta?.uploaded_from;
  const deletableSources = ['document_upload', 'google_drive', 'google_drive_folder', 'google_drive_integration', undefined, null, ''];
  if (uploadedFrom && !deletableSources.includes(uploadedFrom)) return 'external_upload';
  return null;
}

export interface DeleteResult {
  /** Drive 원본 삭제 결과: true=삭제, false=인증 없음/실패로 레코드만 삭제 */
  driveDeleted: boolean | null;
}

/**
 * 문서 삭제: (Drive 파일이면 Drive 삭제 시도) → Storage 정리 → 행 삭제.
 * Storage/Drive 정리는 best-effort, 행 삭제는 RLS 0행 검증.
 * @param options.force 관리자 문서 관리 탭 전용 — 연결/외부 등록 가드를 건너뜀
 */
export async function deleteDocument(doc: Document, options?: { force?: boolean }): Promise<DeleteResult> {
  if (!options?.force) {
    const blockReason = getDeleteBlockReason(doc);
    if (blockReason === 'linked_source') {
      throw new Error('연결된 작업이나 이벤트의 문서는 삭제할 수 없습니다.');
    }
    if (blockReason === 'external_upload') {
      throw new Error('다른 시스템에서 등록된 문서는 삭제할 수 없습니다.');
    }
  }

  let driveDeleted: boolean | null = null;

  // 1) Google Drive 원본 삭제 (서류함에서 등록한 것만)
  const isGoogleDriveFile =
    doc.meta?.is_google_drive_file === true ||
    doc.meta?.uploaded_from === 'google_drive' ||
    doc.meta?.uploaded_from === 'google_drive_folder';
  if (isGoogleDriveFile && doc.meta?.google_drive_id) {
    driveDeleted = false;
    try {
      const { getGoogleDriveService } = await import('@/services/googleDriveServiceNew');
      const driveService = getGoogleDriveService();
      await driveService.initialize();
      if (await driveService.isAuthenticated()) {
        await driveService.deleteFile(doc.meta.google_drive_id);
        driveDeleted = true;
      }
    } catch (driveError) {
      console.error('Google Drive 파일 삭제 오류:', driveError);
    }
  }

  // 2) Storage 파일 정리 (best-effort)
  if (doc.storage_path) {
    if (doc.storage_path.startsWith('http')) {
      const parsed = parseSupabasePublicUrl(doc.storage_path);
      if (parsed) {
        const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
        if (error) console.error('스토리지 파일 삭제 오류:', error);
      }
      // Drive URL 등 외부 URL은 Storage 정리 대상 아님
    } else {
      const bucket = doc.meta?.storage_bucket || DOCUMENT_BUCKET;
      const { error } = await supabase.storage.from(bucket).remove([doc.storage_path]);
      if (error) console.error('스토리지 파일 삭제 오류:', error);
    }
  }

  // 3) 행 삭제 (RLS 차단 감지)
  const { data, error } = await supabase.from('documents').delete().eq('id', doc.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('삭제 권한이 없거나 문서를 찾을 수 없습니다.');
  }

  return { driveDeleted };
}

/** 열람 URL 해석: Drive/외부 URL은 그대로, 비공개 Storage는 signed URL */
export async function resolveDocumentUrl(doc: Document): Promise<string> {
  if (doc.storage_path.startsWith('http')) {
    return doc.storage_path;
  }
  const bucket = doc.meta?.storage_bucket || DOCUMENT_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(doc.storage_path, 60 * 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('파일 URL 생성에 실패했습니다.');
  }
  return data.signedUrl;
}

/** 요구사항: 웹 열람은 항상 새 창 */
export async function openDocumentInNewTab(doc: Document): Promise<void> {
  const url = await resolveDocumentUrl(doc);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** 파일 다운로드 (블롭 저장) */
export async function downloadDocument(doc: Document): Promise<void> {
  let blob: Blob;
  if (doc.storage_path.startsWith('http')) {
    const response = await fetch(doc.storage_path);
    if (!response.ok) throw new Error(`다운로드 실패 (HTTP ${response.status})`);
    blob = await response.blob();
  } else {
    const bucket = doc.meta?.storage_bucket || DOCUMENT_BUCKET;
    const { data, error } = await supabase.storage.from(bucket).download(doc.storage_path);
    if (error || !data) throw error ?? new Error('다운로드에 실패했습니다.');
    blob = data;
  }

  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = doc.file_name;
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
