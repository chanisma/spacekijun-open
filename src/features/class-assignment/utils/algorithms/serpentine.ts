/**
 * Serpentine Assignment Algorithm
 * 뱀식 배정 알고리즘 - 지그재그 배정 (1→2→3→3→2→1)
 */

import type { StudentData, ClassAssignment, AssignmentConstraints } from '../../types/class-assignment.types';
import {
  parseCombineConstraints,
  parseSeparateConstraints,
  checkAllConstraints,
  findCombineTargetClass,
} from './constraints';

/**
 * 학생을 성적순으로 정렬 (낮은 등급 = 높은 성적)
 */
function sortByGrade(students: StudentData[]): StudentData[] {
  return [...students].sort((a, b) => {
    const gradeA = (a as any).averageGrade ?? 5;
    const gradeB = (b as any).averageGrade ?? 5;
    return gradeA - gradeB;
  });
}

export interface SerpentineAssignmentOptions {
  students: StudentData[];
  classCount: number;
  constraints: AssignmentConstraints;
  lockedStudents?: Map<string, number>;
  excludeClasses?: number[];
}

/**
 * 뱀식 배정 알고리즘 실행
 * 1등 → 1반, 2등 → 2반, 3등 → 3반, 4등 → 3반, 5등 → 2반, 6등 → 1반, 7등 → 1반...
 */
export function serpentineAssignment(options: SerpentineAssignmentOptions): ClassAssignment[] {
  const { students, classCount, constraints, lockedStudents = new Map(), excludeClasses = [] } = options;

  // 제약 조건 파싱
  const combinePairs = parseCombineConstraints(constraints);
  const separatePairs = parseSeparateConstraints(constraints);

  // 반별 결과 초기화
  const classes: ClassAssignment[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: [],
  }));

  // 잠긴 학생 먼저 배정
  const lockedCodes = new Set(lockedStudents.keys());
  lockedStudents.forEach((classNum, studentCode) => {
    const student = students.find(s => s.student_code === studentCode);
    if (student && classNum >= 1 && classNum <= classCount) {
      classes[classNum - 1].students.push(student);
    }
  });

  // 제외된 반의 기존 학생 유지
  excludeClasses.forEach(classNum => {
    const existingStudents = students.filter(s => s.class_num === classNum);
    existingStudents.forEach(student => {
      if (!lockedCodes.has(student.student_code)) {
        classes[classNum - 1].students.push(student);
        lockedCodes.add(student.student_code);
      }
    });
  });

  // 미배정 학생 필터링 및 성적순 정렬
  const unassignedStudents = students.filter(s => !lockedCodes.has(s.student_code));
  const sortedStudents = sortByGrade(unassignedStudents);

  // 배정 가능한 반 인덱스 목록
  const availableClassIndices = classes
    .map((_, i) => i)
    .filter(i => !excludeClasses.includes(i + 1));

  if (availableClassIndices.length === 0) {
    return classes;
  }

  // 뱀식 순서 생성 (1, 2, 3, 3, 2, 1, 1, 2, 3, ...)
  const getSerpentineIndex = (studentIdx: number): number => {
    const cycleLength = availableClassIndices.length * 2;
    const posInCycle = studentIdx % cycleLength;

    if (posInCycle < availableClassIndices.length) {
      // 정방향: 0, 1, 2
      return posInCycle;
    } else {
      // 역방향: 2, 1, 0
      return cycleLength - posInCycle - 1;
    }
  };

  // 뱀식 배정
  sortedStudents.forEach((student, idx) => {
    // 결합 제약 확인: 파트너가 이미 배정된 반이 있으면 그 반에 배정
    const combineTargetClass = findCombineTargetClass(student, classes, combinePairs);

    if (combineTargetClass !== null && !excludeClasses.includes(combineTargetClass)) {
      const targetClass = classes[combineTargetClass - 1];
      // 분리 제약만 확인 (결합 제약은 이미 만족)
      if (checkAllConstraints(student, targetClass, classes, separatePairs, [])) {
        targetClass.students.push(student);
        return;
      }
      // 분리 제약과 충돌하면 경고 후 배정
      console.warn(`결합/분리 제약 충돌: ${student.name} - 결합 제약 우선 적용`);
      targetClass.students.push(student);
      return;
    }

    let assigned = false;
    let baseIdx = getSerpentineIndex(idx);
    let attempts = 0;

    while (!assigned && attempts < availableClassIndices.length) {
      const classIdx = availableClassIndices[(baseIdx + attempts) % availableClassIndices.length];
      const targetClass = classes[classIdx];

      if (checkAllConstraints(student, targetClass, classes, separatePairs, combinePairs)) {
        targetClass.students.push(student);
        assigned = true;
      } else {
        attempts++;
      }
    }

    // 제약 조건을 만족하는 반이 없으면 강제 배정
    if (!assigned) {
      console.warn(`제약 조건을 만족하는 반을 찾지 못함: ${student.name}`);
      const classIdx = availableClassIndices[baseIdx % availableClassIndices.length];
      classes[classIdx].students.push(student);
    }
  });

  return classes;
}
