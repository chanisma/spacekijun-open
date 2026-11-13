/**
 * Combination Search Hook - 과목 조합 검색
 * 특정 과목 조합을 가진 학생 검색
 */

import { useState, useCallback, useMemo } from 'react';
import type { Student } from '../types/course.types';
import { findStudentsBySubjectCombination } from '../utils/dataProcessor';

export interface CombinationSearchResult {
  students: Student[];
  matchCount: number;
  searchedSubjects: string[];
  semester: 'semester1' | 'semester2' | 'both';
}

export interface UseCombinationSearchReturn {
  // Search State
  selectedSubjects: string[];
  searchSemester: 'semester1' | 'semester2' | 'both';
  matchMode: 'all' | 'any';

  // Actions
  addSubject: (subject: string) => void;
  removeSubject: (subject: string) => void;
  clearSubjects: () => void;
  toggleSubject: (subject: string) => void;
  setSearchSemester: (semester: 'semester1' | 'semester2' | 'both') => void;
  setMatchMode: (mode: 'all' | 'any') => void;

  // Results
  searchResults: CombinationSearchResult | null;
  isSearching: boolean;
}

export function useCombinationSearch(students: Student[]): UseCombinationSearchReturn {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [searchSemester, setSearchSemester] = useState<'semester1' | 'semester2' | 'both'>('both');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');

  // Actions
  const addSubject = useCallback((subject: string) => {
    setSelectedSubjects(prev => {
      if (prev.includes(subject)) return prev;
      return [...prev, subject];
    });
  }, []);

  const removeSubject = useCallback((subject: string) => {
    setSelectedSubjects(prev => prev.filter(s => s !== subject));
  }, []);

  const clearSubjects = useCallback(() => {
    setSelectedSubjects([]);
  }, []);

  const toggleSubject = useCallback((subject: string) => {
    setSelectedSubjects(prev => {
      if (prev.includes(subject)) {
        return prev.filter(s => s !== subject);
      }
      return [...prev, subject];
    });
  }, []);

  // Search Results
  const searchResults = useMemo((): CombinationSearchResult | null => {
    if (selectedSubjects.length === 0 || students.length === 0) {
      return null;
    }

    const matchedStudents = findStudentsBySubjectCombination(
      students,
      selectedSubjects,
      searchSemester,
      matchMode
    );

    return {
      students: matchedStudents,
      matchCount: matchedStudents.length,
      searchedSubjects: [...selectedSubjects],
      semester: searchSemester
    };
  }, [students, selectedSubjects, searchSemester, matchMode]);

  return {
    selectedSubjects,
    searchSemester,
    matchMode,
    addSubject,
    removeSubject,
    clearSubjects,
    toggleSubject,
    setSearchSemester,
    setMatchMode,
    searchResults,
    isSearching: false // Synchronous operation
  };
}
