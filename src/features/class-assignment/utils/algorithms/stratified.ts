/**
 * Stratified Assignment Algorithm
 * 계층화 배정 알고리즘 - 성적을 상/중/하로 나눈 후 각 그룹에서 뱀식 배정
 * 한국 학교에 가장 권장되는 방식
 */

import type { StudentData, ClassAssignment, AssignmentConstraints } from '../../types/class-assignment.types';
import {
  parseCombineConstraints,
  parseSeparateConstraints,
  checkAllConstraints,
  findCombineTargetClass,
  checkSeparateConstraints,
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

/**
 * 학생을 계층으로 분류
 */
function stratifyStudents(students: StudentData[], tierCount: number = 3): StudentData[][] {
  const sorted = sortByGrade(students);
  const tierSize = Math.ceil(sorted.length / tierCount);
  const tiers: StudentData[][] = [];

  for (let i = 0; i < tierCount; i++) {
    const start = i * tierSize;
    const end = Math.min(start + tierSize, sorted.length);
    tiers.push(sorted.slice(start, end));
  }

  return tiers;
}

/**
 * 출신반 다양성 점수 계산 (낮을수록 좋음)
 */
function calculateOriginDiversityPenalty(
  student: StudentData,
  classStudents: StudentData[]
): number {
  const sameOriginCount = classStudents.filter(s => s.class_num === student.class_num).length;
  return sameOriginCount;
}

export interface StratifiedAssignmentOptions {
  students: StudentData[];
  classCount: number;
  constraints: AssignmentConstraints;
  lockedStudents?: Map<string, number>;
  excludeClasses?: number[];
  tierCount?: number; // 계층 수 (기본: 3 - 상/중/하)
  balanceOriginClass?: boolean; // 출신반 다양성 고려
}

/**
 * 계층화 배정 알고리즘 실행
 */
export function stratifiedAssignment(options: StratifiedAssignmentOptions): ClassAssignment[] {
  const {
    students,
    classCount,
    constraints,
    lockedStudents = new Map(),
    excludeClasses = [],
    tierCount = 3,
    balanceOriginClass = true,
  } = options;

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

  // 미배정 학생 필터링
  const unassignedStudents = students.filter(s => !lockedCodes.has(s.student_code));

  // 배정 가능한 반 인덱스 목록
  const availableClassIndices = classes
    .map((_, i) => i)
    .filter(i => !excludeClasses.includes(i + 1));

  if (availableClassIndices.length === 0) {
    return classes;
  }

  // 계층 분류
  const tiers = stratifyStudents(unassignedStudents, tierCount);

  // 각 계층에서 뱀식 배정
  tiers.forEach((tierStudents, tierIdx) => {
    // 각 계층 내에서 무작위로 섞기 (같은 계층 내 공정성)
    const shuffledTier = [...tierStudents].sort(() => Math.random() - 0.5);

    // 뱀식 순서 생성
    const getSerpentineIndex = (studentIdx: number): number => {
      const cycleLength = availableClassIndices.length * 2;
      const posInCycle = studentIdx % cycleLength;

      // 계층별로 시작 방향 교차 (상위권: 정방향, 중위권: 역방향, 하위권: 정방향)
      const reversed = tierIdx % 2 === 1;

      if (posInCycle < availableClassIndices.length) {
        const idx = reversed
          ? availableClassIndices.length - 1 - posInCycle
          : posInCycle;
        return idx;
      } else {
        const idx = reversed
          ? posInCycle - availableClassIndices.length
          : cycleLength - posInCycle - 1;
        return idx;
      }
    };

    shuffledTier.forEach((student, idx) => {
      let assigned = false;
      const baseIdx = getSerpentineIndex(idx);

      // 결합 제약 확인: 파트너가 이미 배정된 반이 있으면 그 반에 우선 배정
      const combineTargetClass = findCombineTargetClass(student, classes, combinePairs);

      if (combineTargetClass !== null && !excludeClasses.includes(combineTargetClass)) {
        const targetClass = classes[combineTargetClass - 1];
        // 분리 제약만 확인 (결합 제약은 이미 만족)
        if (checkSeparateConstraints(student, targetClass.students, separatePairs)) {
          targetClass.students.push(student);
          assigned = true;
        } else {
          // 분리 제약과 충돌하면 경고 후 배정 (결합 제약 우선)
          console.warn(`결합/분리 제약 충돌: ${student.name} - 결합 제약 우선 적용`);
          targetClass.students.push(student);
          assigned = true;
        }
      }

      // 출신반 다양성을 고려한 배정
      if (!assigned && balanceOriginClass) {
        // 모든 배정 가능한 반의 점수 계산
        const classScores = availableClassIndices.map(classIdx => {
          const targetClass = classes[classIdx];
          const meetsConstraints = checkAllConstraints(
            student,
            targetClass,
            classes,
            separatePairs,
            combinePairs
          );
          const diversityPenalty = calculateOriginDiversityPenalty(student, targetClass.students);
          const sizePenalty = targetClass.students.length * 0.1; // 인원수 균형
          const distanceFromBase = Math.abs(classIdx - availableClassIndices[baseIdx]) * 0.05; // 기본 순서 유지

          return {
            classIdx,
            score: meetsConstraints ? diversityPenalty + sizePenalty + distanceFromBase : Infinity,
          };
        });

        // 가장 점수가 낮은 반 선택
        classScores.sort((a, b) => a.score - b.score);
        const bestClass = classScores[0];

        if (bestClass.score !== Infinity) {
          classes[bestClass.classIdx].students.push(student);
          assigned = true;
        }
      }

      // 출신반 다양성을 고려하지 않거나 배정 실패한 경우 기본 뱀식 배정
      if (!assigned) {
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
      }
    });
  });

  return classes;
}
