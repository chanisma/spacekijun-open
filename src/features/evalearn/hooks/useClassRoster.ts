/**
 * 학급 학생 목록 — 한 회차의 학생별 요약 행.
 *
 * 참고 등급은 `computeReferenceGradesForCohort` 단일 출처로 계산한다(개인 화면·6·9월 모평과
 * 같은 값). `useCohortReferenceGrades` 는 **학년 전체**를 다시 받아 오므로 쓰지 않는다 —
 * 학급 명단은 `useCohortData` 가 이미 마킹·성적까지 들고 있다.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EvalearnStudent } from '../types';
import type { CohortExam } from './useCohortData';
import { computeReferenceGradesForCohort } from '../services/referenceGradeService';
import { buildRosterRows } from '../utils/classRoster';
import type { ReferenceGrade } from '../utils/referenceGrade';

const EMPTY_REFS = new Map<string, Map<string, ReferenceGrade>>();

export function useClassRoster(
  students: EvalearnStudent[],
  exam: CohortExam | null,
  /** 목록 탭을 실제로 볼 때만 계산한다(회차 문항·등급컷 왕복이 생긴다) */
  enabled: boolean
) {
  // 명단이 바뀌면 다시 계산해야 하므로 학생 id 들을 키에 넣는다(객체 자체는 매번 새로 온다)
  const idsKey = useMemo(() => students.map((s) => s.id).join(','), [students]);

  const refQuery = useQuery({
    queryKey: ['class-roster-reference', exam?.academic_year, exam?.exam_month, exam?.exam_grade, idsKey],
    queryFn: () =>
      computeReferenceGradesForCohort(
        students.map((s) => ({ id: s.id, marking: s.mock_marking, results: s.mock_result })),
        exam!.academic_year,
        exam!.exam_month,
        exam!.exam_grade
      ),
    enabled: enabled && exam != null && students.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(
    () => (exam ? buildRosterRows(students, exam, refQuery.data ?? EMPTY_REFS) : []),
    [students, exam, refQuery.data]
  );

  return { rows, loadingReference: enabled && refQuery.isLoading };
}
