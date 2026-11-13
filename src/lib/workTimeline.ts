// 업무 타임라인의 판정 단일 출처 (2026-09-21).
//
// 타임라인에서 업무를 펼치면 할 일이 한 줄씩 나온다. 그 줄에 무엇을 그릴지 — 마감 마커·
// 회차 완료 여부·기간 막대 — 를 여기서 정한다. 간트 컴포넌트는 그리기만 한다.
//
// ── 기간은 "있으면 쓰고 없으면 유도"한다 ─────────────────────────────────────
// `task` 표에는 시작일이 없다(2026-09 실측: 절차형 44건 중 18건은 마감일조차 없다).
// 그런데 절차형은 **순서(`order_index`)가 이미 저장돼 있다** — 없는 것은 날짜지 순서가 아니다.
// 그래서 절차형 단계의 시작 = 앞 단계의 마감(첫 단계는 업무 생성일)으로 유도하고,
// 유도한 구간에는 `derived: true` 를 달아 화면이 "추정"이라고 말할 수 있게 한다.
// 일회성은 유도하지 않는다 — 마감만 있는 일은 실제로 점이다.
import { isValid, parseISO, startOfDay } from 'date-fns';
import {
  getDeadlineProgress,
  getTaskDeadlines,
  isRoundCompleted,
  type TaskDeadlineLike,
} from './taskDeadlines';

export interface TimelineTaskLike extends TaskDeadlineLike {
  id: string;
  title: string;
  type?: string | null;
  status?: string | null;
  order_index?: number | null;
  created_at?: string | null;
  /** 명시 시작일 — 컬럼이 생기면 유도보다 우선한다(지금은 항상 비어 있다) */
  start_date?: string | null;
}

export type TimelineStatus = 'active' | 'completed' | 'cancelled';

export interface TimelineProgress {
  completedTasks: number;
  completedUnits: number;
  totalUnits: number;
  percentage: number;
}

export interface TimelineMarker {
  date: Date;
  /** 이 회차가 끝났는가 — 다중 마감은 회차별(전원 완료), 단일 마감은 할 일 단위 */
  done: boolean;
  progress: number;
}

export interface TimelineTaskRow {
  id: string;
  title: string;
  type: 'procedural' | 'one_time';
  /** 절차형의 단계 번호(1부터). 일회성은 null */
  step: number | null;
  status: TimelineStatus;
  progress: number;
  markers: TimelineMarker[];
  span: { start: Date; end: Date; derived: boolean } | null;
  undated: boolean;
}

export function parseTimelineDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = startOfDay(parseISO(value.slice(0, 10)));
  return isValid(date) ? date : null;
}

function activeAssignees(task: TaskDeadlineLike): Array<{ id: string; status?: string }> {
  const raw = task.meta && (task.meta as { assignees?: unknown }).assignees;
  if (!Array.isArray(raw)) return [];
  return (raw as Array<{ id?: unknown; status?: string }>).filter(
    (a): a is { id: string; status?: string } =>
      !!a && typeof a.id === 'string' && a.status !== 'cancelled',
  );
}

/** 할 일 하나의 진행률 — 담당자가 있으면 담당자 기준, 없으면 task.status */
export function getTaskProgress(task: TimelineTaskLike): TimelineProgress {
  const raw = task.meta && (task.meta as { assignees?: unknown }).assignees;
  const assignees = Array.isArray(raw) ? (raw as Array<{ status?: string }>) : [];

  if (assignees.length > 0) {
    const completedUnits = assignees.filter((a) => a.status === 'completed').length;
    return {
      completedTasks: completedUnits === assignees.length ? 1 : 0,
      completedUnits,
      totalUnits: assignees.length,
      percentage: Math.round((completedUnits / assignees.length) * 100),
    };
  }

  const isCompleted = task.status === 'completed';
  return {
    completedTasks: isCompleted ? 1 : 0,
    completedUnits: isCompleted ? 1 : 0,
    totalUnits: 1,
    percentage: isCompleted ? 100 : 0,
  };
}

/**
 * 회차 하나의 진행률.
 *
 * 다중 마감 할 일은 **모든 회차를 끝내야** 담당자가 completed 가 되므로, 할 일 단위 진행률을
 * 회차마다 그대로 찍으면 이미 끝낸 회차가 0% 로 보인다(2026-07-28 홈 대시보드와 같은 부류).
 * 회차 기록(`meta.deadlineProgress`)에서 그 회차만 센다. task 자체가 종료됐으면 그것이 이긴다.
 */
export function getRoundProgress(task: TimelineTaskLike, deadline: string): TimelineProgress {
  const deadlines = getTaskDeadlines(task);
  if (deadlines.length <= 1 || task.status === 'completed') {
    const base = getTaskProgress(task);
    return task.status === 'completed'
      ? { ...base, completedTasks: 1, completedUnits: base.totalUnits, percentage: 100 }
      : base;
  }

  const ids = activeAssignees(task).map((a) => a.id);
  if (ids.length === 0) return getTaskProgress(task);

  const progress = getDeadlineProgress(task);
  const completedUnits = ids.filter((id) => isRoundCompleted(progress, deadline, id)).length;
  return {
    completedTasks: completedUnits === ids.length ? 1 : 0,
    completedUnits,
    totalUnits: ids.length,
    percentage: Math.round((completedUnits / ids.length) * 100),
  };
}

export function sumProgress(parts: TimelineProgress[]): TimelineProgress {
  const acc = parts.reduce(
    (a, p) => ({
      completedTasks: a.completedTasks + p.completedTasks,
      completedUnits: a.completedUnits + p.completedUnits,
      totalUnits: a.totalUnits + p.totalUnits,
    }),
    { completedTasks: 0, completedUnits: 0, totalUnits: 0 },
  );
  return {
    ...acc,
    percentage: acc.totalUnits > 0 ? Math.round((acc.completedUnits / acc.totalUnits) * 100) : 0,
  };
}

function rowStatus(task: TimelineTaskLike, progress: number): TimelineStatus {
  if (task.status === 'cancelled') return 'cancelled';
  if (task.status === 'completed' || progress === 100) return 'completed';
  return 'active';
}

/** 절차형 → 일회성. 절차형은 단계 순, 일회성은 마감순(날짜 없는 것은 맨 뒤) */
function sortForTimeline<T extends TimelineTaskLike>(tasks: T[]): T[] {
  const firstDue = (t: T) => getTaskDeadlines(t)[0] ?? '9999-12-31';
  const created = (t: T) => t.created_at ?? '';
  return [...tasks].sort((a, b) => {
    const ap = a.type === 'procedural' ? 0 : 1;
    const bp = b.type === 'procedural' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (ap === 0) {
      const d = (a.order_index ?? 0) - (b.order_index ?? 0);
      return d !== 0 ? d : created(a).localeCompare(created(b));
    }
    const d = firstDue(a).localeCompare(firstDue(b));
    return d !== 0 ? d : created(a).localeCompare(created(b));
  });
}

/**
 * 업무 하나를 펼쳤을 때의 할 일 행 목록.
 *
 * `workCreatedAt` 은 절차형 **첫 단계**의 유도 시작점이다. 앞 단계에 날짜가 없으면
 * 그 앞의 날짜 있는 단계까지 거슬러 올라간다(날짜 없는 단계가 사슬을 끊지 않는다).
 */
export function buildTimelineTaskRows(
  tasks: TimelineTaskLike[],
  workCreatedAt?: string | null,
): TimelineTaskRow[] {
  const rows: TimelineTaskRow[] = [];
  let step = 0;
  let chainEnd: Date | null = parseTimelineDate(workCreatedAt);

  for (const task of sortForTimeline(tasks)) {
    const isProcedural = task.type === 'procedural';
    const deadlines = getTaskDeadlines(task);
    const markers: TimelineMarker[] = deadlines.flatMap((deadline) => {
      const date = parseTimelineDate(deadline);
      if (!date) return [];
      const progress = getRoundProgress(task, deadline).percentage;
      return [{ date, done: progress === 100, progress }];
    });

    const progress = getTaskProgress(task).percentage;
    const end = markers.length > 0 ? markers[markers.length - 1].date : null;
    const explicitStart = parseTimelineDate(task.start_date);

    let span: TimelineTaskRow['span'] = null;
    if (end && explicitStart && explicitStart <= end) {
      span = { start: explicitStart, end, derived: false };
    } else if (end && isProcedural && chainEnd && chainEnd < end) {
      span = { start: chainEnd, end, derived: true };
    }

    rows.push({
      id: task.id,
      title: task.title,
      type: isProcedural ? 'procedural' : 'one_time',
      step: isProcedural ? ++step : null,
      status: rowStatus(task, progress),
      progress,
      markers,
      span,
      undated: markers.length === 0,
    });

    if (isProcedural && end) chainEnd = end;
  }

  return rows;
}
