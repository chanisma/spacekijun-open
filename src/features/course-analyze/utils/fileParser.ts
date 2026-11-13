/**
 * Admin File Parser - 관리자 파일 파싱 유틸리티
 * 리로스쿨/교육청 형식 파일을 파싱하여 ParsedFileData로 변환
 */

import * as XLSX from 'xlsx';
import type { FileType, ParsedFileData, ParsedStudent } from '../types/admin.types';

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * 파일을 파싱하여 ParsedFileData로 변환합니다.
 */
export async function parseFile(
  file: File,
  fileType: FileType,
  year: number,
  round: number
): Promise<ParsedFileData> {
  const data = await readFileAsArray(file);

  switch (fileType) {
    case 'riroschool':
      return parseRiroschoolFormat(data, year, round, file.name);
    case 'education-office':
      return parseEducationOfficeFormat(data, year, round, file.name);
    case 'custom':
      return parseCustomFormat(data, year, round, file.name);
    default:
      throw new Error('지원하지 않는 파일 형식입니다.');
  }
}

// ============================================================================
// File Reading
// ============================================================================

/**
 * 파일을 읽어 2D 배열로 변환합니다.
 */
async function readFileAsArray(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;

        // CSV 파일인 경우
        if (file.name.endsWith('.csv')) {
          if (typeof result !== 'string') {
            throw new Error('Failed to read CSV file');
          }
          const rows = result.split('\n').map(row =>
            row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
          );
          resolve(rows);
          return;
        }

        // Excel 파일인 경우
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
        reject(new Error('파일을 읽을 수 없습니다.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류가 발생했습니다.'));
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

// ============================================================================
// Riroschool Format Parser
// ============================================================================

/**
 * 리로스쿨 형식 파일을 파싱합니다.
 * 형식: 카테고리(1행) | 헤더(2행) | 데이터(3행~)
 * 열: 순번 | 아이디 | 이름 | 연락처 | 제출일시 | 학년 | 수정일시 | 1학기과목들... | 2학기과목들...
 */
function parseRiroschoolFormat(
  data: unknown[][],
  year: number,
  round: number,
  fileName: string
): ParsedFileData {
  if (data.length < 3) {
    throw new Error('유효하지 않은 리로스쿨 형식입니다. (최소 3행 필요)');
  }

  const categories = data[0] as string[];
  const headers = data[1] as string[];

  // 1학기/2학기 인덱스 찾기
  let semester1StartIndex = categories.findIndex(h => h && String(h).includes('1학기'));
  if (semester1StartIndex === -1) semester1StartIndex = 7;

  let semester2StartIndex = categories.findIndex(h => h && String(h).includes('2학기'));
  if (semester2StartIndex === -1) semester2StartIndex = headers.findIndex((h, i) =>
    i > semester1StartIndex && h && String(h).includes('2학기')
  );
  if (semester2StartIndex === -1) semester2StartIndex = Math.floor((headers.length + semester1StartIndex) / 2);

  const semester1EndIndex = semester2StartIndex - 1;
  const semester2EndIndex = headers.length - 1;

  // 과목 목록 추출
  const semester1Subjects: string[] = [];
  const semester2Subjects: string[] = [];

  for (let i = semester1StartIndex; i <= semester1EndIndex; i++) {
    if (headers[i]) {
      const subjectName = String(headers[i]).replace(/\([^)]*\)/g, '').trim();
      if (subjectName) semester1Subjects.push(subjectName);
    }
  }

  for (let i = semester2StartIndex; i <= semester2EndIndex; i++) {
    if (headers[i]) {
      const subjectName = String(headers[i]).replace(/\([^)]*\)/g, '').trim();
      if (subjectName) semester2Subjects.push(subjectName);
    }
  }

  // 학생 데이터 파싱
  const students: ParsedStudent[] = [];

  for (let rowIndex = 2; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    if (!row || !row[1] || !row[2]) continue; // 아이디와 이름이 필수

    const student: ParsedStudent = {
      id: String(row[1]),
      name: String(row[2]),
      contact: row[3] ? String(row[3]) : undefined,
      submitTime: row[4] ? String(row[4]) : undefined,
      year,
      grade: parseInt(String(row[5])) || year + 1, // 기본값: year + 1 (1학년 = 2학년, 2학년 = 3학년)
      modifyTime: row[6] ? String(row[6]) : undefined,
      semester1: [],
      semester2: []
    };

    // 반/번호 추출 (아이디에서 추출 시도)
    const idMatch = String(row[1]).match(/(\d)(\d{2})(\d{2})$/);
    if (idMatch) {
      student.class = parseInt(idMatch[2]);
      student.number = parseInt(idMatch[3]);
    }

    // 1학기 과목 선택 파싱
    for (let i = semester1StartIndex; i <= semester1EndIndex; i++) {
      if (row[i] == 1 || row[i] === '1' || row[i] === true || row[i] === 'O') {
        const subjectName = String(headers[i]).replace(/\([^)]*\)/g, '').trim();
        if (subjectName) student.semester1.push(subjectName);
      }
    }

    // 2학기 과목 선택 파싱
    for (let i = semester2StartIndex; i <= semester2EndIndex; i++) {
      if (row[i] == 1 || row[i] === '1' || row[i] === true || row[i] === 'O') {
        const subjectName = String(headers[i]).replace(/\([^)]*\)/g, '').trim();
        if (subjectName) student.semester2.push(subjectName);
      }
    }

    students.push(student);
  }

  return {
    students,
    subjects: {
      semester1: [...new Set(semester1Subjects)],
      semester2: [...new Set(semester2Subjects)]
    },
    totalSubjects: new Set([...semester1Subjects, ...semester2Subjects]).size,
    uploadInfo: {
      year,
      round,
      name: fileName,
      fileType: 'riroschool'
    }
  };
}

// ============================================================================
// Education Office Format Parser
// ============================================================================

/**
 * 교육청 형식 파일을 파싱합니다.
 * 형식: 헤더(1행) | 데이터(2행~)
 * 열: 학번 | 이름 | 학년 | 반 | 번호 | 1학기과목(콤마구분) | 2학기과목(콤마구분)
 */
function parseEducationOfficeFormat(
  data: unknown[][],
  year: number,
  round: number,
  fileName: string
): ParsedFileData {
  if (data.length < 2) {
    throw new Error('유효하지 않은 교육청 형식입니다. (최소 2행 필요)');
  }

  const headers = data[0] as string[];

  // 열 인덱스 찾기
  const findColumnIndex = (names: string[]): number => {
    return headers.findIndex(h => h && names.some(name => String(h).includes(name)));
  };

  const idIndex = Math.max(0, findColumnIndex(['학번', 'ID', '아이디']));
  const nameIndex = Math.max(1, findColumnIndex(['이름', '성명']));
  const gradeIndex = findColumnIndex(['학년']);
  const classIndex = findColumnIndex(['반', '학급']);
  const numberIndex = findColumnIndex(['번호', '번']);
  const sem1Index = findColumnIndex(['1학기', '1학기과목']);
  const sem2Index = findColumnIndex(['2학기', '2학기과목']);

  const allSemester1Subjects = new Set<string>();
  const allSemester2Subjects = new Set<string>();

  // 학생 데이터 파싱
  const students: ParsedStudent[] = [];

  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    if (!row || !row[idIndex] || !row[nameIndex]) continue;

    const student: ParsedStudent = {
      id: String(row[idIndex]),
      name: String(row[nameIndex]),
      year,
      grade: gradeIndex >= 0 && row[gradeIndex] ? parseInt(String(row[gradeIndex])) : year + 1,
      class: classIndex >= 0 && row[classIndex] ? parseInt(String(row[classIndex])) : undefined,
      number: numberIndex >= 0 && row[numberIndex] ? parseInt(String(row[numberIndex])) : undefined,
      semester1: [],
      semester2: []
    };

    // 1학기 과목 파싱 (콤마 구분)
    if (sem1Index >= 0 && row[sem1Index]) {
      const subjects = String(row[sem1Index]).split(',').map(s => s.trim()).filter(s => s);
      student.semester1 = subjects;
      subjects.forEach(s => allSemester1Subjects.add(s));
    }

    // 2학기 과목 파싱 (콤마 구분)
    if (sem2Index >= 0 && row[sem2Index]) {
      const subjects = String(row[sem2Index]).split(',').map(s => s.trim()).filter(s => s);
      student.semester2 = subjects;
      subjects.forEach(s => allSemester2Subjects.add(s));
    }

    students.push(student);
  }

  return {
    students,
    subjects: {
      semester1: Array.from(allSemester1Subjects),
      semester2: Array.from(allSemester2Subjects)
    },
    totalSubjects: new Set([...allSemester1Subjects, ...allSemester2Subjects]).size,
    uploadInfo: {
      year,
      round,
      name: fileName,
      fileType: 'education-office'
    }
  };
}

// ============================================================================
// Custom Format Parser
// ============================================================================

/**
 * 사용자 정의 형식 파일을 파싱합니다.
 * 자동으로 형식을 감지하여 파싱합니다.
 */
function parseCustomFormat(
  data: unknown[][],
  year: number,
  round: number,
  fileName: string
): ParsedFileData {
  if (data.length < 2) {
    throw new Error('유효하지 않은 파일입니다. (최소 2행 필요)');
  }

  // 형식 자동 감지
  const firstRow = data[0] as string[];
  const secondRow = data[1] as string[];

  // 리로스쿨 형식 감지 (첫 번째 행에 '1학기' 또는 '2학기' 포함)
  if (firstRow.some(h => h && (String(h).includes('1학기') || String(h).includes('2학기')))) {
    return parseRiroschoolFormat(data, year, round, fileName);
  }

  // 교육청 형식 감지 (헤더에 '학번', '이름' 등 포함)
  if (firstRow.some(h => h && (String(h).includes('학번') || String(h).includes('이름')))) {
    return parseEducationOfficeFormat(data, year, round, fileName);
  }

  // 기본값: 리로스쿨 형식으로 시도
  try {
    return parseRiroschoolFormat(data, year, round, fileName);
  } catch {
    // 실패시 교육청 형식으로 시도
    return parseEducationOfficeFormat(data, year, round, fileName);
  }
}

// ============================================================================
// Export Utilities
// ============================================================================

/**
 * ParsedFileData를 통합 형식으로 내보냅니다.
 */
export function exportToUnifiedFormat(
  parsedData: ParsedFileData[],
  subjectConfiguration?: Record<string, { subjects: string[] }>
): { headers: string[]; rows: (string | number)[][] } {
  const headers = ['학생ID', '이름', '학년', '반', '번호', '차수', '1학기', '2학기', '등급'];

  const rows: (string | number)[][] = [];

  parsedData.forEach(data => {
    data.students.forEach(student => {
      rows.push([
        student.id,
        student.name,
        student.grade,
        student.class || 0,
        student.number || 0,
        data.uploadInfo.round,
        student.semester1.join(','),
        student.semester2.join(','),
        0 // 등급 기본값
      ]);
    });
  });

  return { headers, rows };
}
