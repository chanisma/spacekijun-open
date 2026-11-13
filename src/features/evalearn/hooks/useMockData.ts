import { useState, useCallback, useMemo } from 'react';
import { EvalearnStudent, ExamIdentifier, MockProblem, MarkingTableRow } from '../types';
import { MockMarkingEntry, MockMarkingSubject } from '@/features/evalog/types/student';
import { fetchMockProblems } from '../services/evalearnService';
import { fetchGradeCuts } from '../services/gradeCutService';
import { gradeMarkingSubject, summarizeGradedItems } from '../utils/mockGrading';
import { computeRawScore, computeReferenceGrade, type GradeCut } from '../utils/referenceGrade';
import { getExamGrade } from '../utils/mockResult';
import { toDbSubject } from '../utils/subjectAlias';
import { toast } from '@/lib/toast';

// 과목명 변환은 utils/subjectAlias 로 옮겼다(서비스 계층에서도 필요해 훅에 두면 의존이 뒤집힌다).
// 기존 import 경로를 쓰던 곳이 있어 재수출한다.
export { SUBJECT_ALIAS, toDbSubject } from '../utils/subjectAlias';

export function useMockData(student: EvalearnStudent | null) {
  const [selectedExamIndex, setSelectedExamIndex] = useState<number>(0);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [mockProblems, setMockProblems] = useState<MockProblem[]>([]);
  const [gradeCuts, setGradeCuts] = useState<Map<string, GradeCut>>(new Map());
  const [loadingProblems, setLoadingProblems] = useState(false);

  // Extract available exams from student's mock_marking — 내림차순 정렬 (최신 시험 우선)
  // 1차: academic_year DESC, 2차: exam_month DESC
  const availableExams: ExamIdentifier[] = useMemo(() => {
    if (!student?.mock_marking) return [];

    const exams = student.mock_marking.map((entry) => ({
      academic_year: entry.academic_year,
      exam_grade: entry.exam_grade,
      exam_month: entry.exam_month,
      label: `${entry.academic_year}년 ${entry.exam_month}월 (${entry.exam_grade}학년)`,
    }));

    exams.sort((a, b) => {
      if (a.academic_year !== b.academic_year) return b.academic_year - a.academic_year;
      return b.exam_month - a.exam_month;
    });

    return exams;
  }, [student?.mock_marking]);

  // Current exam entry — selectedExamIndex는 정렬된 availableExams의 위치이므로
  // mock_marking 원본에서 식별자(year/grade/month)로 찾아야 정렬과 어긋나지 않음.
  const currentExam: MockMarkingEntry | null = useMemo(() => {
    if (!student?.mock_marking) return null;
    const target = availableExams[selectedExamIndex];
    if (!target) return null;
    return (
      student.mock_marking.find(
        (e) =>
          e.academic_year === target.academic_year &&
          e.exam_grade === target.exam_grade &&
          e.exam_month === target.exam_month
      ) ?? null
    );
  }, [student?.mock_marking, selectedExamIndex, availableExams]);

  // Available subjects for the current exam
  const availableSubjects: string[] = useMemo(() => {
    if (!currentExam?.subjects) return [];
    return Object.keys(currentExam.subjects).sort();
  }, [currentExam]);

  // Current subject data
  const currentSubjectData: MockMarkingSubject | null = useMemo(() => {
    if (!currentExam?.subjects || !selectedSubject) return null;
    return currentExam.subjects[selectedSubject] ?? null;
  }, [currentExam, selectedSubject]);

  // Load mock problems for enrichment
  const loadMockProblems = useCallback(async () => {
    if (!currentExam || !selectedSubject) {
      setMockProblems([]);
      return;
    }

    setLoadingProblems(true);
    try {
      // 등급컷은 회차 단위 참조 데이터라 문항과 함께 받아 둔다(서비스가 회차별로 캐시).
      const [problems, cuts] = await Promise.all([
        fetchMockProblems(
          currentExam.academic_year,
          currentExam.exam_month,
          currentExam.exam_grade,
          toDbSubject(selectedSubject)
        ),
        fetchGradeCuts(currentExam.academic_year, currentExam.exam_month, currentExam.exam_grade)
          // 등급컷이 없어도 마킹 분석은 그대로 보여야 한다
          .catch(() => new Map<string, GradeCut>()),
      ]);
      setMockProblems(problems);
      setGradeCuts(cuts);
    } catch (err) {
      console.error('Failed to load mock problems:', err);
      toast.error('문항 메타데이터를 불러오는 데 실패했습니다.');
      setMockProblems([]);
      setGradeCuts(new Map());
    } finally {
      setLoadingProblems(false);
    }
  }, [currentExam, selectedSubject]);

  // Build table rows combining marking data + problem metadata.
  // 정오는 mockGrading 단일 출처가 판정한다 — 수학 주관식은 마킹표에 정오가 오지 않아
  // 학생 답안↔정답 대조로 채운다(자세한 근거는 utils/mockGrading.ts).
  const gradedItems = useMemo(() => {
    if (!currentSubjectData) return [];
    const problemMap = new Map(mockProblems.map((p) => [p.problem_number, p]));
    return gradeMarkingSubject(currentSubjectData, problemMap);
  }, [currentSubjectData, mockProblems]);

  const tableRows: MarkingTableRow[] = useMemo(() => {
    const problemMap = new Map(mockProblems.map((p) => [p.problem_number, p]));

    return gradedItems.map((item) => {
      const problem = problemMap.get(item.problemNumber);
      return {
        problemNumber: item.problemNumber,
        studentAnswer: item.studentAnswer,
        isCorrect: item.isCorrect,
        gradeSource: item.source,
        majorCategory: problem?.major_category ?? null,
        subCategory: problem?.sub_category ?? null,
        correctRate: problem?.correct_rate ?? null,
        intention: problem?.intention ?? null,
      };
    });
  }, [gradedItems, mockProblems]);

  // Subject-level summary
  const subjectSummary = useMemo(() => {
    if (!currentSubjectData) return null;
    return summarizeGradedItems(gradedItems);
  }, [currentSubjectData, gradedItems]);

  // Get mock_result for the selected exam
  const examResult = useMemo(() => {
    if (!student?.mock_result || !currentExam) return null;
    return student.mock_result.find(
      (r) =>
        r.academic_year === currentExam.academic_year &&
        r.exam_grade === currentExam.exam_grade &&
        r.exam_month === currentExam.exam_month
    ) ?? null;
  }, [student?.mock_result, currentExam]);

  /**
   * 참고 등급 — **공식 등급이 없을 때만** 낸다.
   *
   * 공식 등급(`mock_result[].grade`)이 있으면 그것이 정본이므로 계산하지 않는다.
   * 배점이 덜 적재된 회차는 `computeReferenceGrade` 가 null 을 돌려주므로(원점수가 틀린 값이라)
   * 화면에 아무것도 뜨지 않는다 — 틀린 등급을 보여주는 것보다 낫다.
   */
  const referenceGrade = useMemo(() => {
    if (!currentSubjectData || !selectedSubject || gradedItems.length === 0) return null;
    if (getExamGrade(examResult?.subjects?.[selectedSubject]) !== null) return null;

    const problemMap = new Map(mockProblems.map((p) => [p.problem_number, p]));
    const raw = computeRawScore(gradedItems, problemMap);
    return computeReferenceGrade(raw, gradeCuts.get(toDbSubject(selectedSubject)));
  }, [currentSubjectData, selectedSubject, gradedItems, mockProblems, gradeCuts, examResult]);

  return {
    availableExams,
    selectedExamIndex,
    setSelectedExamIndex,
    availableSubjects,
    selectedSubject,
    setSelectedSubject,
    currentExam,
    currentSubjectData,
    tableRows,
    subjectSummary,
    examResult,
    mockProblems,
    referenceGrade,
    loadingProblems,
    loadMockProblems,
  };
}
