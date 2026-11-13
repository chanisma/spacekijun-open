import { minuteOfDay, minuteTime } from '@/features/planner/timelineModel';
import type { PlannerTask } from '@/features/planner/types';

/**
 * 별빛 플래너 시간표 쪽의 자리 계산 (2026-10-03). 화면은 그리기만 하고, «어느 높이 = 몇 시 몇 분»은 여기서 정한다.
 * 저장 함수는 같은 날 안의 HH:MM 만 받는다(24:00 없음) — 그래서 끝은 23:45 를 넘지 않게 접는다.
 */
export interface TimeScale { startHour: number; endHour: number; pxPerMinute: number; step: number }
export const DAY_SCALE: TimeScale = { startHour: 6, endHour: 24, pxPerMinute: 0.8, step: 15 };
export const FULL_SCALE: TimeScale = { startHour: 0, endHour: 24, pxPerMinute: 0.8, step: 15 };
const LAST_END = 23 * 60 + 45;

export function snapMinute(minute: number, step = 15) { return Math.round(minute / step) * step; }
/** 시간표 위 높이(px) → 그 자리의 분(15분 단위로 맞춤, 시간표 범위 안). */
export function minuteAt(y: number, scale: TimeScale) {
  const raw = scale.startHour * 60 + y / scale.pxPerMinute;
  return Math.max(scale.startHour * 60, Math.min(LAST_END, snapMinute(raw, scale.step)));
}
export function durationOf(task: Pick<PlannerTask, 'start_time' | 'end_time'>, fallback = 60) {
  if (!task.start_time || !task.end_time) return fallback;
  const d = minuteOfDay(task.end_time.slice(0, 5)) - minuteOfDay(task.start_time.slice(0, 5));
  return d > 0 ? d : fallback;
}
/** 시작 분과 길이로 저장할 시각을 만든다 — 하루를 넘기면 시작을 당겨 길이를 지킨다. */
export function placeRange(start: number, duration: number, scale: TimeScale) {
  const length = Math.max(scale.step, snapMinute(duration, scale.step));
  let from = Math.max(scale.startHour * 60, snapMinute(start, scale.step));
  if (from + length > LAST_END) from = Math.max(0, LAST_END - length);
  const to = Math.min(LAST_END, from + length);
  return { start: minuteTime(from), end: minuteTime(to) };
}
/** 블록의 위치(px) — 시간표 범위 밖으로 나간 부분은 잘라서 그린다. */
export function blockBox(task: Pick<PlannerTask, 'start_time' | 'end_time'>, scale: TimeScale) {
  const s = minuteOfDay(task.start_time!.slice(0, 5)), e = minuteOfDay(task.end_time!.slice(0, 5));
  const lo = Math.max(s, scale.startHour * 60), hi = Math.min(e, scale.endHour * 60);
  return { top: (lo - scale.startHour * 60) * scale.pxPerMinute, height: Math.max(14, (hi - lo) * scale.pxPerMinute), hidden: hi <= lo };
}
/** 저장 함수에 보낼 값 — 시간만 바뀌고 나머지는 그대로. 빈 시간 = 시간 지우기. */
export function timePayload(task: PlannerTask, start: string, end: string) {
  return { id: task.id, title: task.title, task_date: task.task_date, priority: task.priority, related_goal_id: task.related_goal_id ?? '', memo: task.memo ?? '', start_time: start, end_time: end };
}
