// ========================================
// 자습 감독 배정 — 규칙 단일 출처 (2026-10-11)
//
// 학년부장·담임이 **자기 학년**의 자습 감독을 한 달 단위로 배정한다. 결정(사용자 2026-10-11):
//  · 감독 단위 = **학년·하루 1명**(3학년 열람실이 넷이어도 한 명이 순회)
//  · 대상 시간 = 저녁(월~금) · 아침(월~금) · 토요일(그 학년에 토요 열람실이 있을 때 — 지금은 3학년)
//  · 아침은 화면에서 고른다 — «저녁과 다른 사람» 또는 «그날 저녁 감독이 아침도»
//  · 공정 기준 = **누적 횟수 균등 + 요일 분산**(학년도 누적. 급식지도의 «이어지는 순환»과 다르다)
//  · 교체 = 상대가 수락하면 바로(서버 RPC `respond_supervision_swap`)
//
// 2026-10-12 개선:
//  · 아침 «전 학년 통합 당번» — 아침 열람실이 학년을 넘나들어(1·2·3학년 공용 방) 세 학년 선생님을 한
//    명단으로 돌린다. 감독 일정 표지 `grade = 0`(`SCHOOL_GRADE`). 수능 이후엔 3학년 선생님이 빠진다
//  · 못 하는 날 — 매주 반복(«매주 수요일 저녁 수업») 또는 특정 날짜. 자동 배정이 피한다
//
// 자습 시간은 seaton 열람실(`study_rooms`)에서 읽는다 — 아침 열람실 = 이름에 `아침`
// (seaton 통계 계약 `seaton_private.facts` 와 같은 규칙), 토요 열람실 = 운영 요일이 토요일뿐.
// 쉬는 날은 `schoolDay.ts`(공휴일·휴업일·방학 건너뜀, 시험일은 배정하되 표시).
//
// ⚠ React·Supabase 를 모른다. 회귀 = `scripts/self-study-supervision-test/run.mts`.
// ========================================
import type { SchoolDayInfo } from './schoolDay';

export type SupervisionSlot = 'evening' | 'morning' | 'saturday';

export const SUPERVISION_SLOTS: SupervisionSlot[] = ['morning', 'evening', 'saturday'];

export const SLOT_LABEL: Record<SupervisionSlot, string> = {
  morning: '아침',
  evening: '저녁',
  saturday: '토요일',
};

/** 일정 제목 접두어 — 이력 RPC 는 제목이 아니라 `meta.supervision` 으로 찾는다(제목은 사람이 읽는 용도) */
export const SUPERVISION_TITLE_PREFIX = '자습감독';

/**
 * 아침 감독을 어떻게 정하나 — 학년별 «저녁과 다른 사람» / 학년별 «그날 저녁 감독이 함께» /
 * 학년을 합친 «전 학년 통합 당번»(그 학년 화면에는 아침 칸이 없고, 전 학년 아침 화면에서 배정한다)
 */
export type MorningMode = 'separate' | 'with_evening' | 'school';

/** 감독 일정 `meta.supervision.grade` 가 0 = 전 학년(통합 아침 당번) */
export const SCHOOL_GRADE = 0;

export function gradeLabel(grade: number): string {
  return grade === SCHOOL_GRADE ? '전 학년' : `${grade}학년`;
}

export interface TimeRange {
  start: string;
  end: string;
}

/** seaton 에 시간이 없을 때(아침 열람실은 교시가 없다) */
export const DEFAULT_SLOT_TIMES: Record<SupervisionSlot, TimeRange> = {
  morning: { start: '07:40', end: '08:20' },
  evening: { start: '18:40', end: '21:40' },
  saturday: { start: '09:00', end: '17:00' },
};

/**
 * 제목 — 이름은 **맨 끝 ` · 이름`** 이어야 한다. 교체 RPC 가 이 자리만 바꾼다
 * (`replace` 로 이름을 찾으면 `김민` 이 `정시우` 안에서 걸린다).
 */
export function supervisionTitle(grade: number, slot: SupervisionSlot, name: string, withMorning = false): string {
  const label = slot === 'evening' && withMorning ? '아침·저녁' : SLOT_LABEL[slot];
  return `${SUPERVISION_TITLE_PREFIX} · ${gradeLabel(grade)} ${label} · ${name}`;
}

// ─────────────────────────────── 열람실 → 시간대 ───────────────────────────────

export interface StudyRoomRow {
  name: string;
  grades: number[] | null;
  operating_days: number[] | null;
  operating_periods: { start_time?: string; end_time?: string }[] | null;
}

export interface GradeSlotConfig {
  /** 그 학년에 해당 시간대 열람실이 있나 */
  available: Record<SupervisionSlot, boolean>;
  times: Record<SupervisionSlot, TimeRange>;
  /** 화면에 보여 줄 열람실 이름 */
  rooms: Record<SupervisionSlot, string[]>;
}

const HHMM = /^\d{2}:\d{2}$/;

function spanOf(rooms: StudyRoomRow[], fallback: TimeRange): TimeRange {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const room of rooms) {
    for (const p of room.operating_periods ?? []) {
      if (p.start_time && HHMM.test(p.start_time)) starts.push(p.start_time);
      if (p.end_time && HHMM.test(p.end_time)) ends.push(p.end_time);
    }
  }
  if (starts.length === 0 || ends.length === 0) return fallback;
  return { start: starts.sort()[0], end: ends.sort()[ends.length - 1] };
}

/** 그 학년의 시간대 — 운영 중인(`is_active`) 열람실만 넘길 것 */
export function gradeSlotConfig(rooms: StudyRoomRow[], grade: number): GradeSlotConfig {
  const mine = rooms.filter((r) => (r.grades ?? []).includes(grade));
  const isMorning = (r: StudyRoomRow) => r.name.includes('아침');
  const days = (r: StudyRoomRow) => r.operating_days ?? [];
  const morning = mine.filter(isMorning);
  const saturday = mine.filter((r) => !isMorning(r) && days(r).includes(6) && !days(r).some((d) => d >= 1 && d <= 5));
  const evening = mine.filter((r) => !isMorning(r) && days(r).some((d) => d >= 1 && d <= 5));
  return {
    available: { morning: morning.length > 0, evening: evening.length > 0, saturday: saturday.length > 0 },
    times: {
      morning: spanOf(morning, DEFAULT_SLOT_TIMES.morning),
      evening: spanOf(evening, DEFAULT_SLOT_TIMES.evening),
      saturday: spanOf(saturday, DEFAULT_SLOT_TIMES.saturday),
    },
    rooms: {
      morning: morning.map((r) => r.name),
      evening: evening.map((r) => r.name),
      saturday: saturday.map((r) => r.name),
    },
  };
}

/**
 * 전 학년 통합 아침 — 학년을 가리지 않고 운영 중인 아침 열람실 전부. 저녁·토요일은 없다
 * (그건 학년별 화면에서 배정한다).
 */
export function schoolMorningConfig(rooms: StudyRoomRow[]): GradeSlotConfig {
  const morning = rooms.filter((r) => r.name.includes('아침'));
  return {
    available: { morning: morning.length > 0, evening: false, saturday: false },
    times: {
      morning: spanOf(morning, DEFAULT_SLOT_TIMES.morning),
      evening: DEFAULT_SLOT_TIMES.evening,
      saturday: DEFAULT_SLOT_TIMES.saturday,
    },
    rooms: { morning: morning.map((r) => r.name), evening: [], saturday: [] },
  };
}

/**
 * 그 학년도 수능일 — 학사일정 제목 `대학수학능력시험`(NEIS) 또는 딱 `수능`. «수능 50일 응원» 같은
 * 행사는 수능일이 아니므로 낱말 포함으로 찾지 않는다. 여럿이면 가장 이른 날.
 */
export function findCsatDate(entries: { date: string; title: string }[]): string | null {
  const hits = entries
    .filter((e) => /대학수학능력시험/.test(e.title) || e.title.trim() === '수능')
    .map((e) => e.date)
    .sort();
  return hits[0] ?? null;
}

// ─────────────────────────────── 못 하는 날 ───────────────────────────────

/**
 * 감독을 못 하는 사정 — 매주 반복(`weekday`) 또는 특정 날짜(`date`). 둘 다 없으면 기간(`from`~`until`)
 * 안의 모든 날(화면이 만드는 «수능 이후 3학년 제외» 같은 자동 규칙 — 저장된 행은 둘 중 하나가 반드시 있다).
 */
export interface UnavailabilityRule {
  id?: string;
  resourceId?: string;
  name: string;
  /** 월=1 … 토=6 */
  weekday: number | null;
  date: string | null;
  from: string | null;
  until: string | null;
  slots: SupervisionSlot[];
  note: string | null;
  /** 화면이 만든 규칙(저장 안 됨, 지울 수 없다) */
  auto?: boolean;
}

const DOW_NAME = ['', '월', '화', '수', '목', '금', '토', '일'];

/** 이 칸이 덮는 시간대 — «그날 저녁 감독이 함께» 모드의 저녁 칸은 아침도 덮는다 */
export function cellSlots(cell: Pick<SupervisionCell, 'slot' | 'withMorning'>): SupervisionSlot[] {
  return cell.withMorning ? [cell.slot, 'morning'] : [cell.slot];
}

/** 이 사람이 이 칸을 못 하는 이유(메모, 없으면 규칙 설명) — 못 할 사정이 없으면 null */
export function unavailabilityReason(
  rules: UnavailabilityRule[],
  name: string,
  cell: Pick<SupervisionCell, 'date' | 'dow' | 'slot' | 'withMorning'>,
): string | null {
  const slots = cellSlots(cell);
  for (const rule of rules) {
    if (rule.name !== name) continue;
    if (!rule.slots.some((s) => slots.includes(s))) continue;
    if (rule.date) {
      if (rule.date !== cell.date) continue;
    } else {
      if (rule.weekday != null && rule.weekday !== cell.dow) continue;
      if (rule.from && cell.date < rule.from) continue;
      if (rule.until && cell.date > rule.until) continue;
    }
    return rule.note?.trim() || describeRule(rule);
  }
  return null;
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

/** «매주 수요일 저녁» · «11/3 아침·저녁» · «11/19부터 아침» */
export function describeRule(rule: UnavailabilityRule): string {
  const slots = SUPERVISION_SLOTS.filter((s) => rule.slots.includes(s)).map((s) => SLOT_LABEL[s]).join('·');
  if (rule.date) return `${shortDate(rule.date)} ${slots}`;
  const period = rule.from && rule.until
    ? ` (${shortDate(rule.from)}~${shortDate(rule.until)})`
    : rule.from ? ` (${shortDate(rule.from)}부터)` : rule.until ? ` (${shortDate(rule.until)}까지)` : '';
  if (rule.weekday != null) return `매주 ${DOW_NAME[rule.weekday]}요일 ${slots}${period}`;
  return `${slots}${period}`.trim();
}

/** 수능 이후 3학년 선생님을 통합 아침 당번에서 뺀다 — 화면이 만드는 규칙 */
export function seniorExclusionRules(names: string[], from: string): UnavailabilityRule[] {
  return names.map((name) => ({
    name,
    weekday: null,
    date: null,
    from,
    until: null,
    slots: ['morning'] as SupervisionSlot[],
    note: `${shortDate(from)}부터 3학년 제외(수능 이후)`,
    auto: true,
  }));
}

// ─────────────────────────────── 누가 쓰나 ───────────────────────────────

const HEAD_RE = /^(\d+)학년\s*부장$/;
const HOMEROOM_RE = /^(\d+)학년\s*\d+반$/;

/** 내가 배정할 수 있는 학년 — 학년부장·담임 태그에서. 관리자는 전 학년 */
export function manageableGrades(tagNames: string[], isAdmin: boolean): number[] {
  if (isAdmin) return [1, 2, 3];
  const grades = new Set<number>();
  for (const raw of tagNames) {
    const tag = raw.trim();
    const m = HEAD_RE.exec(tag) ?? HOMEROOM_RE.exec(tag);
    if (m) grades.add(Number(m[1]));
  }
  return [...grades].sort((a, b) => a - b);
}

/** 학년부장 태그인가(교체 완료 알림 대상) */
export function isGradeHeadTag(tag: string, grade: number): boolean {
  const m = HEAD_RE.exec(tag.trim());
  return !!m && Number(m[1]) === grade;
}

/** 학년도 — 3월 시작 */
export function academicYearOf(year: number, month: number): number {
  return month >= 3 ? year : year - 1;
}

// ─────────────────────────────── 칸 만들기 ───────────────────────────────

export interface SupervisionCell {
  date: string;
  /** 월=1 … 토=6 */
  dow: number;
  slot: SupervisionSlot;
  /** 그날 학사일정 메모(시험·행사) — 배정은 하되 보여 준다 */
  notes: string[];
  /** «그날 저녁 감독이 함께» 모드의 저녁 칸 — 아침도 이 사람이 한다 */
  withMorning?: boolean;
}

export interface ListCellsInput {
  /** 그 달의 날짜 판정(`useSchoolCalendar`, 학기 기간 미적용) */
  days: Map<string, SchoolDayInfo>;
  config: GradeSlotConfig;
  /** 켠 시간대 */
  enabled: Record<SupervisionSlot, boolean>;
  morningMode: MorningMode;
  /** 이 날짜 이전(오늘 이전)은 만들지 않는다 */
  from: string;
}

/**
 * 한 달의 감독 칸. 평일 수업일·시험일 = 저녁(+아침), 토요일 = 토요 자습(토요휴업일만 있는 평범한
 * 토요일 — 공휴일·방학이면 판정이 `holiday`/`vacation` 이라 빠진다), 일요일·휴일·방학 = 없음.
 */
export function listSupervisionCells(input: ListCellsInput): SupervisionCell[] {
  const { days, config, enabled, morningMode, from } = input;
  const on = (slot: SupervisionSlot) => enabled[slot] && config.available[slot];
  const togetherMorning = morningMode === 'with_evening' && on('morning');
  const cells: SupervisionCell[] = [];
  for (const day of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < from) continue;
    const notes = [...day.exams, ...day.notes];
    if (day.kind === 'school' || day.kind === 'exam') {
      if (on('morning') && morningMode === 'separate') cells.push({ date: day.date, dow: day.dow, slot: 'morning', notes });
      if (on('evening')) cells.push({ date: day.date, dow: day.dow, slot: 'evening', notes, ...(togetherMorning ? { withMorning: true } : {}) });
    } else if (day.kind === 'weekend' && day.dow === 6 && on('saturday')) {
      cells.push({ date: day.date, dow: day.dow, slot: 'saturday', notes });
    }
  }
  return cells;
}

export function cellKey(cell: Pick<SupervisionCell, 'date' | 'slot'>): string {
  return `${cell.date}|${cell.slot}`;
}

// ─────────────────────────────── 공정 배정 ───────────────────────────────

export interface SupervisionHistoryRow {
  date: string;
  slot: SupervisionSlot;
  names: string[];
}

export interface PersonLoad {
  bySlot: Record<SupervisionSlot, number>;
  total: number;
  /** 요일별 횟수(월=1 … 토=6) */
  byDow: number[];
  /** 마지막 감독일 */
  last: string | null;
}

function emptyLoad(): PersonLoad {
  return { bySlot: { morning: 0, evening: 0, saturday: 0 }, total: 0, byDow: [0, 0, 0, 0, 0, 0, 0], last: null };
}

function dowOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

function addLoad(load: PersonLoad, date: string, slot: SupervisionSlot) {
  load.bySlot[slot] += 1;
  load.total += 1;
  const dow = dowOf(date);
  if (dow <= 6) load.byDow[dow] += 1;
  if (!load.last || date > load.last) load.last = date;
}

/** 학년도 누적 부담 — 이력(이 달에 이미 만든 것 포함) */
export function loadsFromHistory(pool: string[], history: SupervisionHistoryRow[]): Map<string, PersonLoad> {
  const loads = new Map(pool.map((name) => [name, emptyLoad()]));
  for (const row of history) {
    for (const name of row.names) {
      const load = loads.get(name);
      if (load) addLoad(load, row.date, row.slot);
    }
  }
  return loads;
}

/** 이름별 결정적 순번 — 같은 달·학년이면 다시 눌러도 같은 초안, 달이 바뀌면 동점자 순서도 바뀐다 */
export function tieRank(seed: string, name: string): number {
  let h = 2166136261;
  for (const ch of `${seed}|${name}`) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
}

/**
 * 후보 순서 — 앞일수록 먼저 맡는다:
 *  ① 그 시간대 누적이 적은 사람(아침·저녁·토요일을 **따로** 고르게 — 토요일 8시간과 아침 40분을 한 숫자로 섞지 않는다)
 *  ② 전체 누적이 적은 사람
 *  ③ 그 요일을 덜 맡은 사람(요일 분산 — 월요일만 맡는 사람이 생기지 않게)
 *  ④ 마지막 감독이 오래된 사람(이틀 안에 또 맡지 않게)
 *  ⑤ 결정적 동점 순번
 */
export function rankCandidates(
  names: string[],
  loads: Map<string, PersonLoad>,
  cell: Pick<SupervisionCell, 'date' | 'slot' | 'dow'>,
  seed: string,
): string[] {
  const key = (name: string) => {
    const load = loads.get(name) ?? emptyLoad();
    const recent = load.last && daysBetween(load.last, cell.date) <= 1 ? 1 : 0;
    return [load.bySlot[cell.slot], load.total, load.byDow[cell.dow] ?? 0, recent, load.last ?? '', tieRank(seed, name)] as const;
  };
  return [...names].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

export interface PlanInput {
  cells: SupervisionCell[];
  pool: string[];
  history: SupervisionHistoryRow[];
  /** `date|name` — 그날 출장·연수가 있는 사람(가능하면 피한다) */
  absent: Set<string>;
  /** 못 하는 날(매주 반복·특정 날짜·자동 규칙) — 출장과 같이 피한다 */
  unavailable?: UnavailabilityRule[];
  seed: string;
}

export interface PlannedCell extends SupervisionCell {
  assignee: string | null;
}

/**
 * 칸을 날짜순으로 한 칸씩 채운다. 한 사람이 같은 날 두 칸(아침·저녁)을 맡지 않고, 출장·연수가
 * 있거나 못 하는 날로 적어 둔 사람은 피한다. 후보가 아무도 없으면 **빈칸으로 둔다**(조용히 규칙을 어겨
 * 채우지 않는다 — 급식지도와 같은 결정).
 */
export function planSupervision(input: PlanInput): PlannedCell[] {
  const { cells, pool, history, absent, seed, unavailable = [] } = input;
  const loads = loadsFromHistory(pool, history);
  const byDate = new Map<string, Set<string>>();
  const out: PlannedCell[] = [];
  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date) || SUPERVISION_SLOTS.indexOf(a.slot) - SUPERVISION_SLOTS.indexOf(b.slot));
  for (const cell of sorted) {
    const taken = byDate.get(cell.date) ?? new Set<string>();
    const free = pool.filter((name) => !taken.has(name));
    const present = free.filter((name) => !absent.has(`${cell.date}|${name}`) && !unavailabilityReason(unavailable, name, cell));
    const ranked = rankCandidates(present.length > 0 ? present : [], loads, cell, seed);
    const assignee = ranked[0] ?? null;
    if (assignee) {
      taken.add(assignee);
      byDate.set(cell.date, taken);
      const load = loads.get(assignee);
      if (load) addLoad(load, cell.date, cell.slot);
    }
    out.push({ ...cell, assignee });
  }
  return out;
}

export type CellIssue = 'empty' | 'absent' | 'unavailable' | 'duplicate' | 'consecutive';

export const CELL_ISSUE_LABEL: Record<CellIssue, string> = {
  empty: '감독 없음',
  absent: '출장·연수',
  unavailable: '못 하는 날',
  duplicate: '같은 날 두 칸',
  consecutive: '이틀 연속',
};

/** 손으로 고친 뒤의 문제 표시 — 빈칸·같은 날 중복은 반드시, 출장·못 하는 날·이틀 연속은 확인 */
export function cellIssues(cells: PlannedCell[], index: number, absent: Set<string>, unavailable: UnavailabilityRule[] = []): CellIssue[] {
  const cell = cells[index];
  if (!cell.assignee) return ['empty'];
  const issues: CellIssue[] = [];
  if (absent.has(`${cell.date}|${cell.assignee}`)) issues.push('absent');
  if (unavailabilityReason(unavailable, cell.assignee, cell)) issues.push('unavailable');
  if (cells.some((c, i) => i !== index && c.date === cell.date && c.assignee === cell.assignee)) issues.push('duplicate');
  if (cells.some((c) => c.assignee === cell.assignee && c.date !== cell.date && daysBetween(c.date, cell.date) === 1)) {
    issues.push('consecutive');
  }
  return issues;
}

/** 사람별 이 계획 반영 후 부담 — 화면의 «사람별 횟수» 표 */
export function loadsWithPlan(pool: string[], history: SupervisionHistoryRow[], plan: PlannedCell[]): Map<string, PersonLoad> {
  const loads = loadsFromHistory(pool, history);
  for (const cell of plan) {
    if (!cell.assignee) continue;
    const load = loads.get(cell.assignee);
    if (load) addLoad(load, cell.date, cell.slot);
  }
  return loads;
}
