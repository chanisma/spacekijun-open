import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Upload,
  Plus,
  LogIn,
  LogOut,
  AlertCircle,
  CheckCircle,
  Folder,
  FolderTree,
  Loader2
} from 'lucide-react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { GoogleDriveIntegrationService } from '@/services/googleDriveIntegrationService';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { useToast } from '@/hooks/use-toast';

export interface GoogleDriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink?: string;
  size?: number;
  modifiedTime: string;
  // For newly created/uploaded files
  url?: string;
  type?: string;
  // For pending files (manual mode only)
  isPending?: boolean;
  pendingCreate?: {
    name: string;
    type: 'document' | 'spreadsheet' | 'presentation';
  };
  pendingUpload?: File;
}

export interface GoogleDrivePickerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;

  // Mode: auto = auto register, manual = return file info only
  mode?: 'auto' | 'manual';

  // Auto mode props (for automatic registration)
  targetType?: 'meeting' | 'task' | 'task_event' | 'document';
  targetId?: string;
  department?: string;
  onFileAdded?: () => void;

  // Manual mode props (for custom handling)
  onFileSelected?: (file: GoogleDriveFileInfo) => void | Promise<void>;

  // Common props
  title?: string;
  description?: string;
  isAdmin?: boolean;
}

/**
 * GoogleDrivePicker - Universal Google Drive file picker
 *
 * Two modes:
 * 1. Auto mode: Automatically registers file to database (default)
 * 2. Manual mode: Returns file info for custom handling
 *
 * @example
 * // Auto mode (automatic registration)
 * <GoogleDrivePicker
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   targetType="task"
 *   targetId={taskId}
 *   onFileAdded={handleRefresh}
 * />
 *
 * @example
 * // Manual mode (custom handling)
 * <GoogleDrivePicker
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   mode="manual"
 *   onFileSelected={async (file) => {
 *     // Custom logic
 *     await myCustomUploadLogic(file);
 *   }}
 * />
 */
export const GoogleDrivePicker = ({
  isOpen,
  onOpenChange,
  mode = 'auto',
  targetType = 'document',
  targetId = '',
  department,
  onFileAdded,
  onFileSelected,
  title = 'Google Drive 연동',
  description,
  isAdmin = false
}: GoogleDrivePickerProps) => {
  const { toast } = useToast();
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'document' | 'spreadsheet' | 'presentation'>('document');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectingFileIds, setSelectingFileIds] = useState<Set<string>>(new Set());
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isProcessingFolder, setIsProcessingFolder] = useState(false);
  const [folderProgress, setFolderProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);

  const {
    isAuthenticated,
    isLoading,
    error,
    authenticate,
    logout,
    clearError
  } = useGoogleDrive();

  // Check token validity when dialog opens
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      // Check if token is still valid
      const checkToken = async () => {
        try {
          const driveService = getGoogleDriveService();
          await driveService.signIn(); // This will trigger token validation
        } catch (error: any) {
          // Token validation will automatically trigger 'google-auth-expired' event
        }
      };
      checkToken();
    }
  }, [isOpen, isAuthenticated]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setIsCreating(false);
      setIsUploading(false);
      setSelectingFileIds(new Set());
      setIsOpeningPicker(false);
      setIsProcessingFolder(false);
      setFolderProgress(null);
      setNewFileName('');
      setUploadFile(null);
    }
  }, [isOpen]);

  // Create new file
  const handleCreateFile = async () => {
    if (isCreating) return;

    if (!newFileName.trim()) {
      toast({
        title: '오류',
        description: '파일명을 입력해주세요.',
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);
    try {
      if (mode === 'auto') {
        // Auto mode: register to database
        const integrationOptions = {
          targetType,
          targetId,
          department
        };

        await GoogleDriveIntegrationService.createAndRegister(
          newFileName,
          newFileType,
          integrationOptions
        );

        toast({
          title: '성공',
          description: `${newFileName} 파일이 생성되고 등록되었습니다.`
        });

        onFileAdded?.();
      } else {
        // Manual mode: return pending file info (don't create yet)
        const mimeTypes = {
          document: 'application/vnd.google-apps.document',
          spreadsheet: 'application/vnd.google-apps.spreadsheet',
          presentation: 'application/vnd.google-apps.presentation'
        };

        const fileInfo: GoogleDriveFileInfo = {
          id: `pending-${Date.now()}`, // Temporary ID
          name: newFileName,
          mimeType: mimeTypes[newFileType],
          webViewLink: '', // Will be set after actual creation
          modifiedTime: new Date().toISOString(),
          type: 'google_drive',
          isPending: true,
          pendingCreate: {
            name: newFileName,
            type: newFileType
          }
        };

        await onFileSelected?.(fileInfo);

        toast({
          title: '파일 선택됨',
          description: `${newFileName} 파일이 추가되었습니다. 저장 시 Google Drive에 생성됩니다.`
        });
      }

      setNewFileName('');
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: '오류',
        description: error.message || '파일 생성에 실패했습니다.',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Upload file
  const handleUploadFile = async () => {
    if (isUploading) return;

    if (!uploadFile) {
      toast({
        title: '오류',
        description: '업로드할 파일을 선택해주세요.',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    try {
      if (mode === 'auto') {
        // Auto mode: register to database
        const integrationOptions = {
          targetType,
          targetId,
          department
        };

        await GoogleDriveIntegrationService.uploadAndRegister(
          uploadFile,
          integrationOptions
        );

        toast({
          title: '성공',
          description: `${uploadFile.name} 파일이 업로드되고 등록되었습니다.`
        });

        onFileAdded?.();
      } else {
        // Manual mode: return pending file info (don't upload yet)
        const fileInfo: GoogleDriveFileInfo = {
          id: `pending-${Date.now()}`, // Temporary ID
          name: uploadFile.name,
          mimeType: uploadFile.type,
          webViewLink: '', // Will be set after actual upload
          modifiedTime: new Date().toISOString(),
          size: uploadFile.size,
          type: 'google_drive',
          isPending: true,
          pendingUpload: uploadFile
        };

        await onFileSelected?.(fileInfo);

        toast({
          title: '파일 선택됨',
          description: `${uploadFile.name} 파일이 추가되었습니다. 저장 시 Google Drive에 업로드됩니다.`
        });
      }

      setUploadFile(null);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: '오류',
        description: error.message || '파일 업로드에 실패했습니다.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Select existing Google Drive file
  const handleSelectFile = async (googleFile: any, closeDialog = true) => {
    if (selectingFileIds.has(googleFile.id)) return;

    setSelectingFileIds(prev => new Set(prev).add(googleFile.id));
    try {
      if (mode === 'auto') {
        // Auto mode: register to database
        const integrationOptions = {
          targetType,
          targetId,
          department
        };

        await GoogleDriveIntegrationService.selectAndRegister(
          googleFile,
          integrationOptions
        );

        onFileAdded?.();
      } else {
        // Manual mode: return file info
        const fileInfo: GoogleDriveFileInfo = {
          id: googleFile.id,
          name: googleFile.name,
          mimeType: googleFile.mimeType,
          webViewLink: googleFile.webViewLink,
          webContentLink: googleFile.webContentLink,
          size: googleFile.size,
          modifiedTime: googleFile.modifiedTime,
          url: googleFile.webViewLink,
          type: 'google_drive'
        };

        await onFileSelected?.(fileInfo);
      }

      if (closeDialog) {
        onOpenChange(false);
      }
    } catch (error: any) {
      // Error will be handled in batch processing
      throw error;
    } finally {
      setSelectingFileIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(googleFile.id);
        return newSet;
      });
    }
  };

  // Open Google Picker (entire Drive)
  const handleOpenGooglePicker = async () => {
    if (isOpeningPicker) return;

    setIsOpeningPicker(true);

    // Close dialog temporarily to prevent z-index/overlay issues
    onOpenChange(false);

    // Wait for dialog close animation
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const driveService = getGoogleDriveService();

      await driveService.showPicker(
        async (selectedFiles) => {
          // Process selected files
          let successCount = 0;
          let failCount = 0;
          const errors: string[] = [];

          for (const googleFile of selectedFiles) {
            try {
              await handleSelectFile(googleFile, false); // Don't close dialog per file
              successCount++;
            } catch (error: any) {
              failCount++;
              errors.push(`${googleFile.name}: ${error.message || '알 수 없는 오류'}`);
            }
          }

          // Show summary toast
          if (selectedFiles.length === 1) {
            // Single file - show detailed message
            if (successCount === 1) {
              toast({
                title: '성공',
                description: `${selectedFiles[0].name} 파일이 ${mode === 'auto' ? '등록' : '선택'}되었습니다.`
              });
            } else {
              toast({
                title: '오류',
                description: errors[0] || '파일 처리에 실패했습니다.',
                variant: 'destructive'
              });
            }
          } else {
            // Multiple files - show summary
            if (failCount === 0) {
              toast({
                title: '성공',
                description: `${successCount}개의 파일이 ${mode === 'auto' ? '등록' : '선택'}되었습니다.`
              });
            } else if (successCount === 0) {
              toast({
                title: '오류',
                description: `모든 파일 처리에 실패했습니다.\n${errors.join('\n')}`,
                variant: 'destructive'
              });
            } else {
              toast({
                title: '일부 성공',
                description: `성공: ${successCount}개, 실패: ${failCount}개\n${errors.join('\n')}`,
                variant: 'destructive'
              });
            }
          }
        },
        {
          multiselect: true // Enable multi-file selection
        }
      );
    } catch (error: any) {
      toast({
        title: '오류',
        description: error.message || 'Google Picker를 열 수 없습니다.',
        variant: 'destructive'
      });
    } finally {
      setIsOpeningPicker(false);
    }
  };

  // Open Google Picker for folder selection
  const handleOpenFolderPicker = async () => {
    if (isOpeningPicker || isProcessingFolder) return;

    // Only auto mode supports folder selection
    if (mode !== 'auto') {
      toast({
        title: '알림',
        description: '폴더 선택은 자동 등록 모드에서만 지원됩니다.',
        variant: 'destructive'
      });
      return;
    }

    setIsOpeningPicker(true);

    // Close dialog temporarily
    onOpenChange(false);
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const driveService = getGoogleDriveService();

      await driveService.showPicker(
        async (selectedItems) => {
          if (selectedItems.length === 0) return;

          const folder = selectedItems[0];

          // Check if it's a folder
          if (folder.mimeType !== 'application/vnd.google-apps.folder') {
            toast({
              title: '오류',
              description: '폴더를 선택해주세요.',
              variant: 'destructive'
            });
            return;
          }

          // Start processing folder
          setIsProcessingFolder(true);
          setFolderProgress({ current: 0, total: 0, fileName: '폴더 스캔 중...' });

          try {
            const integrationOptions = {
              targetType,
              targetId,
              department
            };

            const fileCount = await GoogleDriveIntegrationService.selectFolderAndRegister(
              folder.id,
              integrationOptions,
              (current, total, fileName) => {
                setFolderProgress({ current, total, fileName });
              }
            );

            toast({
              title: '성공',
              description: `${folder.name} 폴더의 ${fileCount}개 파일이 등록되었습니다.`
            });

            onFileAdded?.();
          } catch (error: any) {
            toast({
              title: '오류',
              description: error.message || '폴더 등록에 실패했습니다.',
              variant: 'destructive'
            });
          } finally {
            setIsProcessingFolder(false);
            setFolderProgress(null);
          }
        },
        {
          multiselect: false,
          enableFolderSelect: true // Enable folder selection
        }
      );
    } catch (error: any) {
      toast({
        title: '오류',
        description: error.message || 'Google Picker를 열 수 없습니다.',
        variant: 'destructive'
      });
    } finally {
      setIsOpeningPicker(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.69 3.4L15.12 17h5.88L12.58 3.4H6.69zm14.31 14.4H14l-4-7h7l4 7zm-14.5-7L2.5 17h7l4-6.6H6.5z" fill="#4285f4"/>
                <path d="M6.69 3.4L15.12 17h5.88L12.58 3.4H6.69z" fill="#34a853"/>
                <path d="M21 10.8H14l-4-7h7l4 7z" fill="#fbbc04"/>
                <path d="M6.5 10.8L2.5 17h7l4-6.6H6.5z" fill="#ea4335"/>
              </svg>
              {title}
            </div>
            {isAuthenticated && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-800">연결됨</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="h-6 w-6 p-0 ml-1 hover:bg-green-100"
                  title="연결 해제"
                >
                  <LogOut className="h-3 w-3 text-green-700" />
                </Button>
              </div>
            )}
          </DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button variant="ghost" size="sm" onClick={clearError} className="ml-2">
                닫기
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!isAuthenticated ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Google Drive 인증
              </CardTitle>
              <CardDescription>
                Google Drive와 연동하려면 먼저 로그인해주세요.
                한 번 로그인하면 장기간 로그인 상태가 유지됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={authenticate} disabled={isLoading}>
                {isLoading ? '처리중...' : 'Google로 로그인'}
              </Button>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>로그인 정보는 브라우저에 암호화되어 안전하게 저장됩니다</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>토큰이 만료되기 전에 자동으로 새로고침됩니다</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>페이지를 닫았다 열어도 로그인 상태가 유지됩니다</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">ℹ</span>
                  <span>매번 새로 로그인할 필요 없이 지속적으로 사용 가능합니다</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Tabs defaultValue="create" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="create">새 파일 생성</TabsTrigger>
                <TabsTrigger value="upload">파일 업로드</TabsTrigger>
                <TabsTrigger value="select">파일 선택</TabsTrigger>
              </TabsList>

              {/* Create new file tab */}
              <TabsContent value="create" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>새 Google 파일 생성</CardTitle>
                    <CardDescription>
                      Google Docs, Sheets, Slides 중 하나를 선택하여 새 파일을 생성합니다.
                      <br />
                      <span className="text-blue-600 font-medium">📁 파일은 Google Drive의 "Spacekijun" 폴더에 저장됩니다.</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fileName">파일명</Label>
                      <Input
                        id="fileName"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="새 파일의 이름을 입력하세요"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>파일 종류</Label>
                      <Select value={newFileType} onValueChange={(value: any) => setNewFileType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="document">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-600" />
                              Google 문서
                            </div>
                          </SelectItem>
                          <SelectItem value="spreadsheet">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4 text-green-600" />
                              Google 스프레드시트
                            </div>
                          </SelectItem>
                          <SelectItem value="presentation">
                            <div className="flex items-center gap-2">
                              <Presentation className="h-4 w-4 text-orange-600" />
                              Google 프레젠테이션
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      onClick={handleCreateFile}
                      disabled={isCreating || isLoading || !newFileName.trim()}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {isCreating ? '생성 중...' : mode === 'auto' ? '파일 생성 후 등록' : '파일 생성'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Upload file tab */}
              <TabsContent value="upload" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>파일 업로드</CardTitle>
                    <CardDescription>
                      기존 파일을 Google Drive에 업로드하여 {mode === 'auto' ? '등록' : '선택'}합니다.
                      <br />
                      <span className="text-blue-600 font-medium">📁 파일은 Google Drive의 "Spacekijun" 폴더에 저장됩니다.</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="uploadFile">업로드할 파일</Label>
                      <Input
                        id="uploadFile"
                        type="file"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.hwp,.hwpx,.png,.jpg,.jpeg"
                      />
                      {uploadFile && (
                        <div className="text-sm text-gray-600">
                          선택된 파일: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={handleUploadFile}
                      disabled={isUploading || isLoading || !uploadFile}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {isUploading ? '업로드 중...' : mode === 'auto' ? '업로드 후 등록' : '업로드'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Select file tab */}
              <TabsContent value="select" className="space-y-4">
                {/* Google Picker - Full Drive Access */}
                <Card className="border-2 border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-900">
                      <Folder className="h-5 w-5" />
                      전체 Google Drive에서 선택
                    </CardTitle>
                    <CardDescription className="text-blue-800">
                      Google Drive의 모든 파일과 폴더를 탐색하고 선택할 수 있습니다.
                      <br />
                      <span className="text-blue-900 font-medium">💡 여러 파일을 동시에 선택할 수 있습니다 (Ctrl/Cmd 클릭)</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={handleOpenGooglePicker}
                      disabled={isOpeningPicker}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <Folder className="mr-2 h-4 w-4" />
                      {isOpeningPicker ? 'Google Picker 열기 중...' : 'Google Drive 탐색기 열기'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Folder Selection - Admin only */}
                {mode === 'auto' && isAdmin && (
                  <Card className="border-2 border-purple-200 bg-purple-50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-purple-900">
                        <FolderTree className="h-5 w-5" />
                        폴더 일괄 등록 (관리자 전용)
                      </CardTitle>
                      <CardDescription className="text-purple-800">
                        Google Drive 폴더를 선택하면 하위 모든 파일을 일괄 등록합니다.
                        <br />
                        <span className="text-purple-900 font-medium">📂 폴더 구조가 meta.directory_path에 유지됩니다</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        onClick={handleOpenFolderPicker}
                        disabled={isOpeningPicker || isProcessingFolder}
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        <FolderTree className="mr-2 h-4 w-4" />
                        {isProcessingFolder ? '처리 중...' : '폴더 선택하기'}
                      </Button>

                      {/* Progress indicator */}
                      {isProcessingFolder && folderProgress && (
                        <div className="space-y-2 p-3 bg-white rounded-md border border-purple-300">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-purple-900">진행 상황</span>
                            <span className="text-purple-700">
                              {folderProgress.current} / {folderProgress.total}
                            </span>
                          </div>
                          <div className="w-full bg-purple-100 rounded-full h-2">
                            <div
                              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                              style={{
                                width: folderProgress.total > 0
                                  ? `${(folderProgress.current / folderProgress.total) * 100}%`
                                  : '0%'
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-purple-700">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="truncate">{folderProgress.fileName}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
