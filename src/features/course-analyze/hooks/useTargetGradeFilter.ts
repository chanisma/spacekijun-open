/**
 * useTargetGradeFilter — 과목 학년(target_grade) 분리 필터 공용 훅
 *
 * 1학년 학생이 (예: 2027학년도) 신청할 때 2학년 과목과 3학년 과목을 함께 고르므로,
 * 한 라운드 안에 서로 다른 target_grade(2·3) 과목이 섞인다. 이 훅은 각 분석 탭이
 * "전체 / 2학년 과목 / 3학년 과목"을 토글로 분리해 볼 수 있도록
 *   - subject_name → target_grade 매핑(useSubjectTargetGradeMap)
 *   - 선택 상태(selected/setSelected)
 *   - 과목명 기준 통과 여부 판정(matches)
 * 를 한 곳에서 제공한다.
 *
 * 일반 학년(2·3학년) 라운드는 target_grade가 단일하므로 hasMultiple === false →
 * 호출부에서 토글 UI를 렌더하지 않으면 기존 동작과 100% 동일하다.
 */

import { useCallback, useState } from 'react';
import { useSubjectTargetGradeMap } from './useSubjectTargetGradeMap';

export interface UseTargetGradeFilterReturn {
  /** subject_name → target_grade(2|3) 매핑 + 사용 가능한 target grade 목록 */
  data: { map: Record<string, number>; targetGrades: number[] } | undefined;
  /** 라운드에 존재하는 distinct target grades (예: [2, 3]) */
  targetGrades: number[];
  /** target grade가 2개 이상일 때만 true → 토글 노출 조건 */
  hasMultiple: boolean;
  /** 현재 선택된 target grade (null = 전체) */
  selected: number | null;
  setSelected: (grade: number | null) => void;
  /** 과목이 현재 필터를 통과하는지 (전체이거나 단일 학년이면 항상 true) */
  matches: (subjectName: string) => boolean;
  /** 과목의 target grade 조회 (없으면 undefined) */
  gradeOf: (subjectName: string) => number | undefined;
}

export function useTargetGradeFilter(
  academicYear: number | null,
  currentGrade: number,
): UseTargetGradeFilterReturn {
  const { data } = useSubjectTargetGradeMap(academicYear, currentGrade);
  const [selected, setSelected] = useState<number | null>(null);

  const targetGrades = data?.targetGrades ?? [];
  const hasMultiple = targetGrades.length > 1;

  const matches = useCallback(
    (subjectName: string): boolean => {
      if (!hasMultiple || selected === null || !data) return true;
      return data.map[subjectName] === selected;
    },
    [hasMultiple, selected, data],
  );

  const gradeOf = useCallback(
    (subjectName: string): number | undefined => data?.map[subjectName],
    [data],
  );

  return { data, targetGrades, hasMultiple, selected, setSelected, matches, gradeOf };
}
