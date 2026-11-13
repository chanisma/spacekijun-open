// ========================================
// 급식지도 월간 명단 — 규칙 단일 출처 (2026-10-01)
//
// 규칙은 손으로 만들어 온 명단(2025-11 · 2026-05 · 2026-08 · 2026-09, 113건)을
// 교사 시간표·태그·업무분장과 대조해 되짚은 것이다. 근거는 docs/features/meal-duty.md.
//
//  1. **그 요일 3교시가 빈 교사만** — 급식지도(11:50~12:20)는 3교시(11:00~11:50) 종료
//     직후라 3교시 수업이 있으면 식당에 먼저 갈 수 없다. 실측: 우연이라면 절반(50%)이
//     걸려야 하는데 실제 명단은 8·9월 70건 중 3건(4%)만 걸렸다.
//  2. **대상 = 수업하는 교사 + 비교과 교사**(보건·상담·도서관). 교장·교감(`학교관리자`
//     태그)과 행정실·직원(resource.type='staff')은 빠진다. 수업도 분장도 없는 계정
//     (휴직·테스트)도 빠진다.
//  3. **월 단위가 아니라 이어지는 순환** — "매월 전원 1회"가 아니다. 지난 명단이 끝난
//     자리부터 이어서 돈다(8월 30명 + 9월 첫 23명 = 풀 53명 한 바퀴). 순서를 따로
//     저장하지 않고 **사람별 마지막 배정일**을 기존 일정에서 계산해 오래된 사람부터 쓴다.
//  4. **하루 2명**, 휴업일·공휴일(NEIS `sbtr_dd_sc_nm`)과 주말은 쉰다.
//     **전 학년 시험일은 기본으로 쉰다** — 그날 `1차고사`·`2차고사`처럼 서로 다른 고사가 함께
//     있으면 전 학년 시험이다(10/1·2·6·7 공식 명단에 배정 없음). 한 학년만 시험인 날은 배정한다
//     (8/19~21 `1차고사`만 → 실제 배정됨). 사용자 결정 2026-10-01.
//     **수학여행·현장체험학습 날은 1명**(10/13~16 공식 명단 — 한 학년이 빠져 식당이 한산하다).
//     둘 다 기본값일 뿐 화면에서 뒤집을 수 있다.
//  5. 3교시가 빈 사람이 모자라면 **빈칸으로 두고 알린다**(사용자 결정 2026-10-01) —
//     규칙을 조용히 어겨 채우지 않는다.
//
// ⚠ 이 파일은 React·Supabase 를 모른다. 화면(`MealDutyPlannerDialog`)과 회귀
// (`scripts/meal-duty-test/run.mts`)가 같은 함수를 부르므로 판정을 화면에 베껴 쓰지 말 것.
// ========================================

// 쉬는 날·시험 판정의 상수와 학사일정 항목 타입은 `schoolDay.ts` 가 단일 출처다(2026-10-11)
import { CLOSED_DAY_KINDS, EXAM_TITLE_RE, type SchoolCalendarEntry } from './schoolDay';
export type { SchoolCalendarEntry } from './schoolDay';

/** 급식지도 일정 제목 접두어 — 기존 일정(`급식지도 - A, B`)과 같아야 순환이 이어진다 */
export const MEAL_DUTY_TITLE = '급식지도';

/** 기존 일정 판정 — 옛 제목(`급식 지도 - …`, `5월 급식 지도 - …`)까지 받는다 */
export function isMealDutyTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return /급식\s*지도/.test(title);
}

/** 기본 시간 — 3교시 종료 직후. 8·9월 명단과 같다 */
export const MEAL_DUTY_DEFAULT_TIME = { start: '11:50', end: '12:20' } as const;

/** 하루 인원 */
export const MEAL_DUTY_PER_DAY = 2;

/** 이 교시에 수업이 있으면 그날 급식지도를 못 한다 */
export const MEAL_DUTY_BLOCKING_PERIOD = 3;

/**
 * 급식지도에서 빼는 태그. 수업 교체의 `SWAP_EXCLUDED_TAGS` 와 **일부러 분리**한다 —
 * 지금은 값이 같지만 두 정책은 이유가 다르다(한쪽을 고칠 때 다른 쪽이 조용히 바뀌면 안 된다).
 */
export const MEAL_DUTY_EXCLUDED_TAGS = ['학교관리자'] as const;


// ─────────────────────────────── 대상자 ───────────────────────────────

export interface MealDutyCandidateInput {
  name: string;
  type: string | null | undefined;
  status: string | null | undefined;
  tags: string[];
  /** 기준 학기의 주간 수업 칸 수 */
  weeklyPeriods: number;
  /** 기준일에 업무분장 자리를 갖고 있는가(보건·상담·도서관처럼 수업이 없는 교사) */
  hasDutySeat: boolean;
}

export type MealDutyExclusion = 'staff' | 'inactive' | 'school_admin' | 'no_role';

export const MEAL_DUTY_EXCLUSION_LABEL: Record<MealDutyExclusion, string> = {
  staff: '행정실·직원',
  inactive: '재직 아님',
  school_admin: '교장·교감',
  no_role: '수업·분장 없음',
};

/** 대상이면 null, 아니면 빠지는 이유 */
export function mealDutyExclusion(input: MealDutyCandidateInput): MealDutyExclusion | null {
  if ((input.status ?? 'active') !== 'active') return 'inactive';
  if (input.type !== 'teacher') return 'staff';
  if (input.tags.some((tag) => (MEAL_DUTY_EXCLUDED_TAGS as readonly string[]).includes(tag))) return 'school_admin';
  if (input.weeklyPeriods <= 0 && !input.hasDutySeat) return 'no_role';
  return null;
}

// ─────────────────────────────── 날짜 ───────────────────────────────

/** 로컬 날짜 → `YYYY-MM-DD` (toISOString 은 UTC 라 자정 근처에서 하루 밀린다) */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` → 월=1 … 금=5, 토=6, 일=7 (teacher_timetable.day_of_week 와 같은 체계) */
export function isoDayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

export interface MealDutyDay {
  date: string;
  dow: number;
  /** 그날의 학사일정 제목(시험·행사) */
  notes: string[];
  /** 그날 인원. 없으면 `MEAL_DUTY_PER_DAY` */
  headcount?: number;
  /** 기본으로 쉬는 이유(전 학년 시험). 화면에서 되살릴 수 있다 */
  defaultSkip?: string;
}

/** 한 학년이 빠지는 행사 — 그날은 1명 */
const REDUCED_DAY_RE = /수학여행|현장체험학습/;
const EXAM_RE = EXAM_TITLE_RE;

/** 그날의 기본값 — 전 학년 시험이면 쉼, 수학여행·현장체험학습이면 1명 */
export function mealDutyDayDefaults(notes: string[]): Pick<MealDutyDay, 'headcount' | 'defaultSkip'> {
  const exams = new Set(notes.filter((n) => EXAM_RE.test(n)).map((n) => n.replace(/\s+/g, '')));
  return {
    ...(notes.some((n) => REDUCED_DAY_RE.test(n)) ? { headcount: 1 } : {}),
    ...(exams.size >= 2 ? { defaultSkip: `전 학년 시험(${[...exams].sort().join('·')})` } : {}),
  };
}

export interface ClosedDay {
  date: string;
  reason: string;
}

/** 한 달의 급식지도 날짜 — 주말·휴업일·공휴일을 뺀 평일 */
export function listMealDutyDays(
  year: number,
  month: number,
  calendar: SchoolCalendarEntry[],
): { days: MealDutyDay[]; closed: ClosedDay[] } {
  const closedReason = new Map<string, string>();
  const notes = new Map<string, string[]>();
  for (const entry of calendar) {
    const title = entry.title.trim();
    if (!title) continue;
    if (entry.dayKind && CLOSED_DAY_KINDS.has(entry.dayKind)) {
      if (!closedReason.has(entry.date)) closedReason.set(entry.date, title);
      continue;
    }
    if (title === '토요휴업일') continue;
    const list = notes.get(entry.date) ?? [];
    if (!list.includes(title)) list.push(title);
    notes.set(entry.date, list);
  }

  const days: MealDutyDay[] = [];
  const closed: ClosedDay[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const key = toDateKey(new Date(year, month - 1, d));
    const dow = isoDayOfWeek(key);
    if (dow > 5) continue;
    const reason = closedReason.get(key);
    if (reason) {
      closed.push({ date: key, reason });
      continue;
    }
    const dayNotes = notes.get(key) ?? [];
    days.push({ date: key, dow, notes: dayNotes, ...mealDutyDayDefaults(dayNotes) });
  }
  return { days, closed };
}

// ─────────────────────────────── 배정 ───────────────────────────────

/** 3교시 수업 여부 키 */
export function busyKey(name: string, dow: number): string {
  return `${name}|${dow}`;
}

export interface MealDutyPlanInput {
  days: MealDutyDay[];
  /** 대상자 이름 */
  pool: string[];
  /** `busyKey(name, dow)` — 그 요일 3교시에 수업이 있는 사람 */
  busy: Set<string>;
  /** 사람별 마지막 급식지도 날짜(이 달 이전). 없으면 한 번도 안 한 사람 */
  lastAssigned: Map<string, string>;
  perDay?: number;
}

export interface MealDutyPlanDay extends MealDutyDay {
  assignees: string[];
  /** 3교시가 빈 사람이 모자라 채우지 못한 칸 수 */
  shortage: number;
}

/**
 * 순환 순서 — 마지막 배정일이 오래된 사람부터, 한 번도 안 한 사람이 맨 앞.
 * 같은 날 함께 한 두 사람은 가나다순으로 푼다(결정적이어야 미리보기가 흔들리지 않는다).
 */
export function mealDutyRotationOrder(pool: string[], lastAssigned: Map<string, string>): string[] {
  return [...new Set(pool)].sort((a, b) => {
    const la = lastAssigned.get(a) ?? '';
    const lb = lastAssigned.get(b) ?? '';
    if (la !== lb) return la < lb ? -1 : 1;
    return a.localeCompare(b, 'ko');
  });
}

/**
 * 날짜 순으로 하루 `perDay` 명씩, 순환 큐의 앞에서부터 **그 요일 3교시가 빈 사람**을 고른다.
 * 고른 사람은 큐 맨 뒤로 간다. 앞사람이 그 요일에 막혀 있으면 건너뛰되 큐 앞자리를 지키므로
 * 다음 날 먼저 뽑힌다 — 손 명단의 "대체로 가나다순인데 이웃끼리만 뒤섞인" 모양이 여기서 나온다.
 */
export function planMealDuty(input: MealDutyPlanInput): MealDutyPlanDay[] {
  const perDay = input.perDay ?? MEAL_DUTY_PER_DAY;
  const queue = mealDutyRotationOrder(input.pool, input.lastAssigned);

  return input.days.map((day) => {
    const need = day.headcount ?? perDay;
    const picked: string[] = [];
    for (const name of queue) {
      if (picked.length >= need) break;
      if (input.busy.has(busyKey(name, day.dow))) continue;
      picked.push(name);
    }
    for (const name of picked) {
      queue.splice(queue.indexOf(name), 1);
      queue.push(name);
    }
    return { ...day, assignees: picked, shortage: need - picked.length };
  });
}

// ─────────────────────────────── 기존 일정 ───────────────────────────────

export interface ExistingMealDutyRow {
  /** `YYYY-MM-DD` */
  date: string;
  names: string[];
}

/** 사람별 마지막 급식지도 날짜 — `before` 이전 일정만 본다 */
export function lastAssignedByName(rows: ExistingMealDutyRow[], before: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.date >= before) continue;
    for (const name of row.names) {
      const prev = map.get(name);
      if (!prev || prev < row.date) map.set(name, row.date);
    }
  }
  return map;
}

/** 일정 제목 — 기존 명단과 같은 `급식지도 - A, B` */
export function mealDutyTitle(names: string[]): string {
  return names.length > 0 ? `${MEAL_DUTY_TITLE} - ${names.join(', ')}` : MEAL_DUTY_TITLE;
}

/** 계획 요약 — 이 달에 몇 번씩 맡는지(두 번째 차례를 받은 사람이 누구인지 보이게) */
export function countByName(plan: MealDutyPlanDay[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of plan) for (const name of day.assignees) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}

// ─────────────────────────────── 검토·수정 (2026-10-01) ───────────────────────────────
//
// 시스템은 개인 일정·연수·행사 동참 여부를 다 알지 못한다(연수는 RLS 상 일부만 보이고, 개인 일정은
// 아예 안 보인다). 그래서 초안은 **사람이 확인하고 고치는 것이 전제**이고, 아래는 그 확인을 돕는
// 판정들이다. 알 수 있는 문제는 칸에 붙이고, 고칠 때는 순환이 덜 틀어지는 길(맞바꾸기·덜 맡은 사람)을 앞에 둔다.

export type SlotIssueKind = 'busy' | 'absent' | 'duplicate' | 'empty';

export interface SlotIssue {
  kind: SlotIssueKind;
  label: string;
}

export interface ReviewContext {
  busy: Set<string>;
  /** `date|name` → 그날의 다른 일정 제목들 */
  absences: Map<string, { kind: string; title: string }[]>;
}

export function absenceKey(date: string, name: string): string {
  return `${date}|${name}`;
}

/** 칸 하나의 문제 — 빈칸 · 3교시 수업 · 출장/연수 · 같은 날 중복 */
export function slotIssues(
  day: { date: string; dow: number; slots: (string | null)[] },
  index: number,
  ctx: ReviewContext,
): SlotIssue[] {
  const name = day.slots[index];
  if (!name) return [{ kind: 'empty', label: '빈칸' }];
  const issues: SlotIssue[] = [];
  if (ctx.busy.has(busyKey(name, day.dow))) issues.push({ kind: 'busy', label: '3교시 수업' });
  for (const a of ctx.absences.get(absenceKey(day.date, name)) ?? []) {
    issues.push({ kind: 'absent', label: `${a.kind === 'training' ? '연수' : '출장'}${a.title ? ` · ${a.title}` : ''}` });
  }
  if (day.slots.indexOf(name) !== index) issues.push({ kind: 'duplicate', label: '같은 날 중복' });
  return issues;
}

/** 두 칸 맞바꾸기 — 같은 달 안에서 날짜만 바꾸므로 사람별 횟수(순환)가 그대로 유지된다 */
export function swapSlots(
  a: { date: string; slots: (string | null)[]; index: number },
  b: { date: string; slots: (string | null)[]; index: number },
): Record<string, (string | null)[]> {
  if (a.date === b.date) {
    const slots = [...a.slots];
    [slots[a.index], slots[b.index]] = [slots[b.index], slots[a.index]];
    return { [a.date]: slots };
  }
  const sa = [...a.slots];
  const sb = [...b.slots];
  [sa[a.index], sb[b.index]] = [sb[b.index], sa[a.index]];
  return { [a.date]: sa, [b.date]: sb };
}

export interface ReplacementOption {
  name: string;
  /** 마지막 급식지도 날짜(지난 명단 + 이번 초안의 다른 날). 없으면 null */
  lastDuty: string | null;
  issues: string[];
}

/**
 * 사람별 마지막 급식지도 날짜 — 지난 명단과 이번 달 명단(이미 있는 것 + 초안)을 함께 본다.
 * 한 달에 두 번 맡는 일은 드물어 "이 달 N회"는 거의 늘 1회라 구별이 안 된다(사용자 지적 2026-10-01).
 * 순환 자체가 마지막 배정일로 돌므로, 손으로 바꿀 때의 기준도 같아야 일관된다.
 */
export function latestDutyByName(rows: ExistingMealDutyRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const name of row.names) {
      const prev = map.get(name);
      if (!prev || prev < row.date) map.set(name, row.date);
    }
  }
  return map;
}

/** 후보 옆 표시 — `마지막 9/3` · 이번 달이면 `10/22 배정` · 없으면 `기록 없음` */
export function formatLastDuty(lastDuty: string | null, monthKey: string): string {
  if (!lastDuty) return '기록 없음';
  const [, m, d] = lastDuty.split('-').map(Number);
  return lastDuty.startsWith(monthKey) ? `${m}/${d} 배정` : `마지막 ${m}/${d}`;
}

/**
 * 칸을 다른 사람으로 바꿀 때의 후보 순서 — 문제 없는 사람 → 마지막 감독일이 오래된 사람(기록 없음이 맨 앞).
 * 문제 있는 사람도 목록에서 빼지 않는다(시간표가 틀렸을 수 있다 — 김지아 목 3교시 사례).
 */
export function rankReplacements(
  day: { date: string; dow: number; slots: (string | null)[] },
  index: number,
  pool: string[],
  lastDuty: Map<string, string>,
  ctx: ReviewContext,
): ReplacementOption[] {
  const others = new Set(day.slots.filter((s, i) => s && i !== index));
  return pool
    .map((name) => {
      const issues: string[] = [];
      if (ctx.busy.has(busyKey(name, day.dow))) issues.push('3교시 수업');
      if ((ctx.absences.get(absenceKey(day.date, name)) ?? []).length > 0) issues.push('출장·연수');
      if (others.has(name)) issues.push('이미 이 날');
      return { name, lastDuty: lastDuty.get(name) ?? null, issues };
    })
    .sort((x, y) =>
      (x.issues.length > 0 ? 1 : 0) - (y.issues.length > 0 ? 1 : 0)
      || (x.lastDuty ?? '').localeCompare(y.lastDuty ?? '')
      || x.name.localeCompare(y.name, 'ko'));
}
