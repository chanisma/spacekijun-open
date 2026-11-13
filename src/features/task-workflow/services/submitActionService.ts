// ========================================
// 제출 받기 작업(submit.*) 서버 호출 — 전부 RPC (2026-10-01)
// 요청·명단·설정·재알림·마감은 입력 받기와 같은 RPC 를 쓴다(collectInputService). 여기는 제출물만.
// 서버가 대상·마감·종류·권한을 다시 확인한다 — 화면은 막지 못한 것을 서버가 막는다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { uploadSubmissionFormToDrive } from '@/services/taskSubmissionService';
import type { CollectBoard } from '@/lib/collectInput';
import type { SubmissionRow, SubmitKind, SubmitUnit, SubmitUnitProgress } from '@/lib/submitAction';
import type { TaskFile } from '@/types/tasks';

function fail(error: { message?: string } | null): never {
  throw new Error(error?.message ?? '요청을 처리하지 못했습니다.');
}

/** get_collect_board 의 제출 작업 모양 — 입력 받기 판에 종류·제출물이 붙는다 */
export type SubmitBoard = CollectBoard & {
  kind: SubmitKind;
  submissions: SubmissionRow[];
  /** 과제 단위(단위 축 요청의 화면용) — 할 일에 단위가 없으면 빈 목록 */
  units: SubmitUnit[];
  unit_progress: SubmitUnitProgress;
};

/** 이 요청이 과제 단위별로 받는가(서버가 보낼 때 정한 축) */
export function isUnitAxis(board: Pick<SubmitBoard, 'request'>): boolean {
  return (board.request as { axis?: string } | null)?.axis === 'unit';
}

export async function getSubmitBoard(actionId: string): Promise<SubmitBoard> {
  const { data, error } = await supabase.rpc('get_collect_board', { p_action_id: actionId });
  if (error) fail(error);
  const board = data as unknown as SubmitBoard;
  return { ...board, submissions: board.submissions ?? [], units: board.units ?? [], unit_progress: board.unit_progress ?? {} };
}

/**
 * 파일 제출 — 구글 공용 드라이브에 올리고(할 일 폴더 맥락) 기록한다. 기록이 실패하면 파일은 드라이브에 남는다.
 */
export async function submitActionFile(actionId: string, taskId: string, file: File, unitKey?: string | null) {
  const uploaded = await uploadSubmissionFormToDrive(taskId, file);
  const { error } = await supabase.rpc('submit_action_file', {
    p_action_id: actionId,
    p_file_name: uploaded.name,
    p_file_url: uploaded.url,
    p_google_drive_id: uploaded.googleDriveId ?? undefined,
    p_mime_type: uploaded.type || undefined,
    p_file_size: uploaded.size || undefined,
    p_unit_key: unitKey ?? undefined,
  });
  if (error) {
    throw new Error(`드라이브 업로드는 끝났지만 제출 기록에 실패했습니다. 파일은 드라이브에 남아 있습니다: ${error.message}`);
  }
}

/** 양식 파일의 드라이브 id — 예전 행은 googleDriveId 없이 id 만 있다 */
export function formDriveId(form: Pick<TaskFile, 'id' | 'googleDriveId' | 'isGoogleDrive'>): string | null {
  if (form.googleDriveId) return form.googleDriveId;
  return form.isGoogleDrive ? form.id : null;
}

export interface FormCleanupResult {
  deleted: string[];
  /** 드라이브에 남긴 파일과 그 이유 */
  kept: { name: string; reason: string }[];
}

/**
 * 실물 제출 받기에서 매니저가 뺀 양식을 드라이브에서도 지운다 (2026-10-01 사용자 요청).
 *
 * **다른 작업이 같은 파일을 쓰면 남긴다.** 연간 가져오기·업무 흐름 복사는 설정을 통째로 복제해
 * 같은 드라이브 링크를 공유한다 — 여기서 지우면 작년(또는 복사본) 할 일의 양식이 죽은 링크가 된다.
 * 교직원은 제출 작업 설정을 모두 읽을 수 있어(비공개 문서 생성 작업만 예외 — 양식이 없다) 이 조회가 빠짐없다.
 * 설정 저장이 끝난 **뒤에** 부른다 — 반대 순서면 저장이 실패했을 때 설정이 지워진 파일을 가리킨다.
 */
export async function deleteUnusedFormFiles(actionId: string, removed: TaskFile[]): Promise<FormCleanupResult> {
  const result: FormCleanupResult = { deleted: [], kept: [] };
  for (const form of removed) {
    const driveId = formDriveId(form);
    if (!driveId) continue;

    const [{ data: actions, error: actionError }, { data: tasks, error: taskError }] = await Promise.all([
      supabase.from('task_action').select('id').neq('id', actionId)
        .contains('config', { submit: { forms: [{ googleDriveId: driveId }] } }).limit(1),
      // 옛 제출 받기 설정(task.meta.submission.forms)이 아직 가리키는 파일도 남긴다
      supabase.from('task').select('id')
        .contains('meta', { submission: { forms: [{ googleDriveId: driveId }] } }).limit(1),
    ]);
    if (actionError || taskError) {
      // 공유 여부를 모르면 지우지 않는다 — 지운 파일은 되돌릴 수 없다
      result.kept.push({ name: form.name, reason: '다른 할 일에서 쓰는지 확인하지 못해 드라이브에 남겼습니다' });
      continue;
    }
    if ((actions?.length ?? 0) > 0 || (tasks?.length ?? 0) > 0) {
      result.kept.push({ name: form.name, reason: '다른 할 일에서도 쓰는 양식이라 드라이브에 남겼습니다' });
      continue;
    }

    try {
      await getGoogleDriveService().deleteFileAndCleanupFolders(driveId);
      result.deleted.push(form.name);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : '';
      result.kept.push({
        name: form.name,
        reason: status === 403
          ? '올린 사람만 드라이브에서 지울 수 있어 남았습니다'
          : /인증|TOKEN/i.test(message)
            ? '구글 드라이브 연결이 끊겨 남았습니다'
            : '드라이브에서 지우지 못했습니다',
      });
    }
  }
  return result;
}

export async function submitActionDocument(actionId: string, documentId: string, unitKey?: string | null) {
  const { error } = await supabase.rpc('submit_action_document', {
    p_action_id: actionId, p_document_id: documentId, p_unit_key: unitKey ?? undefined,
  });
  if (error) fail(error);
}

export async function markActionReceived(actionId: string, resourceId: string, received: boolean, unitKey?: string | null) {
  const { error } = await supabase.rpc('mark_action_received', {
    p_action_id: actionId,
    p_resource_id: resourceId,
    p_received: received,
    p_unit_key: unitKey ?? undefined,
  });
  if (error) fail(error);
}

/**
 * 제출 취소. 기록을 먼저 지우고 드라이브 파일은 그 뒤에 best-effort 로 정리한다 — 반대로 하면 기록 삭제가
 * 실패했을 때 죽은 링크를 가리키는 제출이 남는다(종전 파일 제출과 같은 순서). 남의 파일은 소유권 때문에
 * 드라이브 삭제가 403 일 수 있다 — 그때도 기록 취소는 유지한다.
 */
export async function deleteActionSubmission(submission: Pick<SubmissionRow, 'id' | 'google_drive_id'>) {
  const { error } = await supabase.rpc('delete_action_submission', { p_submission_id: submission.id });
  if (error) fail(error);
  if (!submission.google_drive_id) return { driveCleaned: false };
  try {
    await getGoogleDriveService().deleteFileAndCleanupFolders(submission.google_drive_id);
    return { driveCleaned: true };
  } catch (cleanupError) {
    console.warn('제출 취소 후 드라이브 파일 정리 실패(기록 취소는 유지):', cleanupError);
    return { driveCleaned: false };
  }
}
