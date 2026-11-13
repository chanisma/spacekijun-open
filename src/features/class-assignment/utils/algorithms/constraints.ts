/**
 * Constraint Utilities for Class Assignment Algorithms
 * 제약 조건 처리 유틸리티
 */

import type { StudentData, ClassAssignment, AssignmentConstraints } from '../../types/class-assignment.types';

/**
 * 결합 제약 파싱 (COMBINE: 접두사로 저장된 쌍들)
 * keepFriendsTogether에 의해 추가된 쌍들
 */
export function parseCombineConstraints(constraints: AssignmentConstraints): string[][] {
  return constraints.separateList
    .filter(pair => pair[0]?.startsWith('COMBINE:'))
    .map(pair => [pair[0].replace('COMBINE:', ''), pair[1]]);
}

/**
 * 분리 제약 파싱 (COMBINE: 및 EXCLUDE: 접두사가 없는 쌍들)
 */
export function parseSeparateConstraints(constraints: AssignmentConstraints): string[][] {
  return constraints.separateList
    .filter(pair => pair[0] && !pair[0].startsWith('COMBINE:') && !pair[0].startsWith('EXCLUDE:'));
}

/**
 * 제외 학생 파싱 (EXCLUDE: 접두사로 저장된 항목들)
 */
export function parseExcludedStudents(constraints: AssignmentConstraints): string[] {
  const fromList = constraints.separateList
    .filter(pair => pair[0]?.startsWith('EXCLUDE:'))
    .map(pair => pair[0].replace('EXCLUDE:', ''));

  // excludedStudents 배열과 합침
  return [...new Set([...fromList, ...(constraints.excludedStudents || [])])];
}

/**
 * 동명이인 쌍 생성 - 같은 이름의 학생들을 분리 제약으로 생성
 */
export function generateSameNamePairs(students: StudentData[]): string[][] {
  const nameMap = new Map<string, string[]>();

  students.forEach(s => {
    const codes = nameMap.get(s.name) || [];
    codes.push(s.student_code);
    nameMap.set(s.name, codes);
  });

  const pairs: string[][] = [];
  nameMap.forEach(codes => {
    if (codes.length >= 2) {
      // 모든 조합 쌍 생성
      for (let i = 0; i < codes.length; i++) {
        for (let j = i + 1; j < codes.length; j++) {
          pairs.push([codes[i], codes[j]]);
        }
      }
    }
  });

  return pairs;
}

/**
 * 분리 제약 검증 - 해당 학생이 분리해야 할 학생과 같은 반이 아닌지 확인
 */
export function checkSeparateConstraints(
  student: StudentData,
  classStudents: StudentData[],
  separatePairs: string[][]
): boolean {
  for (const pair of separatePairs) {
    const [code1, code2] = pair;
    if (student.student_code === code1 && classStudents.some(s => s.student_code === code2)) {
      return false;
    }
    if (student.student_code === code2 && classStudents.some(s => s.student_code === code1)) {
      return false;
    }
  }
  return true;
}

/**
 * 결합 제약 검증 - 해당 학생과 같이 배정되어야 하는 학생이 이미 다른 반에 있는지 확인
 */
export function checkCombineConstraints(
  student: StudentData,
  targetClassNum: number,
  allClasses: ClassAssignment[],
  combinePairs: string[][]
): boolean {
  for (const pair of combinePairs) {
    const [code1, code2] = pair;
    let partnerCode: string | null = null;

    if (student.student_code === code1) {
      partnerCode = code2;
    } else if (student.student_code === code2) {
      partnerCode = code1;
    }

    if (partnerCode) {
      // 파트너가 이미 다른 반에 배정되어 있으면 그 반에만 배정 가능
      for (const cls of allClasses) {
        if (cls.students.some(s => s.student_code === partnerCode)) {
          if (cls.classNum !== targetClassNum) {
            return false; // 파트너가 다른 반에 있으므로 이 반에 배정 불가
          }
        }
      }
    }
  }
  return true;
}

/**
 * 결합 제약에 따른 필수 반 찾기 - 파트너가 이미 배정된 반 반환
 */
export function findCombineTargetClass(
  student: StudentData,
  allClasses: ClassAssignment[],
  combinePairs: string[][]
): number | null {
  for (const pair of combinePairs) {
    const [code1, code2] = pair;
    let partnerCode: string | null = null;

    if (student.student_code === code1) {
      partnerCode = code2;
    } else if (student.student_code === code2) {
      partnerCode = code1;
    }

    if (partnerCode) {
      for (const cls of allClasses) {
        if (cls.students.some(s => s.student_code === partnerCode)) {
          return cls.classNum; // 파트너가 있는 반 반환
        }
      }
    }
  }
  return null; // 파트너가 아직 배정되지 않음
}

/**
 * 통합 제약 검증 - 분리 및 결합 제약 모두 확인
 */
export function checkAllConstraints(
  student: StudentData,
  targetClass: ClassAssignment,
  allClasses: ClassAssignment[],
  separatePairs: string[][],
  combinePairs: string[][]
): boolean {
  // 분리 제약 검증
  if (!checkSeparateConstraints(student, targetClass.students, separatePairs)) {
    return false;
  }

  // 결합 제약 검증
  if (!checkCombineConstraints(student, targetClass.classNum, allClasses, combinePairs)) {
    return false;
  }

  return true;
}
