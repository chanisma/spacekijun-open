/**
 * Course Analyze Context - 전역 상태 공유
 * 데이터, 필터, 분석 결과를 컴포넌트 간 공유
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useCourseData, type UseCourseDataReturn } from '../hooks/useCourseData';
import { useStudentFilter, type UseStudentFilterReturn } from '../hooks/useStudentFilter';
import { useSubjectAnalysis, type UseSubjectAnalysisReturn } from '../hooks/useSubjectAnalysis';
import { useCombinationSearch, type UseCombinationSearchReturn } from '../hooks/useCombinationSearch';
import { useRoundComparison, type UseRoundComparisonReturn } from '../hooks/useRoundComparison';
import type { AnalysisTab } from '../types/course.types';

export interface CourseAnalyzeContextValue {
  // Core Data
  courseData: UseCourseDataReturn;

  // Filtering
  studentFilter: UseStudentFilterReturn;

  // Analysis
  subjectAnalysis: UseSubjectAnalysisReturn;

  // Search
  combinationSearch: UseCombinationSearchReturn;

  // Comparison
  roundComparison: UseRoundComparisonReturn;

  // UI State
  activeTab: AnalysisTab;
  setActiveTab: (tab: AnalysisTab) => void;
}

const CourseAnalyzeContext = createContext<CourseAnalyzeContextValue | null>(null);

export interface CourseAnalyzeProviderProps {
  children: ReactNode;
}

export function CourseAnalyzeProvider({ children }: CourseAnalyzeProviderProps) {
  // Core data hook
  const courseData = useCourseData();

  // Filtering with current students
  const studentFilter = useStudentFilter(courseData.currentStudents);

  // Subject analysis
  const subjectAnalysis = useSubjectAnalysis(
    courseData.currentStudents,
    courseData.subjectConfiguration
  );

  // Combination search
  const combinationSearch = useCombinationSearch(courseData.currentStudents);

  // Round comparison
  const roundComparison = useRoundComparison(
    courseData.gradeRoundGroups,
    courseData.currentGrade,
    courseData.availableRounds
  );

  // UI State
  const [activeTab, setActiveTab] = React.useState<AnalysisTab>('subject-count');

  // Memoized context value
  const contextValue = useMemo<CourseAnalyzeContextValue>(() => ({
    courseData,
    studentFilter,
    subjectAnalysis,
    combinationSearch,
    roundComparison,
    activeTab,
    setActiveTab
  }), [
    courseData,
    studentFilter,
    subjectAnalysis,
    combinationSearch,
    roundComparison,
    activeTab
  ]);

  return (
    <CourseAnalyzeContext.Provider value={contextValue}>
      {children}
    </CourseAnalyzeContext.Provider>
  );
}

export function useCourseAnalyze(): CourseAnalyzeContextValue {
  const context = useContext(CourseAnalyzeContext);

  if (!context) {
    throw new Error('useCourseAnalyze must be used within a CourseAnalyzeProvider');
  }

  return context;
}

// Convenience hooks for specific parts of context
export function useCourseAnalyzeData() {
  const { courseData } = useCourseAnalyze();
  return courseData;
}

export function useCourseAnalyzeFilter() {
  const { studentFilter } = useCourseAnalyze();
  return studentFilter;
}

export function useCourseAnalyzeSubjects() {
  const { subjectAnalysis } = useCourseAnalyze();
  return subjectAnalysis;
}

export function useCourseAnalyzeSearch() {
  const { combinationSearch } = useCourseAnalyze();
  return combinationSearch;
}

export function useCourseAnalyzeComparison() {
  const { roundComparison } = useCourseAnalyze();
  return roundComparison;
}
