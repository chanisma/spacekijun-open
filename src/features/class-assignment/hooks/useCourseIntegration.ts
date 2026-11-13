import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  StudentData,
  SpecialClassConfig,
  CourseAnalyzeStudent,
} from '../types/class-assignment.types';
import {
  loadResourceStudents,
  type ResourceStudent,
} from '../utils/resourceStudentLoader';

// Session storage key — kept for compatibility with course-analyze page.
// We treat it as a cache; the source of truth is resource + course_selection_*.
const COURSE_DATA_KEY = 'course-analyze-students';

function toCourseAnalyzeStudent(s: ResourceStudent): CourseAnalyzeStudent {
  return {
    id: s.studentCode,
    name: s.name,
    class: s.classNum,
    number: s.number,
    semester1: s.semester1,
    semester2: s.semester2,
  };
}

/**
 * Hook to integrate with course-selection data for special class assignment.
 *
 * Master 학생 리스트는 resource (type='student'),
 * 선택과목 정보는 course_selection_* LEFT JOIN.
 * 미신청자는 semester1/semester2가 빈 배열로 노출됩니다.
 */
export function useCourseIntegration() {
  const { toast } = useToast();
  const [courseStudents, setCourseStudents] = useState<CourseAnalyzeStudent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Load course-selection-aware student list.
   * Order: sessionStorage cache → resource + course_selection LEFT JOIN.
   */
  const loadCourseData = useCallback(async () => {
    setIsLoading(true);

    try {
      const stored = sessionStorage.getItem(COURSE_DATA_KEY);
      if (stored) {
        const data = JSON.parse(stored) as CourseAnalyzeStudent[];
        if (Array.isArray(data) && data.length > 0) {
          setCourseStudents(data);
          return data;
        }
      }

      const all = await loadResourceStudents({ includeSelections: true });
      if (all.length === 0) {
        toast({
          title: '데이터 없음',
          description: 'resource 테이블에 학생 데이터가 없습니다.',
          variant: 'destructive',
        });
        return null;
      }

      const converted = all.map(toCourseAnalyzeStudent);
      sessionStorage.setItem(COURSE_DATA_KEY, JSON.stringify(converted));
      setCourseStudents(converted);

      return converted;
    } catch (error) {
      console.error('Failed to load course data:', error);
      toast({
        title: '데이터 로드 실패',
        description: '학생 데이터를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Enrich student data with course selections.
   * resource 기반이므로 student_code 직접 매칭이 1순위. legacy 형식 대비
   * (반·번호) 매칭도 fallback으로 남깁니다.
   */
  const enrichStudentsWithCourses = useCallback(
    (students: StudentData[], courseData?: CourseAnalyzeStudent[]): StudentData[] => {
      const courses = courseData ?? courseStudents;
      if (courses.length === 0) return students;

      const byCode = new Map<string, CourseAnalyzeStudent>();
      for (const cs of courses) byCode.set(String(cs.id), cs);

      return students.map((student) => {
        const direct = byCode.get(student.student_code);
        const matched =
          direct ??
          courses.find(
            (cs) => cs.class === student.class_num && cs.number === student.number,
          );

        if (!matched) return student;
        return {
          ...student,
          courseSelections: {
            semester1: matched.semester1 ?? [],
            semester2: matched.semester2 ?? [],
          },
        };
      });
    },
    [courseStudents],
  );

  /**
   * Filter students for a special class based on subject selections.
   */
  const filterStudentsForSpecialClass = useCallback(
    (students: StudentData[], specialConfig: SpecialClassConfig): StudentData[] => {
      const { targetSubjects, minSubjectCount = 1 } = specialConfig;

      return students.filter((student) => {
        if (!student.courseSelections) return false;
        const allSubjects = [
          ...(student.courseSelections.semester1 ?? []),
          ...(student.courseSelections.semester2 ?? []),
        ];
        const matchCount = targetSubjects.filter((subject) =>
          allSubjects.some((s) => s.includes(subject) || subject.includes(s)),
        ).length;
        return matchCount >= minSubjectCount;
      });
    },
    [],
  );

  const getAvailableSubjects = useCallback((): string[] => {
    const set = new Set<string>();
    for (const cs of courseStudents) {
      for (const subj of cs.semester1 ?? []) set.add(subj);
      for (const subj of cs.semester2 ?? []) set.add(subj);
    }
    return Array.from(set).sort();
  }, [courseStudents]);

  const getSubjectDistribution = useCallback(
    (students: StudentData[]): Record<string, number> => {
      const distribution: Record<string, number> = {};
      for (const s of students) {
        if (!s.courseSelections) continue;
        const allSubjects = [
          ...(s.courseSelections.semester1 ?? []),
          ...(s.courseSelections.semester2 ?? []),
        ];
        for (const subject of allSubjects) {
          distribution[subject] = (distribution[subject] || 0) + 1;
        }
      }
      return distribution;
    },
    [],
  );

  /**
   * Preset special class configurations for common Korean high school tracks
   */
  const specialClassPresets: SpecialClassConfig[] = [
    {
      classNum: 0,
      name: '과학중점반 (이과)',
      targetSubjects: ['물리학', '화학', '생명과학', '지구과학', '과학탐구실험'],
      minSubjectCount: 2,
    },
    {
      classNum: 0,
      name: '사회중점반 (문과)',
      targetSubjects: ['정치와법', '경제', '사회·문화', '세계지리', '동아시아사', '세계사'],
      minSubjectCount: 2,
    },
    {
      classNum: 0,
      name: '예체능반',
      targetSubjects: ['미술', '음악', '체육', '연극', '무용'],
      minSubjectCount: 1,
    },
  ];

  return {
    courseStudents,
    isLoading,
    loadCourseData,
    enrichStudentsWithCourses,
    filterStudentsForSpecialClass,
    getAvailableSubjects,
    getSubjectDistribution,
    specialClassPresets,
    hasCourseData: courseStudents.length > 0,
  };
}
