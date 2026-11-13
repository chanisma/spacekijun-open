import { supabase } from '@/integrations/supabase/client';
import { getGoogleDriveService, GoogleDriveFile, GoogleDriveUploadContext } from './googleDriveServiceNew';
import { MeetingFileService } from './meetingFileService';
import type { TaskFile } from '@/types/tasks';
import type { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';

export interface GoogleDriveTaskFile extends TaskFile {
  isGoogleDrive: true;
  googleDriveId: string;
  editUrl: string;
}

export interface IntegrationOptions {
  targetType: 'meeting' | 'task' | 'task_event' | 'document' | 'collab_note';
  targetId: string;
  department?: string;
  boardId?: string; // For collab_note type
  /**
   * 서류함(targetType 'document') 등록 시 함께 저장할 분류 메타 (2026-08-11).
   * 구 구현은 department만 받아 Drive/링크/생성 등록분이 분류·키워드 없이 저장돼
   * 통합 검색에 걸리지 않았다. 로컬 업로드와 동일한 메타를 모든 경로에 싣는다.
   */
  documentMeta?: {
    category?: string;
    keywords?: string[];
    description?: string;
    /** 지정 시 자동 생성 경로 대신 이 가상 폴더로 등록 */
    directoryPath?: string | null;
  };
}

export interface ParsedDriveUrl {
  fileId: string;
  fileType: 'document' | 'spreadsheet' | 'presentation' | 'folder' | 'unknown';
  editUrl: string;
  mimeType: string;
}

export class GoogleDriveIntegrationService {
  private static driveService = getGoogleDriveService();

  /**
   * Get file or folder metadata from Google Drive
   */
  public static async getFileMetadata(fileId: string): Promise<{ id: string; name: string; mimeType: string }> {
    return await this.driveService.getFileMetadata(fileId);
  }

  /**
   * Google Drive URL을 파싱하여 파일 ID 추출
   */
  public static parseDriveUrl(url: string): ParsedDriveUrl | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const trimmedUrl = url.trim();

    // Google Drive URL 패턴 정의
    const patterns = [
      {
        regex: /docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/,
        type: 'document' as const,
        mimeType: 'application/vnd.google-apps.document'
      },
      {
        regex: /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        type: 'spreadsheet' as const,
        mimeType: 'application/vnd.google-apps.spreadsheet'
      },
      {
        regex: /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9-_]+)/,
        type: 'presentation' as const,
        mimeType: 'application/vnd.google-apps.presentation'
      },
      {
        regex: /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9-_]+)/,
        type: 'folder' as const,
        mimeType: 'application/vnd.google-apps.folder'
      },
      {
        regex: /drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/,
        type: 'unknown' as const,
        mimeType: 'application/octet-stream'
      }
    ];

    // 각 패턴에 대해 매칭 시도
    for (const pattern of patterns) {
      const match = trimmedUrl.match(pattern.regex);
      if (match && match[1]) {
        const fileId = match[1];

        // Edit URL 생성
        let editUrl: string;
        if (pattern.type === 'document') {
          editUrl = `https://docs.google.com/document/d/${fileId}/edit`;
        } else if (pattern.type === 'spreadsheet') {
          editUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
        } else if (pattern.type === 'presentation') {
          editUrl = `https://docs.google.com/presentation/d/${fileId}/edit`;
        } else if (pattern.type === 'folder') {
          editUrl = `https://drive.google.com/drive/folders/${fileId}`;
        } else {
          editUrl = `https://drive.google.com/file/d/${fileId}/view`;
        }

        return {
          fileId,
          fileType: pattern.type,
          editUrl,
          mimeType: pattern.mimeType
        };
      }
    }

    return null;
  }

  /**
   * Google Drive 링크를 문서로 등록
   */
  public static async linkAndRegister(
    url: string,
    fileName: string,
    options: IntegrationOptions
  ): Promise<GoogleDriveTaskFile | null> {
    try {
      // URL 파싱
      const parsed = this.parseDriveUrl(url);
      if (!parsed) {
        throw new Error('유효하지 않은 Google Drive URL입니다.');
      }

      // TaskFile 형식으로 변환 (실제 파일 없이 링크만)
      const taskFile: GoogleDriveTaskFile = {
        id: crypto.randomUUID(),
        name: fileName,
        url: parsed.editUrl,
        size: 0, // 링크 파일은 크기 없음
        type: parsed.mimeType,
        uploaded_at: new Date().toISOString(),
        uploaded_by: '',
        category: 'attachment',
        isGoogleDrive: true,
        googleDriveId: parsed.fileId,
        editUrl: parsed.editUrl
      };

      // 현재 사용자 ID 설정
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        taskFile.uploaded_by = user.id;
      }

      // 대상 시스템에 등록
      await this.registerToTarget(taskFile, options);

      return taskFile;
    } catch (error) {
      console.error('Google Drive 링크 등록 오류:', error);
      throw error;
    }
  }

  /**
   * Google Drive 파일을 TaskFile 형식으로 변환
   */
  public static convertToTaskFile(googleFile: GoogleDriveFile | any): GoogleDriveTaskFile {
    return {
      id: crypto.randomUUID(), // 로컬 ID 생성
      name: googleFile.name,
      url: googleFile.webViewLink,
      size: googleFile.size || 0,
      type: googleFile.mimeType,
      uploaded_at: googleFile.createdTime || googleFile.modifiedTime || new Date().toISOString(),
      uploaded_by: '', // 현재 사용자 ID로 설정될 예정
      category: 'attachment',
      isGoogleDrive: true,
      googleDriveId: googleFile.id,
      editUrl: googleFile.webViewLink
    };
  }

  /**
   * Build upload context for Google Drive folder structure
   */
  private static async buildUploadContext(options: IntegrationOptions): Promise<GoogleDriveUploadContext | undefined> {
    const currentYear = new Date().getFullYear();

    switch (options.targetType) {
      case 'task': {
        const { department, eventName, taskName, year } = await this.getTaskAndWorkInfo(options.targetId);
        return {
          feature: '업무 관리',
          year: year || currentYear,
          department: department || undefined,
          eventName: eventName || undefined,
          taskName: taskName || undefined
        };
      }

      case 'task_event': {
        const { department, eventName, year } = await this.getWorkInfo(options.targetId);
        return {
          feature: '업무 관리',
          year: year || currentYear,
          department: department || undefined,
          eventName: eventName || undefined
        };
      }

      case 'meeting': {
        const { department, meetingName } = await this.getMeetingInfo(options.targetId);
        // Get meeting data to determine month
        const { data: meeting } = await supabase
          .from('meeting')
          .select('starts_at')
          .eq('id', options.targetId)
          .single();

        const month = meeting?.starts_at ? new Date(meeting.starts_at).getMonth() + 1 : undefined;

        return {
          feature: '스케줄',
          year: currentYear,
          month,
          scheduleName: meetingName || undefined
        };
      }

      case 'document': {
        return {
          feature: '서류함',
          year: currentYear,
          department: options.department
        };
      }

      case 'collab_note': {
        const { boardName, noteName } = await this.getCollabNoteInfo(options.targetId, options.boardId);
        return {
          feature: '협업 보드',
          year: currentYear,
          boardName: boardName || undefined,
          noteName: noteName || undefined
        };
      }

      default:
        return undefined;
    }
  }

  /**
   * Google Drive에서 새 파일 생성 후 시스템에 등록
   */
  public static async createAndRegister(
    fileName: string,
    fileType: 'document' | 'spreadsheet' | 'presentation',
    options: IntegrationOptions
  ): Promise<GoogleDriveTaskFile | null> {
    try {
      // Build upload context for folder structure
      const uploadContext = await this.buildUploadContext(options);
      console.log('📁 Create File Context Built:', {
        targetType: options.targetType,
        targetId: options.targetId,
        uploadContext
      });

      // Google Drive에 새 파일 생성
      const googleFile = await this.driveService.createNewFile({
        name: fileName,
        type: fileType,
        uploadContext
      });

      // TaskFile 형식으로 변환
      const taskFile = this.convertToTaskFile(googleFile);

      // 현재 사용자 ID 설정
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        taskFile.uploaded_by = user.id;
      }

      // 대상 시스템에 등록 (uploadContext 전달)
      await this.registerToTarget(taskFile, options, uploadContext);

      console.log('File created and registered successfully:', googleFile.name);
      return taskFile;
    } catch (error) {
      console.error('Google Drive 파일 생성 및 등록 오류:', error);
      throw error;
    }
  }

  /**
   * 기존 파일을 Google Drive에 업로드 후 시스템에 등록
   */
  public static async uploadAndRegister(
    file: File,
    options: IntegrationOptions
  ): Promise<GoogleDriveTaskFile | null> {
    try {
      // Build upload context for folder structure
      const uploadContext = await this.buildUploadContext(options);
      console.log('📁 Upload Context Built:', {
        targetType: options.targetType,
        targetId: options.targetId,
        uploadContext
      });

      // Google Drive에 파일 업로드
      const googleFile = await this.driveService.uploadFile({
        name: file.name,
        file: file,
        uploadContext
      });

      // TaskFile 형식으로 변환
      const taskFile = this.convertToTaskFile(googleFile);

      // 현재 사용자 ID 설정
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        taskFile.uploaded_by = user.id;
      }

      // 대상 시스템에 등록 (uploadContext 전달)
      await this.registerToTarget(taskFile, options, uploadContext);

      return taskFile;
    } catch (error) {
      console.error('Google Drive 파일 업로드 및 등록 오류:', error);
      throw error;
    }
  }

  /**
   * Google Drive에서 파일 선택 후 시스템에 등록
   * Spacekijun 폴더로 복사하여 다운로드 가능하게 함
   */
  public static async selectAndRegister(
    googleFile: GoogleDriveFile | any,
    options: IntegrationOptions
  ): Promise<GoogleDriveTaskFile | null> {
    try {
      // Build upload context for folder structure
      const uploadContext = await this.buildUploadContext(options);

      // 파일을 적절한 폴더로 복사 (다운로드 가능하도록)
      console.log('Copying file with context:', googleFile.name, uploadContext);
      const copiedFile = await this.driveService.copyFileToSpacekijun(
        googleFile.id,
        undefined, // Keep original name
        uploadContext
      );

      // 복사된 파일을 TaskFile 형식으로 변환
      const taskFile = this.convertToTaskFile(copiedFile);

      // 현재 사용자 ID 설정
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        taskFile.uploaded_by = user.id;
      }

      // 대상 시스템에 등록 (uploadContext 전달)
      await this.registerToTarget(taskFile, options, uploadContext);

      console.log('File copied and registered successfully:', copiedFile.name);
      return taskFile;
    } catch (error) {
      console.error('Google Drive 파일 선택 및 등록 오류:', error);
      throw error;
    }
  }

  /**
   * Pending 파일 처리 및 등록 (Manual mode용)
   * - Pending 생성 파일: 실제로 생성 후 등록
   * - Pending 업로드 파일: 실제로 업로드 후 등록
   * - 기존 파일: 바로 등록
   */
  public static async processPendingAndRegister(
    fileInfo: GoogleDriveFileInfo,
    options: IntegrationOptions
  ): Promise<GoogleDriveTaskFile | null> {
    try {
      // Pending 생성 파일 처리
      if (fileInfo.isPending && fileInfo.pendingCreate) {
        return await this.createAndRegister(
          fileInfo.pendingCreate.name,
          fileInfo.pendingCreate.type,
          options
        );
      }

      // Pending 업로드 파일 처리
      if (fileInfo.isPending && fileInfo.pendingUpload) {
        return await this.uploadAndRegister(
          fileInfo.pendingUpload,
          options
        );
      }

      // 기존 파일 처리 (이미 Google Drive에 존재)
      return await this.selectAndRegister(fileInfo, options);
    } catch (error) {
      console.error('Pending 파일 처리 및 등록 오류:', error);
      throw error;
    }
  }

  /**
   * 대상 시스템에 파일 등록
   */
  private static async registerToTarget(
    taskFile: GoogleDriveTaskFile,
    options: IntegrationOptions,
    uploadContext?: GoogleDriveUploadContext
  ): Promise<void> {
    switch (options.targetType) {
      case 'meeting':
        await this.registerToMeeting(taskFile, options.targetId, uploadContext);
        break;
      case 'task':
        await this.registerToTask(taskFile, options.targetId, uploadContext);
        break;
      case 'task_event':
        await this.registerToWork(taskFile, options.targetId, uploadContext);
        break;
      case 'document':
        await this.registerToDocuments(taskFile, options.department, options.documentMeta);
        break;
      case 'collab_note':
        await this.registerToCollabNote(taskFile, options.targetId, options.boardId, uploadContext);
        break;
      default:
        throw new Error(`지원하지 않는 대상 타입: ${options.targetType}`);
    }
  }

  /**
   * Meeting 시스템에 Google Drive 파일 등록
   */
  private static async registerToMeeting(
    taskFile: GoogleDriveTaskFile,
    meetingId: string,
    uploadContext?: GoogleDriveUploadContext
  ): Promise<void> {
    // Meeting meta에 파일 정보 추가 (MeetingFileService 활용)
    const { data: meeting, error: selectError } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    if (selectError) {
      throw new Error(`미팅 조회 실패: ${selectError.message}`);
    }

    const currentMeta = (meeting?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = [...currentFiles, taskFile];

    const { error: updateError } = await supabase
      .from('meeting')
      .update({
        meta: {
          ...currentMeta,
          files: updatedFiles
        }
      })
      .eq('id', meetingId);

    if (updateError) {
      throw new Error(`파일 정보 저장 실패: ${updateError.message}`);
    }

    // Meeting 정보 가져오기
    const { department, meetingName } = await this.getMeetingInfo(meetingId);

    // Documents 테이블에도 저장 (uploadContext 전달)
    await this.saveToDocumentsTable(taskFile, 'meeting', meetingId, { department, meetingName }, uploadContext);
  }

  /**
   * Task 시스템에 Google Drive 파일 등록
   */
  private static async registerToTask(
    taskFile: GoogleDriveTaskFile,
    taskId: string,
    uploadContext?: GoogleDriveUploadContext
  ): Promise<void> {
    // Task의 meta.files 필드에 추가
    const { data: task, error: selectError } = await (supabase as any)
      .from('task')
      .select('meta')
      .eq('id', taskId)
      .single();

    if (selectError) {
      throw new Error(`업무 조회 실패: ${selectError.message}`);
    }

    const currentMeta = (task?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = [...currentFiles, taskFile];

    const { error: updateError } = await (supabase as any)
      .from('task')
      .update({
        meta: {
          ...currentMeta,
          files: updatedFiles
        }
      })
      .eq('id', taskId);

    if (updateError) {
      throw new Error(`파일 정보 저장 실패: ${updateError.message}`);
    }

    // Task와 Event 정보 가져오기
    const { department, eventName, taskName } = await this.getTaskAndWorkInfo(taskId);

    // Documents 테이블에도 저장 (uploadContext 전달)
    await this.saveToDocumentsTable(taskFile, 'task', taskId, { department, eventName, taskName }, uploadContext);
  }

  /**
   * Task Event 시스템에 Google Drive 파일 등록
   */
  private static async registerToWork(
    taskFile: GoogleDriveTaskFile,
    eventId: string,
    uploadContext?: GoogleDriveUploadContext
  ): Promise<void> {
    // Event의 meta.files 필드에 추가
    const { data: event, error: selectError } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', eventId)
      .single();

    if (selectError) {
      throw new Error(`이벤트 조회 실패: ${selectError.message}`);
    }

    const currentMeta = (event?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = [...currentFiles, taskFile];

    const { error: updateError } = await (supabase as any)
      .from('work')
      .update({
        meta: {
          ...currentMeta,
          files: updatedFiles
        }
      })
      .eq('id', eventId);

    if (updateError) {
      throw new Error(`파일 정보 저장 실패: ${updateError.message}`);
    }

    // Event 정보 가져오기
    const { department, eventName } = await this.getWorkInfo(eventId);

    // Documents 테이블에도 저장 (uploadContext 전달)
    await this.saveToDocumentsTable(taskFile, 'task_event', eventId, { department, eventName }, uploadContext);
  }

  /**
   * Documents 시스템에 Google Drive 파일 등록
   */
  private static async registerToDocuments(
    taskFile: GoogleDriveTaskFile,
    department?: string,
    documentMeta?: IntegrationOptions['documentMeta']
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('사용자 인증이 필요합니다.');
    }

    // uploadContext 생성 (카테고리는 자동 설정하지 않음)
    const uploadContext: GoogleDriveUploadContext = {
      feature: '서류함',
      year: new Date().getFullYear(),
      department: department
    };

    // 디렉토리 경로: 지정 폴더 우선, 없으면 uploadContext에서 자동 생성
    const directoryPath = documentMeta?.directoryPath || this.buildDirectoryPathFromContext(uploadContext);

    const now = new Date().toISOString();
    const documentData = {
      id: taskFile.id,
      user_id: user.id,
      title: taskFile.name,
      file_name: taskFile.name,
      file_type: taskFile.type,
      file_size: taskFile.size,
      storage_path: taskFile.url,
      upload_status: 'completed',
      created_at: now,
      updated_at: now,
      meta: {
        department: department,
        category: documentMeta?.category || undefined,
        keywords: documentMeta?.keywords ?? [],
        search_keywords: documentMeta?.keywords ?? [],
        description: documentMeta?.description || undefined,
        directory_path: directoryPath,
        uploadContext: uploadContext,
        uploaded_from: 'google_drive',
        google_drive_id: taskFile.googleDriveId,
        google_drive_edit_url: taskFile.editUrl,
        is_google_drive_file: true
      }
    };

    const { error } = await supabase
      .from('documents')
      .insert(documentData);

    if (error) {
      throw new Error(`Documents 테이블 저장 실패: ${error.message}`);
    }
  }

  /**
   * Collaboration Note에 Google Drive 파일 등록
   */
  private static async registerToCollabNote(
    taskFile: GoogleDriveTaskFile,
    noteId: string,
    boardId?: string,
    uploadContext?: GoogleDriveUploadContext
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('사용자 인증이 필요합니다.');
    }

    const { boardName, noteName } = await this.getCollabNoteInfo(noteId, boardId);

    // uploadContext로부터 디렉토리 경로 생성
    const directoryPath = this.buildDirectoryPathFromContext(uploadContext);

    const now = new Date().toISOString();
    const documentData = {
      id: crypto.randomUUID(),
      user_id: user.id,
      title: taskFile.name,
      file_name: taskFile.name,
      file_type: taskFile.type,
      file_size: taskFile.size,
      storage_path: taskFile.url,
      upload_status: 'completed',
      created_at: now,
      updated_at: now,
      meta: {
        directory_path: directoryPath,
        uploadContext: uploadContext,
        source_type: 'collab_note',
        source_id: noteId,
        uploaded_from: 'collab_note',
        is_google_drive_file: true,
        google_drive_id: taskFile.googleDriveId,
        google_drive_edit_url: taskFile.editUrl,
        board_name: boardName,
        note_name: noteName,
        upload_timestamp: now
      }
    };

    const { error } = await supabase
      .from('documents')
      .insert(documentData);

    if (error) {
      throw new Error(`Documents 테이블 저장 실패: ${error.message}`);
    }
  }

  /**
   * Helper: uploadContext로부터 디렉토리 경로 생성
   */
  private static buildDirectoryPathFromContext(uploadContext?: GoogleDriveUploadContext): string {
    if (!uploadContext) return '/';

    const path: string[] = [];

    // Year first
    path.push(uploadContext.year?.toString() || new Date().getFullYear().toString());

    // Feature name
    if (uploadContext.feature) path.push(uploadContext.feature);

    // Feature-specific structure
    switch (uploadContext.feature) {
      case '업무 관리':
        if (uploadContext.taskName) {
          if (uploadContext.department) path.push(uploadContext.department);
          if (uploadContext.eventName) path.push(uploadContext.eventName);
          path.push(uploadContext.taskName);
        } else if (uploadContext.eventName) {
          if (uploadContext.department) path.push(uploadContext.department);
          path.push(uploadContext.eventName);
        }
        break;

      case '스케줄':
        if (uploadContext.month) path.push(uploadContext.month.toString());
        if (uploadContext.scheduleName) path.push(uploadContext.scheduleName);
        break;

      case '협업 보드':
        if (uploadContext.boardName) path.push(uploadContext.boardName);
        if (uploadContext.noteName) path.push(uploadContext.noteName);
        break;

      case '서류함':
        if (uploadContext.category) path.push(uploadContext.category);
        if (uploadContext.department) path.push(uploadContext.department);
        break;
    }

    return path.join('/');
  }

  /**
   * Documents 테이블에 파일 정보 저장 (공통)
   */
  private static async saveToDocumentsTable(
    taskFile: GoogleDriveTaskFile,
    sourceType: 'meeting' | 'task' | 'task_event',
    sourceId: string,
    additionalInfo?: { department?: string | null; eventName?: string | null; taskName?: string | null; meetingName?: string | null },
    uploadContext?: GoogleDriveUploadContext
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('사용자 정보가 없어 documents 테이블에 저장하지 않습니다.');
      return;
    }

    // uploadContext로부터 디렉토리 경로 생성
    const directoryPath = this.buildDirectoryPathFromContext(uploadContext);

    const now = new Date().toISOString();
    const documentData = {
      id: crypto.randomUUID(), // 별도 ID 생성
      user_id: user.id,
      title: taskFile.name,
      file_name: taskFile.name,
      file_type: taskFile.type,
      file_size: taskFile.size,
      storage_path: taskFile.url,
      upload_status: 'completed',
      created_at: now,
      updated_at: now,
      meta: {
        department: additionalInfo?.department || null,
        directory_path: directoryPath,
        uploadContext: uploadContext,
        source_type: sourceType,
        source_id: sourceId,
        uploaded_from: 'google_drive_integration',
        google_drive_id: taskFile.googleDriveId,
        google_drive_edit_url: taskFile.editUrl,
        is_google_drive_file: true,
        event_name: additionalInfo?.eventName || null,
        task_name: additionalInfo?.taskName || null,
        meeting_name: additionalInfo?.meetingName || null
      }
    };

    const { error } = await supabase
      .from('documents')
      .insert(documentData);

    if (error) {
      console.error('Documents 테이블 저장 실패:', error);
      // 에러가 발생해도 메인 기능은 실패하지 않도록 함
    } else {
      console.log('Google Drive 파일이 Documents 테이블에 저장됨:', {
        fileId: taskFile.id,
        googleDriveId: taskFile.googleDriveId,
        sourceType,
        sourceId,
        department: additionalInfo?.department,
        eventName: additionalInfo?.eventName,
        taskName: additionalInfo?.taskName,
        meetingName: additionalInfo?.meetingName,
        directoryPath
      });
    }
  }

  /**
   * Event에서 department와 name 정보 가져오기
   */
  private static async getWorkInfo(eventId: string): Promise<{ department: string | null; eventName: string | null; year: number | null }> {
    const { data: event, error } = await (supabase as any)
      .from('work')
      .select('name, meta, created_at')
      .eq('id', eventId)
      .single();

    if (error || !event) {
      console.warn(`Event 정보 조회 실패 (${eventId}):`, error);
      return { department: null, eventName: null, year: null };
    }

    const year = (event as any).meta?.year
      || ((event as any).created_at ? new Date((event as any).created_at).getFullYear() : null);

    return {
      department: (event as any).meta?.department || null,
      eventName: (event as any).name || null,
      year
    };
  }

  /**
   * Task와 Event 정보 가져오기
   */
  private static async getTaskAndWorkInfo(taskId: string): Promise<{ department: string | null; eventName: string | null; taskName: string | null; year: number | null }> {
    const { data: task, error } = await (supabase as any)
      .from('task')
      .select('title, event_id')
      .eq('id', taskId)
      .single();

    if (error || !task) {
      console.warn(`Task 조회 실패 (${taskId}):`, error);
      return { department: null, eventName: null, taskName: null, year: null };
    }

    if (!(task as any).event_id) {
      console.warn(`Task에 event_id가 없음 (${taskId})`);
      return { department: null, eventName: null, taskName: (task as any).title || null, year: null };
    }

    const { department, eventName, year } = await this.getWorkInfo((task as any).event_id);

    return {
      department,
      eventName,
      taskName: (task as any).title || null,
      year
    };
  }

  /**
   * Meeting 정보 가져오기
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
      department: (meeting as any).meta?.department || null,
      meetingName: (meeting as any).meta?.title || null
    };
  }

  /**
   * Collaboration Board Note 정보 가져오기
   */
  private static async getCollabNoteInfo(noteId: string, boardId?: string): Promise<{ boardName: string | null; noteName: string | null }> {
    // Get note title
    const { data: note, error: noteError } = await supabase
      .from('collab_notes')
      .select('title, board_id')
      .eq('id', noteId)
      .single();

    if (noteError || !note) {
      console.warn(`Collab Note 정보 조회 실패 (${noteId}):`, noteError);
      return { boardName: null, noteName: null };
    }

    const noteBoardId = boardId || (note as any).board_id;
    if (!noteBoardId) {
      return { boardName: null, noteName: (note as any).title || null };
    }

    // Get board title
    const { data: board, error: boardError } = await supabase
      .from('collab_boards')
      .select('title')
      .eq('id', noteBoardId)
      .single();

    if (boardError || !board) {
      console.warn(`Collab Board 정보 조회 실패 (${noteBoardId}):`, boardError);
      return { boardName: null, noteName: (note as any).title || null };
    }

    return {
      boardName: (board as any).title || null,
      noteName: (note as any).title || null
    };
  }

  /**
   * Google Drive 파일 삭제 (시스템에서도 제거)
   */
  public static async deleteGoogleDriveFile(
    taskFile: GoogleDriveTaskFile,
    options: IntegrationOptions
  ): Promise<void> {
    try {
      // Google Drive에서 파일 삭제 + 빈 폴더 정리
      await this.driveService.deleteFileAndCleanupFolders(taskFile.googleDriveId);

      // 시스템에서 파일 정보 제거
      await this.removeFromTarget(taskFile, options);

      // Documents 테이블에서도 제거
      await this.removeFromDocumentsTable(taskFile.googleDriveId);
    } catch (error) {
      console.error('Google Drive 파일 삭제 오류:', error);
      throw error;
    }
  }

  /**
   * 대상 시스템에서 파일 정보 제거
   */
  private static async removeFromTarget(
    taskFile: GoogleDriveTaskFile,
    options: IntegrationOptions
  ): Promise<void> {
    switch (options.targetType) {
      case 'meeting':
        await this.removeFromMeeting(taskFile, options.targetId);
        break;
      case 'task':
        await this.removeFromTask(taskFile, options.targetId);
        break;
      case 'task_event':
        await this.removeFromWork(taskFile, options.targetId);
        break;
      // document 타입은 documents 테이블에서만 삭제하면 됨
    }
  }

  /**
   * Meeting에서 Google Drive 파일 제거
   */
  private static async removeFromMeeting(
    taskFile: GoogleDriveTaskFile,
    meetingId: string
  ): Promise<void> {
    const { data: meeting } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    const currentMeta = (meeting?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = currentFiles.filter((f: TaskFile) => f.id !== taskFile.id);

    await supabase
      .from('meeting')
      .update({
        meta: {
          ...currentMeta,
          files: updatedFiles
        }
      })
      .eq('id', meetingId);
  }

  /**
   * Task에서 Google Drive 파일 제거
   */
  private static async removeFromTask(
    taskFile: GoogleDriveTaskFile,
    taskId: string
  ): Promise<void> {
    const { data: task } = await (supabase as any)
      .from('task')
      .select('meta')
      .eq('id', taskId)
      .single();

    const currentMeta = (task?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = currentFiles.filter((f: TaskFile) => f.id !== taskFile.id);

    await (supabase as any)
      .from('task')
      .update({
        meta: {
          ...currentMeta,
          files: updatedFiles
        }
      })
      .eq('id', taskId);
  }

  /**
   * Task Event에서 Google Drive 파일 제거
   */
  private static async removeFromWork(
    taskFile: GoogleDriveTaskFile,
    eventId: string
  ): Promise<void> {
    const { data: event } = await (supabase as any)
      .from('work')
      .select('meta')
      .eq('id', eventId)
      .single();

    const currentMeta = (event?.meta as any) || {};
    const currentFiles = (currentMeta as any).files || [];
    const updatedFiles = currentFiles.filter((f: TaskFile) => f.id !== taskFile.id);

    await (supabase as any)
      .from('work')
      .update({
        meta: {
          ...currentMeta,
          files: updatedFiles
        }
      })
      .eq('id', eventId);
  }

  /**
   * Documents 테이블에서 Google Drive 파일 제거
   */
  private static async removeFromDocumentsTable(googleDriveId: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('meta->>google_drive_id', googleDriveId);

    if (error) {
      console.error('Documents 테이블 삭제 실패:', error);
    }
  }

  /**
   * Google Drive 폴더와 모든 하위 파일 일괄 등록 (폴더 구조 유지)
   * @param folderId - Google Drive 폴더 ID
   * @param options - Integration options
   * @param onProgress - Progress callback (current, total, fileName)
   * @returns Number of files registered
   */
  public static async selectFolderAndRegister(
    folderId: string,
    options: IntegrationOptions,
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<number> {
    try {
      // Get all files in folder recursively with relative paths
      console.log('🔍 Scanning folder:', folderId);
      const filesWithPaths = await this.driveService.getAllFilesInFolder(folderId);

      if (filesWithPaths.length === 0) {
        throw new Error('폴더에 파일이 없습니다.');
      }

      console.log(`📁 Found ${filesWithPaths.length} files in folder`);

      // Get folder name for base path
      const folderPath = await this.driveService.getFolderPath(folderId);
      const baseFolderName = folderPath[folderPath.length - 1] || 'folder';

      let successCount = 0;
      const errors: Array<{ fileName: string; error: string }> = [];

      // Process each file
      for (let i = 0; i < filesWithPaths.length; i++) {
        const fileWithPath = filesWithPaths[i];

        // Report progress
        onProgress?.(i + 1, filesWithPaths.length, fileWithPath.name);

        try {
          // Build upload context with folder structure
          const uploadContext = await this.buildUploadContext(options);

          // Extract relative directory from relativePath (exclude filename)
          const pathParts = fileWithPath.relativePath.split('/');
          pathParts.pop(); // Remove filename
          const relativeDir = pathParts.join('/');

          // Combine base folder name with relative path
          const fullPath = relativeDir ? `${baseFolderName}/${relativeDir}` : baseFolderName;

          // Copy file to Spacekijun with folder structure
          console.log(`📄 Processing: ${fileWithPath.relativePath}`);
          const copiedFile = await this.driveService.copyFileToSpacekijun(
            fileWithPath.id,
            fileWithPath.name,
            uploadContext
          );

          // Convert to TaskFile
          const taskFile = this.convertToTaskFile(copiedFile);

          // Set current user ID
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            taskFile.uploaded_by = user.id;
          }

          // Register to target with directory path in meta
          await this.registerFileWithPath(taskFile, options, uploadContext, fullPath);

          successCount++;
          console.log(`✅ Registered: ${fileWithPath.relativePath}`);
        } catch (error: any) {
          console.error(`❌ Failed to process: ${fileWithPath.name}`, error);
          errors.push({
            fileName: fileWithPath.name,
            error: error.message || '알 수 없는 오류'
          });
        }
      }

      console.log(`✨ Folder registration complete: ${successCount}/${filesWithPaths.length} files`);

      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} files failed:`, errors);
      }

      return successCount;
    } catch (error: any) {
      console.error('Google Drive 폴더 일괄 등록 오류:', error);
      throw error;
    }
  }

  /**
   * Register file to target with directory path
   */
  private static async registerFileWithPath(
    taskFile: GoogleDriveTaskFile,
    options: IntegrationOptions,
    uploadContext: GoogleDriveUploadContext | undefined,
    directoryPath: string
  ): Promise<void> {
    // Build full directory path
    const baseDir = this.buildDirectoryPathFromContext(uploadContext);
    const fullDir = `${baseDir}/${directoryPath}`;

    switch (options.targetType) {
      case 'document': {
        // For documents, save directly with directory path
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('사용자 인증이 필요합니다.');
        }

        const now = new Date().toISOString();
        const documentData = {
          id: crypto.randomUUID(),
          user_id: user.id,
          title: taskFile.name,
          file_name: taskFile.name,
          file_type: taskFile.type,
          file_size: taskFile.size,
          storage_path: taskFile.url,
          upload_status: 'completed',
          created_at: now,
          updated_at: now,
          meta: {
            department: options.department,
            category: options.documentMeta?.category || undefined,
            keywords: options.documentMeta?.keywords ?? [],
            search_keywords: options.documentMeta?.keywords ?? [],
            directory_path: fullDir,
            uploadContext: uploadContext,
            uploaded_from: 'google_drive_folder',
            google_drive_id: taskFile.googleDriveId,
            google_drive_edit_url: taskFile.editUrl,
            is_google_drive_file: true
          }
        };

        const { error } = await supabase
          .from('documents')
          .insert(documentData);

        if (error) {
          throw new Error(`Documents 테이블 저장 실패: ${error.message}`);
        }
        break;
      }

      case 'meeting':
      case 'task':
      case 'task_event':
      case 'collab_note': {
        // For other types, use existing registration with enhanced meta
        await this.registerToTarget(taskFile, options, {
          ...uploadContext,
          category: directoryPath // Store directory path in category for now
        } as GoogleDriveUploadContext);
        break;
      }

      default:
        throw new Error(`지원하지 않는 대상 타입: ${options.targetType}`);
    }
  }
}