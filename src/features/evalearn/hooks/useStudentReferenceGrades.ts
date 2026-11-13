/**
 * 한 학생의 **모든 회차 × 모든 과목** 참고 등급.
 *
 * 계산 자체는 `services/referenceGradeService` 가 한다 — admission-wishlist 등 evalearn 밖에서도
 * 같은 값을 써야 하기 때문이다. 이 훅은 그 서비스를 React 수명주기에 붙이기만 한다.
 */
import { useEffect, useState } from 'react';
import type { EvalearnStudent } from '../types';
import {
  computeReferenceGradesFor,
  examKey,
  type ReferenceGradeMap,
} from '../services/referenceGradeService';

export { examKey };
export type { ReferenceGradeMap };

export function useStudentReferenceGrades(student: EvalearnStudent | null): ReferenceGradeMap {
  const [map, setMap] = useState<ReferenceGradeMap>(new Map());

  useEffect(() => {
    if (!student?.mock_marking?.length) { setMap(new Map()); return; }
    let cancelled = false;

    computeReferenceGradesFor(student.mock_marking, student.mock_result)
      .then((next) => { if (!cancelled) setMap(next); })
      .catch((e) => {
        console.error('참고 등급 계산 실패', e);
        if (!cancelled) setMap(new Map());
      });

    return () => { cancelled = true; };
  }, [student?.id, student?.mock_marking, student?.mock_result]);

  return map;
}
