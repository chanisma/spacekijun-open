import { supabase } from '@/integrations/supabase/client';
import type { TaskFile } from '@/types/tasks';
import { getGoogleDriveService } from './googleDriveServiceNew';

export interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
}

export class TaskFileService {
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
      console.log(`[TaskFileService] Converting unsupported MIME type ${file.type} to application/octet-stream for file: ${file.name}`);
      return 'application/octet-stream';
    }

    // HWP/HWPX 확장자도 체크 (MIME 타입이 비어있거나 인식 안 될 경우 대비)
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'hwp' || ext === 'hwpx') {
      console.log(`[TaskFileService] Converting HWP/HWPX file to application/octet-stream: ${file.name}`);
      return 'application/octet-stream';
    }

    return file.type || 'application/octet-stream';
  }

  /**
   * 파일을 task work에 업로드
   */
  static async uploadWorkFile(
    workId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<TaskFile> {
    await this.validateFile(file);

    const fileId = crypto.randomUUID();
    // 파일명에 한글이나 특수문자가 있을 수 있으므로 UUID.확장자 형식만 사용
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const safeFileName = `${fileId}.${fileExt}`;
    const filePath = `work/${workId}/${safeFileName}`;

    // HWP/HWPX 파일은 text/plain으로 변환 (Supabase Storage에서 application/octet-stream 차단)
    const isHwpFile = fileExt === 'hwp' || fileExt === 'hwpx';
    const safeContentType = isHwpFile ? 'text/plain' : (file.type || 'application/octet-stream');
    const uploadFile = safeContentType !== file.type
      ? new File([file], safeFileName, { type: safeContentType })
      : file;

    console.log(`[TaskFileService] Uploading work file: ${file.name}, safe name: ${safeFileName}, original type: ${file.type}, safe type: ${safeContentType}`);

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
      uploaded_by: (await supabase.auth.getUser()).data.user?.id || ''
    };

    // work의 department와 title 정보 가져오기
    const { department, workName } = await this.getWorkInfo(workId);

    // documents 테이블에 파일 정보 저장
    await this.saveToDocumentsTable(taskFile, department, 'event', workId, { workName });

    // task_event의 meta.files에 파일 정보 추가
    await this.addFileToWorkMeta(workId, taskFile);

    return taskFile;
  }

  /**
   * 파일을 task에 업로드
   */
  static async uploadTaskFile(
    taskId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<TaskFile> {
    await this.validateFile(file);

    const fileId = crypto.randomUUID();
    // 파일명에 한글이나 특수문자가 있을 수 있으므로 UUID.확장자 형식만 사용
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const safeFileName = `${fileId}.${fileExt}`;
    const filePath = `task/${taskId}/${safeFileName}`;

    // HWP/HWPX 파일은 text/plain으로 변환 (Supabase Storage에서 application/octet-stream 차단)
    const isHwpFile = fileExt === 'hwp' || fileExt === 'hwpx';
    const safeContentType = isHwpFile ? 'text/plain' : (file.type || 'application/octet-stream');
    const uploadFile = safeContentType !== file.type
      ? new File([file], safeFileName, { type: safeContentType })
      : file;

    console.log(`[TaskFileService] Uploading file: ${file.name}, safe name: ${safeFileName}, original type: ${file.type}, safe type: ${safeContentType}`);

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
      uploaded_by: (await supabase.auth.getUser()).data.user?.id || ''
    };

    // task와 work 정보 가져오기
    const { department, workName, taskName } = await this.getTaskAndWorkInfo(taskId);

    // documents 테이블에 파일 정보 저장
    await this.saveToDocumentsTable(taskFile, department, 'task', taskId, { workName, taskName });

    // task의 meta.files에 파일 정보 추가
    await this.addFileToTaskMeta(taskId, taskFile);

    return taskFile;
  }

  /**
   * Work 파일 삭제
   */
  static async deleteWorkFile(workId: string, fileId: string): Promise<void> {
    // meta에서 파일 정보 가져오기
    const { data: work } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', workId)
      .single();

    if (!work) {
      throw new Error('업무를 찾을 수 없습니다.');
    }

    const files = ((work as any).meta as any)?.files || [];
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
      const filePath = `work/${workId}/${fileName}`;

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
    await this.removeFileFromWorkMeta(workId, fileId);
  }

  /**
   * Task 파일 삭제
   */
  static async deleteTaskFile(taskId: string, fileId: string): Promise<void> {
    // meta에서 파일 정보 가져오기
    const { data: task } = await (supabase as any)
      .from('task')
      .select('meta')
      .eq('id', taskId)
      .single();

    if (!task) {
      throw new Error('작업을 찾을 수 없습니다.');
    }

    const files = ((task as any).meta as any)?.files || [];
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
      const filePath = `task/${taskId}/${fileName}`;

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
    await this.removeFileFromTaskMeta(taskId, fileId);
  }

  /**
   * Work 파일 목록 조회
   */
  static async getWorkFiles(workId: string): Promise<TaskFile[]> {
    const { data: work } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', workId)
      .single();

    return ((work as any)?.meta as any)?.files || [];
  }

  /**
   * Task 파일 목록 조회
   */
  static async getTaskFiles(taskId: string): Promise<TaskFile[]> {
    const { data: task } = await (supabase as any)
      .from('task')
      .select('meta')
      .eq('id', taskId)
      .single();

    return ((task as any)?.meta as any)?.files || [];
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
   * Work meta에 파일 정보 추가
   */
  private static async addFileToWorkMeta(workId: string, file: TaskFile): Promise<void> {
    console.log('🔍 [DEBUG] Adding file to work meta:', { workId, file });

    // 인증 상태 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('🔐 [DEBUG] Auth status:', { user: user?.id, authError });

    const { data: work, error: selectError } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', workId)
      .single();

    if (selectError) {
      console.error('❌ [ERROR] Failed to select work:', selectError);
      throw new Error(`업무 조회 실패: ${selectError.message}`);
    }

    console.log('📊 [DEBUG] Current work meta:', (work as any)?.meta);

    const currentMeta = ((work as any)?.meta as any) || {};
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

    const { error, data: updateResult } = await (supabase as any)
      .from('work')
      .update(updateData)
      .eq('id', workId)
      .select();

    console.log('✅ [DEBUG] Update result:', updateResult);
    console.log('🔍 [DEBUG] Update error:', error);

    if (error) {
      console.error('❌ [ERROR] Failed to update work meta:', error);
      console.error('❌ [ERROR] Error details:', JSON.stringify(error, null, 2));
      throw new Error(`파일 정보 저장 실패: ${error.message}`);
    }

    if (!updateResult || updateResult.length === 0) {
      console.error('❌ [ERROR] No rows updated');
      throw new Error('파일 정보 저장 실패: 업데이트된 행이 없습니다');
    }

    console.log('🎉 [SUCCESS] File metadata saved to work');

    // 업데이트 후 실제 저장된 데이터 확인
    const { data: verifyData } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', workId)
      .single();
    console.log('🔍 [VERIFY] Saved meta data:', (verifyData as any)?.meta);
  }

  /**
   * Task meta에 파일 정보 추가
   */
  private static async addFileToTaskMeta(taskId: string, file: TaskFile): Promise<void> {
    const { data: task } = await (supabase as any)
      .from('task')
      .select('meta')
      .eq('id', taskId)
      .single();

    const currentMeta = ((task as any)?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = [...currentFiles, file];

    const { error } = await (supabase as any)
      .from('task')
      .update({
        meta: {
          ...(currentMeta as any),
          files: updatedFiles
        }
      })
      .eq('id', taskId);

    if (error) {
      throw new Error(`파일 정보 저장 실패: ${error.message}`);
    }
  }

  /**
   * Work meta에서 파일 정보 제거
   */
  private static async removeFileFromWorkMeta(workId: string, fileId: string): Promise<void> {
    const { data: work } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', workId)
      .single();

    const currentMeta = ((work as any)?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = currentFiles.filter((f: TaskFile) => f.id !== fileId);

    const { error } = await (supabase as any)
      .from('work')
      .update({
        meta: {
          ...(currentMeta as any),
          files: updatedFiles
        }
      })
      .eq('id', workId);

    if (error) {
      throw new Error(`파일 정보 삭제 실패: ${error.message}`);
    }
  }

  /**
   * Task meta에서 파일 정보 제거
   */
  private static async removeFileFromTaskMeta(taskId: string, fileId: string): Promise<void> {
    const { data: task } = await (supabase as any)
      .from('task')
      .select('meta')
      .eq('id', taskId)
      .single();

    const currentMeta = ((task as any)?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = currentFiles.filter((f: TaskFile) => f.id !== fileId);

    const { error } = await (supabase as any)
      .from('task')
      .update({
        meta: {
          ...(currentMeta as any),
          files: updatedFiles
        }
      })
      .eq('id', taskId);

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
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
    if (type.includes('text')) return '📄';
    return '📎';
  }

  /**
   * Work에서 department와 name 정보 가져오기
   */
  private static async getWorkInfo(workId: string): Promise<{ department: string | null; workName: string | null }> {
    const { data: work, error } = await (supabase as any)
      .from('work')
      .select('name, meta')
      .eq('id', workId)
      .single();

    if (error || !work) {
      console.warn(`Work 정보 조회 실패 (${workId}):`, error);
      return { department: null, workName: null };
    }

    return {
      department: ((work as any).meta as any)?.department || null,
      workName: (work as any).name || null
    };
  }

  /**
   * Work에서 department 정보 가져오기 (레거시 호환용)
   */
  private static async getDepartmentFromWork(workId: string): Promise<string | null> {
    const { department } = await this.getWorkInfo(workId);
    return department;
  }

  /**
   * Task와 Work 정보 가져오기
   */
  private static async getTaskAndWorkInfo(taskId: string): Promise<{ department: string | null; workName: string | null; taskName: string | null }> {
    const { data: task, error } = await (supabase as any)
      .from('task')
      .select('title, event_id')
      .eq('id', taskId)
      .single();

    if (error || !task) {
      console.warn(`Task 조회 실패 (${taskId}):`, error);
      return { department: null, workName: null, taskName: null };
    }

    if (!(task as any).event_id) {
      console.warn(`Task에 event_id가 없음 (${taskId})`);
      return { department: null, workName: null, taskName: (task as any).title || null };
    }

    const { department, workName } = await this.getWorkInfo((task as any).event_id);

    return {
      department,
      workName,
      taskName: (task as any).title || null
    };
  }

  /**
   * Task를 통해 Work의 department 정보 가져오기 (레거시 호환용)
   */
  private static async getDepartmentFromTask(taskId: string): Promise<string | null> {
    const { department } = await this.getTaskAndWorkInfo(taskId);
    return department;
  }

  /**
   * Documents 테이블에 파일 정보 저장
   */
  private static async saveToDocumentsTable(
    taskFile: TaskFile,
    department: string | null,
    sourceType: 'event' | 'task',
    sourceId: string,
    additionalInfo?: { workName?: string; taskName?: string }
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('사용자 정보가 없어 documents 테이블에 저장하지 않습니다.');
      return;
    }

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
        uploaded_from: 'task_management',
        event_name: additionalInfo?.workName,
        task_name: additionalInfo?.taskName
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
        workName: additionalInfo?.workName,
        taskName: additionalInfo?.taskName
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

  // ========================================
  // Bulk File Cleanup Functions
  // ========================================

  /**
   * Work 삭제 시 모든 첨부 파일 정리
   */
  static async cleanupWorkFiles(workId: string): Promise<void> {
    try {
      console.log(`🧹 Starting file cleanup for work: ${workId}`);

      const files = await this.getWorkFiles(workId);
      if (files.length === 0) {
        console.log(`📁 No files to cleanup for work: ${workId}`);
        return;
      }

      console.log(`📁 Found ${files.length} files to cleanup in work: ${workId}`);

      for (const file of files) {
        try {
          await this.deleteWorkFile(workId, file.id);
          console.log(`✅ Deleted file: ${file.name} (${file.id})`);
        } catch (error) {
          console.error(`❌ Failed to delete file: ${file.name} (${file.id})`, error);
          // Continue with other files even if one fails
        }
      }

      console.log(`🎉 File cleanup completed for work: ${workId}`);
    } catch (error) {
      console.error(`💥 Error during work file cleanup (${workId}):`, error);
      // Don't throw error to prevent blocking work deletion
    }
  }

  /**
   * Task 삭제 시 모든 첨부 파일 정리
   */
  static async cleanupTaskFiles(taskId: string): Promise<void> {
    try {
      console.log(`🧹 Starting file cleanup for task: ${taskId}`);

      const files = await this.getTaskFiles(taskId);
      if (files.length === 0) {
        console.log(`📁 No files to cleanup for task: ${taskId}`);
        return;
      }

      console.log(`📁 Found ${files.length} files to cleanup in task: ${taskId}`);

      for (const file of files) {
        try {
          await this.deleteTaskFile(taskId, file.id);
          console.log(`✅ Deleted file: ${file.name} (${file.id})`);
        } catch (error) {
          console.error(`❌ Failed to delete file: ${file.name} (${file.id})`, error);
          // Continue with other files even if one fails
        }
      }

      console.log(`🎉 File cleanup completed for task: ${taskId}`);
    } catch (error) {
      console.error(`💥 Error during task file cleanup (${taskId}):`, error);
      // Don't throw error to prevent blocking task deletion
    }
  }

  /**
   * Work 삭제 시 해당 Work의 모든 Task 파일 정리
   */
  static async cleanupTaskFilesByWork(workId: string): Promise<void> {
    try {
      console.log(`🧹 Starting task files cleanup for work: ${workId}`);

      // Get all tasks for this work
      const { data: tasks, error } = await (supabase as any)
        .from('task')
        .select('id')
        .eq('event_id', workId);

      if (error) {
        console.error(`❌ Failed to fetch tasks for work ${workId}:`, error);
        return;
      }

      if (!tasks || tasks.length === 0) {
        console.log(`📁 No tasks found for work: ${workId}`);
        return;
      }

      console.log(`📁 Found ${tasks.length} tasks to cleanup files for in work: ${workId}`);

      for (const task of (tasks as any)) {
        await this.cleanupTaskFiles((task as any).id);
      }

      console.log(`🎉 Task files cleanup completed for work: ${workId}`);
    } catch (error) {
      console.error(`💥 Error during task files cleanup for work (${workId}):`, error);
      // Don't throw error to prevent blocking work deletion
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

      // Google Drive에서 파일 삭제 + 빈 폴더 정리
      console.log('🗑️ Google Drive 파일 삭제 시작:', googleDriveId);
      await driveService.deleteFileAndCleanupFolders(googleDriveId);
      console.log('✅ Google Drive에서 파일이 삭제되었습니다 (빈 폴더 정리 포함):', googleDriveId);

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