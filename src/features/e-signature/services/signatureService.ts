/**
 * 전자서명 데이터 계층 — DB·Storage 왕복은 전부 여기를 거친다.
 *
 * 쓰기는 **RPC 전용**이다. 표에 INSERT/UPDATE 정책을 두지 않았으므로 직접 쓰기는 실패한다
 * (차례·신원 검증을 클라이언트가 우회할 수 없게 하는 것이 목적).
 *
 * snake_case ↔ camelCase 변환도 여기서만 한다.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { parsePlacements } from '../lib/signatureField';
// 경로 규약은 순수 lib 에 있다(회귀 테스트가 supabase 클라이언트 없이 import 한다)
import { signedObjectPath, sourceObjectPath } from '../lib/storagePath';
import { signedFileName } from '../lib/stampDocument';

export { signedObjectPath, sourceObjectPath };
import type {
  SignatureRequest, SignatureSigner, SignerDraft, SourceKind,
} from '../types';

export const SIGNATURE_BUCKET = 'signatures';

/* ────────────────────────────── 자동 정리 ────────────────────────────── */

/**
 * 이 탭에서 정리를 이미 걸었는가.
 *
 * pg_cron 이 없어 스케줄러가 없고, Supabase 는 `storage.objects` 직접 DELETE 도 막으므로
 * 서비스 롤로 Storage API 를 쓰는 **엣지 함수**를 목록 조회 때 부른다.
 *
 * **스로틀은 여기(클라이언트)서 한다.** 처음엔 서버가 `system_settings` 에 마지막 실행
 * 시각을 써서 1시간에 한 번만 돌게 했는데, 그 표는 학사력 같은 **운영 설정**이 사는 곳이라
 * 기계 상태를 둘 자리가 아니었고 실패 지점만 늘렸다(컬럼명·NOT NULL 로 두 번 연속 500).
 * 정리 함수는 대상이 없으면 인덱스 조회 몇 번으로 끝나므로 페이지 로드당 1회면 충분하다.
 */
let purgeTriggered = false;

function triggerPurge(): void {
  if (purgeTriggered) return;
  purgeTriggered = true;

  // 실패해도 목록은 그대로 떠야 하므로 **결과를 기다리지 않고 오류도 삼킨다**.
  // 진짜 원인은 엣지 함수 로그(`function_logs`)에 단계와 함께 남는다.
  void supabase.functions.invoke('purge-signature-files')
    .then(({ error }) => { if (error) console.warn('서명 문서 정리 건너뜀', error.message); });
}

/* ────────────────────────────── 읽기 ────────────────────────────── */

interface RequestRow {
  id: string;
  title: string;
  message: string | null;
  subject_type: string | null;
  subject_id: string | null;
  source_kind: SourceKind;
  source_path: string;
  source_name: string;
  source_mime: string | null;
  page_count: number | null;
  signed_path: string | null;
  purged_at: string | null;
  status: SignatureRequest['status'];
  current_order: number;
  requester_user_id: string;
  requester_resource_id: string | null;
  requester_name: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  due_at: string;
  signature_signer?: SignerRow[];
}

interface SignerRow {
  id: string;
  request_id: string;
  order_index: number;
  role_label: string | null;
  signer_user_id: string | null;
  signer_resource_id: string | null;
  signer_name: string;
  status: SignatureSigner['status'];
  signature: unknown;
  comment: string | null;
  acted_at: string | null;
  fields: unknown;
}

function toSigner(row: SignerRow): SignatureSigner {
  return {
    id: row.id,
    requestId: row.request_id,
    orderIndex: row.order_index,
    roleLabel: row.role_label,
    signerUserId: row.signer_user_id,
    signerResourceId: row.signer_resource_id,
    signerName: row.signer_name,
    status: row.status,
    signature: row.signature,
    comment: row.comment,
    actedAt: row.acted_at,
    // 잘못된 배치는 여기서 걸러 낸다 — 화면까지 흘려보내면 렌더가 깨진다
    fields: parsePlacements(row.fields),
  };
}

function toRequest(row: RequestRow): SignatureRequest {
  const signers = (row.signature_signer ?? []).map(toSigner);
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    sourceKind: row.source_kind,
    sourcePath: row.source_path,
    sourceName: row.source_name,
    sourceMime: row.source_mime,
    pageCount: row.page_count,
    signedPath: row.signed_path,
    purgedAt: row.purged_at,
    status: row.status,
    currentOrder: row.current_order,
    requesterUserId: row.requester_user_id,
    requesterResourceId: row.requester_resource_id,
    requesterName: row.requester_name,
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    dueAt: row.due_at,
    // 화면이 순서를 의식하지 않아도 되게 여기서 정렬해 둔다
    signers: signers.sort(
      (a, b) => a.orderIndex - b.orderIndex || a.signerName.localeCompare(b.signerName, 'ko'),
    ),
  };
}

const SELECT = `
  id, title, message, subject_type, subject_id,
  source_kind, source_path, source_name, source_mime, page_count,
  signed_path, purged_at, status, current_order,
  requester_user_id, requester_resource_id, requester_name,
  meta, created_at, updated_at, decided_at, due_at,
  signature_signer (
    id, request_id, order_index, role_label,
    signer_user_id, signer_resource_id, signer_name,
    status, signature, comment, acted_at, fields
  )
`;

/**
 * 내가 볼 수 있는 요청 전부(RLS 가 = 내가 요청 ∪ 내가 서명자 ∪ admin 으로 이미 좁힌다).
 * 화면에서 다시 거르지 않는 이유 — 서버 범위와 화면 범위가 어긋나면 "있는데 안 보인다"가 된다.
 */
export async function fetchSignatureRequests(): Promise<SignatureRequest[]> {
  // Storage 자동 정리 — 아래 참고. 목록을 여는 것이 방아쇠다.
  triggerPurge();

  const { data, error } = await supabase
    .from('signature_request' as never)
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as RequestRow[]).map(toRequest);
}

export async function fetchSignatureRequest(id: string): Promise<SignatureRequest | null> {
  const { data, error } = await supabase
    .from('signature_request' as never)
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toRequest(data as unknown as RequestRow) : null;
}

/** 특정 기능에 붙은 요청들(임베드 버튼·목록용). */
export async function fetchSignatureRequestsBySubject(
  subjectType: string,
  subjectId?: string,
): Promise<SignatureRequest[]> {
  let query = supabase
    .from('signature_request' as never)
    .select(SELECT)
    .eq('subject_type', subjectType);
  if (subjectId) query = query.eq('subject_id', subjectId);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as RequestRow[]).map(toRequest);
}

/* ────────────────────────────── 쓰기 ────────────────────────────── */

export interface CreateSignatureRequestInput {
  title: string;
  message?: string | null;
  file: File;
  sourceKind: SourceKind;
  pageCount?: number | null;
  signers: SignerDraft[];
  subjectType?: string | null;
  subjectId?: string | null;
  meta?: Record<string, unknown>;
  /** 서명 마감(ISO) — 없으면 서버 기본(요청 후 7일) */
  dueAt?: string | null;
}

/**
 * 요청 생성 = **행 먼저, 파일 나중**.
 *
 * 순서가 중요하다. Storage 경로 첫 세그먼트가 요청 id 라서 id 를 먼저 받아야 하고,
 * 파일 업로드가 실패하면 **행을 지운다** — 원본이 없는 요청은 열 수 없는 껍데기이고
 * 서명자에게 알림만 가는 최악의 상태가 된다.
 */
export async function createSignatureRequest(
  input: CreateSignatureRequestInput,
): Promise<string> {
  const { data: requestId, error } = await supabase.rpc('create_signature_request' as never, {
    p_title: input.title,
    p_message: input.message ?? null,
    p_source_kind: input.sourceKind,
    // 실제 경로는 id 를 알아야 정해지므로 임시로 넣고 업로드 후 갱신한다
    p_source_path: 'pending',
    p_source_name: input.file.name,
    p_source_mime: input.file.type || null,
    p_page_count: input.pageCount ?? null,
    p_signers: input.signers.map((s) => ({
      order_index: s.orderIndex,
      role_label: s.roleLabel ?? null,
      signer_resource_id: s.signerResourceId,
      signer_name: s.signerName,
      fields: s.fields,
    })),
    p_subject_type: input.subjectType ?? null,
    p_subject_id: input.subjectId ?? null,
    p_meta: input.meta ?? {},
  } as never);
  if (error) throw error;

  const id = requestId as unknown as string;
  const path = sourceObjectPath(id, input.file.name);

  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, input.file, { contentType: input.file.type || undefined, upsert: true });

  if (uploadError) {
    // 원본 없는 껍데기를 남기지 않는다
    await supabase.rpc('cancel_signature_request' as never, { p_request_id: id } as never);
    throw uploadError;
  }

  const { error: pathError } = await supabase.rpc('set_signature_source_path' as never, {
    p_request_id: id,
    p_source_path: path,
  } as never);
  if (pathError) throw pathError;

  // 마감은 만들고 나서 정한다(create_signature_request 의 인자를 늘리지 않으려고). 실패하면 기본(7일)이 남으므로
  // **던지지 않는다** — 요청은 이미 만들어졌고, 던지면 화면이 실패로 보고 다시 눌러 같은 요청이 둘 생긴다.
  if (input.dueAt) {
    const { error: dueErr } = await supabase.rpc('set_signature_due' as never, { p_request_id: id, p_due_at: input.dueAt } as never);
    if (dueErr) toast.warning(`요청은 보냈지만 마감일을 정하지 못해 기본(7일)으로 두었습니다 — 요청 화면에서 바꿀 수 있습니다. (${dueErr.message})`);
  }

  return id;
}

/** 서명 마감 바꾸기 — 요청자·관리자, 진행 중인 요청만(서버가 범위를 다시 확인한다) */
export async function setSignatureDue(requestId: string, dueAt: string): Promise<void> {
  const { error } = await supabase.rpc('set_signature_due' as never, { p_request_id: requestId, p_due_at: dueAt } as never);
  if (error) throw error;
}

/** 서명 또는 거절. 서버가 차례·신원·서명 유무를 다시 검증한다. */
export async function actOnSignatureRequest(
  requestId: string,
  action: 'sign' | 'reject',
  signature: unknown,
  comment?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('act_on_signature_request' as never, {
    p_request_id: requestId,
    p_action: action,
    p_signature: (signature ?? null) as never,
    p_comment: comment ?? null,
  } as never);
  if (error) throw error;
}

/**
 * 요청 **삭제** — 취소와 다르다.
 *
 * 취소는 진행을 멈추되 기록을 남기고, 삭제는 그 기록까지 없앤다(되돌릴 수 없다).
 * 요청 행·서명자·이미 한 서명 획·서명 링크 토큰이 전부 사라진다.
 *
 * **Storage 를 먼저 지운다.** 삭제 정책(`signatures_delete`)은 경로의 요청 id 로
 * `signature_request` 를 조회해 요청자인지 보는데, 행을 먼저 지우면 그 조회가 실패해
 * **파일을 영영 못 지운다**(영구 고아). 순서가 곧 안전장치다.
 *
 * **Google Drive 로 옮긴 파일은 건드리지 않는다** — 그쪽이 이미 정본이고 소유자도 그 사람이다.
 * 여기서 지우면 "보관해 뒀는데 사라졌다"가 된다.
 */
export async function deleteSignatureRequest(request: SignatureRequest): Promise<void> {
  const paths = [...new Set([
    request.sourcePath,
    sourceObjectPath(request.id, request.sourceName),
    request.signedPath,
    signedObjectPath(request.id, signedFileName(request)),
  ].filter((p): p is string => !!p && p !== 'pending'))];

  // 이미 정리된 요청이면 지울 파일이 없다. 없는 파일 삭제는 오류가 아니므로 그냥 부른다.
  const { error: rmError } = await supabase.storage.from(SIGNATURE_BUCKET).remove(paths);
  if (rmError) {
    // 여기서 멈춘다 — 행을 지우면 이 파일들을 되찾을 방법이 없어진다
    throw new Error(`문서 파일을 지우지 못했습니다: ${rmError.message}`);
  }

  const { error } = await supabase.rpc('delete_signature_request' as never, {
    p_request_id: request.id,
  } as never);
  if (error) throw error;
}

export async function cancelSignatureRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_signature_request' as never, {
    p_request_id: requestId,
  } as never);
  if (error) throw error;
}

/* ────────────────────────────── 파일 ────────────────────────────── */

export async function downloadSignatureFile(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(path);
  if (error) throw error;
  return data;
}

/**
 * 완성본 업로드 + 경로 기록.
 *
 * 날인은 브라우저에서 한다(rhwp·pdf-lib·canvas 가 전부 클라이언트 라이브러리다).
 * 서버는 "완료된 요청인가"만 검증한다.
 */
export async function uploadSignedFile(
  requestId: string,
  fileName: string,
  blob: Blob,
): Promise<string> {
  const path = signedObjectPath(requestId, fileName);
  const { error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, blob, { contentType: blob.type || undefined, upsert: true });
  if (error) throw error;

  const { error: rpcError } = await supabase.rpc('set_signature_request_signed_path' as never, {
    p_request_id: requestId,
    p_signed_path: path,
  } as never);
  if (rpcError) throw rpcError;

  return path;
}
