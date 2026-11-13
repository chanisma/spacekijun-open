import React from "react"
import { FileText, File, Image as ImageIcon, FileSpreadsheet, Presentation } from "lucide-react"

/**
 * 파일 크기를 읽기 쉬운 형식으로 포맷팅
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 파일 확장자 또는 MIME 타입에 따른 아이콘 반환
 */
export const getFileIconElement = (fileName: string, mimeType?: string): React.ReactNode => {
  const ext = fileName.split('.').pop()?.toLowerCase()

  // Google Drive 파일 타입 체크
  if (mimeType?.includes('google-apps.document') || ext === 'gdoc') {
    return React.createElement(FileText, { className: "h-5 w-5 text-blue-600" })
  }
  if (mimeType?.includes('google-apps.spreadsheet') || ext === 'gsheet') {
    return React.createElement(FileSpreadsheet, { className: "h-5 w-5 text-green-600" })
  }
  if (mimeType?.includes('google-apps.presentation') || ext === 'gslides') {
    return React.createElement(Presentation, { className: "h-5 w-5 text-orange-600" })
  }

  // 이미지 파일
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
    return React.createElement(ImageIcon, { className: "h-5 w-5 text-blue-500" })
  }
  // PDF
  if (ext === 'pdf') {
    return React.createElement(FileText, { className: "h-5 w-5 text-red-500" })
  }
  // 스프레드시트
  if (['xls', 'xlsx'].includes(ext || '')) {
    return React.createElement(FileSpreadsheet, { className: "h-5 w-5 text-green-500" })
  }
  // 프레젠테이션
  if (['ppt', 'pptx'].includes(ext || '')) {
    return React.createElement(Presentation, { className: "h-5 w-5 text-orange-500" })
  }
  // Word 문서
  if (['doc', 'docx'].includes(ext || '')) {
    return React.createElement(FileText, { className: "h-5 w-5 text-blue-600" })
  }
  // 한글 문서
  if (['hwp', 'hwpx'].includes(ext || '')) {
    return React.createElement(FileText, { className: "h-5 w-5 text-blue-700" })
  }

  return React.createElement(File, { className: "h-5 w-5 text-gray-500" })
}

/**
 * 기본 허용 파일 타입
 */
export const DEFAULT_ACCEPTED_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.gif,.webp,.hwp,.hwpx"

/**
 * 기본 최대 파일 크기 (5MB)
 */
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * 기본 최대 파일 개수
 */
export const DEFAULT_MAX_FILES = 10

/**
 * 파일 유효성 검사 결과 타입
 */
export interface FileValidationResult {
  valid: File[]
  errors: string[]
}

/**
 * 파일 유효성 검사
 */
export const validateFiles = (
  newFiles: File[],
  existingFiles: { name: string }[],
  options: {
    maxFileSize?: number
    maxFiles?: number
  } = {}
): FileValidationResult => {
  const { maxFileSize = DEFAULT_MAX_FILE_SIZE, maxFiles = DEFAULT_MAX_FILES } = options
  const errors: string[] = []
  const valid: File[] = []

  for (const file of newFiles) {
    // 파일 크기 검사
    if (file.size > maxFileSize) {
      errors.push(`${file.name}: 파일 크기가 ${formatFileSize(maxFileSize)}를 초과합니다`)
      continue
    }

    // 파일 개수 검사
    if (existingFiles.length + valid.length >= maxFiles) {
      errors.push(`최대 ${maxFiles}개의 파일만 업로드할 수 있습니다`)
      break
    }

    // 중복 파일 검사
    if (existingFiles.some(f => f.name === file.name) || valid.some(f => f.name === file.name)) {
      errors.push(`${file.name}: 이미 추가된 파일입니다`)
      continue
    }

    valid.push(file)
  }

  return { valid, errors }
}
