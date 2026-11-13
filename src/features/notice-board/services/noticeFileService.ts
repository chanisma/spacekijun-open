// ========================================
// 공지 첨부파일 서비스
// tasks의 파일 첨부(TaskFileService + GoogleDriveIntegrationService) 패턴을 참고.
// - 로컬 파일: Supabase Storage(kijunspace) notice/<id>/ 경로 업로드 + documents 등록
// - Google Drive: GoogleDriveIntegrationService(targetType 'document')로
//   pending 생성/업로드까지 처리 후 참조 저장 (부서 문서함에도 노출)
// - 참조는 department_notice.attachments JSONB 배열에 저장
// ========================================

import { supabase } from '@/integrations/supabase/client';
import { GoogleDriveIntegrationService } from '@/services/googleDriveIntegrationService';
import type { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import type { NoticeAttachment } from '../types';

const BUCKET_NAME = 'kijunspace';
export const NOTICE_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (tasks와 동일)
export const NOTICE_MAX_FILES = 10;

/** 로컬 파일 업로드 — TaskFileService.uploadTaskFile 흐름과 동일한 규칙 */
export async function uploadNoticeLocalFile(noticeId: string, file: File): Promise<NoticeAttachment> {
  if (file.size > NOTICE_MAX_FILE_SIZE) {
    throw new Error(`파일 크기는 5MB를 초과할 수 없습니다: ${file.name}`);
  }

  const fileId = crypto.randomUUID();
  // 한글·특수문자 파일명 대비 UUID.확장자만 사용
  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const safeFileName = `${fileId}.${fileExt}`;
  const filePath = `notice/${noticeId}/${safeFileName}`;

  // HWP/HWPX는 Supabase Storage가 application/octet-stream을 차단해 text/plain으로 업로드
  const isHwpFile = fileExt === 'hwp' || fileExt === 'hwpx';
  const safeContentType = isHwpFile ? 'text/plain' : (file.type || 'application/octet-stream');
  const uploadFile = safeContentType !== file.type
    ? new File([file], safeFileName, { type: safeContentType })
    : file;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, uploadFile, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(`파일 업로드 실패: ${error.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  const userId = (await supabase.auth.getUser()).data.user?.id || '';

  const attachment: NoticeAttachment = {
    id: fileId,
    name: file.name,
    url: urlData.publicUrl,
    size: file.size,
    type: file.type,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
  };

  return attachment;
}

/** documents 테이블 등록 — 부서 문서함 노출용 (실패해도 첨부 자체는 유지) */
export async function registerNoticeFileToDocuments(
  attachment: NoticeAttachment,
  department: string,
  noticeId: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('documents').insert({
    id: attachment.id,
    user_id: user.id,
    title: attachment.name,
    file_name: attachment.name,
    file_type: attachment.type,
    file_size: attachment.size,
    storage_path: attachment.url,
    upload_status: 'completed',
    meta: {
      department,
      source_type: 'notice',
      source_id: noticeId,
      uploaded_from: 'notice_board',
    },
  });
  if (error) console.error('Documents 테이블 저장 실패 (공지 첨부):', error);
}

/**
 * Google Drive 파일 등록 — pending 생성/업로드 파일까지 통합 서비스가 처리.
 * targetType 'document' = documents 테이블(부서 문서함)에 등록되고,
 * 반환된 파일 정보를 공지 attachments 참조로 변환한다.
 */
export async function registerNoticeDriveFile(
  noticeId: string,
  department: string,
  fileInfo: GoogleDriveFileInfo
): Promise<NoticeAttachment | null> {
  const driveFile = await GoogleDriveIntegrationService.processPendingAndRegister(fileInfo, {
    targetType: 'document',
    targetId: noticeId,
    department,
  });
  if (!driveFile) return null;

  const userId = (await supabase.auth.getUser()).data.user?.id || '';
  return {
    id: driveFile.id,
    name: driveFile.name,
    url: driveFile.url,
    size: driveFile.size ?? 0,
    type: driveFile.type || 'application/vnd.google-apps.file',
    uploaded_at: driveFile.uploaded_at ?? new Date().toISOString(),
    uploaded_by: driveFile.uploaded_by || userId,
    isGoogleDrive: true,
    googleDriveId: driveFile.googleDriveId,
  };
}

/** 공지의 attachments 배열 갱신 */
export async function updateNoticeAttachments(
  noticeId: string,
  attachments: NoticeAttachment[]
): Promise<void> {
  const { error } = await supabase
    .from('department_notice')
    .update({ attachments: attachments as unknown as never })
    .eq('id', noticeId);
  if (error) throw error;
}

/**
 * 첨부 제거 시 best-effort 정리.
 * - 로컬 파일: Storage 객체 + documents 행 삭제
 * - Google Drive: 참조와 documents 행만 삭제 (Drive 원본은 사용자 소유라 보존)
 */
export async function cleanupRemovedAttachment(
  noticeId: string,
  attachment: NoticeAttachment
): Promise<void> {
  try {
    if (!attachment.isGoogleDrive) {
      const fileExt = attachment.name.split('.').pop()?.toLowerCase();
      const filePath = `notice/${noticeId}/${attachment.id}.${fileExt}`;
      await supabase.storage.from(BUCKET_NAME).remove([filePath]);
    }
    await supabase.from('documents').delete().eq('id', attachment.id);
  } catch (error) {
    console.error('첨부파일 정리 실패 (무시):', error);
  }
}
