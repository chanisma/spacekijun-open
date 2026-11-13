"use client"

import React, { useState, useRef, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GoogleDrivePicker, GoogleDriveFileInfo } from "@/components/ui/google-drive/GoogleDrivePicker"
import { X, UploadCloud } from "lucide-react"
import { useGoogleDrive } from "@/hooks/useGoogleDrive"
import { cn } from "@/lib/utils"
import {
  formatFileSize,
  getFileIconElement,
  validateFiles as validateFilesUtil,
  DEFAULT_ACCEPTED_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES
} from "./file-upload-utils"

// 이 컴포넌트의 props 가 쓰는 타입이라 소비자도 여기서 가져온다(파사드).
// isolatedModules 가 켜져 있어 `export type` 이어야 한다.
export type { GoogleDriveFileInfo }

interface CombinedFileUploadProps {
  // Local file upload props
  localFiles: File[]
  onLocalFilesChange: (files: File[]) => void

  // Google Drive files props
  googleDriveFiles: GoogleDriveFileInfo[]
  onGoogleDriveFilesChange: (files: GoogleDriveFileInfo[]) => void

  // Common props
  maxFileSize?: number
  acceptedTypes?: string
  maxFiles?: number
  disabled?: boolean
  className?: string

  // Display props
  showGoogleDrive?: boolean
}

// 통합 파일 타입
interface CombinedFile {
  id: string
  name: string
  size: number
  type: string
  source: 'local' | 'google_drive'
  isPending?: boolean
  file?: File
  googleFileInfo?: GoogleDriveFileInfo
}

export const CombinedFileUpload: React.FC<CombinedFileUploadProps> = ({
  localFiles,
  onLocalFilesChange,
  googleDriveFiles,
  onGoogleDriveFilesChange,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxFiles = DEFAULT_MAX_FILES,
  disabled = false,
  className,
  showGoogleDrive = true
}) => {
  const [isGoogleDriveDialogOpen, setIsGoogleDriveDialogOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filesToDelete, setFilesToDelete] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isAuthenticated } = useGoogleDrive()

  // 로컬 파일과 Google Drive 파일을 통합
  const combinedFiles: CombinedFile[] = [
    ...localFiles.map((file, index) => ({
      id: `local-${index}`,
      name: file.name,
      size: file.size,
      type: file.type,
      source: 'local' as const,
      file
    })),
    ...googleDriveFiles.map((gFile, index) => ({
      id: gFile.id || `gdrive-${index}`,
      name: gFile.name,
      size: gFile.size || 0,
      type: gFile.mimeType,
      source: 'google_drive' as const,
      isPending: gFile.isPending,
      googleFileInfo: gFile
    }))
  ]

  // 로컬 파일 선택 처리
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return

    const newFiles = Array.from(selectedFiles)
    const existingFiles = [...localFiles, ...googleDriveFiles]
    const { valid, errors } = validateFilesUtil(newFiles, existingFiles, { maxFileSize, maxFiles })

    if (errors.length > 0) {
      setError(errors.join('\n'))
      setTimeout(() => setError(null), 5000)
    }

    if (valid.length > 0) {
      onLocalFilesChange([...localFiles, ...valid])
      setError(null)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [localFiles, onLocalFilesChange, combinedFiles.length])

  // 드래그 앤 드롭 처리
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return
    handleFileSelect(e.dataTransfer.files)
  }, [disabled, handleFileSelect])

  // Google Drive 파일 선택 처리
  const handleGoogleDriveFileSelected = async (file: GoogleDriveFileInfo) => {
    onGoogleDriveFilesChange([...googleDriveFiles, file])
    setIsGoogleDriveDialogOpen(false)
  }

  // 파일 삭제/삭제 취소
  const handleRemoveFile = (fileId: string, source: 'local' | 'google_drive') => {
    if (filesToDelete.has(fileId)) {
      // 삭제 예정 상태 취소
      setFilesToDelete(prev => {
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })
    } else {
      // 삭제 예정으로 표시
      setFilesToDelete(prev => new Set(prev).add(fileId))

      // 0.3초 후 실제 삭제
      setTimeout(() => {
        if (source === 'local') {
          const index = parseInt(fileId.split('-')[1])
          onLocalFilesChange(localFiles.filter((_, i) => i !== index))
        } else {
          onGoogleDriveFilesChange(googleDriveFiles.filter(f => f.id !== fileId))
        }
        setFilesToDelete(prev => {
          const next = new Set(prev)
          next.delete(fileId)
          return next
        })
      }, 300)
    }
  }

  return (
    <div className={cn("w-full min-w-0 max-w-full space-y-4", className)}>
      {/* 파일 선택 영역 */}
      <div className="grid grid-cols-2 gap-2">
        {/* 왼쪽: 로컬 파일 드롭존 */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="sr-only"
            disabled={disabled}
          />
          <UploadCloud className={cn(
            "w-10 h-10 mb-2 mx-auto transition-colors",
            isDragging ? "text-primary" : "text-muted-foreground"
          )} />
          <p className="mb-1 text-sm font-medium text-foreground">로컬 파일 업로드</p>
          <p className="text-xs text-muted-foreground">
            클릭 또는 드래그하여 파일 추가
          </p>
        </div>

        {/* 오른쪽: Google Drive */}
        {showGoogleDrive && (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              "border-muted-foreground/25 hover:border-primary hover:bg-primary/5",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !disabled && setIsGoogleDriveDialogOpen(true)}
          >
            <svg className="w-10 h-10 mb-2 mx-auto" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.69 3.4L15.12 17h5.88L12.58 3.4H6.69zm14.31 14.4H14l-4-7h7l4 7zm-14.5-7L2.5 17h7l4-6.6H6.5z" fill="#4285f4"/>
            </svg>
            <p className="mb-1 text-sm font-medium text-foreground">Google Drive</p>
            <p className="text-xs text-muted-foreground">
              클릭하여 파일 생성/선택
            </p>
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* 통합 파일 리스트 */}
      {combinedFiles.length > 0 && (
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              선택된 파일 ({combinedFiles.length})
            </h4>
            <Badge variant="secondary" className="text-xs">
              {combinedFiles.length}/{maxFiles}
            </Badge>
          </div>

          <div className="max-h-[400px] min-w-0 space-y-2 overflow-y-auto overflow-x-hidden">
            {combinedFiles.map((file) => {
              const isMarkedForDeletion = filesToDelete.has(file.id)

              return (
                <Card
                  key={file.id}
                  className={cn(
                    "min-w-0 max-w-full overflow-hidden transition-opacity",
                    isMarkedForDeletion && "opacity-50"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {/* 파일 아이콘/썸네일 */}
                      <div className="flex-shrink-0">
                        {file.source === 'local' && file.file?.type.startsWith('image/') ? (
                          <div className="w-12 h-12 rounded overflow-hidden bg-muted">
                            <img
                              src={URL.createObjectURL(file.file)}
                              alt={file.name}
                              className="w-full h-full object-cover"
                              onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            {getFileIconElement(file.name, file.type)}
                          </div>
                        )}
                      </div>

                      {/* 파일 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={file.name}>
                          {file.name}
                        </p>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            {file.size > 0 && (
                              <>
                                <span>{formatFileSize(file.size)}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{file.source === 'local' ? '로컬' : 'Google Drive'}</span>
                          </div>
                          {isMarkedForDeletion && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-destructive text-destructive">
                              삭제 예정
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* 삭제/취소 버튼 */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(file.id, file.source)}
                        className={cn(
                          "flex-shrink-0",
                          isMarkedForDeletion
                            ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                            : "text-destructive hover:text-destructive hover:bg-destructive/10"
                        )}
                        disabled={disabled}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Google Drive Picker Dialog */}
      {showGoogleDrive && (
        <GoogleDrivePicker
          isOpen={isGoogleDriveDialogOpen}
          onOpenChange={setIsGoogleDriveDialogOpen}
          mode="manual"
          onFileSelected={handleGoogleDriveFileSelected}
          title="Google Drive 파일 추가"
          description="파일을 생성하거나 업로드, 또는 기존 파일을 선택하세요"
        />
      )}
    </div>
  )
}
