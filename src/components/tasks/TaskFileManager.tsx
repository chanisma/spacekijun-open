import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Trash2, Download, Upload, File } from 'lucide-react';
import { TaskFileService, FileUploadProgress } from '@/services/taskFileService';
import { useDeleteTaskFile, useDeleteWorkFile } from '@/hooks/useTaskFiles';
import type { TaskFile } from '@/types/tasks';

interface TaskFileManagerProps {
  entityId: string;
  entityType: 'event' | 'task';
  files: TaskFile[];
  onFilesChange: () => void;
  allowUpload?: boolean;
  allowDelete?: boolean;
}

export function TaskFileManager({
  entityId,
  entityType,
  files,
  onFilesChange,
  allowUpload = true,
  allowDelete = true
}: TaskFileManagerProps) {
  const [uploading, setUploading] = useState<FileUploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Delete mutations with proper cache invalidation
  const deleteTaskFileMutation = useDeleteTaskFile();
  const deleteWorkFileMutation = useDeleteWorkFile();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!allowUpload) return;

    setError(null);
    const newUploads: FileUploadProgress[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const
    }));

    setUploading(prev => [...prev, ...newUploads]);

    // 파일들을 순차적으로 업로드
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const uploadIndex = uploading.length + i;

      try {
        let uploadedFile: TaskFile;

        if (entityType === 'event') {
          uploadedFile = await TaskFileService.uploadWorkFile(
            entityId,
            file,
            (progress) => {
              setUploading(prev => prev.map((upload, idx) =>
                idx === uploadIndex
                  ? { ...upload, progress }
                  : upload
              ));
            }
          );
        } else {
          uploadedFile = await TaskFileService.uploadTaskFile(
            entityId,
            file,
            (progress) => {
              setUploading(prev => prev.map((upload, idx) =>
                idx === uploadIndex
                  ? { ...upload, progress }
                  : upload
              ));
            }
          );
        }

        setUploading(prev => prev.map((upload, idx) =>
          idx === uploadIndex
            ? { ...upload, status: 'completed', progress: 100, url: uploadedFile.url }
            : upload
        ));

        onFilesChange();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '업로드 실패';
        setUploading(prev => prev.map((upload, idx) =>
          idx === uploadIndex
            ? { ...upload, status: 'error', error: errorMessage }
            : upload
        ));
        setError(errorMessage);
      }
    }

    // 3초 후 업로드 상태 초기화
    setTimeout(() => {
      setUploading([]);
    }, 3000);
  }, [entityId, entityType, allowUpload, onFilesChange, uploading.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !allowUpload,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  const handleDeleteFile = async (fileId: string) => {
    if (!allowDelete) return;

    try {
      if (entityType === 'event') {
        await deleteWorkFileMutation.mutateAsync({ workId: entityId, fileId });
      } else {
        await deleteTaskFileMutation.mutateAsync({ taskId: entityId, fileId });
      }
      // 훅에서 자동으로 캐시 무효화하므로 onFilesChange는 필요시에만 호출
      onFilesChange();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '삭제 실패';
      setError(errorMessage);
    }
  };

  const handleDownloadFile = (file: TaskFile) => {
    window.open(file.url, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <File className="h-5 w-5" />
          첨부파일
          {files.length > 0 && (
            <Badge variant="secondary">{files.length}개</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {entityType === 'event' ? '업무' : '작업'}에 관련된 파일을 관리할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 파일 업로드 영역 */}
        {allowUpload && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/10'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            {isDragActive ? (
              <p className="text-primary">파일을 여기에 놓으세요...</p>
            ) : (
              <div>
                <p className="text-gray-600 mb-1">파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-sm text-gray-400">
                  PDF, Word, Excel, PowerPoint, 이미지 파일 (최대 50MB)
                </p>
              </div>
            )}
          </div>
        )}

        {/* 업로드 진행 상황 */}
        {uploading.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">업로드 중...</h4>
            {uploading.map((upload, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{upload.file.name}</span>
                  <span>
                    {upload.status === 'uploading' && `${upload.progress}%`}
                    {upload.status === 'completed' && '완료'}
                    {upload.status === 'error' && '실패'}
                  </span>
                </div>
                {upload.status === 'uploading' && (
                  <Progress value={upload.progress} className="h-2" />
                )}
                {upload.status === 'error' && upload.error && (
                  <p className="text-sm text-red-500">{upload.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 파일 목록 */}
        {files.length > 0 ? (
          <div className="space-y-2">
            <h4 className="font-medium">첨부된 파일</h4>
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xl">{TaskFileService.getFileIcon(file.type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{TaskFileService.formatFileSize(file.size)}</span>
                      <span>•</span>
                      <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadFile(file)}
                    title="다운로드"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {allowDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFile(file.id)}
                      className="text-red-500 hover:text-red-700"
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <File className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>첨부된 파일이 없습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}