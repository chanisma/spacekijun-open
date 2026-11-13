/**
 * Statistics Utilities
 * 배정 결과 통계 계산 유틸리티
 */

import type { ClassAssignment, AssignmentStatistics, StudentData } from '../types/class-assignment.types';
import { BALANCE_THRESHOLDS } from '../constants';

/**
 * 반별 평균 성적 계산
 */
export function calculateClassAverageGrade(students: StudentData[]): number {
  if (students.length === 0) return 0;

  const sum = students.reduce((acc, student) => {
    return acc + ((student as any).averageGrade ?? 5);
  }, 0);

  return sum / students.length;
}

/**
 * 반별 성적 분산 계산
 */
export function calculateGradeVariance(assignments: ClassAssignment[]): number {
  const classAverages = assignments.map(cls => calculateClassAverageGrade(cls.students));
  const overallAverage = classAverages.reduce((a, b) => a + b, 0) / classAverages.length;

  const variance = classAverages.reduce((acc, avg) => {
    return acc + Math.pow(avg - overallAverage, 2);
  }, 0) / classAverages.length;

  return Math.sqrt(variance);
}

/**
 * 반별 인원수 분산 계산
 */
export function calculateSizeVariance(assignments: ClassAssignment[]): number {
  const sizes = assignments.map(cls => cls.students.length);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

  const variance = sizes.reduce((acc, size) => {
    return acc + Math.pow(size - avgSize, 2);
  }, 0) / sizes.length;

  return Math.sqrt(variance);
}

/**
 * 출신반 다양성 점수 계산 (높을수록 좋음)
 */
export function calculateOriginDiversity(cls: ClassAssignment): number {
  if (cls.students.length === 0) return 0;

  const originCounts: Record<number, number> = {};
  cls.students.forEach(s => {
    originCounts[s.class_num] = (originCounts[s.class_num] || 0) + 1;
  });

  const originClasses = Object.keys(originCounts).length;
  const maxRatio = Math.max(...Object.values(originCounts)) / cls.students.length;

  // 다양성 점수: 출신반 수가 많고, 최대 비율이 낮을수록 높음
  return originClasses * (1 - maxRatio);
}

/**
 * 배정 결과 통계 계산
 */
export function calculateStatistics(assignments: ClassAssignment[]): AssignmentStatistics {
  const totalStudents = assignments.reduce((sum, cls) => sum + cls.students.length, 0);
  const classCount = assignments.length;
  const avgClassSize = totalStudents / classCount;

  // 반별 통계 (성별 통계는 여학교이므로 모두 여학생으로 설정)
  const genderBalance = assignments.map(cls => ({
    classNum: cls.classNum,
    maleCount: 0,
    femaleCount: cls.students.length,
  }));

  // 특수반 통계 (설정된 경우)
  const specialClassStats = assignments
    .filter(cls => cls.specialClass && cls.specialConfig)
    .map(cls => {
      const targetCount = cls.students.filter(s => {
        if (!s.courseSelections || !cls.specialConfig) return false;

        const allSubjects = [
          ...(s.courseSelections.semester1 || []),
          ...(s.courseSelections.semester2 || []),
        ];

        const matchCount = cls.specialConfig.targetSubjects.filter(subject =>
          allSubjects.some(s => s.includes(subject) || subject.includes(s))
        ).length;

        return matchCount >= cls.specialConfig.minSubjectCount;
      }).length;

      return {
        classNum: cls.classNum,
        targetedCount: targetCount,
        assignedCount: cls.students.length,
      };
    });

  return {
    totalStudents,
    classCount,
    avgClassSize,
    genderBalance,
    specialClassStats: specialClassStats.length > 0 ? specialClassStats : undefined,
  };
}

/**
 * 배정 품질 점수 계산 (0-100)
 */
export function calculateQualityScore(assignments: ClassAssignment[]): {
  overall: number;
  gradeBalance: number;
  sizeBalance: number;
  diversity: number;
  details: string[];
} {
  const details: string[] = [];

  // 1. 성적 균형 점수 (40점)
  const gradeVariance = calculateGradeVariance(assignments);
  const gradeScore = Math.max(0, 40 - gradeVariance * 20);
  if (gradeVariance > BALANCE_THRESHOLDS.gradeVariance) {
    details.push(`⚠️ 반별 성적 편차가 큽니다 (${gradeVariance.toFixed(2)})`);
  } else {
    details.push(`✅ 반별 성적이 균등합니다 (편차: ${gradeVariance.toFixed(2)})`);
  }

  // 2. 인원 균형 점수 (30점)
  const sizeVariance = calculateSizeVariance(assignments);
  const sizeScore = Math.max(0, 30 - sizeVariance * 5);
  if (sizeVariance > BALANCE_THRESHOLDS.sizeVariance) {
    details.push(`⚠️ 반별 인원 편차가 큽니다 (${sizeVariance.toFixed(1)}명)`);
  } else {
    details.push(`✅ 반별 인원이 균등합니다 (편차: ${sizeVariance.toFixed(1)}명)`);
  }

  // 3. 출신반 다양성 점수 (30점)
  const diversityScores = assignments.map(calculateOriginDiversity);
  const avgDiversity = diversityScores.reduce((a, b) => a + b, 0) / diversityScores.length;
  const diversityScore = Math.min(30, avgDiversity * 10);

  const lowDiversityClasses = assignments.filter((cls, idx) => diversityScores[idx] < 1.5);
  if (lowDiversityClasses.length > 0) {
    details.push(`⚠️ ${lowDiversityClasses.length}개 반의 출신반 다양성이 낮습니다`);
  } else {
    details.push(`✅ 모든 반의 출신반 다양성이 양호합니다`);
  }

  const overall = gradeScore + sizeScore + diversityScore;

  return {
    overall: Math.round(overall),
    gradeBalance: Math.round(gradeScore / 40 * 100),
    sizeBalance: Math.round(sizeScore / 30 * 100),
    diversity: Math.round(diversityScore / 30 * 100),
    details,
  };
}

/**
 * 학년별 등급 스케일 감지 (5등급 또는 9등급)
 */
export function detectGradeScale(students: StudentData[]): 5 | 9 {
  const grades = students
    .map(s => (s as any).averageGrade)
    .filter(g => g !== undefined && g !== null);

  if (grades.length === 0) return 9;

  // 5등급 초과하는 성적이 있으면 9등급제
  const maxGrade = Math.max(...grades);
  return maxGrade > 5 ? 9 : 5;
}

/**
 * 반별 상세 통계
 */
export function getClassDetails(cls: ClassAssignment, gradeScale?: 5 | 9): {
  studentCount: number;
  averageGrade: number;
  gradeDistribution: Record<string, number>;
  originDistribution: Record<number, number>;
  gradeScale: 5 | 9;
} {
  const studentCount = cls.students.length;
  const averageGrade = calculateClassAverageGrade(cls.students);

  // 등급 스케일 자동 감지
  const scale = gradeScale ?? detectGradeScale(cls.students);

  // 성적 분포 (5등급제 또는 9등급제에 따라 다름)
  let gradeDistribution: Record<string, number>;

  if (scale === 5) {
    // 5등급제 (1학년)
    gradeDistribution = {
      '1등급': 0,
      '2등급': 0,
      '3등급': 0,
      '4등급': 0,
      '5등급': 0,
    };

    cls.students.forEach(student => {
      const grade = Math.round((student as any).averageGrade ?? 3);
      if (grade <= 1) gradeDistribution['1등급']++;
      else if (grade <= 2) gradeDistribution['2등급']++;
      else if (grade <= 3) gradeDistribution['3등급']++;
      else if (grade <= 4) gradeDistribution['4등급']++;
      else gradeDistribution['5등급']++;
    });
  } else {
    // 9등급제 (2, 3학년)
    gradeDistribution = {
      '상위(1-2)': 0,
      '중상(3-4)': 0,
      '중하(5-6)': 0,
      '하위(7-9)': 0,
    };

    cls.students.forEach(student => {
      const grade = (student as any).averageGrade ?? 5;
      if (grade <= 2) gradeDistribution['상위(1-2)']++;
      else if (grade <= 4) gradeDistribution['중상(3-4)']++;
      else if (grade <= 6) gradeDistribution['중하(5-6)']++;
      else gradeDistribution['하위(7-9)']++;
    });
  }

  // 출신반 분포
  const originDistribution: Record<number, number> = {};
  cls.students.forEach(s => {
    originDistribution[s.class_num] = (originDistribution[s.class_num] || 0) + 1;
  });

  return {
    studentCount,
    averageGrade,
    gradeDistribution,
    originDistribution,
    gradeScale: scale,
  };
}
