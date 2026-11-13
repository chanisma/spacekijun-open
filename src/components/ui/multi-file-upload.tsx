"use client"

import React, { useRef, useCallback, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UploadCloud, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  formatFileSize,
  getFileIconElement,
  validateFiles,
  DEFAULT_ACCEPTED_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES
} from "./file-upload-utils"

interface MultiFileUploadProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  maxFileSize?: number
  acceptedTypes?: string
  maxFiles?: number
  disabled?: boolean
  className?: string
}

export const MultiFileUpload: React.FC<MultiFileUploadProps> = ({
  files,
  onFilesChange,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxFiles = DEFAULT_MAX_FILES,
  disabled = false,
  className
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return

    const newFiles = Array.from(selectedFiles)
    const { valid, errors } = validateFiles(newFiles, files, { maxFileSize, maxFiles })

    if (errors.length > 0) {
      setError(errors.join('\n'))
      setTimeout(() => setError(null), 5000)
    }

    if (valid.length > 0) {
      onFilesChange([...files, ...valid])
      setError(null)
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [files, onFilesChange])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
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

    const droppedFiles = e.dataTransfer.files
    handleFileSelect(droppedFiles)
  }, [disabled, handleFileSelect])

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    onFilesChange(newFiles)
  }

  const triggerFileInput = () => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className={cn("w-full min-w-0 max-w-full space-y-4", className)}>
      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
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
          "w-12 h-12 mb-3 mx-auto transition-colors",
          isDragging ? "text-primary" : "text-muted-foreground"
        )} />
        <p className="mb-2 text-sm text-muted-foreground">
          <span className="font-semibold">클릭하여 파일 선택</span> 또는 드래그하여 업로드
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, Office 문서, 한글 문서, 이미지 파일 (최대 {formatFileSize(maxFileSize)})
        </p>
        {files.length > 0 && (
          <Badge variant="secondary" className="mt-2">
            {files.length}/{maxFiles} 파일
          </Badge>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">선택된 파일 ({files.length})</h4>
          <div className="max-h-[300px] min-w-0 space-y-2 overflow-y-auto overflow-x-hidden">
            {files.map((file, index) => (
              <Card key={index} className="min-w-0 max-w-full overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* File Icon or Preview */}
                    <div className="flex-shrink-0">
                      {file.type.startsWith('image/') ? (
                        <div className="w-12 h-12 rounded overflow-hidden bg-muted">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                          {getFileIconElement(file.name)}
                        </div>
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={file.name}>
                        {file.name}
                      </p>
                      {/* MIME 하위타입은 hwpx/docx처럼 짧을 때도 있지만
                          `vnd.openxmlformats-officedocument.wordprocessingml.document`
                          같이 줄바꿈 기회가 전혀 없는 60자짜리도 온다 — 줄여서 넘치지 않게 */}
                      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="shrink-0">{formatFileSize(file.size)}</span>
                        <span className="shrink-0">•</span>
                        <span className="truncate" title={file.type || undefined}>
                          {file.type.split('/')[1]?.toUpperCase() || 'Unknown'}
                        </span>
                      </div>
                    </div>

                    {/* Remove Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(index)}
                      className="flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={disabled}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
