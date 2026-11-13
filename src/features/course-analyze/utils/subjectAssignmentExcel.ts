/**
 * Subject Assignment Excel Export/Import Utilities
 * 과목별 반 배정 Excel 내보내기/가져오기 유틸리티
 */

import * as XLSX from 'xlsx';
import type { Student, SubjectAssignment, SubjectClass } from '../types/course.types';

/**
 * Excel 가져오기 결과 인터페이스
 */
export interface ImportSubjectResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  assignments: SubjectAssignment[];
}

/**
 * 과목별 배정 결과를 Excel로 내보내기
 *
 * @param assignments - 과목별 배정 결과 배열
 * @param options - 내보내기 옵션 (파일명 등)
 */
export function exportSubjectAssignmentsToExcel(
  assignments: SubjectAssignment[],
  options?: { fileName?: string }
): void {
  const fileName = options?.fileName ?? `과목별배정결과_${new Date().toISOString().slice(0, 10)}`;
  const workbook = XLSX.utils.book_new();

  // 1. 각 과목-학기별 시트 생성
  assignments.forEach(assignment => {
    const sheetData = generateSubjectAssignmentSheet(assignment);
    const sheetName = `${assignment.subjectName}(${assignment.semester === 'semester1' ? '1학기' : '2학기'})`;
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);

    // 열 너비 설정
    sheet['!cols'] = [
      { wch: 6 },  // 번호
      { wch: 10 }, // 이름
      { wch: 6 },  // 학년
      { wch: 8 },  // 기존반
      { wch: 8 },  // 기존번호
      { wch: 8 },  // 배정반
      { wch: 8 },  // 등급
    ];

    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  // 2. 통계 시트 생성
  const statsData = generateStatisticsSheet(assignments);
  const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
  statsSheet['!cols'] = [
    { wch: 15 }, // 과목명
    { wch: 8 },  // 학기
    { wch: 10 }, // 신청인원
    { wch: 10 }, // 배정반수
    { wch: 20 }, // 반별인원
  ];
  XLSX.utils.book_append_sheet(workbook, statsSheet, '통계');

  // 3. 파일 다운로드
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

/**
 * 개별 과목-학기 시트 데이터 생성
 */
function generateSubjectAssignmentSheet(assignment: SubjectAssignment): (string | number)[][] {
  const headers = ['번호', '이름', '학년', '기존반', '기존번호', '배정반', '등급'];
  const rows: (string | number)[][] = [headers];

  let sequentialIndex = 1;

  // 배정반별로 정렬된 학생 목록 생성
  const sortedClasses = [...assignment.classes].sort((a, b) => a.classNum - b.classNum);

  sortedClasses.forEach(subjectClass => {
    // 각 반 내에서 이름 순으로 정렬
    const sortedStudents = [...subjectClass.students].sort((a, b) =>
      a.name.localeCompare(b.name, 'ko')
    );

    sortedStudents.forEach(student => {
      rows.push([
        sequentialIndex++,
        student.name,
        student.year,
        student.class,
        student.number,
        subjectClass.classNum,
        student.grade ?? '-',
      ]);
    });
  });

  return rows;
}

/**
 * 통계 시트 데이터 생성
 */
function generateStatisticsSheet(assignments: SubjectAssignment[]): (string | number)[][] {
  const headers = ['과목명', '학기', '신청인원', '배정반수', '반별인원'];
  const rows: (string | number)[][] = [headers];

  assignments.forEach(assignment => {
    const totalStudents = assignment.classes.reduce((sum, cls) => sum + cls.students.length, 0);
    const classSizes = assignment.classes
      .sort((a, b) => a.classNum - b.classNum)
      .map(cls => cls.students.length)
      .join(', ');

    rows.push([
      assignment.subjectName,
      assignment.semester === 'semester1' ? '1학기' : '2학기',
      totalStudents,
      assignment.classCount,
      classSizes,
    ]);
  });

  return rows;
}

/**
 * Excel 파일에서 과목별 배정 결과 가져오기
 *
 * @param file - Excel 파일
 * @returns 파싱 결과 (검증 결과 및 배정 데이터)
 */
export async function importSubjectAssignmentsFromExcel(file: File): Promise<ImportSubjectResult> {
  const result: ImportSubjectResult = {
    valid: true,
    errors: [],
    warnings: [],
    assignments: [],
  };

  try {
    // 파일 읽기
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // 통계 시트를 제외한 모든 시트 처리
    const sheetNames = workbook.SheetNames.filter(name => name !== '통계');

    if (sheetNames.length === 0) {
      result.valid = false;
      result.errors.push('유효한 과목 시트가 없습니다.');
      return result;
    }

    // 각 시트별로 처리
    for (const sheetName of sheetNames) {
      const parseResult = parseSubjectSheet(workbook.Sheets[sheetName], sheetName);

      if (parseResult.error) {
        result.errors.push(`${sheetName}: ${parseResult.error}`);
        result.valid = false;
      } else if (parseResult.warning) {
        result.warnings.push(`${sheetName}: ${parseResult.warning}`);
      }

      if (parseResult.assignment) {
        result.assignments.push(parseResult.assignment);
      }
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`파일 읽기 오류: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * 파일을 ArrayBuffer로 읽기
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as ArrayBuffer);
      } else {
        reject(new Error('파일 읽기 실패'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader 오류'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 개별 시트 파싱 결과
 */
interface ParseSheetResult {
  assignment?: SubjectAssignment;
  error?: string;
  warning?: string;
}

/**
 * 개별 과목 시트 파싱
 */
function parseSubjectSheet(sheet: XLSX.WorkSheet, sheetName: string): ParseSheetResult {
  try {
    // 시트명에서 과목명과 학기 추출
    const match = sheetName.match(/^(.+)\((1학기|2학기)\)$/);
    if (!match) {
      return { error: '시트명 형식이 올바르지 않습니다. "{과목명}({학기})" 형식이어야 합니다.' };
    }

    const subjectName = match[1];
    const semester = match[2] === '1학기' ? 'semester1' : 'semester2';

    // 시트를 JSON으로 변환
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length < 2) {
      return { error: '데이터가 없습니다.' };
    }

    // 헤더 찾기
    const headers = data[0].map((h: any) => String(h).trim());
    const columnIndices = findColumnIndices(headers);

    if (!columnIndices.name || !columnIndices.assignedClass) {
      return { error: '필수 열(이름, 배정반)을 찾을 수 없습니다.' };
    }

    // 학생 데이터 파싱
    const students: Student[] = [];
    const classMap = new Map<number, Student[]>();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const name = row[columnIndices.name];
      const assignedClass = Number(row[columnIndices.assignedClass]);

      if (!name || !assignedClass) {
        continue; // 빈 행 건너뛰기
      }

      const student: Student = {
        id: `${name}_${i}`,
        name: String(name).trim(),
        year: columnIndices.year !== undefined ? Number(row[columnIndices.year]) || 2 : 2,
        class: columnIndices.class !== undefined ? Number(row[columnIndices.class]) || 0 : 0,
        number: columnIndices.number !== undefined ? Number(row[columnIndices.number]) || 0 : 0,
        round: 1,
        semester1: semester === 'semester1' ? [subjectName] : [],
        semester2: semester === 'semester2' ? [subjectName] : [],
        grade: columnIndices.grade !== undefined && row[columnIndices.grade] !== '-'
          ? Number(row[columnIndices.grade])
          : 5,
      };

      students.push(student);

      // 배정반별로 그룹화
      if (!classMap.has(assignedClass)) {
        classMap.set(assignedClass, []);
      }
      classMap.get(assignedClass)!.push(student);
    }

    if (students.length === 0) {
      return { error: '파싱된 학생이 없습니다.' };
    }

    // SubjectClass 배열 생성
    const classes: SubjectClass[] = Array.from(classMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([classNum, classStudents]) => ({
        classNum,
        students: classStudents,
      }));

    const assignment: SubjectAssignment = {
      subjectName,
      semester: semester as 'semester1' | 'semester2',
      classCount: classes.length,
      classes,
      algorithm: 'random', // 기본값
    };

    return { assignment };

  } catch (error) {
    return { error: `파싱 오류: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * 헤더에서 열 인덱스 찾기
 */
interface ColumnIndices {
  name?: number;
  year?: number;
  class?: number;
  number?: number;
  assignedClass?: number;
  grade?: number;
}

function findColumnIndices(headers: string[]): ColumnIndices {
  const indices: ColumnIndices = {};

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().replace(/\s/g, '');

    // 이름
    if (['이름', '성명', 'name'].some(h => normalized.includes(h.toLowerCase()))) {
      indices.name = index;
    }
    // 학년
    else if (['학년', 'grade', 'year'].some(h => normalized.includes(h.toLowerCase()))) {
      indices.year = index;
    }
    // 기존반
    else if (['기존반', '반', 'class'].some(h => normalized.includes(h.toLowerCase())) && !normalized.includes('배정')) {
      indices.class = index;
    }
    // 기존번호
    else if (['기존번호', '번호', 'number'].some(h => normalized.includes(h.toLowerCase())) && !normalized.includes('배정')) {
      indices.number = index;
    }
    // 배정반
    else if (['배정반', '신규반'].some(h => normalized.includes(h.toLowerCase()))) {
      indices.assignedClass = index;
    }
    // 등급
    else if (['등급', '성적', 'grade'].some(h => normalized.includes(h.toLowerCase()))) {
      indices.grade = index;
    }
  });

  return indices;
}
