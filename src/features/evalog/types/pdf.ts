/**
 * PDF 파싱 관련 타입 정의
 */

import { Student } from './index';

// PDF 파싱 결과 타입
export interface PDFParseResult {
  success: boolean;
  student?: Partial<Student>;
  students?: Partial<Student>[];
  errors: PDFParseError[];
  warnings: string[];
  rawText?: string;
  originalText?: string;
}

// PDF 파싱 오류 타입
export interface PDFParseError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  lineNumber?: number;
}

// PDF 텍스트 섹션 타입
export interface PDFSection {
  title: string;
  startLine: number;
  endLine: number;
  content: string[];
}

// PDF 업로드 상태
export interface PDFUploadState {
  file: File | null;
  status: 'idle' | 'uploading' | 'parsing' | 'success' | 'error';
  progress: number;
  error: string | null;
  result: PDFParseResult | null;
}

// 파싱 옵션
export interface PDFParseOptions {
  autoDetectEncoding: boolean;
  skipValidation: boolean;
  allowPartialData: boolean;
  debugMode: boolean;
}

// 정규식 패턴 타입
export interface PDFPattern {
  name: string;
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => any;
}

// 데이터 매핑 규칙
export interface MappingRule {
  source: string;
  target: keyof Student;
  transform?: (value: any) => any;
  validate?: (value: any) => boolean;
  required?: boolean;
}
