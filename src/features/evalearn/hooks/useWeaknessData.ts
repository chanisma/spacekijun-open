import { useState, useCallback, useMemo } from 'react';
import { EvalearnStudent, MockProblem } from '../types';
import { fetchMockProblems } from '../services/evalearnService';
import { toDbSubject } from './useMockData';
import { sortSubjects } from '../utils/subjectOrder';
import {
  classifyDifficulty,
  DIFFICULTY_WEIGHT,
  DifficultyBand,
} from '../utils/difficulty';
import { monthsBetween, recencyWeight } from '../utils/timeDecay';
import { gradeMarkingSubject } from '../utils/mockGrading';
import {
  CategoryAggregate,
  CategoryStat as NewCategoryStat,
  ensureAggregate,
  ensureExamSlot,
  finalizeStats,
} from '../utils/weaknessScore';
import { toast } from '@/lib/toast';

export type { CategoryStat, TimelinePoint } from '../utils/weaknessScore';

/** 특정 소영역에 해당하는 개별 문항 정보 */
export interface ProblemDetail {
  examLabel: string;
  problemNumber: number;
  isCorrect: boolean;
  studentAnswer: number | null;
  correctRate: string | null;
  intention: string | null;
  majorCategory: string;
  subCategory: string;
}

/**
 * 전 회차의 오답을 영역별로 집계하는 hook.
 * 선택된 과목에 대해 필터된 시험 회차를 순회하여
 * mock_problems에서 major_category/sub_category를 매칭한 뒤 오답률·난이도 분포·시계열·취약도 점수를 계산한다.
 */
export function useWeaknessData(student: EvalearnStudent | null) {
  const [selectedSubject, setSelectedSubjectState] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [categories, setCategories] = useState<NewCategoryStat[]>([]);
  const [problemDetails, setProblemDetails] = useState<ProblemDetail[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableGrades: number[] = useMemo(() => {
    if (!student?.mock_marking) return [];
    const grades = new Set<number>();
    for (const entry of student.mock_marking) {
      grades.add(entry.exam_grade);
    }
    return Array.from(grades).sort();
  }, [student?.mock_marking]);

  const allSubjects: string[] = useMemo(() => {
    if (!student?.mock_marking) return [];
    const subjectSet = new Set<string>();
    for (const entry of student.mock_marking) {
      if (selectedGrade != null && entry.exam_grade !== selectedGrade) continue;
      if (entry.subjects) {
        for (const subj of Object.keys(entry.subjects)) {
          subjectSet.add(subj);
        }
      }
    }
    return sortSubjects(Array.from(subjectSet));
  }, [student?.mock_marking, selectedGrade]);

  const analyze = useCallback(async (subject: string) => {
    if (!student?.mock_marking) return;

    setSelectedSubjectState(subject);
    setSelectedCategory(null);
    setLoading(true);

    try {
      const filteredEntries = student.mock_marking.filter(
        (entry) => selectedGrade == null || entry.exam_grade === selectedGrade
      );

      // 회차 메타 병렬 로드
      const problemMapsByExam = await Promise.all(
        filteredEntries.map(async (entry) => {
          const problems = await fetchMockProblems(
            entry.academic_year,
            entry.exam_month,
            entry.exam_grade,
            toDbSubject(subject)
          );
          const map = new Map<number, MockProblem>();
          for (const p of problems) map.set(p.problem_number, p);
          return { entry, map };
        })
      );

      const categoryMap = new Map<string, CategoryAggregate>();
      const allDetails: ProblemDetail[] = [];

      for (const { entry, map: problemMap } of problemMapsByExam) {
        const subjData = entry.subjects[subject];
        if (!subjData) continue;

        const monthsAgo = monthsBetween(entry.academic_year, entry.exam_month);
        const decay = recencyWeight(monthsAgo);
        const examKey = `${entry.academic_year}-${entry.exam_month}`;
        const examLabel = `${entry.academic_year}년 ${entry.exam_month}월`;

        // 정오 판정은 mockGrading 단일 출처. 종전엔 `correct[i] == null`이면 건너뛰어
        // 수학 주관식(1·2학년 22~30, 3학년 16~22·29~30)이 취약점 분석에서 통째로 빠져 있었다.
        const graded = gradeMarkingSubject(subjData, problemMap);
        for (const item of graded) {
          const problem = problemMap.get(item.problemNumber);
          if (!problem) continue;
          const correctVal = item.isCorrect;
          if (correctVal == null) continue;

          const major = problem.major_category || '기타';
          const sub = problem.sub_category || '기타';
          const key = `${major}|${sub}`;
          const band: DifficultyBand = classifyDifficulty(problem.correct_rate);
          const agg = ensureAggregate(categoryMap, key, major, sub);
          const examSlot = ensureExamSlot(
            agg.byExam,
            examKey,
            entry.academic_year,
            entry.exam_month
          );

          agg.total += 1;
          agg.byDifficulty[band].total += 1;
          examSlot.total += 1;
          examSlot.byDifficulty[band].total += 1;

          if (correctVal === false) {
            agg.wrong += 1;
            agg.byDifficulty[band].wrong += 1;
            examSlot.wrong += 1;
            examSlot.byDifficulty[band].wrong += 1;
            agg.score += decay * DIFFICULTY_WEIGHT[band];
          }

          allDetails.push({
            examLabel,
            problemNumber: item.problemNumber,
            isCorrect: correctVal,
            studentAnswer: item.studentAnswer,
            correctRate: problem.correct_rate,
            intention: problem.intention,
            majorCategory: major,
            subCategory: sub,
          });
        }
      }

      const result: NewCategoryStat[] = [];
      for (const agg of categoryMap.values()) {
        result.push(finalizeStats(agg));
      }

      // 기본 정렬: score DESC (TOP 추출). 차트 정렬은 컴포넌트가 별도로 useMemo.
      result.sort((a, b) => b.score - a.score);

      setCategories(result);
      setProblemDetails(allDetails);
    } catch (err) {
      console.error('Weakness analysis failed:', err);
      toast.error('취약점 분석 중 오류가 발생했습니다.');
      setCategories([]);
      setProblemDetails([]);
    } finally {
      setLoading(false);
    }
  }, [student, selectedGrade]);

  const filteredProblems: ProblemDetail[] = useMemo(() => {
    if (!selectedCategory) return [];
    const [major, sub] = selectedCategory.split('|');
    return problemDetails.filter(
      (p) => p.majorCategory === major && p.subCategory === sub
    );
  }, [selectedCategory, problemDetails]);

  const handleBarClick = useCallback((subCategory: string, majorCategory: string) => {
    const key = `${majorCategory}|${subCategory}`;
    setSelectedCategory((prev) => (prev === key ? null : key));
  }, []);

  return {
    allSubjects,
    selectedSubject,
    setSelectedSubject: analyze,
    availableGrades,
    selectedGrade,
    setSelectedGrade,
    categories,
    loading,
    selectedCategory,
    filteredProblems,
    handleBarClick,
  };
}
