import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PlannerGoal, PlannerTask } from './types';
import { fetchPlanner } from './plannerService';
import { movePayload, offsetDay, seoulDay, weekCenter, weekDays, weekStartOf } from './plannerModel';

/**
 * 한 주의 계획 — 읽기·옮기기·바로 적기·지난 날 남은 일 가져오기 (2026-10-03).
 * 아카데미 «별빛 플래너» 의 이번 주 쪽(`BookWeek`)이 쓰고, 일반 플래너(`/planner`)도 2026-10-03 부터 같은 `BookWeek` 를 앱 테마로 그린다.
 * 그림은 둘이 전혀 다르지만 «무엇을 어떻게 옮기고 세는가»는 한 벌이어야 두 화면이 다른 답을 내지 않는다.
 *
 * 읽기 RPC 는 p_date ±3일을 돌려주므로 그 주의 목요일로 한 번만 부른다(`weekCenter`).
 */
export type PlannerWrite = (action: string, payload: Record<string, unknown>, options?: { silent?: boolean }) => Promise<boolean>;

export function usePlannerWeek({ userId, initialDay, write, studentCode = null, readOnly = false, busy = false }: {
  userId: string; initialDay: string; write: PlannerWrite; studentCode?: string | null; readOnly?: boolean; busy?: boolean;
}) {
  const [start, setStart] = useState(() => weekStartOf(initialDay));
  const [notice, setNotice] = useState('');
  const today = seoulDay();
  const days = useMemo(() => weekDays(start), [start]);
  const query = useQuery({
    queryKey: ['academy-dormitory', userId, 'planner-week', studentCode, start],
    queryFn: () => fetchPlanner(weekCenter(start), studentCode),
    enabled: !!userId, staleTime: 0, refetchInterval: 30_000, retry: 1, placeholderData: keepPreviousData,
  });
  const data = query.data;
  const goals: PlannerGoal[] = useMemo(() => data?.goals ?? [], [data]);
  const activeGoals = useMemo(() => goals.filter(g => !g.is_archived && !g.is_completed), [goals]);
  const tasks = useMemo(() => (data?.tasks ?? []).filter(t => days.includes(t.task_date)), [data, days]);
  // 목표로 거르기는 2026-10-04 에 뺐다(사용자 결정) — 목표는 줄 옆 «정보» 단추가 보여 준다.
  const shown = tasks;
  const done = tasks.filter(t => t.completed).length;
  const overdue = start <= today ? tasks.filter(t => !t.completed && t.task_date < today) : [];
  const locked = busy || readOnly;

  /** 그날의 할 일 — 안 한 일 먼저, 시간 있는 일은 시간순. */
  const byDay = (day: string, list: PlannerTask[] = shown) => list.filter(t => t.task_date === day)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Number(!a.start_time) - Number(!b.start_time) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));

  async function move(task: PlannerTask, day: string, silent = true) {
    if (locked || day === task.task_date) return day === task.task_date;
    return write('save_task', movePayload(task, day), { silent });
  }
  async function add(day: string, title: string) {
    const clean = title.trim();
    if (!clean || locked) return false;
    return write('save_task', { title: clean, task_date: day, priority: 'medium', related_goal_id: '', memo: '', start_time: '', end_time: '' }, { silent: true });
  }
  async function toggle(task: PlannerTask, completed: boolean) {
    if (locked) return false;
    return write('complete', { id: task.id, completed }, { silent: true });
  }
  async function bringOverdue() {
    let moved = 0, skipped = 0;
    for (const task of overdue) {
      // 같은 계획이 오늘 이미 있으면 서버가 (계획, 날짜) 중복으로 막는다 — 그 일은 남겨 두고 개수만 알린다.
      if (tasks.some(t => t.task_date === today && t.id !== task.id && t.title === task.title)) { skipped++; continue; }
      if (await move(task, today)) moved++; else skipped++;
    }
    setNotice(`${moved}개를 오늘로 가져왔어요.${skipped ? ` ${skipped}개는 오늘 같은 계획이 있어 그대로 두었어요.` : ''}`);
    return moved;
  }
  return {
    start, setStart, days, today, query, data, goals, activeGoals, tasks, shown, done, overdue, locked,
    notice, setNotice, byDay, move, add, toggle, bringOverdue,
    prevWeek: () => setStart(offsetDay(start, -7)), nextWeek: () => setStart(offsetDay(start, 7)), thisWeek: () => setStart(weekStartOf(today)),
  };
}
