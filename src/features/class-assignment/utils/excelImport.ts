/**
 * Excel Import Utilities
 * Excel 파일 불러오기 유틸리티
 */

import * as XLSX from 'xlsx';
import type { StudentData, ClassAssignment } from '../types/class-assignment.types';
import { IMPORT_REQUIRED_HEADERS } from '../constants';

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  students: StudentData[];
  existingAssignments?: ClassAssignment[];
  lockedStudents?: Map<string, number>;
}

export interface ImportOptions {
  skipValidation?: boolean;
  gradeFilter?: number;
}

/**
 * Excel 파일 파싱
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
 * 헤더 매핑 - 다양한 형식의 헤더 지원
 */
function mapHeaders(headers: string[]): Map<string, number> {
  const mapping = new Map<string, number>();
  const headerAliases: Record<string, string[]> = {
    student_code: ['학번', '학생코드', 'student_code', 'id', 'ID'],
    name: ['이름', '성명', 'name', '학생명'],
    grade: ['학년', 'grade', '학년'],
    class_num: ['반', '기존반', '현재반', 'class', 'class_num', '클래스'],
    number: ['번호', '기존번호', 'number', '학생번호'],
    assigned_class: ['배정반', '신규반', 'assigned_class', '새반'],
    average_grade: ['평균등급', '등급', '성적', 'grade', 'average_grade'],
    locked: ['잠금', 'locked', 'lock'],
  };

  headers.forEach((header, idx) => {
    const normalizedHeader = String(header).trim().toLowerCase();

    for (const [key, aliases] of Object.entries(headerAliases)) {
      if (aliases.some(alias => alias.toLowerCase() === normalizedHeader)) {
        mapping.set(key, idx);
        break;
      }
    }
  });

  return mapping;
}

/**
 * 행 데이터를 StudentData로 변환 (배정반 정보 포함)
 */
function rowToStudent(row: unknown[], headerMap: Map<string, number>, rowIndex: number): {
  student: StudentData;
  assignedClass?: number;
  isLocked?: boolean;
} | null {
  const getValue = (key: string): string | number | undefined => {
    const idx = headerMap.get(key);
    if (idx === undefined) return undefined;
    return row[idx] as string | number;
  };

  const studentCode = getValue('student_code');
  const name = getValue('name');
  const grade = getValue('grade');
  const assignedClass = getValue('assigned_class');
  const locked = getValue('locked');

  // 필수 필드 검증
  if (!studentCode || !name) {
    return null;
  }

  return {
    student: {
      student_code: String(studentCode),
      name: String(name),
      grade: Number(grade) || 1,
      class_num: Number(getValue('class_num')) || 0,
      number: Number(getValue('number')) || 0,
    },
    assignedClass: assignedClass ? Number(assignedClass) : undefined,
    isLocked: locked === 'O' || locked === 'o' || locked === true || locked === 1,
  };
}

/**
 * 학생 데이터 검증
 */
function validateStudentData(students: StudentData[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenCodes = new Set<string>();

  students.forEach((student, idx) => {
    // 중복 학번 체크
    if (seenCodes.has(student.student_code)) {
      warnings.push(`행 ${idx + 2}: 중복된 학번 (${student.student_code})`);
    }
    seenCodes.add(student.student_code);

    // 이름 검증
    if (!student.name || student.name.trim().length === 0) {
      errors.push(`행 ${idx + 2}: 이름이 비어있습니다.`);
    }

    // 학년 검증
    if (student.grade < 1 || student.grade > 3) {
      warnings.push(`행 ${idx + 2}: 학년 값이 유효하지 않습니다 (${student.grade})`);
    }
  });

  return { errors, warnings };
}

/**
 * Excel 파일에서 학생 데이터 불러오기
 */
export async function importStudentsFromExcel(
  file: File,
  options: ImportOptions = {}
): Promise<ImportValidationResult> {
  const { skipValidation = false, gradeFilter } = options;

  try {
    const rawData = await parseExcelFile(file);

    if (rawData.length < 2) {
      return {
        valid: false,
        errors: ['데이터가 없거나 헤더만 있습니다.'],
        warnings: [],
        students: [],
      };
    }

    // 헤더 매핑
    const headers = rawData[0] as string[];
    const headerMap = mapHeaders(headers);

    // 필수 헤더 확인
    const missingHeaders: string[] = [];
    if (!headerMap.has('student_code')) missingHeaders.push('학번');
    if (!headerMap.has('name')) missingHeaders.push('이름');

    if (missingHeaders.length > 0) {
      return {
        valid: false,
        errors: [`필수 헤더가 없습니다: ${missingHeaders.join(', ')}`],
        warnings: [],
        students: [],
      };
    }

    // 데이터 변환
    const students: StudentData[] = [];
    const studentClassMap: Map<number, StudentData[]> = new Map();
    const lockedStudentsMap: Map<string, number> = new Map();
    const parseErrors: string[] = [];
    let hasAssignedClass = headerMap.has('assigned_class');

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const result = rowToStudent(row, headerMap, i);
      if (result) {
        // 학년 필터링
        if (gradeFilter && result.student.grade !== gradeFilter) {
          continue;
        }
        students.push(result.student);

        // 배정반 정보 수집
        if (hasAssignedClass && result.assignedClass && result.assignedClass > 0) {
          const classStudents = studentClassMap.get(result.assignedClass) || [];
          classStudents.push(result.student);
          studentClassMap.set(result.assignedClass, classStudents);

          // 잠금 상태 수집
          if (result.isLocked) {
            lockedStudentsMap.set(result.student.student_code, result.assignedClass);
          }
        }
      } else {
        parseErrors.push(`행 ${i + 1}: 데이터 변환 실패`);
      }
    }

    // 배정반 정보가 있으면 assignments 생성
    let existingAssignments: ClassAssignment[] | undefined;
    if (studentClassMap.size > 0) {
      existingAssignments = Array.from(studentClassMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([classNum, classStudents]) => ({
          classNum,
          students: classStudents,
          specialClass: false,
        }));
    }

    // 검증
    let errors: string[] = [];
    let warnings: string[] = [];

    if (!skipValidation) {
      const validation = validateStudentData(students);
      errors = [...parseErrors, ...validation.errors];
      warnings = validation.warnings;
    } else {
      errors = parseErrors;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      students,
      existingAssignments,
      lockedStudents: lockedStudentsMap.size > 0 ? lockedStudentsMap : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : '알 수 없는 오류'],
      warnings: [],
      students: [],
    };
  }
}

/**
 * JSON 파일에서 배정 결과 불러오기
 */
export async function importAssignmentsFromJson(file: File): Promise<{
  valid: boolean;
  error?: string;
  assignments?: ClassAssignment[];
  config?: any;
  lockedStudents?: Map<string, number>;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result !== 'string') {
          throw new Error('Failed to read file');
        }

        const data = JSON.parse(result);

        if (!data.assignments || !Array.isArray(data.assignments)) {
          throw new Error('유효하지 않은 배정 데이터 형식입니다.');
        }

        // lockedStudents 복원
        let lockedStudents: Map<string, number> | undefined;
        if (data.lockedStudents && typeof data.lockedStudents === 'object') {
          lockedStudents = new Map(
            Object.entries(data.lockedStudents).map(([k, v]) => [k, Number(v)])
          );
        }

        resolve({
          valid: true,
          assignments: data.assignments,
          config: data.config,
          lockedStudents,
        });
      } catch (error) {
        resolve({
          valid: false,
          error: error instanceof Error ? error.message : '알 수 없는 오류',
        });
      }
    };

    reader.onerror = () => {
      resolve({
        valid: false,
        error: '파일 읽기 중 오류가 발생했습니다.',
      });
    };

    reader.readAsText(file);
  });
}
