// 다중 마감 일정(2026-07-26): 반복 할 일(예: 시험 출제)를 task 하나로 관리하기 위한
// 마감일 다중화 유틸. 저장 모델 —
//   - `task.meta.deadlines: string[]` (YYYY-MM-DD, 정렬 저장, 2개 이상일 때만 존재)
//   - `task.due_date` 컬럼 = "효과적 마감일"(다음 예정, 전부 지났으면 마지막)로 저장 시 동기화
// 이 덕에 기존 정렬·RPC·캘린더 범위 쿼리는 무수정으로 "다음 마감" 기준으로 동작하고,
// 읽기 계층은 이 유틸로 회차 정보(총 N회·M회 지남)를 표시한다.
// 판정은 로컬 날짜 문자열 비교(타임존 함정 회피) — 오늘 마감은 "예정"으로 취급.

export interface TaskDeadlineLike {
  due_date?: string | null;
  meta?: Record<string, unknown> | null;
}

/** 로컬 기준 오늘 날짜 문자열(YYYY-MM-DD) */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 날짜 입력들을 유효한 YYYY-MM-DD 목록으로 정규화(빈 값·중복 제거, 오름차순) */
export function normalizeDeadlines(dates: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const d of dates) {
    const s = (d ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out.add(s);
  }
  return [...out].sort();
}

/** 정렬된 마감 목록에서 효과적 마감일: 다음 예정(오늘 포함), 전부 지났으면 마지막 */
export function effectiveFromDeadlines(deadlines: string[], now: Date = new Date()): string | null {
  if (deadlines.length === 0) return null;
  const today = todayDateString(now);
  return deadlines.find((d) => d >= today) ?? deadlines[deadlines.length - 1];
}

/** task의 마감 일정 전체(meta.deadlines 우선, 없으면 due_date 단일) — 항상 정렬본 */
export function getTaskDeadlines(task: TaskDeadlineLike): string[] {
  const raw = task.meta && (task.meta as { deadlines?: unknown }).deadlines;
  if (Array.isArray(raw)) {
    const list = normalizeDeadlines(raw as Array<string | null>);
    if (list.length > 0) return list;
  }
  return task.due_date ? normalizeDeadlines([task.due_date]) : [];
}

export interface TaskDeadlineInfo {
  /** 전체 마감 일정(오름차순) */
  deadlines: string[];
  /** 여러 회차인지(2개 이상) */
  isMulti: boolean;
  /** 효과적 마감일 — 다음 예정(오늘 포함), 전부 지났으면 마지막, 없으면 null */
  effective: string | null;
  /** 지난 회차 수(효과적 마감일 이전) */
  passed: number;
  total: number;
}

/** 표시·판정용 종합 정보 — due_date 단일 task도 동일 구조로 다룬다 */
/**
 * 회차 이름 — «N회 · MM/DD» (2026-10-06). 회차를 보이는 모든 칩이 이 함수를 쓴다.
 * 종전엔 내 할 일 목록은 «1회 · 10/05», 할 일 상세·담당자 칩은 «10/05» 만 보여 같은 회차가 다른 이름이었다.
 * @param deadlines 정렬된 회차 목록(getTaskDeadlines) — 순번은 여기서의 위치
 */
export function formatRoundLabel(deadlines: readonly string[], deadline: string): string {
  const index = deadlines.indexOf(deadline);
  const day = `${deadline.slice(5, 7)}/${deadline.slice(8, 10)}`;
  return index >= 0 ? `${index + 1}회 · ${day}` : day;
}

export function getTaskDeadlineInfo(task: TaskDeadlineLike, now: Date = new Date()): TaskDeadlineInfo {
  const deadlines = getTaskDeadlines(task);
  const today = todayDateString(now);
  const effective = effectiveFromDeadlines(deadlines, now);
  return {
    deadlines,
    isMulti: deadlines.length > 1,
    effective,
    passed: deadlines.filter((d) => d < today).length,
    total: deadlines.length,
  };
}

// ── 회차별 완료 기록(deadlineProgress) ──

export interface DeadlineRoundRecord {
  status: 'pending' | 'completed';
  completed_at?: string | null;
}
export type DeadlineProgressMap = Record<string, Record<string, DeadlineRoundRecord>>;

/** task의 회차별 완료 기록(없으면 빈 객체) */
export function getDeadlineProgress(task: TaskDeadlineLike): DeadlineProgressMap {
  const raw = task.meta && (task.meta as { deadlineProgress?: unknown }).deadlineProgress;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as DeadlineProgressMap)
    : {};
}

/** 특정 회차×담당자의 완료 여부 */
export function isRoundCompleted(
  progress: DeadlineProgressMap, deadline: string, assigneeId: string,
): boolean {
  return progress[deadline]?.[assigneeId]?.status === 'completed';
}

/** 담당자가 완료한 회차 수 */
export function countCompletedRounds(
  progress: DeadlineProgressMap, deadlines: string[], assigneeId: string,
): number {
  return deadlines.filter((d) => isRoundCompleted(progress, d, assigneeId)).length;
}

interface AssigneeStatusLike {
  id: string;
  status?: string;
  completed_at?: string | null;
  [key: string]: unknown;
}

/** meta.assignees 중 취소되지 않은 담당자 id 목록 */
function activeAssigneeIds(task: TaskDeadlineLike): string[] {
  const raw = task.meta && (task.meta as { assignees?: unknown }).assignees;
  if (!Array.isArray(raw)) return [];
  return (raw as Array<{ id?: unknown; status?: unknown }>)
    .filter((a) => a && typeof a.id === 'string' && a.status !== 'cancelled')
    .map((a) => a.id as string);
}

/**
 * 담당자 본인이 아직 끝내지 않은 회차 목록 — 타임라인·캘린더 회차 전개(fan-out)용.
 *
 * 다중 마감 task는 **모든 회차를 끝내야** 담당자 상태가 completed가 되므로, 일부만
 * 끝낸 task는 "진행 중" 목록에 그대로 남는다. 그 task의 마감일을 그냥 전개하면
 * 이미 체크한 회차까지 앞으로 할 일처럼 보이므로 이 함수로 걸러야 한다.
 * 단일 마감은 task 단위 완료 필터가 이미 거르므로 원본을 그대로 돌려준다.
 */
export function pendingDeadlinesForAssignee(
  task: TaskDeadlineLike, assigneeId?: string,
): string[] {
  const deadlines = getTaskDeadlines(task);
  if (deadlines.length <= 1 || !assigneeId) return deadlines;

  const progress = getDeadlineProgress(task);
  return deadlines.filter((d) => !isRoundCompleted(progress, d, assigneeId));
}

/** 담당자 **전원**이 끝낸 회차를 뺀 목록 — 매니저 시점(업무 기간) 산정용 */
export function pendingDeadlinesForWork(task: TaskDeadlineLike): string[] {
  const deadlines = getTaskDeadlines(task);
  if (deadlines.length <= 1) return deadlines;

  const ids = activeAssigneeIds(task);
  if (ids.length === 0) return deadlines;

  const progress = getDeadlineProgress(task);
  return deadlines.filter((d) => !ids.every((id) => isRoundCompleted(progress, d, id)));
}

/**
 * 회차 기록에서 담당자 전체 상태 파생(모든 회차 완료 → completed) —
 * 마감 일정을 편집(회차 추가/삭제)했을 때 저장 경로에서 재파생한다.
 * cancelled 담당자는 그대로 두고, 단일 마감(다중 아님)이면 원본 유지.
 */
export function deriveAssigneesFromProgress<T extends AssigneeStatusLike>(
  deadlines: string[],
  progress: DeadlineProgressMap,
  assignees: T[],
): T[] {
  if (deadlines.length <= 1) return assignees;
  return assignees.map((a) => {
    if ((a.status ?? 'pending') === 'cancelled') return a;
    const done = deadlines.every((d) => isRoundCompleted(progress, d, a.id));
    if (done && a.status === 'completed') return a;
    return {
      ...a,
      status: done ? 'completed' : 'pending',
      completed_at: done ? (a.completed_at ?? new Date().toISOString()) : null,
    };
  });
}

/** 회차 목록에 없는 기록 제거(마감일 편집 시 고아 키 정리) */
export function pruneDeadlineProgress(
  progress: DeadlineProgressMap, deadlines: string[],
): DeadlineProgressMap {
  const keep = new Set(deadlines);
  const out: DeadlineProgressMap = {};
  for (const [d, rec] of Object.entries(progress)) {
    if (keep.has(d)) out[d] = rec;
  }
  return out;
}

/**
 * 저장 시 due_date 컬럼과 meta를 함께 만드는 헬퍼:
 * due_date = 효과적 마감일, meta.deadlines = 2회 이상이면 배열, 아니면 **null**.
 * null을 명시하는 이유 — task update 경로는 meta를 얕은 병합하므로 키를 빼는 것만으로는
 * 기존 다중 마감이 지워지지 않는다(getTaskDeadlines는 null을 무시하고 due_date로 폴백).
 * 회차 기록(deadlineProgress)도 함께 정리: 다중이면 회차 목록에 맞춰 prune, 단일이면 null.
 */
export function buildDeadlinePayload(
  dates: Array<string | null | undefined>,
  baseMeta: Record<string, unknown> = {},
  existingProgress: DeadlineProgressMap = {},
): { due_date: string | null; meta: Record<string, unknown> } {
  const deadlines = normalizeDeadlines(dates);
  const isMulti = deadlines.length > 1;
  const progress = isMulti ? pruneDeadlineProgress(existingProgress, deadlines) : null;
  return {
    due_date: effectiveFromDeadlines(deadlines),
    meta: {
      ...baseMeta,
      deadlines: isMulti ? deadlines : null,
      deadlineProgress: progress && Object.keys(progress).length > 0 ? progress : null,
    },
  };
}
