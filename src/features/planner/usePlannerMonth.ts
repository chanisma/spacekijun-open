import { useMemo } from 'react';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import { fetchPlanner } from './plannerService';
import { offsetDay, weekCenter, weekStartOf } from './plannerModel';
import type { PlannerGoal, PlannerState, PlannerTask } from './types';

/**
 * 한 달 칸(월요일 시작 6주 = 42일)의 할 일 (2026-10-03, 별빛 플래너 «월별 일정»).
 * 읽기 함수는 «그날 ±3일»만 주므로 주마다 한 번씩 부른다 — 질의 열쇠가 이번 주 쪽(usePlannerWeek)과 같아서
 * 이미 본 주는 다시 받지 않고, 한쪽에서 적으면 다른 쪽도 함께 무효화된다.
 */
export function monthGrid(month: string) {
  const first = `${month.slice(0, 7)}-01`;
  const start = weekStartOf(first);
  return Array.from({ length: 42 }, (_, i) => offsetDay(start, i));
}
export function shiftMonth(day: string, delta: number) {
  const d = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

export function usePlannerMonth({ userId, day, studentCode = null }: { userId: string; day: string; studentCode?: string | null }) {
  const days = useMemo(() => monthGrid(day), [day]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, i) => days[i * 7]), [days]);
  const results = useQueries({
    queries: weeks.map(start => ({
      queryKey: ['academy-dormitory', userId, 'planner-week', studentCode, start],
      queryFn: () => fetchPlanner(weekCenter(start), studentCode),
      enabled: !!userId, staleTime: 0, retry: 1, placeholderData: keepPreviousData,
    })),
  });
  const tasks = useMemo(() => {
    const seen = new Map<string, PlannerTask>();
    for (const r of results) for (const t of (r.data as PlannerState | undefined)?.tasks ?? []) if (days.includes(t.task_date)) seen.set(t.id, t);
    return [...seen.values()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, ...results.map(r => r.data)]);
  const goals: PlannerGoal[] = (results.find(r => r.data)?.data as PlannerState | undefined)?.goals ?? [];
  return { days, tasks, goals, isPending: results.some(r => r.isPending), isError: results.some(r => r.isError) };
}
