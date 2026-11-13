/**
 * File Utilities - 파일 업로드 및 파싱 유틸리티
 *
 * xlsx 라이브러리는 이미 프로젝트에 설치되어 있습니다.
 * CDN 대신 번들된 버전을 사용합니다.
 */

import * as XLSX from 'xlsx';
import type { UnifiedDataFormat, Student } from '../types/course.types';
import { parseStudentData } from './dataProcessor';

// ============================================================================
// File Type Detection
// ============================================================================

export type SupportedFileType = 'json' | 'xlsx' | 'xls' | 'unknown';

/**
 * 파일 확장자를 기반으로 파일 타입을 감지합니다.
 */
export function detectFileType(fileName: string): SupportedFileType {
  const extension = fileName.toLowerCase().split('.').pop();

  switch (extension) {
    case 'json':
      return 'json';
    case 'xlsx':
      return 'xlsx';
    case 'xls':
      return 'xls';
    default:
      return 'unknown';
  }
}

/**
 * 지원되는 파일 형식인지 확인합니다.
 */
export function isValidFileType(fileName: string): boolean {
  const type = detectFileType(fileName);
  return type !== 'unknown';
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * JSON 파일을 파싱합니다.
 */
export async function parseJsonFile(file: File): Promise<UnifiedDataFormat> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result !== 'string') {
          throw new Error('Failed to read file as text');
        }
        const jsonData = JSON.parse(result) as UnifiedDataFormat;
        resolve(jsonData);
      } catch (error) {
        reject(new Error('JSON 파일을 읽을 수 없습니다.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류가 발생했습니다.'));
    };

    reader.readAsText(file);
  });
}

/**
 * Excel 파일을 파싱합니다.
 */
export async function parseExcelFile(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          throw new Error('Failed to read file as ArrayBuffer');
        }

        const data = new Uint8Array(result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        resolve(json as unknown[][]);
      } catch (error) {
        reject(new Error('Excel 파일을 읽을 수 없습니다.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류가 발생했습니다.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * 파일을 파싱하여 학생 데이터로 변환합니다.
 */
export async function parseFile(file: File): Promise<{
  students: Student[];
  gradeRoundGroups: Record<string, Student[]>;
  subjectConfiguration: import('../types/course.types').SubjectConfiguration | null;
}> {
  const fileType = detectFileType(file.name);

  if (fileType === 'unknown') {
    throw new Error('지원하지 않는 파일 형식입니다. (지원: .json, .xlsx, .xls)');
  }

  if (fileType === 'json') {
    const jsonData = await parseJsonFile(file);
    return parseStudentData(jsonData);
  }

  // Excel 파일
  const excelData = await parseExcelFile(file);
  return parseStudentData(excelData);
}

// ============================================================================
// File Download
// ============================================================================

/**
 * 데이터를 JSON 파일로 다운로드합니다.
 */
export function downloadAsJson(
  data: unknown,
  fileName: string = 'data.json'
): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 학생 데이터를 통합 JSON 형식으로 내보냅니다.
 */
export function exportToUnifiedFormat(
  students: Student[],
  subjectConfiguration?: import('../types/course.types').SubjectConfiguration | null
): UnifiedDataFormat {
  // 헤더 생성
  const headers = ['학생ID', '이름', '학년', '반', '번호', '차수', '1학기', '2학기', '등급'];

  // 학생 데이터를 2D 배열로 변환
  const studentRows = students.map(student => [
    student.id,
    student.name,
    student.year,
    student.class,
    student.number,
    student.round,
    student.semester1.join(','),
    student.semester2.join(','),
    student.grade
  ]);

  const unifiedData: UnifiedDataFormat = {
    fileType: 'kijun_unified_export',
    version: '1.0',
    studentData: [headers, ...studentRows]
  };

  if (subjectConfiguration) {
    unifiedData.subjectConfiguration = subjectConfiguration;
  }

  return unifiedData;
}

// ============================================================================
// URL-based File Loading
// ============================================================================

/**
 * URL에서 파일을 로드합니다.
 */
export async function loadFileFromUrl(url: string): Promise<{
  students: Student[];
  gradeRoundGroups: Record<string, Student[]>;
  subjectConfiguration: import('../types/course.types').SubjectConfiguration | null;
}> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-cache',
    headers: {
      'Accept': 'application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = url.toLowerCase().endsWith('.json') ||
                 contentType.includes('application/json') ||
                 contentType.includes('text/json');

  if (isJson) {
    const jsonData = await response.json() as UnifiedDataFormat;
    return parseStudentData(jsonData);
  }

  // Excel 파일
  const arrayBuffer = await response.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  return parseStudentData(json);
}

/**
 * Raw JSON 데이터를 직접 파싱합니다.
 * (import된 JSON 데이터를 처리할 때 사용)
 */
export function loadFromRawData(data: unknown): {
  students: Student[];
  gradeRoundGroups: Record<string, Student[]>;
  subjectConfiguration: import('../types/course.types').SubjectConfiguration | null;
} {
  return parseStudentData(data as UnifiedDataFormat);
}

// ============================================================================
// File Validation
// ============================================================================

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ACCEPTED_FILE_TYPES = [
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

/**
 * 파일 유효성을 검사합니다.
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // 파일 크기 검사
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `파일 크기가 너무 큽니다. (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB)`
    };
  }

  // 파일 형식 검사
  if (!isValidFileType(file.name)) {
    return {
      valid: false,
      error: '지원하지 않는 파일 형식입니다. (지원: .json, .xlsx, .xls)'
    };
  }

  return { valid: true };
}
