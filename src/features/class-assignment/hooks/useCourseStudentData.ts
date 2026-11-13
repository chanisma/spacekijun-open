/**
 * useCourseStudentData (Subject Mode)
 *
 * Master 학생 리스트는 resource (type='student'),
 * 성적은 student_basic_info.academic_development,
 * 선택과목은 course_selection_* LEFT JOIN — 미신청자도 포함됩니다.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Student } from '../types/subject-assignment.types';
import {
  loadResourceStudents,
  type ResourceStudent,
} from '../utils/resourceStudentLoader';

export interface UseCourseStudentDataReturn {
  currentStudents: Student[];
  currentGrade: number;
  setCurrentGrade: (grade: number) => void;
  availableGrades: number[];
  isLoading: boolean;
  /**
   * 현재 학년의 selection이 작성된 학년도 (학생들 중 가장 빈도 높은 academic_year).
   * selection이 없거나 불명이면 0.
   */
  selectionAcademicYear: number;
}

function toStudent(s: ResourceStudent): Student {
  return {
    id: s.studentCode,
    name: s.name,
    contact: '',
    submitTime: '',
    year: s.grade,
    class: s.classNum,
    number: s.number,
    round: s.round,
    semester1: s.semester1,
    semester2: s.semester2,
    grade: s.averageGrade,
  };
}

/** 학년별로 가장 빈도 높은 selectionAcademicYear를 추출. */
function dominantAcademicYear(items: ResourceStudent[]): number {
  const counts = new Map<number, number>();
  for (const s of items) {
    if (s.selectionAcademicYear > 0) {
      counts.set(s.selectionAcademicYear, (counts.get(s.selectionAcademicYear) ?? 0) + 1);
    }
  }
  let bestYear = 0;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      bestYear = year;
      bestCount = count;
    }
  }
  return bestYear;
}

export function useCourseStudentData(): UseCourseStudentDataReturn {
  const [studentsByGrade, setStudentsByGrade] = useState<Record<number, Student[]>>({});
  const [academicYearByGrade, setAcademicYearByGrade] = useState<Record<number, number>>({});
  const [availableGrades, setAvailableGrades] = useState<number[]>([]);
  const [currentGrade, setCurrentGrade] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const all = await loadResourceStudents({ includeSelections: true });
        const byGrade: Record<number, Student[]> = {};
        const rawByGrade: Record<number, ResourceStudent[]> = {};
        const gradeSet = new Set<number>();

        for (const s of all) {
          if (s.grade <= 0) continue;
          gradeSet.add(s.grade);
          (byGrade[s.grade] ??= []).push(toStudent(s));
          (rawByGrade[s.grade] ??= []).push(s);
        }

        const yearByGrade: Record<number, number> = {};
        for (const [grade, list] of Object.entries(rawByGrade)) {
          yearByGrade[Number(grade)] = dominantAcademicYear(list);
        }

        setStudentsByGrade(byGrade);
        setAcademicYearByGrade(yearByGrade);
        const grades = Array.from(gradeSet).sort((a, b) => a - b);
        setAvailableGrades(grades);
        if (grades.length > 0) setCurrentGrade(grades[0]);
      } catch (err) {
        console.error('Failed to load students from resource:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const currentStudents = useMemo(
    () => studentsByGrade[currentGrade] ?? [],
    [studentsByGrade, currentGrade],
  );

  const selectionAcademicYear = useMemo(
    () => academicYearByGrade[currentGrade] ?? 0,
    [academicYearByGrade, currentGrade],
  );

  const handleSetCurrentGrade = useCallback((grade: number) => {
    setCurrentGrade(grade);
  }, []);

  return {
    currentStudents,
    currentGrade,
    setCurrentGrade: handleSetCurrentGrade,
    availableGrades,
    isLoading,
    selectionAcademicYear,
  };
}
