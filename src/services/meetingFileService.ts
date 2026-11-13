import { supabase } from '@/integrations/supabase/client';
import type { TaskFile } from '@/types/tasks';
import { GoogleDriveIntegrationService, type GoogleDriveTaskFile } from './googleDriveIntegrationService';
import { getGoogleDriveService } from './googleDriveServiceNew';

export interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
}

export class MeetingFileService {
  private static readonly BUCKET_NAME = 'kijunspace';
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/x-hwp',
    'application/haansofthwp',
    'application/vnd.hancom.hwpx'
  ];

  private static readonly ALLOWED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.hwp', '.hwpx'
  ];

  /**
   * Supabase Storage에서 지원하는 안전한 Content-Type 반환
   * HWP/HWPX 등 지원하지 않는 MIME 타입은 application/octet-stream으로 변환
   */
  private static getSafeContentType(file: File): string {
    const unsupportedTypes = [
      'application/x-hwp',
      'application/haansofthwp',
      'application/vnd.hancom.hwpx'
    ];

    // 지원하지 않는 MIME 타입이면 무조건 application/octet-stream 사용
    if (unsupportedTypes.includes(file.type)) {
      console.log(`[MeetingFileService] Converting unsupported MIME type ${file.type} to application/octet-stream for file: ${file.name}`);
      return 'application/octet-stream';
    }

    // HWP/HWPX 확장자도 체크 (MIME 타입이 비어있거나 인식 안 될 경우 대비)
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'hwp' || ext === 'hwpx') {
      console.log(`[MeetingFileService] Converting HWP/HWPX file to application/octet-stream: ${file.name}`);
      return 'application/octet-stream';
    }

    return file.type || 'application/octet-stream';
  }

  /**
   * 파일을 meeting에 업로드
   */
  static async uploadMeetingFile(
    meetingId: string,
    file: File,
    onProgress?: (progress: number) => void,
    category: 'template' | 'attachment' = 'attachment'
  ): Promise<TaskFile> {
    await this.validateFile(file);

    const fileId = crypto.randomUUID();
    // 파일명에 한글이나 특수문자가 있을 수 있으므로 UUID.확장자 형식만 사용
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const safeFileName = `${fileId}.${fileExt}`;
    const filePath = `meeting/${meetingId}/${safeFileName}`;

    // HWP/HWPX 파일은 text/plain으로 변환 (Supabase Storage에서 application/octet-stream 차단)
    const isHwpFile = fileExt === 'hwp' || fileExt === 'hwpx';
    const safeContentType = isHwpFile ? 'text/plain' : (file.type || 'application/octet-stream');
    const uploadFile = safeContentType !== file.type
      ? new File([file], safeFileName, { type: safeContentType })
      : file;

    console.log(`[MeetingFileService] Uploading meeting file: ${file.name}, safe name: ${safeFileName}, original type: ${file.type}, safe type: ${safeContentType}`);

    const { data, error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, uploadFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw new Error(`파일 업로드 실패: ${error.message}`);
    }

    // 업로드된 파일의 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(filePath);

    const taskFile: TaskFile = {
      id: fileId,
      name: file.name,
      url: urlData.publicUrl,
      size: file.size,
      type: file.type,
      uploaded_at: new Date().toISOString(),
      uploaded_by: (await supabase.auth.getUser()).data.user?.id || '',
      category: category
    };

    // meeting의 department와 title 정보 가져오기
    const { department, meetingName } = await this.getMeetingInfo(meetingId);

    // documents 테이블에 파일 정보 저장
    await this.saveToDocumentsTable(taskFile, department, 'meeting', meetingId, meetingName);

    // meeting의 meta.files에 파일 정보 추가
    await this.addFileToMeetingMeta(meetingId, taskFile);

    return taskFile;
  }

  /**
   * Meeting 파일 삭제
   */
  static async deleteMeetingFile(meetingId: string, fileId: string): Promise<void> {
    // meta에서 파일 정보 가져오기
    const { data: meeting } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    if (!meeting) {
      throw new Error('미팅을 찾을 수 없습니다.');
    }

    const files = (meeting.meta as any)?.files || [];
    const fileToDelete = files.find((f: TaskFile) => f.id === fileId);

    if (!fileToDelete) {
      throw new Error('파일을 찾을 수 없습니다.');
    }

    // Google Drive 파일인지 확인
    const isGoogleDrive = (fileToDelete as any).isGoogleDrive ||
                          (fileToDelete as any).googleDriveId ||
                          fileToDelete.url?.includes('docs.google.com');

    if (isGoogleDrive) {
      // Google Drive 파일: 실제 Drive 파일 + documents 테이블 삭제
      console.log('🔍 Google Drive 파일 삭제:', fileId);

      const googleDriveId = (fileToDelete as any).googleDriveId;
      if (googleDriveId) {
        // Google Drive에서 파일 삭제
        await this.deleteFromGoogleDrive(googleDriveId);

        // google_drive_id로 documents 테이블에서 삭제
        await this.deleteGoogleDriveFromDocumentsTable(googleDriveId);
      } else {
        console.warn('Google Drive ID가 없어 documents 삭제를 건너뜁니다.');
      }
    } else {
      // 일반 파일: Storage 삭제 + documents 테이블 삭제
      console.log('🔍 일반 파일 삭제:', fileId);

      // 파일 확장자 추출
      const fileExt = fileToDelete.name.split('.').pop()?.toLowerCase();
      const fileName = `${fileId}.${fileExt}`;
      const filePath = `meeting/${meetingId}/${fileName}`;

      const { error: storageError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([filePath]);

      if (storageError) {
        console.error('Storage 삭제 실패:', storageError);
        // Storage 삭제 실패해도 계속 진행
      }

      // documents 테이블에서 파일 정보 삭제
      await this.deleteFromDocumentsTable(fileId);
    }

    // meta에서 파일 정보 제거
    await this.removeFileFromMeetingMeta(meetingId, fileId);
  }

  /**
   * Meeting 파일 목록 조회
   */
  static async getMeetingFiles(meetingId: string): Promise<TaskFile[]> {
    const { data: meeting } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    return (meeting?.meta as any)?.files || [];
  }

  /**
   * Meeting의 템플릿 파일만 조회
   */
  static async getMeetingTemplateFiles(meetingId: string): Promise<TaskFile[]> {
    const files = await this.getMeetingFiles(meetingId);
    return files.filter(file => file.category === 'template');
  }

  /**
   * Meeting의 일반 첨부 파일만 조회
   */
  static async getMeetingAttachmentFiles(meetingId: string): Promise<TaskFile[]> {
    const files = await this.getMeetingFiles(meetingId);
    return files.filter(file => file.category === 'attachment' || !file.category);
  }

  /**
   * 파일 유효성 검사
   */
  private static async validateFile(file: File): Promise<void> {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`파일 크기가 너무 큽니다. 최대 ${this.MAX_FILE_SIZE / (1024 * 1024)}MB까지 업로드 가능합니다.`);
    }

    // MIME 타입 또는 확장자로 검증
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = this.ALLOWED_TYPES.includes(file.type);
    const isValidExtension = this.ALLOWED_EXTENSIONS.includes(fileExtension);

    if (!isValidType && !isValidExtension) {
      throw new Error('지원하지 않는 파일 형식입니다.');
    }
  }

  /**
   * Meeting meta에 파일 정보 추가
   */
  private static async addFileToMeetingMeta(meetingId: string, file: TaskFile): Promise<void> {
    console.log('🔍 [DEBUG] Adding file to meeting meta:', { meetingId, file });

    // 인증 상태 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('🔐 [DEBUG] Auth status:', { user: user?.id, authError });

    const { data: meeting, error: selectError } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    if (selectError) {
      console.error('❌ [ERROR] Failed to select meeting:', selectError);
      throw new Error(`미팅 조회 실패: ${selectError.message}`);
    }

    console.log('📊 [DEBUG] Current meeting meta:', meeting?.meta);

    const currentMeta = (meeting?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = [...currentFiles, file];

    console.log('📝 [DEBUG] Updated files:', updatedFiles);

    const updateData = {
      meta: {
        ...(currentMeta as any),
        files: updatedFiles
      }
    };

    console.log('🔄 [DEBUG] Updating with data:', updateData);

    const { error, data: updateResult } = await supabase
      .from('meeting')
      .update(updateData)
      .eq('id', meetingId)
      .select();

    console.log('✅ [DEBUG] Update result:', updateResult);
    console.log('🔍 [DEBUG] Update error:', error);

    if (error) {
      console.error('❌ [ERROR] Failed to update meeting meta:', error);
      console.error('❌ [ERROR] Error details:', JSON.stringify(error, null, 2));
      throw new Error(`파일 정보 저장 실패: ${error.message}`);
    }

    if (!updateResult || updateResult.length === 0) {
      console.error('❌ [ERROR] No rows updated');
      throw new Error('파일 정보 저장 실패: 업데이트된 행이 없습니다');
    }

    console.log('🎉 [SUCCESS] File metadata saved to meeting');

    // 업데이트 후 실제 저장된 데이터 확인
    const { data: verifyData } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();
    console.log('🔍 [VERIFY] Saved meta data:', verifyData?.meta);
  }

  /**
   * Meeting meta에서 파일 정보 제거
   */
  private static async removeFileFromMeetingMeta(meetingId: string, fileId: string): Promise<void> {
    const { data: meeting } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    const currentMeta = (meeting?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = currentFiles.filter((f: TaskFile) => f.id !== fileId);

    const { error } = await supabase
      .from('meeting')
      .update({
        meta: {
          ...(currentMeta as any),
          files: updatedFiles
        }
      })
      .eq('id', meetingId);

    if (error) {
      throw new Error(`파일 정보 삭제 실패: ${error.message}`);
    }
  }

  /**
   * 파일 크기 포맷팅
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 파일 확장자에 따른 아이콘 반환
   */
  static getFileIcon(type: string): string {
    if (!type || typeof type !== 'string') return '📎';
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
    if (type.includes('text')) return '📄';
    return '📎';
  }

  /**
   * Meeting에서 department와 title 정보 가져오기
   */
  private static async getMeetingInfo(meetingId: string): Promise<{ department: string | null; meetingName: string | null }> {
    const { data: meeting, error } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    if (error || !meeting) {
      console.warn(`Meeting 정보 조회 실패 (${meetingId}):`, error);
      return { department: null, meetingName: null };
    }

    return {
      department: (meeting.meta as any)?.department || null,
      meetingName: (meeting.meta as any)?.title || null
    };
  }

  /**
   * Meeting에서 department 정보 가져오기 (레거시 호환용)
   */
  private static async getDepartmentFromMeeting(meetingId: string): Promise<string | null> {
    const { department } = await this.getMeetingInfo(meetingId);
    return department;
  }


  /**
   * Documents 테이블에 파일 정보 저장
   */
  private static async saveToDocumentsTable(
    taskFile: TaskFile,
    department: string | null,
    sourceType: 'meeting',
    sourceId: string,
    meetingName?: string | null
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('사용자 정보가 없어 documents 테이블에 저장하지 않습니다.');
      return;
    }

    // Build directory path: 년도/스케줄/월/일정명
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString();

    // Build Korean display path
    const displayPath: string[] = [year, '스케줄', month];
    if (meetingName) {
      displayPath.push(meetingName);
    }
    const directory_path = displayPath.join('/');

    const documentData = {
      id: taskFile.id, // TaskFile의 ID와 동일하게 사용
      user_id: user.id,
      title: taskFile.name,
      file_name: taskFile.name,
      file_type: taskFile.type,
      file_size: taskFile.size,
      storage_path: taskFile.url,
      upload_status: 'completed',
      meta: {
        department: department,
        source_type: sourceType,
        source_id: sourceId,
        uploaded_from: 'meeting_management',
        meeting_name: meetingName,
        directory_path: directory_path,
        year: year,
        month: month,
        feature: '스케줄',
        scheduleName: meetingName
      }
    };

    const { error } = await supabase
      .from('documents')
      .insert(documentData);

    if (error) {
      console.error('Documents 테이블 저장 실패:', error);
      // 에러가 발생해도 파일 업로드 자체는 실패하지 않도록 함
    } else {
      console.log('Documents 테이블에 저장 완료:', {
        fileId: taskFile.id,
        department,
        sourceType,
        sourceId,
        meetingName,
        directory_path
      });
    }
  }

  /**
   * Documents 테이블에서 파일 정보 삭제
   */
  private static async deleteFromDocumentsTable(fileId: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', fileId);

    if (error) {
      console.error('Documents 테이블 삭제 실패:', error);
      // 에러가 발생해도 파일 삭제 자체는 실패하지 않도록 함
    } else {
      console.log('Documents 테이블에서 삭제 완료:', fileId);
    }
  }

  /**
   * Google Drive 파일을 Documents 테이블에서 삭제 (google_drive_id로 검색)
   */
  private static async deleteGoogleDriveFromDocumentsTable(googleDriveId: string): Promise<void> {
    console.log('🔍 Documents 테이블에서 Google Drive 파일 삭제 시도:', googleDriveId);

    // google_drive_id로 Google Drive 파일 찾기
    const { data: documents, error: selectError } = await supabase
      .from('documents')
      .select('id, meta')
      .eq('meta->>google_drive_id', googleDriveId);

    if (selectError) {
      console.error('❌ Google Drive 파일 조회 실패:', selectError);
      return;
    }

    console.log('📊 찾은 documents:', documents);

    if (!documents || documents.length === 0) {
      console.log('⚠️ 삭제할 Google Drive 파일이 documents 테이블에 없습니다.');
      return;
    }

    // 찾은 모든 문서 삭제 (같은 Google Drive 파일이 여러 곳에 링크될 수 있음)
    for (const doc of (documents as any)) {
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', (doc as any).id);

      if (deleteError) {
        console.error('❌ Google Drive 파일 삭제 실패:', deleteError);
      } else {
        console.log('✅ Google Drive 파일이 Documents 테이블에서 삭제됨:', (doc as any).id);
      }
    }
  }

  /**
   * Google Drive에서 실제 파일 삭제
   * 미연결 시 자동으로 연결 시도
   */
  private static async deleteFromGoogleDrive(googleDriveId: string): Promise<void> {
    try {
      const driveService = getGoogleDriveService();

      // Google Drive 초기화 확인
      if (!(await driveService.isAuthenticated())) {
        console.log('⚠️ Google Drive 미연결 상태, 연결 시도 중...');

        // 초기화 시도
        await driveService.initialize();

        // 로그인 시도
        await driveService.signIn();

        // 연결 확인
        if (!(await driveService.isAuthenticated())) {
          throw new Error('Google Drive 연결에 실패했습니다. 다시 로그인해주세요.');
        }

        console.log('✅ Google Drive 연결 성공');
      }

      // Google Drive에서 파일 삭제
      console.log('🗑️ Google Drive 파일 삭제 시작:', googleDriveId);
      await driveService.deleteFile(googleDriveId);
      console.log('✅ Google Drive에서 파일이 삭제되었습니다:', googleDriveId);

    } catch (error: any) {
      console.error('❌ Google Drive 파일 삭제 실패:', error);

      // 인증 관련 에러인 경우 사용자에게 안내
      if (error.message?.includes('인증') || error.message?.includes('로그인')) {
        throw new Error('Google Drive 연결이 필요합니다. Google Drive에 다시 로그인한 후 삭제를 시도해주세요.');
      }

      // 파일이 이미 삭제된 경우 (404 등)
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        console.warn('⚠️ Google Drive에 파일이 이미 존재하지 않습니다. 메타데이터만 삭제합니다.');
        return; // 에러 없이 계속 진행
      }

      // 기타 에러는 재발생
      throw new Error(`Google Drive 파일 삭제 실패: ${error.message}`);
    }
  }
}