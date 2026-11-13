import { MockMarkingEntry, MockExamResult } from '@/features/evalog/types/student';
import type { GradeSource } from '../utils/mockGrading';

// Re-export for convenience
export type { MockMarkingEntry, MockExamResult };
export type { GradeSource };
export type { MockMarkingSubject, MockExamSubjectScore } from '@/features/evalog/types/student';

// Student type for evalearn (simplified from evalog)
export interface EvalearnStudent {
  id: string;           // student_basic_info.id (student code like "00-00472")
  name: string;
  grade: number;
  classNum: number;
  number: number;       // 번호
  mock_marking: MockMarkingEntry[] | null;
  mock_result: MockExamResult[] | null;
}

// mock_problems table row
export interface MockProblem {
  id: string;
  year: number;
  month: number;
  student_grade: number;
  subject: string;
  problem_number: number;
  major_category: string | null;
  sub_category: string | null;
  correct_rate: string | null;
  intention: string | null;
  info: Record<string, unknown> | null;
  // fetchMockProblems 는 select('*') 라 아래 컬럼도 항상 실려 온다.
  // 종전엔 타입에만 빠져 있어 정오 fallback(mockGrading)이 answer 를 못 읽었다.
  answer: string | null;
  answer_type: string | null;
  /** 문항 배점. 리로스쿨 CSV 에 배점이 없어 일부 회차는 기본값 2 로 들어가 있다. */
  point: number | null;
  /** 보기별 선택 비율 `{"1":"12%",...}`. 주관식은 null. */
  choice_rates: Record<string, string> | null;
}

// Exam identifier for dropdown selection
export interface ExamIdentifier {
  academic_year: number;
  exam_grade: number;
  exam_month: number;
  label: string; // e.g. "2025년 9월 (1학년)"
}

// Combined row for the marking data table
export interface MarkingTableRow {
  problemNumber: number;
  studentAnswer: number | null;
  isCorrect: boolean | null;
  /** 정오의 출처. 'answerKey' = 마킹표에 정오가 없어 정답과 대조해 유도한 값(수학 주관식). */
  gradeSource: GradeSource;
  // From mock_problems (may be null if no match)
  majorCategory: string | null;
  subCategory: string | null;
  correctRate: string | null;
  intention: string | null;
}
