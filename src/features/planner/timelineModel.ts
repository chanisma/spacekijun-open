import { validPlanTimes } from './plannerModel';
import type { PlannerTask } from './types';

export const timelineSlotHeight = 22;
export function minuteOfDay(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function minuteTime(value: number) { const m = Math.max(0, Math.min(1439, value)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
export function rangeFromSlots(a: number, b: number) {
  const low = Math.max(0, Math.min(95, Math.min(a, b))), high = Math.max(0, Math.min(95, Math.max(a, b)));
  return { start: minuteTime(low * 15), end: minuteTime((high + 1) * 15), first: low, count: high - low + 1 };
}
export function layoutTimedTasks(tasks: PlannerTask[]) {
  const sorted = tasks.filter(t => t.start_time && t.end_time && validPlanTimes(t.start_time, t.end_time)).map(task => ({ task, start: minuteOfDay(task.start_time!), end: minuteOfDay(task.end_time!), column: 0, columns: 1 })).sort((a, b) => a.start - b.start || a.end - b.end || a.task.id.localeCompare(b.task.id));
  let group: typeof sorted = [], ends: number[] = [], until = -1;
  const finish = () => { for (const block of group) block.columns = ends.length; group = []; ends = []; };
  for (const block of sorted) {
    if (block.start >= until) finish();
    let column = ends.findIndex(end => end <= block.start);
    if (column < 0) column = ends.length;
    ends[column] = block.end; block.column = column; group.push(block); until = Math.max(until, block.end);
  }
  finish(); return sorted;
}

