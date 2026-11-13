/**
 * 완성본을 Google Drive 로 **옮긴다**.
 *
 * ── 옮기기(move) 시맨틱 ───────────────────────────────────────────────────
 * Drive 에 올라가면 **원본과 완성본을 모두 Storage 에서 지운다**(사용자 결정 2026-09-04).
 * Drive 파일에 서명이 이미 찍혀 있으므로 원본을 남길 이유가 없다 — 서명본을 다시 만들
 * 필요가 없기 때문이다. `purged_at` 을 기록해 화면이 "파일이 정리됐다"를 말할 수 있게 한다.
 *
 * ── 인증이 자주 없다는 사실 ───────────────────────────────────────────────
 * Drive 접근은 **로그인한 사람의 개인 토큰**(`session.provider_token`)을 쓰는데,
 * **Supabase 는 세션이 갱신되면 이 토큰을 버린다** — 최초 OAuth 직후에만 존재한다.
 * 그래서 `isAuthenticated()` 는 평소에 대부분 false 다.
 *
 * 이걸 "조용히 넘어감"으로 처리하면 **기능이 한 번도 동작하지 않는다**. 그래서 인증이
 * 없으면 `needs-auth` 를 돌려주고, 호출부가 **막지 않는 토스트 + [인증하고 보관] 버튼**으로
 * 안내한다. 모달을 띄우지 않으므로 방해가 아니고, 사용자가 이미 내려받기를 누른 흐름
 * 안이라 맥락도 맞는다.
 *
 * 결과는 `meta.drive` 에 기록한다. **실패는 기록하지 않는다** — 다음에 자연히 다시
 * 시도되고, 기록해 두면 "실패했음"을 지우는 코드가 또 필요해진다.
 */
import { supabase } from '@/integrations/supabase/client';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { SIGNATURE_BUCKET } from './signatureService';
import { signedObjectPath, sourceObjectPath } from '../lib/storagePath';
import { signedFileName } from '../lib/stampDocument';
import type { SignatureRequest } from '../types';

export interface DriveArchiveInfo {
  fileId: string;
  link: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

/** `meta.drive` 를 읽는다. 형태가 다르면 없는 것으로 본다(옛 데이터·수기 편집 대비) */
export function readDriveArchive(request: SignatureRequest): DriveArchiveInfo | null {
  const raw = (request.meta as Record<string, unknown> | null)?.drive;
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.file_id !== 'string' || !d.file_id) return null;
  return {
    fileId: d.file_id,
    link: typeof d.link === 'string' ? d.link : null,
    uploadedAt: typeof d.uploaded_at === 'string' ? d.uploaded_at : '',
    uploadedBy: typeof d.uploaded_by === 'string' ? d.uploaded_by : null,
  };
}

export type DriveArchiveResult =
  | { status: 'uploaded'; fileId: string; link: string | null }
  | { status: 'already' }
  /** 구글 인증이 없다 — 호출부가 [인증하고 보관] 을 권한다 */
  | { status: 'needs-auth' }
  | { status: 'failed'; message: string };

export async function archiveToDrive(
  request: SignatureRequest,
  blob: Blob,
  fileName: string,
): Promise<DriveArchiveResult> {
  if (request.status !== 'completed') {
    return { status: 'failed', message: '아직 서명이 끝나지 않았습니다.' };
  }
  if (readDriveArchive(request)) return { status: 'already' };

  let drive: ReturnType<typeof getGoogleDriveService>;
  try {
    drive = getGoogleDriveService();
  } catch (e) {
    // 환경변수(VITE_GOOGLE_DRIVE_CLIENT_ID)가 없는 배포도 있다
    return { status: 'failed', message: e instanceof Error ? e.message : 'Drive 설정이 없습니다.' };
  }

  /*
    `isAuthenticated()` 를 **먼저** 부른다 — 바로 업로드로 들어가면 내부 `getAccessToken()`
    이 `google-auth-expired` 이벤트를 쏴서 재인증 **모달**이 저절로 뜬다. 여기서는 모달 대신
    호출부가 토스트로 권하게 하고 싶으므로 그 경로를 타면 안 된다.
  */
  let authed = false;
  try {
    authed = await drive.isAuthenticated();
  } catch {
    authed = false;
  }
  if (!authed) return { status: 'needs-auth' };

  try {
    await drive.initialize();
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    const uploaded = await drive.uploadFile({
      name: fileName,
      file,
      // 연도/전자서명/ 아래에 모은다 — 다른 기능과 같은 정리 규칙
      uploadContext: { feature: '전자서명', year: new Date().getFullYear() },
    });

    const link = uploaded.webViewLink ?? null;
    const { error } = await supabase.rpc('set_signature_drive_file' as never, {
      p_request_id: request.id,
      p_file_id: uploaded.id,
      p_link: link,
    } as never);

    if (error) {
      // 기록에 실패해도 파일은 올라갔다 — 다음에 한 번 더 올라갈 뿐 잃는 것은 없다.
      // 다만 `signed_path` 가 그대로이므로 **Storage 정리는 하지 않는다**(앱이 아직 그 파일을 찾는다).
      console.error('Drive 보관 기록 실패(파일은 업로드됨)', error);
      return { status: 'uploaded', fileId: uploaded.id, link };
    }

    /*
      **옮기기의 뒷정리** — Storage 에서 원본·완성본을 모두 지운다.

      `request.signedPath` 만 믿으면 안 된다. 화면이 들고 있는 `request` 는 **완성본을 굽기
      전의 스냅샷**이라, 방금 `build()` 가 만들어 올린 완성본의 경로를 아직 모른다(쿼리 캐시가
      갱신되기 전이다). 실제로 이 때문에 source 만 지워지고 **signed 가 남았다**(실사용 확인).

      경로는 규약상 결정적(`<id>/signed.<확장자>`)이므로 **직접 계산해 함께** 넣는다.
      없는 파일을 지우라고 해도 Storage API 는 오류를 내지 않으므로 여분이 있어도 안전하다.

      여기서 실패해도 서버 정리(`purge-signature-files`)가 같은 대상을 다시 잡으므로
      고아가 영구히 남지는 않는다.
    */
    const toRemove = [...new Set([
      request.sourcePath,
      sourceObjectPath(request.id, request.sourceName),
      request.signedPath,
      signedObjectPath(request.id, signedFileName(request)),
    ].filter((p): p is string => !!p && p !== 'pending'))];

    const { error: rmError } = await supabase.storage.from(SIGNATURE_BUCKET).remove(toRemove);
    if (rmError) console.error('Storage 정리 실패(서버 정리가 이어서 처리한다)', rmError);

    return { status: 'uploaded', fileId: uploaded.id, link };
  } catch (e) {
    console.error('Drive 보관 실패', e);
    return { status: 'failed', message: e instanceof Error ? e.message : 'Drive 업로드에 실패했습니다.' };
  }
}
