// ========================================
// 할 일 파일 제출 서비스 (2026-08-11)
// 담당자가 할 일에 파일을 내면 그것이 곧 '내 상태 완료'가 된다.
// 파일은 Google 공용 드라이브에 올라가고, 제출 사실은 task_submission 테이블에 남는다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import { getGoogleDriveService, type GoogleDriveUploadContext } from './googleDriveServiceNew';
import type { TaskFile, TaskSubmission } from '@/types/tasks';

/**
 * 제출물은 서류함(documents 테이블)에 등록하지 않는다.
 * documents는 교사 전원이 읽을 수 있어서, 등록하는 순간 "담당자는 본인 것만 본다"는
 * 열람 규칙이 무력화된다. 제출물의 단일 출처는 task_submission이다.
 */

export async function fetchTaskSubmissions(taskId: string): Promise<TaskSubmission[]> {
  const { data, error } = await supabase
    .from('task_submission')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`제출물을 불러오지 못했습니다: ${error.message}`);
  // RLS가 이미 걸러준다 — 담당자는 본인 행만, 매니저·admin은 전원 행이 온다.
  return (data ?? []) as TaskSubmission[];
}

/** 업로드할 드라이브 폴더 경로를 정하기 위한 할 일/업무 정보 */
async function buildUploadContext(taskId: string): Promise<GoogleDriveUploadContext> {
  const { data, error } = await supabase
    .from('task')
    .select('title, due_date, event:event_id (name, meta)')
    .eq('id', taskId)
    .single();

  if (error) throw new Error(`할 일 정보를 불러오지 못했습니다: ${error.message}`);

  const event = (Array.isArray(data?.event) ? data?.event[0] : data?.event) as
    | { name?: string; meta?: Record<string, unknown> | null }
    | undefined;
  const eventMeta = (event?.meta ?? {}) as Record<string, unknown>;

  return {
    feature: '업무 관리',
    // 마감일이 있으면 그 연도로 묶는다(연말에 낸 다음 해 할 일이 엉뚱한 폴더로 가지 않게).
    year: data?.due_date ? new Date(data.due_date).getFullYear() : new Date().getFullYear(),
    department: typeof eventMeta.department === 'string' ? eventMeta.department : undefined,
    eventName: event?.name ?? undefined,
    taskName: data?.title ?? undefined,
  };
}

export interface SubmitTaskFileResult {
  submissionId: string;
  fileName: string;
  fileUrl: string;
}

/**
 * 파일 1건 제출 = Drive 업로드 → RPC(행 등록 + 담당자 상태 completed)까지 한 번에.
 *
 * Drive 업로드가 성공한 뒤 RPC가 실패하면 드라이브에 고아 파일이 남는다. 그 경우
 * 사용자에게 실패를 알리되 파일은 지우지 않는다 — 삭제 권한 문제로 또 실패할 수 있고,
 * 남은 파일은 재제출 시 사람이 정리하는 편이 데이터 유실보다 안전하다.
 */
export async function submitTaskFile(
  taskId: string,
  file: File,
  /** 과제 단위 할 일면 필수 — 제출이 곧 그 단위의 선택+완료가 된다(서버가 검증) */
  unitKey?: string | null
): Promise<SubmitTaskFileResult> {
  const uploadContext = await buildUploadContext(taskId);
  const driveService = getGoogleDriveService();

  // uploadFile이 공용 폴더(VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID) 하위에 경로를 만들고,
  // 업로드 직후 도메인(myschool.hs.kr) 권한까지 걸어준다.
  const googleFile = await driveService.uploadFile({
    name: file.name,
    file,
    uploadContext,
  });

  const { data, error } = await supabase.rpc('submit_task_submission', {
    p_task_id: taskId,
    p_file_name: googleFile.name,
    p_file_url: googleFile.webViewLink,
    p_edit_url: googleFile.webViewLink,
    p_google_drive_id: googleFile.id,
    p_mime_type: googleFile.mimeType,
    p_file_size: googleFile.size ?? file.size ?? null,
    p_meta: {},
    p_unit_key: unitKey ?? null,
  });

  if (error) {
    const detail = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    throw new Error(
      `드라이브 업로드는 끝났지만 제출 기록에 실패했습니다. 파일은 드라이브에 남아 있습니다: ${detail}`
    );
  }

  return {
    submissionId: (data as { submission_id: string })?.submission_id,
    fileName: googleFile.name,
    fileUrl: googleFile.webViewLink,
  };
}

/**
 * 실물 제출의 **제출 양식**을 구글 공용 드라이브에 올린다 (2026-10-01 사용자 요청).
 * 파일 제출과 **같은 폴더 맥락**(업무 관리 / 연도 / 부서 / 업무 / 할 일)이고, `uploadFile` 이
 * 도메인 권한까지 걸어 담당자가 열 수 있다. 저장 위치는 `task.meta.submission.forms` —
 * 이 함수는 올리기만 하고 meta 는 호출부(할 일 편집 창)가 쓴다.
 * 양식을 목록에서 빼도 드라이브 파일은 지우지 않는다: «다른 할 일에서 복사»·연간 가져오기가
 * 같은 링크를 공유한다.
 */
export async function uploadSubmissionFormToDrive(taskId: string, file: File): Promise<TaskFile> {
  const uploadContext = await buildUploadContext(taskId);
  const googleFile = await getGoogleDriveService().uploadFile({ name: file.name, file, uploadContext });
  return {
    id: googleFile.id,
    name: googleFile.name,
    url: googleFile.webViewLink,
    size: googleFile.size ?? file.size,
    type: googleFile.mimeType ?? file.type,
    uploaded_at: new Date().toISOString(),
    uploaded_by: (await supabase.auth.getUser()).data.user?.id || '',
    category: 'template',
    isGoogleDrive: true,
    googleDriveId: googleFile.id,
    editUrl: googleFile.webViewLink,
  };
}

export interface DeleteTaskSubmissionResult {
  /** 드라이브 원본까지 지웠는가. false면 기록만 취소되고 파일은 드라이브에 남아 있다. */
  driveCleaned: boolean;
}

/**
 * 제출 철회. 마지막 파일이면 서버가 담당자 상태를 pending으로 되돌린다.
 *
 * 드라이브 원본도 함께 지운다(2026-08-12) — 안 지우면 재제출 시 같은 이름의 고아 파일이
 * 폴더에 계속 쌓인다(Drive는 이름 충돌을 허용). 단 **best-effort**다:
 * - 순서는 기록 삭제 → 파일 삭제. 반대로 하면 파일만 지워지고 RPC가 실패했을 때
 *   죽은 링크를 가리키는 제출 행이 남는다(기록이 완료 상태의 정본이라 이쪽이 치명적).
 * - 공용 폴더여도 파일 소유권은 업로더 개인이라(도메인 권한은 writer),
 *   매니저가 남의 제출을 취소하면 Drive 삭제는 403으로 실패한다. 토큰 만료도 마찬가지.
 *   이 경우 기록 취소는 유지하고 driveCleaned=false로 알린다(오늘까지의 동작과 동일).
 */
export async function deleteTaskSubmission(
  submission: Pick<TaskSubmission, 'id' | 'google_drive_id'>
): Promise<DeleteTaskSubmissionResult> {
  const { error } = await supabase.rpc('delete_task_submission', {
    p_submission_id: submission.id,
  });

  if (error) {
    const detail = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    throw new Error(detail || '제출을 취소하지 못했습니다.');
  }

  if (!submission.google_drive_id) return { driveCleaned: false };

  try {
    // 파일 삭제 + 비게 된 상위 폴더 정리(공용 폴더 루트는 보존)
    await getGoogleDriveService().deleteFileAndCleanupFolders(submission.google_drive_id);
    return { driveCleaned: true };
  } catch (cleanupError) {
    console.warn('제출 취소 후 드라이브 파일 정리 실패(기록 취소는 유지):', cleanupError);
    return { driveCleaned: false };
  }
}
