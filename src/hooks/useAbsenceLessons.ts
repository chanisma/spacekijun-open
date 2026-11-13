/**
 * 결강 구간에 걸린 **내** 수업과 처리 상태.
 *
 * 입력은 일정의 시작·끝뿐이라 저장 전(생성 모달 미리보기)과 저장 후(결강 처리 모달·상세 칩)가
 * 같은 훅을 쓴다. 판정은 전부 `src/lib/absenceLessons.ts`.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useTimetableData, type TimetableEntry } from '@/hooks/useTimetableData';
import {
  absenceWindowOf,
  buildAbsenceLessons,
  summarizeAbsenceLessons,
  type AbsenceLesson,
  type AbsenceSummary,
  type AbsenceWindow,
} from '@/lib/absenceLessons';
import { absenceSwapsQueryKey, fetchMySwapsOnDate } from '@/services/absenceLessonService';
import type { ClassSwap } from '@/types/classSwap';

export interface AbsenceLessonsInput {
  startsAt: string | Date;
  endsAt: string | Date;
  dateOnly?: boolean;
}

export interface AbsenceLessonsResult {
  window: AbsenceWindow | null;
  lessons: AbsenceLesson<TimetableEntry>[];
  summary: AbsenceSummary;
  /** 그 주의 내 시간표(ClassSwapDialog 충돌 판정·교시 스트립용) */
  weekEntries: TimetableEntry[];
  /** 그날 내가 요청자인 교체/대체 전부 — 보강 계획서가 승인 행을 쓴다 */
  swaps: ClassSwap[];
  myResourceId: string | null;
  isLoading: boolean;
}

export function useAbsenceLessons(
  input: AbsenceLessonsInput | null,
  enabled: boolean = true
): AbsenceLessonsResult {
  const { resourceId } = useCurrentResourceId();

  const startKey = input ? new Date(input.startsAt).getTime() : NaN;
  const endKey = input ? new Date(input.endsAt).getTime() : NaN;
  const window = useMemo(
    () => (input ? absenceWindowOf(input.startsAt, input.endsAt, input.dateOnly) : null),
    // Date 객체는 렌더마다 새로 만들어지므로 시각 값으로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startKey, endKey, input?.dateOnly]
  );

  const active = enabled && !!window && !!resourceId;
  const day = useMemo(() => (window ? new Date(`${window.date}T00:00:00`) : undefined), [window]);

  const timetable = useTimetableData(undefined, day, active);

  const swapsQuery = useQuery({
    queryKey: absenceSwapsQueryKey(resourceId, window?.date),
    queryFn: () => fetchMySwapsOnDate(resourceId!, window!.date),
    enabled: active,
    staleTime: 30 * 1000,
  });

  const weekEntries = useMemo(() => (active ? timetable.data ?? [] : []), [active, timetable.data]);
  const swaps = useMemo(() => (active ? swapsQuery.data ?? [] : []), [active, swapsQuery.data]);

  const lessons = useMemo(
    () =>
      window && resourceId && active
        ? buildAbsenceLessons(window, weekEntries, swaps, resourceId)
        : [],
    [window, resourceId, active, weekEntries, swaps]
  );

  return {
    window,
    lessons,
    summary: summarizeAbsenceLessons(lessons),
    weekEntries,
    swaps,
    myResourceId: resourceId,
    isLoading: active && (timetable.isLoading || swapsQuery.isLoading),
  };
}
