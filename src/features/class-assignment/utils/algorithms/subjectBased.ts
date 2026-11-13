/**
 * Subject-Based Assignment Algorithms
 * 과목 기반 배정 알고리즘
 *
 * 1. 과목 조합 매칭: 특정 과목 조합 선택자를 지정된 반에 배정
 * 2. 과목 클러스터링: 유사한 과목 선택 패턴을 자동으로 그룹화
 */

import type { StudentData, ClassAssignment, AssignmentConstraints } from '../../types/class-assignment.types';
import {
  parseCombineConstraints,
  parseSeparateConstraints,
  checkAllConstraints,
  findCombineTargetClass,
  checkSeparateConstraints,
} from './constraints';

// ============================================================================
// Types
// ============================================================================

export interface SubjectCombination {
  id: string;
  name: string;
  requiredSubjects: string[];  // 모두 포함해야 함 (AND)
  optionalSubjects?: string[]; // 하나 이상 포함 (OR)
  minOptionalCount?: number;   // 최소 선택 개수
  targetClassNum?: number;     // 배정할 반 번호 (미지정시 자동)
  targetClassCount?: number;   // 분산할 반 수 (미지정시 인원 균형에 따라 자동 계산)
  priority?: number;           // 우선순위 (높을수록 먼저 처리)
}

export interface SubjectCluster {
  id: string;
  centroid: string[];          // 클러스터 중심 과목들
  students: StudentData[];
  similarity: number;          // 평균 유사도
}

export interface SubjectBasedOptions {
  students: StudentData[];
  classCount: number;
  constraints: AssignmentConstraints;
  lockedStudents?: Map<string, number>;
  excludeClasses?: number[];

  // 과목 조합 매칭용
  subjectCombinations?: SubjectCombination[];

  // 클러스터링용
  clusterCount?: number;       // 클러스터 수 (미지정시 classCount)
  minClusterSize?: number;     // 최소 클러스터 크기
  similarityThreshold?: number; // 유사도 임계값 (0-1)
  centroidThreshold?: number;  // 중심점 과목 포함 임계값 (0.4~0.8, 기본 0.5)

  // 공통
  fallbackAlgorithm?: 'random' | 'serpentine' | 'stratified';
  balanceGrades?: boolean;     // 성적 균형 유지
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 학생의 전체 선택 과목 가져오기
 */
function getStudentSubjects(student: StudentData): string[] {
  if (!student.courseSelections) return [];

  const subjects = new Set<string>([
    ...(student.courseSelections.semester1 || []),
    ...(student.courseSelections.semester2 || []),
  ]);

  return Array.from(subjects);
}

/**
 * 두 과목 집합의 자카드 유사도 계산 (0-1)
 */
function calculateJaccardSimilarity(subjects1: string[], subjects2: string[]): number {
  if (subjects1.length === 0 && subjects2.length === 0) return 1;
  if (subjects1.length === 0 || subjects2.length === 0) return 0;

  const set1 = new Set(subjects1);
  const set2 = new Set(subjects2);

  const intersection = [...set1].filter(s => set2.has(s)).length;
  const union = new Set([...subjects1, ...subjects2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * 코사인 유사도 계산 (과목 가중치 기반)
 */
function calculateCosineSimilarity(
  subjects1: string[],
  subjects2: string[],
  allSubjects: string[]
): number {
  const vector1 = allSubjects.map(s => subjects1.includes(s) ? 1 : 0);
  const vector2 = allSubjects.map(s => subjects2.includes(s) ? 1 : 0);

  const dotProduct = vector1.reduce((sum, v, i) => sum + v * vector2[i], 0);
  const magnitude1 = Math.sqrt(vector1.reduce((sum, v) => sum + v * v, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((sum, v) => sum + v * v, 0));

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * 학생이 과목 조합을 충족하는지 확인
 */
function matchesSubjectCombination(
  student: StudentData,
  combination: SubjectCombination
): boolean {
  const studentSubjects = getStudentSubjects(student);

  // 필수 과목 전부 포함 확인 (부분 문자열 매칭)
  const hasAllRequired = combination.requiredSubjects.every(required =>
    studentSubjects.some(s =>
      s.includes(required) || required.includes(s)
    )
  );

  if (!hasAllRequired) return false;

  // 선택 과목 조건 확인
  if (combination.optionalSubjects && combination.optionalSubjects.length > 0) {
    const minCount = combination.minOptionalCount || 1;
    const optionalMatches = combination.optionalSubjects.filter(optional =>
      studentSubjects.some(s =>
        s.includes(optional) || optional.includes(s)
      )
    ).length;

    if (optionalMatches < minCount) return false;
  }

  return true;
}

/**
 * 성적순 정렬
 */
function sortByGrade(students: StudentData[]): StudentData[] {
  return [...students].sort((a, b) => {
    const gradeA = (a as any).averageGrade ?? 5;
    const gradeB = (b as any).averageGrade ?? 5;
    return gradeA - gradeB;
  });
}

// ============================================================================
// Subject Combination Matching Algorithm
// ============================================================================

/**
 * 과목 조합 매칭 알고리즘
 * 지정한 과목 조합을 선택한 학생을 같은 반에 우선 배정
 * 인원이 많으면 여러 반에 분산하여 반 인원 균형 유지
 */
export function subjectCombinationAssignment(options: SubjectBasedOptions): ClassAssignment[] {
  const {
    students,
    classCount,
    constraints,
    lockedStudents = new Map(),
    excludeClasses = [],
    subjectCombinations = [],
    balanceGrades = true,
  } = options;

  // 제약 조건 파싱
  const combinePairs = parseCombineConstraints(constraints);
  const separatePairs = parseSeparateConstraints(constraints);

  // 사용 가능한 반 수
  const availableClassCount = classCount - excludeClasses.length;

  // 목표 반당 인원 계산
  const targetClassSize = Math.ceil(students.length / availableClassCount);

  // 반별 결과 초기화
  const classes: ClassAssignment[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: [],
    specialClass: false,
  }));

  // 사용 가능한 반 인덱스
  const availableClassIndices = classes
    .map((_, i) => i)
    .filter(i => !excludeClasses.includes(i + 1));

  // 잠긴 학생 먼저 배정
  const assignedCodes = new Set<string>();
  lockedStudents.forEach((classNum, studentCode) => {
    const student = students.find(s => s.student_code === studentCode);
    if (student && classNum >= 1 && classNum <= classCount) {
      classes[classNum - 1].students.push(student);
      assignedCodes.add(studentCode);
    }
  });

  // 과목 조합 우선순위 정렬 (높을수록 먼저)
  const sortedCombinations = [...subjectCombinations].sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );

  // 각 과목 조합별로 학생 매칭
  const combinationStudents: Map<string, StudentData[]> = new Map();
  const allCombinationStudentCodes = new Set<string>();

  sortedCombinations.forEach(combination => {
    const matchingStudents = students.filter(s =>
      !assignedCodes.has(s.student_code) &&
      !allCombinationStudentCodes.has(s.student_code) && // 다른 조합에 이미 매칭되지 않은 학생
      matchesSubjectCombination(s, combination)
    );

    // 성적 균형을 위해 정렬
    const sortedMatches = balanceGrades
      ? sortByGrade(matchingStudents)
      : matchingStudents;

    combinationStudents.set(combination.id, sortedMatches);
    sortedMatches.forEach(s => allCombinationStudentCodes.add(s.student_code));
  });

  // 조합에 해당하지 않는 학생들
  const nonCombinationStudents = students.filter(s =>
    !assignedCodes.has(s.student_code) &&
    !allCombinationStudentCodes.has(s.student_code)
  );
  const sortedNonCombination = balanceGrades
    ? sortByGrade(nonCombinationStudents)
    : nonCombinationStudents;

  // 반에 조합 배정 (인원 균형을 고려하여 분산)
  let nextAvailableClassIdx = 0;

  sortedCombinations.forEach(combination => {
    const matchingStudents = combinationStudents.get(combination.id) || [];
    if (matchingStudents.length === 0) return;

    // 이 조합에 필요한 반 수 계산
    // 1. 사용자가 지정한 반 수가 있으면 사용
    // 2. 없으면 목표 인원 기준으로 자동 계산
    const autoClassesNeeded = Math.ceil(matchingStudents.length / targetClassSize);
    const classesNeeded = combination.targetClassCount
      ? Math.min(combination.targetClassCount, availableClassCount, matchingStudents.length)
      : autoClassesNeeded;
    const studentsPerClass = Math.ceil(matchingStudents.length / classesNeeded);

    // 배정할 반들 결정
    const targetClassIndices: number[] = [];

    // 지정된 반이 있으면 그 반부터 시작
    if (combination.targetClassNum && !excludeClasses.includes(combination.targetClassNum)) {
      const specifiedIdx = combination.targetClassNum - 1;
      if (availableClassIndices.includes(specifiedIdx)) {
        targetClassIndices.push(specifiedIdx);
      }
    }

    // 필요한 만큼 반 추가
    while (targetClassIndices.length < classesNeeded) {
      // 현재 인원이 가장 적은 반부터 선택
      const sortedBySize = availableClassIndices
        .filter(idx => !targetClassIndices.includes(idx))
        .sort((a, b) => classes[a].students.length - classes[b].students.length);

      if (sortedBySize.length === 0) break;
      targetClassIndices.push(sortedBySize[0]);
    }

    if (targetClassIndices.length === 0) {
      console.warn(`과목 조합 "${combination.name}" 배정 실패: 사용 가능한 반 없음`);
      return;
    }

    // 대상 반에 특수반 표시
    targetClassIndices.forEach(classIdx => {
      classes[classIdx].specialClass = true;
      classes[classIdx].specialConfig = {
        classNum: classIdx + 1,
        name: combination.name,
        targetSubjects: combination.requiredSubjects,
        minSubjectCount: combination.requiredSubjects.length,
      };
    });

    // 학생들을 대상 반에 균등 분배 (성적 균형 뱀식)
    matchingStudents.forEach((student, idx) => {
      if (assignedCodes.has(student.student_code)) return;

      // 결합 제약 확인
      const combineTarget = findCombineTargetClass(student, classes, combinePairs);
      if (combineTarget !== null) {
        if (checkSeparateConstraints(student, classes[combineTarget - 1].students, separatePairs)) {
          classes[combineTarget - 1].students.push(student);
          assignedCodes.add(student.student_code);
          return;
        }
      }

      // 뱀식 분배로 성적 균형 유지
      const cyclePos = idx % (targetClassIndices.length * 2);
      const isReverse = cyclePos >= targetClassIndices.length;
      const posInCycle = isReverse
        ? targetClassIndices.length * 2 - 1 - cyclePos
        : cyclePos;

      // 인원이 가장 적은 대상 반 찾기 (뱀식 기준 + 현재 인원 고려)
      const sortedTargets = [...targetClassIndices].sort((a, b) => {
        const sizeA = classes[a].students.length;
        const sizeB = classes[b].students.length;
        return sizeA - sizeB;
      });

      let assigned = false;
      for (const classIdx of sortedTargets) {
        const targetClass = classes[classIdx];

        // 제약 조건 확인
        if (checkAllConstraints(student, targetClass, classes, separatePairs, combinePairs)) {
          targetClass.students.push(student);
          assignedCodes.add(student.student_code);
          assigned = true;
          break;
        }
      }

      // 제약 조건으로 배정 실패 시 강제 배정
      if (!assigned) {
        const smallestClass = sortedTargets[0];
        classes[smallestClass].students.push(student);
        assignedCodes.add(student.student_code);
      }
    });
  });

  // 미배정 학생들(조합에 해당하지 않는 학생)을 모든 반에 균등 분배
  // 인원이 적은 반부터 채워서 균형 맞춤
  sortedNonCombination.forEach((student, idx) => {
    if (assignedCodes.has(student.student_code)) return;

    // 결합 제약 우선 확인
    const combineTarget = findCombineTargetClass(student, classes, combinePairs);
    if (combineTarget !== null && availableClassIndices.includes(combineTarget - 1)) {
      if (checkSeparateConstraints(student, classes[combineTarget - 1].students, separatePairs)) {
        classes[combineTarget - 1].students.push(student);
        assignedCodes.add(student.student_code);
        return;
      }
    }

    // 인원이 가장 적은 반에 배정
    const sortedBySize = [...availableClassIndices].sort(
      (a, b) => classes[a].students.length - classes[b].students.length
    );

    let assigned = false;
    for (const classIdx of sortedBySize) {
      const targetClass = classes[classIdx];

      if (checkAllConstraints(student, targetClass, classes, separatePairs, combinePairs)) {
        targetClass.students.push(student);
        assignedCodes.add(student.student_code);
        assigned = true;
        break;
      }
    }

    // 강제 배정
    if (!assigned) {
      classes[sortedBySize[0]].students.push(student);
      assignedCodes.add(student.student_code);
    }
  });

  return classes;
}

// ============================================================================
// Subject Clustering Algorithm (K-means style)
// ============================================================================

/**
 * K-means 스타일 클러스터링으로 과목 선택 패턴 그룹화
 * @param centroidThreshold 중심점 과목 포함 비율 (0.4~0.8, 기본 0.5)
 */
function kMeansCluster(
  students: StudentData[],
  k: number,
  maxIterations: number = 20,
  centroidThreshold: number = 0.7
): SubjectCluster[] {
  // 전체 과목 목록 추출
  const allSubjectsSet = new Set<string>();
  students.forEach(s => {
    getStudentSubjects(s).forEach(subj => allSubjectsSet.add(subj));
  });
  const allSubjects = Array.from(allSubjectsSet);

  if (allSubjects.length === 0) {
    // 과목 데이터 없으면 무작위 클러스터
    const clusters: SubjectCluster[] = [];
    for (let i = 0; i < k; i++) {
      clusters.push({
        id: `cluster-${i + 1}`,
        centroid: [],
        students: [],
        similarity: 0,
      });
    }
    students.forEach((s, idx) => {
      clusters[idx % k].students.push(s);
    });
    return clusters;
  }

  // 초기 중심점 선택 (K-means++ 방식)
  const centroids: string[][] = [];
  const studentSubjects = students.map(s => getStudentSubjects(s));

  // 첫 번째 중심점: 무작위
  centroids.push(studentSubjects[Math.floor(Math.random() * students.length)] || []);

  // 나머지 중심점: 가장 먼 학생 선택
  while (centroids.length < k && centroids.length < students.length) {
    let maxDist = -1;
    let farthestIdx = 0;

    studentSubjects.forEach((subjects, idx) => {
      const minDistToCentroid = Math.min(
        ...centroids.map(c => 1 - calculateJaccardSimilarity(subjects, c))
      );
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        farthestIdx = idx;
      }
    });

    centroids.push(studentSubjects[farthestIdx]);
  }

  // 클러스터 초기화
  let clusters: SubjectCluster[] = centroids.map((c, i) => ({
    id: `cluster-${i + 1}`,
    centroid: c,
    students: [],
    similarity: 0,
  }));

  // 반복적 할당 및 중심점 업데이트
  for (let iter = 0; iter < maxIterations; iter++) {
    // 클러스터 초기화
    clusters.forEach(c => { c.students = []; });

    // 각 학생을 가장 가까운 클러스터에 할당
    students.forEach((student, idx) => {
      const subjects = studentSubjects[idx];
      let bestClusterIdx = 0;
      let bestSimilarity = -1;

      clusters.forEach((cluster, clusterIdx) => {
        const similarity = calculateJaccardSimilarity(subjects, cluster.centroid);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestClusterIdx = clusterIdx;
        }
      });

      clusters[bestClusterIdx].students.push(student);
    });

    // 빈 클러스터 처리: 가장 큰 클러스터에서 가장 먼 학생 이동
    clusters.forEach((cluster, idx) => {
      if (cluster.students.length === 0) {
        const largestCluster = clusters.reduce(
          (max, c) => c.students.length > max.students.length ? c : max
        );
        if (largestCluster.students.length > 1) {
          // 가장 먼 학생 찾기
          let farthestIdx = 0;
          let minSim = Infinity;
          largestCluster.students.forEach((s, i) => {
            const sim = calculateJaccardSimilarity(
              getStudentSubjects(s),
              largestCluster.centroid
            );
            if (sim < minSim) {
              minSim = sim;
              farthestIdx = i;
            }
          });
          cluster.students.push(largestCluster.students.splice(farthestIdx, 1)[0]);
        }
      }
    });

    // 중심점 업데이트 (가장 빈번한 과목들)
    const prevCentroids = clusters.map(c => [...c.centroid]);

    clusters.forEach(cluster => {
      if (cluster.students.length === 0) return;

      const subjectCounts: Map<string, number> = new Map();
      cluster.students.forEach(s => {
        getStudentSubjects(s).forEach(subj => {
          subjectCounts.set(subj, (subjectCounts.get(subj) || 0) + 1);
        });
      });

      // centroidThreshold 이상의 학생이 선택한 과목을 중심점으로
      const threshold = cluster.students.length * centroidThreshold;
      cluster.centroid = Array.from(subjectCounts.entries())
        .filter(([_, count]) => count >= threshold)
        .map(([subj]) => subj)
        .sort();
    });

    // 수렴 확인
    const converged = clusters.every((c, i) => {
      const prev = prevCentroids[i].sort().join(',');
      const curr = c.centroid.sort().join(',');
      return prev === curr;
    });

    if (converged) break;
  }

  // 최종 유사도 계산
  clusters.forEach(cluster => {
    if (cluster.students.length === 0) {
      cluster.similarity = 0;
      return;
    }

    const similarities = cluster.students.map(s =>
      calculateJaccardSimilarity(getStudentSubjects(s), cluster.centroid)
    );
    cluster.similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  });

  return clusters;
}

/**
 * 클러스터에 이름 부여 (주요 과목 기반)
 */
function generateClusterName(centroid: string[]): string {
  if (centroid.length === 0) return '일반';

  // 과목 카테고리 추론
  const scienceKeywords = ['물리', '화학', '생명', '지구과학'];
  const socialKeywords = ['정치', '경제', '사회', '지리', '역사', '세계사', '동아시아'];
  const artKeywords = ['미술', '음악', '체육', '연극', '무용'];

  const hasScience = centroid.some(s => scienceKeywords.some(k => s.includes(k)));
  const hasSocial = centroid.some(s => socialKeywords.some(k => s.includes(k)));
  const hasArt = centroid.some(s => artKeywords.some(k => s.includes(k)));

  if (hasScience && !hasSocial) return '이과중점';
  if (hasSocial && !hasScience) return '문과중점';
  if (hasArt) return '예체능';
  if (hasScience && hasSocial) return '교차선택';

  // 가장 긴 과목명 2개 조합
  const sorted = [...centroid].sort((a, b) => b.length - a.length);
  return sorted.slice(0, 2).join('+');
}

/**
 * 과목 클러스터링 배정 알고리즘
 * 유사한 과목 선택 패턴의 학생들을 자동으로 같은 반에 배정
 * 반 인원 균형을 최우선으로 고려하며, 클러스터 정보는 특수반 표시에만 활용
 */
export function subjectClusteringAssignment(options: SubjectBasedOptions): ClassAssignment[] {
  const {
    students,
    classCount,
    constraints,
    lockedStudents = new Map(),
    excludeClasses = [],
    clusterCount,
    minClusterSize = 15,
    balanceGrades = true,
    centroidThreshold = 0.7,
  } = options;

  // 제약 조건 파싱
  const combinePairs = parseCombineConstraints(constraints);
  const separatePairs = parseSeparateConstraints(constraints);

  // 반별 결과 초기화
  const classes: ClassAssignment[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: [],
    specialClass: false,
  }));

  // 잠긴 학생 먼저 배정
  const assignedCodes = new Set<string>();
  lockedStudents.forEach((classNum, studentCode) => {
    const student = students.find(s => s.student_code === studentCode);
    if (student && classNum >= 1 && classNum <= classCount) {
      classes[classNum - 1].students.push(student);
      assignedCodes.add(studentCode);
    }
  });

  // 배정 가능한 학생
  const unassignedStudents = students.filter(s => !assignedCodes.has(s.student_code));

  // 사용 가능한 반
  const availableClassIndices = classes
    .map((_, i) => i)
    .filter(i => !excludeClasses.includes(i + 1));
  const availableClassCount = availableClassIndices.length;

  // 목표 반당 인원 (균형 기준)
  const targetClassSize = Math.ceil(unassignedStudents.length / availableClassCount);

  // 과목 데이터가 있는 학생만 클러스터링
  const studentsWithCourses = unassignedStudents.filter(s =>
    s.courseSelections &&
    (s.courseSelections.semester1?.length > 0 || s.courseSelections.semester2?.length > 0)
  );

  // 클러스터링 수행 (패턴 분석용)
  const targetClusterCount = clusterCount || availableClassCount;
  let clusters = kMeansCluster(
    studentsWithCourses,
    Math.min(targetClusterCount, Math.max(1, studentsWithCourses.length)),
    20, // maxIterations
    centroidThreshold
  );

  // 유효한 클러스터만 유지 (minClusterSize 이상)
  const validClusters = clusters.filter(c => c.students.length >= minClusterSize);

  // 각 학생에게 클러스터 ID 매핑 (어떤 클러스터에 속하는지)
  const studentClusterMap = new Map<string, { clusterId: string; centroid: string[]; name: string }>();
  validClusters.forEach(cluster => {
    const clusterName = generateClusterName(cluster.centroid);
    cluster.students.forEach(s => {
      studentClusterMap.set(s.student_code, {
        clusterId: cluster.id,
        centroid: cluster.centroid,
        name: clusterName,
      });
    });
  });

  // 클러스터별로 학생 그룹화 (성적순 정렬)
  const clusterGroups: Map<string, StudentData[]> = new Map();
  validClusters.forEach(cluster => {
    const sorted = balanceGrades ? sortByGrade(cluster.students) : cluster.students;
    clusterGroups.set(cluster.id, sorted);
  });

  // 클러스터에 속하지 않는 학생들 (과목 데이터 없거나 작은 클러스터)
  const unclusteredStudents = unassignedStudents.filter(s =>
    !studentClusterMap.has(s.student_code)
  );
  const sortedUnclustered = balanceGrades ? sortByGrade(unclusteredStudents) : unclusteredStudents;

  // === 반 인원 균형을 고려한 배정 ===

  // 1. 각 클러스터를 필요한 반 수만큼 분산 배정
  // 클러스터 크기순 정렬 (큰 클러스터부터)
  const sortedClusterIds = [...clusterGroups.keys()].sort(
    (a, b) => (clusterGroups.get(b)?.length || 0) - (clusterGroups.get(a)?.length || 0)
  );

  // 반별 주요 클러스터 추적 (특수반 표시용)
  const classClusterInfo: Map<number, { name: string; centroid: string[]; count: number }> = new Map();

  sortedClusterIds.forEach(clusterId => {
    const clusterStudents = clusterGroups.get(clusterId) || [];
    if (clusterStudents.length === 0) return;

    const clusterInfo = studentClusterMap.get(clusterStudents[0].student_code);
    if (!clusterInfo) return;

    // 이 클러스터에 필요한 반 수 계산
    const classesNeeded = Math.max(1, Math.ceil(clusterStudents.length / targetClassSize));
    const studentsPerClass = Math.ceil(clusterStudents.length / classesNeeded);

    // 현재 인원이 적은 반부터 선택
    const targetClasses = [...availableClassIndices]
      .sort((a, b) => classes[a].students.length - classes[b].students.length)
      .slice(0, classesNeeded);

    // 뱀식 분배로 성적 균형 유지
    clusterStudents.forEach((student, idx) => {
      if (assignedCodes.has(student.student_code)) return;

      // 결합 제약 확인
      const combineTarget = findCombineTargetClass(student, classes, combinePairs);
      if (combineTarget !== null) {
        if (checkSeparateConstraints(student, classes[combineTarget - 1].students, separatePairs)) {
          classes[combineTarget - 1].students.push(student);
          assignedCodes.add(student.student_code);

          // 클러스터 정보 업데이트
          const info = classClusterInfo.get(combineTarget - 1);
          if (info) {
            info.count++;
          } else {
            classClusterInfo.set(combineTarget - 1, {
              name: clusterInfo.name,
              centroid: clusterInfo.centroid,
              count: 1,
            });
          }
          return;
        }
      }

      // 뱀식으로 대상 반 결정
      const cyclePos = idx % (targetClasses.length * 2);
      const isReverse = cyclePos >= targetClasses.length;
      const posInCycle = isReverse
        ? targetClasses.length * 2 - 1 - cyclePos
        : cyclePos;

      // 인원이 적은 순으로 정렬하여 배정 시도
      const sortedTargets = [...targetClasses].sort(
        (a, b) => classes[a].students.length - classes[b].students.length
      );

      let assigned = false;
      for (const classIdx of sortedTargets) {
        const targetClass = classes[classIdx];

        if (checkAllConstraints(student, targetClass, classes, separatePairs, combinePairs)) {
          targetClass.students.push(student);
          assignedCodes.add(student.student_code);
          assigned = true;

          // 클러스터 정보 업데이트
          const info = classClusterInfo.get(classIdx);
          if (info) {
            info.count++;
          } else {
            classClusterInfo.set(classIdx, {
              name: clusterInfo.name,
              centroid: clusterInfo.centroid,
              count: 1,
            });
          }
          break;
        }
      }

      // 제약 조건으로 배정 실패 시 강제 배정
      if (!assigned) {
        const smallestIdx = sortedTargets[0];
        classes[smallestIdx].students.push(student);
        assignedCodes.add(student.student_code);

        const info = classClusterInfo.get(smallestIdx);
        if (info) {
          info.count++;
        } else {
          classClusterInfo.set(smallestIdx, {
            name: clusterInfo.name,
            centroid: clusterInfo.centroid,
            count: 1,
          });
        }
      }
    });
  });

  // 2. 클러스터에 속하지 않는 학생들을 모든 반에 균등 분배
  sortedUnclustered.forEach((student, idx) => {
    if (assignedCodes.has(student.student_code)) return;

    // 결합 제약 확인
    const combineTarget = findCombineTargetClass(student, classes, combinePairs);
    if (combineTarget !== null && availableClassIndices.includes(combineTarget - 1)) {
      if (checkSeparateConstraints(student, classes[combineTarget - 1].students, separatePairs)) {
        classes[combineTarget - 1].students.push(student);
        assignedCodes.add(student.student_code);
        return;
      }
    }

    // 인원이 가장 적은 반에 배정
    const sortedBySize = [...availableClassIndices].sort(
      (a, b) => classes[a].students.length - classes[b].students.length
    );

    let assigned = false;
    for (const classIdx of sortedBySize) {
      const targetClass = classes[classIdx];

      if (checkAllConstraints(student, targetClass, classes, separatePairs, combinePairs)) {
        targetClass.students.push(student);
        assignedCodes.add(student.student_code);
        assigned = true;
        break;
      }
    }

    // 강제 배정
    if (!assigned) {
      classes[sortedBySize[0]].students.push(student);
      assignedCodes.add(student.student_code);
    }
  });

  // 3. 특수반 정보 설정 (해당 반에서 가장 많은 클러스터 기준)
  availableClassIndices.forEach(classIdx => {
    const info = classClusterInfo.get(classIdx);
    const classStudents = classes[classIdx].students;

    // 반 인원의 30% 이상이 특정 클러스터인 경우만 특수반으로 표시
    if (info && classStudents.length > 0 && info.count >= classStudents.length * 0.3) {
      classes[classIdx].specialClass = true;
      classes[classIdx].specialConfig = {
        classNum: classIdx + 1,
        name: info.name,
        targetSubjects: info.centroid,
        minSubjectCount: Math.ceil(info.centroid.length * 0.5),
      };
    }
  });

  return classes;
}

// ============================================================================
// Exports
// ============================================================================

export {
  getStudentSubjects,
  calculateJaccardSimilarity,
  matchesSubjectCombination,
  kMeansCluster,
  generateClusterName,
};
