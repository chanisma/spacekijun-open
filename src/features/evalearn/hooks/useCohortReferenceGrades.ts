/**
 * 한 학년 전체의 **특정 회차 참고 등급** — 학년 단위 화면(6·9월 모평 비교 등)용.
 *
 * 계산은 `referenceGradeService.computeReferenceGradesForCohort` 단일 출처를 쓴다.
 * 여기서 따로 계산하면 같은 학생의 9월 등급이 개인 화면과 학년 화면에서 달라진다.
 *
 * 마킹 payload 가 커서(학생당 전 회차 답안) **필요할 때만** 받는다 — `enabled` 로 제어한다.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchStudentsWithMocking } from '../services/evalearnService';
import { computeReferenceGradesForCohort } from '../services/referenceGradeService';
import type { ReferenceGrade } from '../utils/referenceGrade';

/** 학적 코드 -> (마킹 과목키 -> 참고 등급) */
export type CohortReferenceGrades = Map<string, Map<string, ReferenceGrade>>;

export function useCohortReferenceGrades(
  /** 현재 학적상 학년(명단을 뽑는 기준) */
  cohortGrade: number | undefined,
  /** 회차 식별 */
  year: number | undefined,
  month: number | undefined,
  /** 그 회차의 응시 학년 */
  examGrade: number | undefined,
  enabled: boolean
) {
  const ready = enabled && cohortGrade != null && year != null && month != null && examGrade != null;

  const query = useQuery({
    queryKey: ['cohort-reference-grades', cohortGrade, year, month, examGrade],
    queryFn: async (): Promise<CohortReferenceGrades> => {
      const students = await fetchStudentsWithMocking(cohortGrade!, null);
      return computeReferenceGradesForCohort(
        students.map((s) => ({ id: s.id, marking: s.mock_marking, results: s.mock_result })),
        year!,
        month!,
        examGrade!
      );
    },
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });

  return {
    referenceGrades: query.data ?? (new Map() as CohortReferenceGrades),
    isLoading: ready && query.isLoading,
  };
}
