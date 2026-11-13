/**
 * Student Filter Hook - 학생 필터링 관리
 * 이름, 반, 과목별 필터링 기능 제공
 */

import { useState, useCallback, useMemo } from 'react';
import type { Student, StudentFilter } from '../types/course.types';
import { filterStudents } from '../utils/dataProcessor';

export interface UseStudentFilterReturn {
  // Filter State
  filters: StudentFilter;
  setFilters: (filters: StudentFilter) => void;
  resetFilters: () => void;

  // Individual Filter Setters
  setNameQuery: (query: string) => void;
  setClassFilter: (classNumber: number | undefined) => void;
  setSubjectFilter: (subject: string | undefined, semester?: 'semester1' | 'semester2' | 'both') => void;

  // Computed
  filteredStudents: Student[];
  availableClasses: number[];
  hasActiveFilters: boolean;
}

const initialFilters: StudentFilter = {
  grade: undefined,
  classNumber: undefined,
  nameQuery: undefined,
  hasSubject: undefined,
  semester: 'both'
};

export function useStudentFilter(students: Student[]): UseStudentFilterReturn {
  const [filters, setFiltersState] = useState<StudentFilter>(initialFilters);

  // Filter Setters
  const setFilters = useCallback((newFilters: StudentFilter) => {
    setFiltersState(newFilters);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters);
  }, []);

  const setNameQuery = useCallback((query: string) => {
    setFiltersState(prev => ({
      ...prev,
      nameQuery: query || undefined
    }));
  }, []);

  const setClassFilter = useCallback((classNumber: number | undefined) => {
    setFiltersState(prev => ({
      ...prev,
      classNumber
    }));
  }, []);

  const setSubjectFilter = useCallback((
    subject: string | undefined,
    semester: 'semester1' | 'semester2' | 'both' = 'both'
  ) => {
    setFiltersState(prev => ({
      ...prev,
      hasSubject: subject,
      semester
    }));
  }, []);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    if (students.length === 0) return [];

    return filterStudents(students, {
      grade: filters.grade,
      classNumber: filters.classNumber,
      searchTerm: filters.nameQuery,
      subject: filters.hasSubject,
      semester: filters.semester
    });
  }, [students, filters]);

  // Available Classes
  const availableClasses = useMemo(() => {
    const classSet = new Set<number>();
    students.forEach(student => {
      if (student.class) classSet.add(student.class);
    });
    return [...classSet].sort((a, b) => a - b);
  }, [students]);

  // Has Active Filters
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.nameQuery ||
      filters.classNumber ||
      filters.hasSubject
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    resetFilters,
    setNameQuery,
    setClassFilter,
    setSubjectFilter,
    filteredStudents,
    availableClasses,
    hasActiveFilters
  };
}
