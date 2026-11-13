// ========================================
// 업무 작업실 — 순수 판정 (2026-11-12, W0)
//
// 설계 = docs/plans/2026-11-12-work-room.md. 철학: 구조는 나중 — 할 일은 **평평한 목록**, 날짜로만 묶는다.
// 이 파일은 DB 를 모른다. 쓰기는 services/workRoomService.ts.
// ========================================

import { getMyTaskStatus } from '@/lib/taskStatus';
import { daysBetween } from './todayFeed';

// ---------- 날짜 ----------

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** «11/14(토)» */
export function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}/${d}(${WEEKDAYS[weekdayOf(dateKey)]})`;
}

/** D-day 표기 — 목표일이 없으면 null */
export function dDayLabel(today: string, target: string | null | undefined): string | null {
  if (!target) return null;
  const n = daysBetween(today, target.slice(0, 10));
  if (n === null) return null;
  return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
}

/**
 * 짧은 날짜 말 → 날짜 키. 모르면 null.
 *  오늘·내일·모레 · 요일(«금», «금요일» — 오늘이 그 요일이면 오늘) · 11/13 · 11월 13일 · 2026-11-13
 *  · D-1(목표일 기준, 목표일이 있을 때만) · 당일(= 목표일)
 */
export function parseDateWord(word: string, today: string, target?: string | null): string | null {
  const w = word.trim();
  if (!w) return null;
  if (w === '오늘') return today;
  if (w === '내일') return addDays(today, 1);
  if (w === '모레') return addDays(today, 2);
  if ((w === '당일' || w === 'D-day' || w === 'd-day') && target) return target.slice(0, 10);
  const dm = /^[Dd]-(\d{1,2})$/.exec(w);
  if (dm && target) return addDays(target.slice(0, 10), -Number(dm[1]));
  const wd = /^([일월화수목금토])(요일)?$/.exec(w);
  if (wd) {
    const want = WEEKDAYS.indexOf(wd[1] as (typeof WEEKDAYS)[number]);
    const diff = (want - weekdayOf(today) + 7) % 7;
    return addDays(today, diff);
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w);
  const md = /^(\d{1,2})[/.](\d{1,2})$/.exec(w) ?? /^(\d{1,2})월\s*(\d{1,2})일$/.exec(w);
  let y: number, m: number, d: number;
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (md) {
    m = Number(md[1]); d = Number(md[2]);
    y = Number(today.slice(0, 4));
    // 지난 달을 적으면 내년으로(12월에 «1/5»)
    if (m < Number(today.slice(5, 7)) - 1) y += 1;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return addDays(key, 0) === key ? key : null; // 2/30 같은 없는 날 거절
}

/**
 * 빠른 추가 한 줄 — 끝의 날짜 말을 떼어 마감으로. «포스터 인쇄 금» → {포스터 인쇄, 금요일}
 * «11월 13일»처럼 두 낱말인 날짜도 끝에서 본다.
 */
export function parseQuickAdd(input: string, today: string, target?: string | null): { title: string; due: string | null } {
  const text = input.replace(/\s+/g, ' ').trim();
  const words = text.split(' ');
  for (const take of [2, 1]) {
    if (words.length <= take) continue; // 제목이 남아야 한다
    const tail = words.slice(-take).join(' ');
    const due = parseDateWord(tail, today, target);
    if (due) return { title: words.slice(0, -take).join(' '), due };
  }
  return { title: text, due: null };
}

// ---------- 할 일 묶음 ----------

export interface RoomTask {
  id: string;
  title: string;
  status?: string | null;
  due_date?: string | null;
  type?: string | null;
  meta?: unknown;
}

export type RoomBucket = 'now' | 'week' | 'later' | 'nodate' | 'done';

export const ROOM_BUCKET_LABEL: Record<RoomBucket, string> = {
  now: '오늘까지',
  week: '이번 주',
  later: '나중에',
  nodate: '날짜 없음',
  done: '끝남',
};

/** 이 할 일이 «끝났는가» — 내가 담당이면 내 상태, 아니면 할 일 전체 상태(단일 출처 taskStatus) */
export function isRoomTaskDone(task: RoomTask, myResourceId: string | null): boolean {
  const s = getMyTaskStatus(task as never, myResourceId);
  return s === 'completed' || task.status === 'completed' || task.status === 'cancelled';
}

export function bucketOfRoomTask(task: RoomTask, today: string, myResourceId: string | null): RoomBucket {
  if (isRoomTaskDone(task, myResourceId)) return 'done';
  const due = task.due_date?.slice(0, 10);
  if (!due) return 'nodate';
  const n = daysBetween(today, due);
  if (n === null) return 'nodate';
  return n <= 0 ? 'now' : n <= 6 ? 'week' : 'later';
}

export function groupRoomTasks<T extends RoomTask>(tasks: readonly T[], today: string, myResourceId: string | null): Array<{ bucket: RoomBucket; tasks: T[] }> {
  const order: RoomBucket[] = ['now', 'week', 'later', 'nodate', 'done'];
  const by = new Map<RoomBucket, T[]>(order.map((b) => [b, []]));
  for (const t of tasks) by.get(bucketOfRoomTask(t, today, myResourceId))!.push(t);
  for (const [b, list] of by) {
    list.sort((a, c) => (b === 'done'
      ? (c.due_date ?? '').localeCompare(a.due_date ?? '')
      : (a.due_date ?? '9999').localeCompare(c.due_date ?? '9999')) || a.title.localeCompare(c.title, 'ko'));
  }
  return order.map((bucket) => ({ bucket, tasks: by.get(bucket)! })).filter((g) => g.tasks.length > 0);
}

// ---------- 체크로 끝낼 수 있는가 ----------

interface AssigneeLike { id?: string; status?: string }

function assigneesOf(task: RoomTask): AssigneeLike[] {
  const a = (task.meta as { assignees?: unknown } | null)?.assignees;
  return Array.isArray(a) ? (a as AssigneeLike[]) : [];
}

export type CheckBlock = 'not_assignee' | 'has_actions' | 'rounds' | 'units' | null;

/**
 * 작업실 체크로 완료해도 되는가 (설계 §3-3, 2026-11-12 사용자 결정 «전체 업무 관리를 수행 중심으로»).
 * 작업(제출·입력 받기 등)이 걸린 할 일 · 회차 · 과제 단위는 «내 할 일»의 수행 화면으로 보낸다 —
 * 그 화면들이 제출 확인·회차·단위를 다룬다. 쓰기는 어느 쪽이든 같은 RPC(set_task_assignee_status)이고
 * 제출 가드는 DB 트리거(guard_submission_completion)가 지킨다.
 */
export function roomCheckBlock(task: RoomTask, myResourceId: string | null, actionCount: number): CheckBlock {
  if (!myResourceId || !assigneesOf(task).some((a) => a.id === myResourceId)) return 'not_assignee';
  if (actionCount > 0) return 'has_actions';
  const meta = (task.meta ?? {}) as { deadlines?: unknown; units?: unknown };
  if (Array.isArray(meta.deadlines) && meta.deadlines.length > 1) return 'rounds';
  if (Array.isArray(meta.units) && meta.units.length > 0) return 'units';
  return null;
}

export const CHECK_BLOCK_HINT: Record<Exclude<CheckBlock, null>, string> = {
  not_assignee: '담당자만 끝낼 수 있습니다',
  has_actions: '제출·입력 같은 작업이 걸린 할 일 — 업무노트에서 진행합니다',
  rounds: '회차가 여러 개인 할 일 — 업무노트에서 회차마다 끝냅니다',
  units: '과제 단위 할 일 — 업무노트에서 단위마다 끝냅니다',
};

// ---------- 시작 ----------

/** 학년도 — 3월부터 새 해 */
export function academicYearOfDate(dateKey: string): number {
  const [y, m] = dateKey.split('-').map(Number);
  return m >= 3 ? y : y - 1;
}

export interface WorkRoomMeta { targetDate?: string | null; goal?: string | null }

export function roomMetaOf(meta: unknown): WorkRoomMeta {
  const m = (meta ?? {}) as { targetDate?: unknown; goal?: unknown };
  return {
    targetDate: typeof m.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.targetDate) ? m.targetDate : null,
    goal: typeof m.goal === 'string' && m.goal.trim() ? m.goal.trim() : null,
  };
}

/** 진행 막대 — 끝난 할 일 / 전체(취소 제외) */
export function roomProgress(tasks: readonly RoomTask[], myResourceId: string | null): { done: number; total: number } {
  const live = tasks.filter((t) => t.status !== 'cancelled');
  return { done: live.filter((t) => isRoomTaskDone(t, myResourceId)).length, total: live.length };
}

// ---------- 서랍 ----------

/** 한 줄 입력 — 주소가 들어 있으면 링크(주소 앞 글이 이름, 없으면 주소의 호스트) */
export function noteFromInput(text: string): { kind: 'note' | 'link'; body: string; url: string | null } | null {
  const t = text.trim();
  if (!t) return null;
  const m = /(https?:\/\/\S+)/i.exec(t);
  if (!m) return { kind: 'note', body: t.slice(0, 2000), url: null };
  const url = m[1].replace(/[)\].,]+$/, '');
  const label = t.replace(m[1], '').replace(/\s+/g, ' ').trim();
  let host = url;
  try { host = new URL(url).host; } catch { /* 그대로 */ }
  return { kind: 'link', body: (label || host).slice(0, 2000), url };
}

