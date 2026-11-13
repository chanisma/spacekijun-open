/**
 * Excel Export Utilities
 * Excel 파일 내보내기 유틸리티
 */

import * as XLSX from 'xlsx';
import type { ClassAssignment, StudentData, AssignmentStatistics } from '../types/class-assignment.types';
import { STUDENT_LIST_HEADERS, CLASS_LIST_HEADERS } from '../constants';

export interface ExportOptions {
  fileName?: string;
  includeStatistics?: boolean;
  format?: 'studentList' | 'classList';
}

/**
 * 학생 목록 형식으로 Excel 데이터 생성
 * 전체 학생을 한 시트에 배정번호와 함께 표시
 */
function generateStudentListData(
  assignments: ClassAssignment[],
  lockedStudents?: Map<string, number>
): (string | number)[][] {
  const headers = [...STUDENT_LIST_HEADERS, '잠금'];
  const rows: (string | number)[][] = [headers];

  assignments.forEach(cls => {
    // 각 반의 학생을 이름 가나다순으로 정렬 후 배정번호 부여
    const sortedStudents = [...cls.students].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    sortedStudents.forEach((student, idx) => {
      rows.push([
        student.student_code,
        student.name,
        student.grade,
        student.class_num,
        student.number,
        cls.classNum,
        idx + 1, // 배정번호 (이름 가나다순)
        (student as any).averageGrade ?? '-',
        '', // 비고
        lockedStudents?.has(student.student_code) ? 'O' : '',
      ]);
    });
  });

  // 학번 순으로 정렬
  const header = rows[0];
  const data = rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return [header, ...data];
}

/**
 * 반별 목록 형식으로 Excel 데이터 생성
 * 각 반을 별도 시트로 생성
 */
function generateClassListData(assignments: ClassAssignment[]): Map<string, (string | number)[][]> {
  const sheets = new Map<string, (string | number)[][]>();

  assignments.forEach(cls => {
    const rows: (string | number)[][] = [CLASS_LIST_HEADERS];

    // 각 반의 학생을 이름 가나다순으로 정렬 후 번호 부여
    const sortedStudents = [...cls.students].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    sortedStudents.forEach((student, idx) => {
      rows.push([
        idx + 1, // 번호 (이름 가나다순)
        student.student_code,
        student.name,
        student.class_num,
        (student as any).averageGrade ?? '-',
      ]);
    });

    sheets.set(`${cls.classNum}반`, rows);
  });

  return sheets;
}

/**
 * 통계 시트 데이터 생성
 */
function generateStatisticsData(
  assignments: ClassAssignment[],
  statistics: AssignmentStatistics
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  // 기본 통계
  rows.push(['=== 배정 통계 ===', '']);
  rows.push(['총 학생 수', statistics.totalStudents]);
  rows.push(['반 수', statistics.classCount]);
  rows.push(['반별 평균 인원', statistics.avgClassSize.toFixed(1)]);
  rows.push(['', '']);

  // 반별 상세
  rows.push(['=== 반별 현황 ===', '']);
  rows.push(['반', '인원', '평균 등급', '출신반 분포']);

  assignments.forEach(cls => {
    const avgGrade = cls.students.length > 0
      ? cls.students.reduce((sum, s) => sum + ((s as any).averageGrade ?? 5), 0) / cls.students.length
      : 0;

    // 출신반 분포 계산
    const originDistribution: Record<number, number> = {};
    cls.students.forEach(s => {
      originDistribution[s.class_num] = (originDistribution[s.class_num] || 0) + 1;
    });
    const distributionStr = Object.entries(originDistribution)
      .map(([k, v]) => `${k}반:${v}명`)
      .join(', ');

    rows.push([
      `${cls.classNum}반`,
      cls.students.length,
      avgGrade.toFixed(2),
      distributionStr,
    ]);
  });

  return rows;
}

/**
 * Excel 워크북 생성 및 다운로드
 */
export function exportToExcel(
  assignments: ClassAssignment[],
  statistics: AssignmentStatistics,
  options: ExportOptions = {},
  lockedStudents?: Map<string, number>
): void {
  const {
    fileName = `반배정결과_${new Date().toISOString().slice(0, 10)}`,
    includeStatistics = true,
    format = 'studentList',
  } = options;

  const workbook = XLSX.utils.book_new();

  if (format === 'studentList') {
    // 학생 목록 형식
    const studentData = generateStudentListData(assignments, lockedStudents);
    const studentSheet = XLSX.utils.aoa_to_sheet(studentData);

    // 열 너비 설정
    studentSheet['!cols'] = [
      { wch: 12 }, // 학번
      { wch: 10 }, // 이름
      { wch: 6 },  // 학년
      { wch: 8 },  // 기존반
      { wch: 8 },  // 기존번호
      { wch: 8 },  // 배정반
      { wch: 8 },  // 배정번호
      { wch: 10 }, // 평균등급
      { wch: 20 }, // 비고
      { wch: 6 },  // 잠금
    ];

    XLSX.utils.book_append_sheet(workbook, studentSheet, '전체 배정 결과');
  } else {
    // 반별 목록 형식
    const classSheets = generateClassListData(assignments);

    classSheets.forEach((data, sheetName) => {
      const sheet = XLSX.utils.aoa_to_sheet(data);
      sheet['!cols'] = [
        { wch: 6 },  // 번호
        { wch: 12 }, // 학번
        { wch: 10 }, // 이름
        { wch: 8 },  // 기존반
        { wch: 10 }, // 평균등급
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    });
  }

  // 통계 시트 추가
  if (includeStatistics) {
    const statsData = generateStatisticsData(assignments, statistics);
    const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
    statsSheet['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(workbook, statsSheet, '통계');
  }

  // 다운로드
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

/**
 * 배정 결과를 JSON 형식으로 내보내기
 * 추후 다시 불러오기 위한 용도
 */
export function exportToJson(
  assignments: ClassAssignment[],
  statistics: AssignmentStatistics,
  config: any,
  lockedStudents?: Map<string, number>
): void {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    config,
    assignments,
    statistics,
    lockedStudents: lockedStudents ? Object.fromEntries(lockedStudents) : undefined,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `반배정결과_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
