/**
 * Random Assignment Algorithm
 * 무작위 배정 알고리즘 - Fisher-Yates 셔플 사용
 */

import type { StudentData, ClassAssignment, AssignmentConstraints } from '../../types/class-assignment.types';
import {
  parseCombineConstraints,
  parseSeparateConstraints,
  checkAllConstraints,
  findCombineTargetClass,
} from './constraints';

/**
 * Fisher-Yates 셔플 알고리즘
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export interface RandomAssignmentOptions {
  students: StudentData[];
  classCount: number;
  constraints: AssignmentConstraints;
  lockedStudents?: Map<string, number>; // student_code -> classNum
  excludeClasses?: number[]; // 재배정에서 제외할 반
}

/**
 * 무작위 배정 알고리즘 실행
 */
export function randomAssignment(options: RandomAssignmentOptions): ClassAssignment[] {
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

  // 미배정 학생 필터링 및 셔플
  const unassignedStudents = students.filter(s => !lockedCodes.has(s.student_code));
  const shuffledStudents = shuffleArray(unassignedStudents);

  // 배정 가능한 반 목록 (제외된 반 제외)
  const availableClasses = classes.filter(c => !excludeClasses.includes(c.classNum));

  // 균등 배정
  shuffledStudents.forEach(student => {
    // 결합 제약 확인: 파트너가 이미 배정된 반이 있으면 그 반에 배정
    const combineTargetClass = findCombineTargetClass(student, classes, combinePairs);

    if (combineTargetClass !== null) {
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

    // 가장 인원이 적은 반 찾기 (제약 조건 만족하는 반 중에서)
    let targetClass: ClassAssignment | null = null;
    let minSize = Infinity;

    for (const cls of availableClasses) {
      if (cls.students.length < minSize) {
        if (checkAllConstraints(student, cls, classes, separatePairs, combinePairs)) {
          targetClass = cls;
          minSize = cls.students.length;
        }
      }
    }

    // 제약 조건을 만족하는 반이 없으면 가장 인원이 적은 반에 배정 (경고 로그)
    if (!targetClass) {
      console.warn(`제약 조건을 만족하는 반을 찾지 못함: ${student.name}`);
      targetClass = availableClasses.reduce((min, cls) =>
        cls.students.length < min.students.length ? cls : min
      , availableClasses[0]);
    }

    if (targetClass) {
      targetClass.students.push(student);
    }
  });

  return classes;
}
