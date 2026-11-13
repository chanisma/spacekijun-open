/**
 * Subject Analysis Hook - 과목 분석 기능
 * 과목별 통계, 카테고리 분류, 수강 현황 분석
 */

import { useMemo } from 'react';
import type {
  Student,
  SubjectConfiguration,
  SubjectCount,
  CategorizedSubjects,
  StudentViolation,
  MaxCapacitySubjects,
  SubjectEnrollmentData
} from '../types/course.types';
import {
  calculateSubjectCounts,
  getScienceHierarchyViolations,
  getSubjectsAtMaxCapacity,
  calculateEnrollmentData
} from '../utils/dataProcessor';
import {
  DEFAULT_SUBJECT_CATEGORIES,
  convertSubjectConfiguration,
  classifySubjectsByCategories,
  getCategoryDisplayOrder,
  normalizeSubjectName
} from '../utils/subjectUtils';

export interface UseSubjectAnalysisReturn {
  // Subject Categories
  subjectCategories: Record<string, string[]>;
  categoryOrder: string[];

  // Subject Statistics
  subjectCounts: SubjectCount[];
  allSubjects: string[];
  categorizedSubjects: CategorizedSubjects;

  // Analysis Results
  scienceViolations: StudentViolation[];
  maxCapacitySubjects: MaxCapacitySubjects;
  enrollmentData: SubjectEnrollmentData | null;

  // Utilities
  getSubjectCategory: (subject: string) => string;
  getSubjectsInCategory: (category: string) => string[];
}

export function useSubjectAnalysis(
  students: Student[],
  subjectConfiguration: SubjectConfiguration | null
): UseSubjectAnalysisReturn {
  // Convert configuration to categories
  const subjectCategories = useMemo(() => {
    return convertSubjectConfiguration(subjectConfiguration);
  }, [subjectConfiguration]);

  const categoryOrder = useMemo(() => {
    return getCategoryDisplayOrder();
  }, []);

  // Extract all unique subjects from students
  const allSubjects = useMemo(() => {
    const subjectSet = new Set<string>();
    students.forEach(student => {
      student.semester1.forEach(s => subjectSet.add(s));
      student.semester2.forEach(s => subjectSet.add(s));
    });
    return [...subjectSet].sort();
  }, [students]);

  // Categorized subjects
  const categorizedSubjects = useMemo(() => {
    return classifySubjectsByCategories(allSubjects, subjectCategories);
  }, [allSubjects, subjectCategories]);

  // Subject counts
  const subjectCounts = useMemo(() => {
    if (students.length === 0) return [];
    return calculateSubjectCounts(students, subjectCategories);
  }, [students, subjectCategories]);

  // Science hierarchy violations
  const scienceViolations = useMemo(() => {
    if (students.length === 0) return [];
    return getScienceHierarchyViolations(students);
  }, [students]);

  // Enrollment data (must be computed before maxCapacitySubjects)
  const enrollmentData = useMemo((): SubjectEnrollmentData | null => {
    if (students.length === 0 || !subjectConfiguration) {
      return null;
    }
    return calculateEnrollmentData(students, subjectConfiguration);
  }, [students, subjectConfiguration]);

  // Max capacity subjects (depends on enrollmentData)
  const maxCapacitySubjects = useMemo((): MaxCapacitySubjects => {
    if (!enrollmentData) {
      return { semester1: [], semester2: [] };
    }
    return getSubjectsAtMaxCapacity(enrollmentData);
  }, [enrollmentData]);

  // Utility: Get category for a subject
  // 정규화 매칭: 공백·중점·슬래시 표기 차이를 무시 ('경제 수학'≡'경제수학')
  const getSubjectCategory = useMemo(() => {
    const categoryMap = new Map<string, string>();

    Object.entries(subjectCategories).forEach(([category, subjects]) => {
      subjects.forEach(subject => {
        categoryMap.set(normalizeSubjectName(subject), category);
      });
    });

    return (subject: string): string => {
      return categoryMap.get(normalizeSubjectName(subject)) || '기타';
    };
  }, [subjectCategories]);

  // Utility: Get subjects in a category
  const getSubjectsInCategory = useMemo(() => {
    return (category: string): string[] => {
      return subjectCategories[category] || [];
    };
  }, [subjectCategories]);

  return {
    subjectCategories,
    categoryOrder,
    subjectCounts,
    allSubjects,
    categorizedSubjects,
    scienceViolations,
    maxCapacitySubjects,
    enrollmentData,
    getSubjectCategory,
    getSubjectsInCategory
  };
}
