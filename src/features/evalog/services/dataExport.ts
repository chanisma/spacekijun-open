/**
 * JSON 내보내기/가져오기 서비스
 * 학생 데이터를 JSON 파일로 내보내거나 가져옵니다.
 */

import { Student } from '../types';

export interface ExportData {
  version: string;
  exportDate: string;
  students: Partial<Student>[];
  metadata?: {
    totalStudents: number;
    exportedBy?: string;
    notes?: string;
  };
}

/**
 * 학생 데이터를 JSON 파일로 내보내기
 */
export function exportStudentsToJSON(
  students: Partial<Student>[],
  metadata?: ExportData['metadata']
): void {
  const exportData: ExportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    students,
    metadata: {
      totalStudents: students.length,
      ...metadata
    }
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `evalog_students_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * 단일 학생 데이터를 JSON 파일로 내보내기
 */
export function exportStudentToJSON(student: Partial<Student>): void {
  exportStudentsToJSON([student], {
    totalStudents: 1,
    notes: `Single student export: ${student.name || student.studentNo}`
  });
}

/**
 * JSON 파일에서 학생 데이터 가져오기
 */
export function importStudentsFromJSON(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const data = JSON.parse(jsonString) as ExportData;

        // 데이터 검증
        if (!data.version || !data.students || !Array.isArray(data.students)) {
          throw new Error('유효하지 않은 JSON 형식입니다.');
        }

        // 버전 확인
        if (data.version !== '1.0') {
          console.warn(`경고: 다른 버전의 데이터입니다. (${data.version})`);
        }

        resolve(data);
      } catch (error) {
        reject(new Error('JSON 파일 파싱에 실패했습니다: ' + (error as Error).message));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기에 실패했습니다.'));
    };

    reader.readAsText(file);
  });
}

/**
 * CSV 형식으로 학생 기본 정보 내보내기
 */
export function exportStudentsToCSV(students: Partial<Student>[]): void {
  // CSV 헤더
  const headers = [
    '수험번호',
    '성명',
    // '학교명', // removed 
    // '지원학과', // removed
    // '입시유형', // removed
    // '입시단위', // removed
    '교과성적수',
    '창의적체험활동수',
    '봉사활동수',
    '행동특성수'
  ];

  // CSV 행 생성
  const rows = students.map((student) => [
    student.studentNo || '',
    student.name || '',
    // student.schoolName || '',
    // student.department || '',
    // student.ipsiType || '',
    // student.ipsiUnit || '',
    student.section6_academic_development?.length || 0,
    student.section5_creative_activities?.length || 0,
    student.volunteer_activities?.length || 0,
    student.section8_behavior_characteristics?.length || 0
  ]);

  // CSV 문자열 생성
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
  ].join('\n');

  // BOM 추가 (Excel에서 한글 깨짐 방지)
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `evalog_students_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * 학생 데이터 검증
 */
export function validateImportedStudent(student: Partial<Student>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 필수 필드 검증
  if (!student.studentNo || student.studentNo.trim().length === 0) {
    errors.push('수험번호가 누락되었습니다.');
  }

  if (!student.name || student.name.trim().length === 0) {
    errors.push('성명이 누락되었습니다.');
  }

  // 형식 검증
  // ipsiType, ipsiUnit 제거됨

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 가져온 데이터 일괄 검증
 */
export function validateImportedData(data: ExportData): {
  valid: boolean;
  totalStudents: number;
  validStudents: number;
  errors: Array<{ studentNo?: string; name?: string; errors: string[] }>;
} {
  const errors: Array<{ studentNo?: string; name?: string; errors: string[] }> = [];
  let validStudents = 0;

  data.students.forEach((student) => {
    const validation = validateImportedStudent(student);
    if (validation.valid) {
      validStudents++;
    } else {
      errors.push({
        studentNo: student.studentNo,
        name: student.name,
        errors: validation.errors
      });
    }
  });

  return {
    valid: errors.length === 0,
    totalStudents: data.students.length,
    validStudents,
    errors
  };
}

/**
 * 백업 생성 (전체 데이터 + 메타데이터)
 */
export function createBackup(
  students: Partial<Student>[],
  additionalMetadata?: Record<string, any>
): void {
  const backupData: ExportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    students,
    metadata: {
      totalStudents: students.length,
      exportedBy: 'Evalog System',
      notes: 'Full system backup',
      ...additionalMetadata
    }
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `evalog_backup_${new Date().toISOString().replace(/:/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * 백업 복원
 */
export async function restoreBackup(file: File): Promise<{
  success: boolean;
  data?: ExportData;
  error?: string;
}> {
  try {
    const data = await importStudentsFromJSON(file);
    const validation = validateImportedData(data);

    if (!validation.valid) {
      return {
        success: false,
        error: `${validation.errors.length}개의 유효하지 않은 학생 데이터가 있습니다.`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
