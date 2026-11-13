/**
 * Round Comparison Hook - 차수별 비교 기능
 * 학생들의 과목 선택 변경 사항 추적
 */

import { useState, useCallback, useMemo } from 'react';
import type { Student, StudentChange, RoundComparison } from '../types/course.types';
import { getStudentsWithSameSubjectsInBothSemesters } from '../utils/dataProcessor';

export interface UseRoundComparisonReturn {
  // Selection State
  round1: number | null;
  round2: number | null;
  setRound1: (round: number | null) => void;
  setRound2: (round: number | null) => void;

  // Comparison Results
  comparison: RoundComparison | null;
  changedStudents: StudentChange[];
  unchangedStudents: Student[];

  // Statistics
  totalChanges: number;
  additionCount: number;
  removalCount: number;

  // Actions
  compareRounds: () => void;
  clearComparison: () => void;
}

export function useRoundComparison(
  gradeRoundGroups: Record<string, Student[]>,
  currentGrade: number,
  availableRounds: number[]
): UseRoundComparisonReturn {
  const [round1, setRound1] = useState<number | null>(null);
  const [round2, setRound2] = useState<number | null>(null);

  // Get students for a specific round
  const getStudentsForRound = useCallback((round: number): Student[] => {
    const key = `${currentGrade}-${round}`;
    return gradeRoundGroups[key] || [];
  }, [gradeRoundGroups, currentGrade]);

  // Compare two student lists
  const compareStudentSubjects = useCallback((
    oldStudent: Student,
    newStudent: Student
  ): StudentChange => {
    const oldSubjects = new Set([...oldStudent.semester1, ...oldStudent.semester2]);
    const newSubjects = new Set([...newStudent.semester1, ...newStudent.semester2]);

    const added: string[] = [];
    const removed: string[] = [];
    const unchanged: string[] = [];

    // Find added subjects
    newSubjects.forEach(subject => {
      if (!oldSubjects.has(subject)) {
        added.push(subject);
      } else {
        unchanged.push(subject);
      }
    });

    // Find removed subjects
    oldSubjects.forEach(subject => {
      if (!newSubjects.has(subject)) {
        removed.push(subject);
      }
    });

    return {
      student: newStudent,
      added,
      removed,
      unchanged
    };
  }, []);

  // Comparison Results
  const comparison = useMemo((): RoundComparison | null => {
    if (round1 === null || round2 === null) return null;

    const students1 = getStudentsForRound(round1);
    const students2 = getStudentsForRound(round2);

    if (students1.length === 0 || students2.length === 0) return null;

    return {
      round1: { roundNumber: round1, students: students1 },
      round2: { roundNumber: round2, students: students2 },
      changes: []
    };
  }, [round1, round2, getStudentsForRound]);

  // Changed Students
  const changedStudents = useMemo((): StudentChange[] => {
    if (round1 === null || round2 === null) return [];

    const students1 = getStudentsForRound(round1);
    const students2 = getStudentsForRound(round2);

    // Create map for quick lookup
    const student1Map = new Map<string, Student>();
    students1.forEach(s => {
      const key = `${s.class}-${s.number}`;
      student1Map.set(key, s);
    });

    const changes: StudentChange[] = [];

    students2.forEach(newStudent => {
      const key = `${newStudent.class}-${newStudent.number}`;
      const oldStudent = student1Map.get(key);

      if (oldStudent) {
        const change = compareStudentSubjects(oldStudent, newStudent);
        if (change.added.length > 0 || change.removed.length > 0) {
          changes.push(change);
        }
      }
    });

    return changes;
  }, [round1, round2, getStudentsForRound, compareStudentSubjects]);

  // Unchanged Students (students with same subjects in both semesters)
  const unchangedStudents = useMemo((): Student[] => {
    if (round2 === null) return [];
    const students = getStudentsForRound(round2);
    return getStudentsWithSameSubjectsInBothSemesters(students);
  }, [round2, getStudentsForRound]);

  // Statistics
  const totalChanges = useMemo(() => changedStudents.length, [changedStudents]);

  const additionCount = useMemo(() => {
    return changedStudents.reduce((sum, change) => sum + change.added.length, 0);
  }, [changedStudents]);

  const removalCount = useMemo(() => {
    return changedStudents.reduce((sum, change) => sum + change.removed.length, 0);
  }, [changedStudents]);

  // Actions
  const compareRounds = useCallback(() => {
    // Auto-select rounds if not set
    if (availableRounds.length >= 2) {
      if (round1 === null) {
        setRound1(availableRounds[availableRounds.length - 2]);
      }
      if (round2 === null) {
        setRound2(availableRounds[availableRounds.length - 1]);
      }
    }
  }, [availableRounds, round1, round2]);

  const clearComparison = useCallback(() => {
    setRound1(null);
    setRound2(null);
  }, []);

  return {
    round1,
    round2,
    setRound1,
    setRound2,
    comparison,
    changedStudents,
    unchangedStudents,
    totalChanges,
    additionCount,
    removalCount,
    compareRounds,
    clearComparison
  };
}
