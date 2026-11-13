// ========================================
// File Management Hook
// Shared state and handlers for file operations
// ========================================

import { useState, useCallback } from 'react';
import type { TaskFile } from '@/types/tasks';
import type { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import { TaskFileService } from '@/services/taskFileService';
import { GoogleDriveIntegrationService } from '@/services/googleDriveIntegrationService';

export interface UseFileManagementOptions {
  entityId: string | null;
  entityType: 'task' | 'event';
  onError?: (message: string) => void;
}

export interface FileManagementState {
  attachedFiles: File[];
  googleDriveFiles: GoogleDriveFileInfo[];
  existingFiles: TaskFile[];
  filesToDelete: string[];
  loadingFiles: boolean;
}

export interface FileManagementActions {
  setAttachedFiles: (files: File[]) => void;
  setGoogleDriveFiles: (files: GoogleDriveFileInfo[]) => void;
  markFileForDeletion: (fileId: string) => void;
  cancelFileDeletion: (fileId: string) => void;
  downloadFile: (file: TaskFile) => void;
  loadExistingFiles: () => Promise<void>;
  resetFileState: () => void;
  uploadNewFiles: (targetId: string) => Promise<void>;
  processFileDeletions: (targetId: string) => Promise<void>;
  getFilesNotMarkedForDeletion: () => TaskFile[];
}

export function useFileManagement(
  options: UseFileManagementOptions
): FileManagementState & FileManagementActions {
  const { entityId, entityType, onError } = options;

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFileInfo[]>([]);
  const [existingFiles, setExistingFiles] = useState<TaskFile[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const markFileForDeletion = useCallback((fileId: string): void => {
    setFilesToDelete((prev) => [...prev, fileId]);
  }, []);

  const cancelFileDeletion = useCallback((fileId: string): void => {
    setFilesToDelete((prev) => prev.filter((id) => id !== fileId));
  }, []);

  const downloadFile = useCallback((file: TaskFile): void => {
    window.open(file.url, '_blank');
  }, []);

  const loadExistingFiles = useCallback(async (): Promise<void> => {
    if (!entityId) {
      setExistingFiles([]);
      return;
    }

    setLoadingFiles(true);
    try {
      const files =
        entityType === 'task'
          ? await TaskFileService.getTaskFiles(entityId)
          : await TaskFileService.getWorkFiles(entityId);
      setExistingFiles(files);
    } catch (error) {
      console.error('파일 로드 실패:', error);
      onError?.('첨부파일을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingFiles(false);
    }
  }, [entityId, entityType, onError]);

  const resetFileState = useCallback((): void => {
    setAttachedFiles([]);
    setGoogleDriveFiles([]);
    setFilesToDelete([]);
  }, []);

  const uploadNewFiles = useCallback(
    async (targetId: string): Promise<void> => {
      // Upload local files
      for (const file of attachedFiles) {
        try {
          if (entityType === 'task') {
            await TaskFileService.uploadTaskFile(targetId, file);
          } else {
            await TaskFileService.uploadWorkFile(targetId, file);
          }
        } catch (error) {
          console.error('파일 업로드 실패:', error);
          onError?.(`${file.name} 업로드 중 오류가 발생했습니다.`);
        }
      }

      // Register Google Drive files
      for (const googleFile of googleDriveFiles) {
        try {
          const integrationOptions = {
            targetType: entityType === 'task' ? ('task' as const) : ('task_event' as const),
            targetId,
          };
          await GoogleDriveIntegrationService.processPendingAndRegister(
            googleFile,
            integrationOptions
          );
        } catch (error) {
          console.error('Google Drive 파일 등록 실패:', error);
          onError?.(`${googleFile.name} 등록 중 오류가 발생했습니다.`);
        }
      }
    },
    [attachedFiles, googleDriveFiles, entityType, onError]
  );

  const processFileDeletions = useCallback(
    async (targetId: string): Promise<void> => {
      for (const fileId of filesToDelete) {
        try {
          if (entityType === 'task') {
            await TaskFileService.deleteTaskFile(targetId, fileId);
          } else {
            await TaskFileService.deleteWorkFile(targetId, fileId);
          }
        } catch (error) {
          console.error('파일 삭제 실패:', error);
        }
      }
    },
    [filesToDelete, entityType]
  );

  const getFilesNotMarkedForDeletion = useCallback((): TaskFile[] => {
    return existingFiles.filter((file) => !filesToDelete.includes(file.id));
  }, [existingFiles, filesToDelete]);

  return {
    // State
    attachedFiles,
    googleDriveFiles,
    existingFiles,
    filesToDelete,
    loadingFiles,
    // Actions
    setAttachedFiles,
    setGoogleDriveFiles,
    markFileForDeletion,
    cancelFileDeletion,
    downloadFile,
    loadExistingFiles,
    resetFileState,
    uploadNewFiles,
    processFileDeletions,
    getFilesNotMarkedForDeletion,
  };
}
