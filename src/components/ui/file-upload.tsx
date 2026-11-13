import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fileUploadService, UploadedFile, FileUploadProgress } from '@/services/fileUploadService';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  onFileUploaded: (file: UploadedFile) => void;
  onFileRemoved?: (fileId: string) => void;
  accept?: string;
  maxFileSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  uploadedFiles?: UploadedFile[];
  showUploadedFiles?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileUploaded,
  onFileRemoved,
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.hwp,.hwpx,.jpg,.jpeg,.png,.gif",
  maxFileSize = 5 * 1024 * 1024, // 5MB
  multiple = false,
  disabled = false,
  className,
  uploadedFiles = [],
  showUploadedFiles = true
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, FileUploadProgress>>({});
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || disabled) return;

    Array.from(files).forEach(file => {
      if (!fileUploadService.isSupportedFileType(file)) {
        toast({
          title: "지원하지 않는 파일 형식",
          description: `${file.name} 파일은 지원하지 않는 형식입니다.`,
          variant: "destructive"
        });
        return;
      }

      if (!fileUploadService.isValidFileSize(file)) {
        toast({
          title: "파일 크기 초과",
          description: `${file.name} 파일이 너무 큽니다. (최대 5MB)`,
          variant: "destructive"
        });
        return;
      }

      const uploadId = `${Date.now()}-${Math.random()}`;
      
      setUploadProgress(prev => ({
        ...prev,
        [uploadId]: { progress: 0, status: 'uploading' }
      }));

      fileUploadService.uploadFile(
        file,
        file.name,
        (progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [uploadId]: progress
          }));
        }
      ).then(uploadedFile => {
        if (uploadedFile) {
          onFileUploaded(uploadedFile);
          toast({
            title: "업로드 완료",
            description: `${file.name} 파일이 성공적으로 업로드되었습니다.`,
          });
        }
        
        // Remove progress after delay
        setTimeout(() => {
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[uploadId];
            return newProgress;
          });
        }, 2000);
      });
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleRemoveFile = async (fileId: string) => {
    const success = await fileUploadService.deleteFile(fileId);
    if (success) {
      onFileRemoved?.(fileId);
      toast({
        title: "파일 삭제",
        description: "파일이 성공적으로 삭제되었습니다.",
      });
    } else {
      toast({
        title: "삭제 실패",
        description: "파일 삭제 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  const getProgressIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Upload className="h-4 w-4 text-blue-600" />;
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload Area */}
      <Card 
        className={cn(
          "border-2 border-dashed transition-colors",
          isDragOver && "border-blue-400 bg-blue-50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <CardContent className="p-6">
          <div
            className="text-center"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              파일을 드래그 앤 드롭하거나 클릭하여 선택하세요
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              PDF, DOC, XLS, PPT, TXT, HWP, HWPX, 이미지 파일 (최대 5MB)
            </p>
            
            <Input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
              disabled={disabled}
            />
            
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Upload className="h-4 w-4 mr-2" />
              파일 선택
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {Object.entries(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([id, progress]) => (
            <Card key={id} className="p-3">
              <div className="flex items-center gap-3">
                {getProgressIcon(progress.status)}
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">업로드 중...</span>
                    <span className="text-xs text-muted-foreground">
                      {progress.progress}%
                    </span>
                  </div>
                  <Progress value={progress.progress} className="h-2" />
                  {progress.error && (
                    <p className="text-xs text-red-600 mt-1">{progress.error}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Uploaded Files List */}
      {showUploadedFiles && uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">업로드된 파일</Label>
          {uploadedFiles.map((file) => (
            <Card key={file.id} className="min-w-0 max-w-full overflow-hidden p-3">
              {/* 파일명은 임의 길이라 반드시 min-w-0 + truncate 쌍으로 묶는다.
                  둘 중 하나만 있으면 이름이 카드(그리고 모달)를 밀어낸다 */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.file_name}>
                      {file.file_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fileUploadService.formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {file.file_type}
                  </Badge>
                  {onFileRemoved && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(file.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};