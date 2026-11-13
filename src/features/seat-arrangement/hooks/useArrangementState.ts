import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Arrangement,
  ArrangementCurrentState,
  Constraint,
  SeatLayout,
  SeatStudent,
} from '../types';
import { assignSeats, swapSeats } from '../utils/assignmentAlgorithm';
import { loadCurrent, saveCurrent } from '../utils/seatStorage';
import { newSeed } from '../utils/seedRandom';

interface UseArrangementStateOpts {
  layout: SeatLayout | undefined;
  students: SeatStudent[];
  constraints: Constraint[];
  classKey: string | null;
}

export interface UseArrangementStateResult {
  arrangement: Arrangement | undefined;
  setArrangement: (arr: Arrangement | undefined) => void;
  regenerate: (seed?: number) => Arrangement | undefined;
  swap: (seatA: string, seatB: string) => void;
  reset: () => void;
}

export function useArrangementState({
  layout,
  students,
  constraints,
  classKey,
}: UseArrangementStateOpts): UseArrangementStateResult {
  const [persisted, setPersisted] = useState<ArrangementCurrentState>(() =>
    loadCurrent()
  );

  // 현재 classKey + layoutId에 해당하는 저장된 arrangement만 사용
  const arrangement = useMemo<Arrangement | undefined>(() => {
    if (!persisted.arrangement) return undefined;
    if (classKey && persisted.classKey !== classKey) return undefined;
    if (layout && persisted.layoutId !== layout.id) return undefined;
    return persisted.arrangement;
  }, [persisted, classKey, layout]);

  const writeState = useCallback((state: ArrangementCurrentState) => {
    setPersisted(state);
    saveCurrent(state);
  }, []);

  const setArrangement: UseArrangementStateResult['setArrangement'] = useCallback(
    (arr) => {
      writeState({
        classKey: classKey ?? undefined,
        layoutId: layout?.id,
        arrangement: arr,
      });
    },
    [classKey, layout?.id, writeState]
  );

  const regenerate: UseArrangementStateResult['regenerate'] = useCallback(
    (seed) => {
      if (!layout || students.length === 0 || !classKey) return undefined;
      const next = assignSeats(layout, students, constraints, {
        seed: seed ?? newSeed(),
      });
      next.classKey = classKey;
      writeState({
        classKey,
        layoutId: layout.id,
        arrangement: next,
      });
      return next;
    },
    [layout, students, constraints, classKey, writeState]
  );

  const swap: UseArrangementStateResult['swap'] = useCallback(
    (seatA, seatB) => {
      if (!arrangement) return;
      const updated = swapSeats(arrangement, seatA, seatB);
      writeState({
        classKey: classKey ?? undefined,
        layoutId: layout?.id,
        arrangement: updated,
      });
    },
    [arrangement, classKey, layout?.id, writeState]
  );

  const reset: UseArrangementStateResult['reset'] = useCallback(() => {
    writeState({
      classKey: classKey ?? undefined,
      layoutId: layout?.id,
      arrangement: undefined,
    });
  }, [classKey, layout?.id, writeState]);

  // classKey 또는 layoutId 변경 시 stale 캐시 정리는 자동 (위 useMemo 분기)
  // 다른 탭에서 변경된 경우 동기화
  useEffect(() => {
    const onStorage = () => setPersisted(loadCurrent());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { arrangement, setArrangement, regenerate, swap, reset };
}
