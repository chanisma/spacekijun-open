/**
 * Class Assignment Algorithms Index
 * 배정 알고리즘 모음
 */

export { randomAssignment, type RandomAssignmentOptions } from './random';
export { gradeBasedAssignment, type GradeBasedAssignmentOptions } from './gradeBased';
export { serpentineAssignment, type SerpentineAssignmentOptions } from './serpentine';
export { stratifiedAssignment, type StratifiedAssignmentOptions } from './stratified';
export {
  subjectCombinationAssignment,
  subjectClusteringAssignment,
  type SubjectCombination,
  type SubjectCluster,
  type SubjectBasedOptions,
  getStudentSubjects,
  matchesSubjectCombination,
  generateClusterName,
  kMeansCluster,
} from './subjectBased';
export * from './constraints';

import type { StudentData, ClassAssignment, AssignmentConstraints, SpecialClassMode } from '../../types/class-assignment.types';
import type { AlgorithmType } from '../../constants';
import { randomAssignment } from './random';
import { gradeBasedAssignment } from './gradeBased';
import { serpentineAssignment } from './serpentine';
import { stratifiedAssignment } from './stratified';
import { subjectCombinationAssignment, subjectClusteringAssignment, type SubjectCombination } from './subjectBased';
import { parseExcludedStudents, generateSameNamePairs } from './constraints';

export interface AssignmentOptions {
  students: StudentData[];
  classCount: number;
  constraints: AssignmentConstraints;
  lockedStudents?: Map<string, number>;
  excludeClasses?: number[];
}

export interface SpecialClassOptions {
  mode: SpecialClassMode;
  // 과목 조합 매칭용
  subjectCombinations?: SubjectCombination[];
  // 클러스터링용
  clusterCount?: number;
  minClusterSize?: number;
  centroidThreshold?: number;
}

/**
 * 제약 조건 전처리 - 제외 학생 필터링 및 동명이인 분리 쌍 추가
 */
function preprocessOptions(options: AssignmentOptions): AssignmentOptions {
  let { students, constraints } = options;

  // 1. 제외 학생 필터링
  const excludedCodes = parseExcludedStudents(constraints);
  if (excludedCodes.length > 0) {
    students = students.filter(s => !excludedCodes.includes(s.student_code));
  }

  // 2. 동명이인 분리 쌍 자동 추가
  let { separateList } = constraints;
  if (constraints.separateSameNames) {
    const sameNamePairs = generateSameNamePairs(students);
    if (sameNamePairs.length > 0) {
      separateList = [...separateList, ...sameNamePairs];
    }
  }

  return {
    ...options,
    students,
    constraints: { ...constraints, separateList },
  };
}

/**
 * 알고리즘 타입에 따른 배정 실행
 */
export function executeAssignment(
  algorithm: AlgorithmType,
  options: AssignmentOptions
): ClassAssignment[] {
  const processed = preprocessOptions(options);

  switch (algorithm) {
    case 'random':
      return randomAssignment(processed);
    case 'gradeBased':
      return gradeBasedAssignment(processed);
    case 'serpentine':
      return serpentineAssignment(processed);
    case 'stratified':
      return stratifiedAssignment(processed);
    default:
      console.warn(`Unknown algorithm: ${algorithm}, falling back to stratified`);
      return stratifiedAssignment(processed);
  }
}

/**
 * 특수반 배정을 포함한 전체 배정 실행
 */
export function executeAssignmentWithSpecialClass(
  algorithm: AlgorithmType,
  options: AssignmentOptions,
  specialClassOptions?: SpecialClassOptions
): ClassAssignment[] {
  // 특수반 모드가 없거나 none이면 일반 배정 (executeAssignment 내부에서 전처리)
  if (!specialClassOptions || specialClassOptions.mode === 'none' || specialClassOptions.mode === 'preset') {
    return executeAssignment(algorithm, options);
  }

  // 특수반 모드용 제약 조건 전처리 (제외 학생, 동명이인 분리)
  const processed = preprocessOptions(options);

  // 과목 조합 매칭
  if (specialClassOptions.mode === 'combination' && specialClassOptions.subjectCombinations) {
    return subjectCombinationAssignment({
      ...processed,
      subjectCombinations: specialClassOptions.subjectCombinations,
      balanceGrades: true,
    });
  }

  // 클러스터링
  if (specialClassOptions.mode === 'clustering') {
    return subjectClusteringAssignment({
      ...processed,
      clusterCount: specialClassOptions.clusterCount || processed.classCount,
      minClusterSize: specialClassOptions.minClusterSize || 15,
      balanceGrades: true,
      centroidThreshold: specialClassOptions.centroidThreshold || 0.7,
    });
  }

  // 기본값: 일반 배정
  return executeAssignment(algorithm, options);
}
