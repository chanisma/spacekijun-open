/**
 * MCP 에이전트 — 시간표·스케줄 부가 기능의 «계산» 단일 출처 묶음 (2026-10-23).
 *
 * 수업 교체 후보·급식지도 명단·자습 감독 배정·일정 설문 결과는 웹에서 **순수 함수**가 판정한다
 * (`timetableSwapUtils`·`swapBurden`·`mealDuty`·`selfStudySupervision`·`schoolDay`·`surveyAggregate`).
 * 에이전트 도구는 그 판정을 SQL 로 다시 쓰지 않고 이 파일을 거쳐 **같은 함수**를 부른다 —
 * DB 는 입력만 모으고(`mcp_*_sources` RPC, 사용자 토큰·RLS 그대로), 계산은 엣지 함수 mcp 가 여기서 한다.
 *
 * ⚠️ 이 파일은 supabase/functions/_shared/mcpSchoolOps.bundle.js 로 묶인다(scripts/mcp-docgen/build-bundle.mts).
 *    위 순수 모듈을 고치면 다시 묶고 엣지 함수 mcp 를 배포할 것 — 안 하면 웹과 에이전트가 다른 답을 낸다
 *    (회귀 `scripts/mcp-agent-test/run.mts` 가 묶음 = 원본을 본다). 그래서 `@/` 별칭 대신 상대 경로를 쓴다.
 * ⚠️ 학생은 이름이 아니라 수·«학년-반-번호»로만 내보낸다(사용자 결정 2026-10-23 — 수강생 판정의 겹치는 학생 이름은 버린다).
 */
import type { TimetableEntry } from '../hooks/useTimetable';
import {
  findSwappableClasses,
  getSwapConflictReason,
  isSwappableLesson,
  lessonKey,
  type LessonRosterFit,
  type RosterFitIndex,
} from '../utils/timetableSwapUtils';
import { BURDEN_LEVEL_LABEL, compareBurden, evaluateSwapBurden, type BurdenSlot } from './swapBurden';
import {
  MEAL_DUTY_DEFAULT_TIME,
  MEAL_DUTY_EXCLUDED_TAGS,
  MEAL_DUTY_EXCLUSION_LABEL,
  MEAL_DUTY_PER_DAY,
  busyKey,
  lastAssignedByName,
  listMealDutyDays,
  mealDutyExclusion,
  mealDutyTitle,
  planMealDuty,
  slotIssues,
  type ExistingMealDutyRow,
} from './mealDuty';
import {
  CELL_ISSUE_LABEL,
  SCHOOL_GRADE,
  SLOT_LABEL,
  cellIssues,
  cellKey,
  findCsatDate,
  gradeLabel,
  gradeSlotConfig,
  listSupervisionCells,
  loadsWithPlan,
  planSupervision,
  schoolMorningConfig,
  seniorExclusionRules,
  supervisionTitle,
  unavailabilityReason,
  type MorningMode,
  type PlannedCell,
  type StudyRoomRow,
  type SupervisionSlot,
  type UnavailabilityRule,
} from './selfStudySupervision';
import { classifySchoolDay, expandScheduleRows, indexCalendar, toDateKey, type SchoolDayInfo } from './schoolDay';
import { aggregateSurvey, suggestTitleForDate } from '../features/schedule-survey/utils/surveyAggregate';
import type { ScheduleSurveyResponse } from '../features/schedule-survey/types';

const DOW = ['', '월', '화', '수', '목', '금', '토', '일'];
const dayLabel = (date: string, dow: number) => {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}(${DOW[dow] ?? ''})`;
};
const isoDow = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
};

// ─────────────────────────────── 수업 교체·대체 후보 ───────────────────────────────

/** `get_teacher_timetables_for_swap` 한 행 */
export interface SwapSourceEntry {
  id: string;
  period: number;
  weekday: number;
  subject: string;
  section_name: string;
  teacher_name: string;
  grade: number | null;
  class_number: number | null;
  resource_id: string;
  section_id: string;
  weekday_time: string;
  activity_type: string | null;
}

/** `get_swap_roster_fit` 한 행 — 이름 칸은 서버가 이미 뺐다 */
export interface SwapRosterRow {
  teacher_resource_id: string;
  day_of_week: number;
  period: number;
  my_count: number;
  their_count: number;
  shared_count: number;
  their_conflict_count: number;
  my_conflict_count: number;
}

export interface SwapSources {
  me: { resource_id: string; name: string };
  weekday: number;
  period: number;
  /** 지금 학기 전교 교사 시간표 */
  entries: SwapSourceEntry[];
  roster_fit: SwapRosterRow[] | null;
  /** 상대가 될 수 없는 교사(학교관리자 태그) */
  excluded_ids: string[];
  /** 재직 교사 전원 — 대체 후보의 모집단 */
  teachers: { id: string; name: string }[];
}

const toEntry = (row: SwapSourceEntry): TimetableEntry =>
  ({
    id: row.id,
    period: row.period,
    weekday: row.weekday,
    subject: row.subject,
    section_name: row.section_name,
    teacher_name: row.teacher_name,
    grade: row.grade ?? undefined,
    class_number: row.class_number != null ? String(row.class_number) : undefined,
    resource_id: row.resource_id,
    section_id: row.section_id,
    weekday_time: row.weekday_time,
    type: 'pattern',
    activity_type: row.activity_type ?? undefined,
  }) as unknown as TimetableEntry;

const ROSTER_LABEL = {
  same: '수강생 같음',
  compatible: '겹치는 학생 없음',
  unknown: '명단 미확인(학년-반 표기로만 판정)',
  conflict: '수강생이 달라 불가',
} as const;

function burdenOut(b: ReturnType<typeof evaluateSwapBurden>) {
  return { level: BURDEN_LEVEL_LABEL[b.level], delta: b.delta, lessons_after: b.totalAfter, ...(b.reasons.length ? { reasons: b.reasons } : {}) };
}

/**
 * 내 수업(요일·교시) 하나의 교체·대체 후보 — 웹 `ClassSwapDialog` 와 같은 판정·같은 순서
 * (교체 가능한 수업 = 상대 부담 적은 순, 불가한 수업은 이유별로 따로).
 */
export function swapCandidateReport(src: SwapSources, mode: 'swap' | 'substitute' | 'both', limit = 15) {
  const all = src.entries.map(toEntry);
  const mine = all.find((e) => e.resource_id === src.me.resource_id && e.weekday === src.weekday && e.period === src.period);
  if (!mine) {
    return { found: false, note: `${DOW[src.weekday]}요일 ${src.period}교시에 내 수업이 없습니다(지금 학기 시간표 기준).` };
  }
  const excluded = new Set(src.excluded_ids);
  const slotsOf = new Map<string, BurdenSlot[]>();
  for (const e of all) {
    if (!e.resource_id) continue;
    const list = slotsOf.get(e.resource_id) ?? [];
    list.push({ weekday: e.weekday, period: e.period });
    slotsOf.set(e.resource_id, list);
  }
  const target = { weekday: mine.weekday, period: mine.period };
  const lesson = { subject: mine.subject, weekday: DOW[mine.weekday], period: mine.period, club: !isSwappableLesson(mine) };

  const out: Record<string, unknown> = { found: true, my_lesson: lesson };

  if (mode !== 'substitute') {
    let fit: RosterFitIndex | null = null;
    if (src.roster_fit) {
      fit = new Map<string, LessonRosterFit>();
      for (const r of src.roster_fit) {
        fit.set(lessonKey(r.teacher_resource_id, r.day_of_week, r.period), {
          myCount: r.my_count, theirCount: r.their_count, sharedCount: r.shared_count,
          theirConflictCount: r.their_conflict_count, theirConflictNames: [],
          myConflictCount: r.my_conflict_count, myConflictNames: [],
        });
      }
    }
    const candidates = findSwappableClasses(mine, all, fit).filter((c) => !excluded.has(c.entry.resource_id ?? ''));
    const available = candidates
      .filter((c) => c.canSwap)
      .map((c) => ({
        c,
        weekday: c.entry.weekday,
        period: c.entry.period,
        burden: evaluateSwapBurden({
          teacherSlots: slotsOf.get(c.entry.resource_id ?? '') ?? [],
          add: target,
          remove: { weekday: c.entry.weekday, period: c.entry.period },
        }),
      }))
      .sort(compareBurden);
    out.swap = {
      roster_checked: !!src.roster_fit,
      available_count: available.length,
      available: available.slice(0, limit).map(({ c, burden }) => ({
        teacher: c.entry.teacher_name,
        subject: c.entry.subject,
        weekday: c.entry.weekday,
        day: DOW[c.entry.weekday],
        period: c.entry.period,
        students: ROSTER_LABEL[c.rosterStatus],
        partner_burden: burdenOut(burden),
      })),
      blocked_by_students: candidates
        .filter((c) => !c.canSwap && c.studentConflicts > 0)
        .slice(0, limit)
        .map((c) => ({
          teacher: c.entry.teacher_name, subject: c.entry.subject, day: DOW[c.entry.weekday], period: c.entry.period,
          reason: `맞바꾸면 그 시간에 다른 수업과 겹치는 학생 ${c.studentConflicts}명`
            + (c.rosterFit ? ` (같은 학생 ${c.rosterFit.sharedCount}명 / 내 수업 ${c.rosterFit.myCount}명 · 상대 ${c.rosterFit.theirCount}명)` : ''),
        })),
      blocked_by_teacher_time: candidates
        .filter((c) => !c.canSwap && c.studentConflicts === 0)
        .slice(0, limit)
        .map((c) => ({
          teacher: c.entry.teacher_name, subject: c.entry.subject, day: DOW[c.entry.weekday], period: c.entry.period,
          reasons: getSwapConflictReason(mine, c.entry, all),
        })),
      ...(lesson.club ? { note: '동아리활동은 교체할 수 없습니다 — 대체(substitute)로 다른 선생님께 맡길 수는 있습니다.' } : {}),
      ...(src.roster_fit ? {} : { warning: '수강생 명단을 확인하지 못해 학년-반 표기로만 골랐습니다 — 표기가 같아도 학생이 다를 수 있습니다.' }),
    };
  }

  if (mode !== 'swap') {
    const busy = new Set<string>(all.filter((e) => e.weekday === mine.weekday && e.period === mine.period).map((e) => String(e.resource_id)));
    const eligible = src.teachers.filter((t) => t.id !== src.me.resource_id && !excluded.has(t.id));
    const free = eligible
      .filter((t) => !busy.has(t.id))
      .map((t) => ({ t, burden: evaluateSwapBurden({ teacherSlots: slotsOf.get(t.id) ?? [], add: target }) }))
      .sort(compareBurden);
    out.substitute = {
      free_count: free.length,
      busy_count: eligible.filter((t) => busy.has(t.id)).length,
      free: free.slice(0, limit).map(({ t, burden }) => ({ teacher: t.name, burden: burdenOut(burden) })),
      note: '대체 = 그날 내 수업을 그 선생님이 대신 맡는다(같은 날·같은 교시). 수업이 하나도 없는 계정도 «비어 있음»으로 잡힌다.',
    };
  }
  return out;
}

// ─────────────────────────────── 급식지도 명단 ───────────────────────────────

export interface MealDutySources {
  today: string;
  year: number;
  month: number;
  candidates: { name: string; type: string; status: string | null; school_admin: boolean; weekly_periods: number; has_duty_seat: boolean }[];
  /** 3교시 수업 (이름 × 요일) */
  busy: { name: string; dow: number }[];
  history: ExistingMealDutyRow[];
  /** 학사일정 — 일부 학년만 쉬는 날은 dayKind 를 비워 둔다(급식은 학교 전체) */
  calendar: { date: string; title: string; dayKind: string | null }[];
  absences: { date: string; name: string; kind: 'event' | 'training'; title: string }[];
}

export interface MealDutyOptions {
  /** 이번 명단에서 뺄 사람 */
  exclude?: string[];
  /** 기본(전 학년 시험 = 쉼)을 뒤집을 날 — 쉬던 날은 배정, 배정하던 날은 쉼 */
  toggle_skip?: string[];
  /** 날짜별 인원 */
  headcounts?: Record<string, number>;
  /** 날짜별 손 보정 — 그날 칸 전체(빈칸 = null) */
  overrides?: Record<string, (string | null)[]>;
}

/** 웹 `MealDutyPlannerDialog` 의 model 과 같은 계산 */
export function mealDutyDraft(src: MealDutySources, opts: MealDutyOptions = {}) {
  const excluded = new Set(opts.exclude ?? []);
  const toggled = new Set(opts.toggle_skip ?? []);
  const monthKey = `${src.year}-${String(src.month).padStart(2, '0')}`;
  const nextMonthStart = toDateKey(new Date(src.year, src.month, 1));

  const people = src.candidates.map((c) => ({
    name: c.name,
    exclusion: mealDutyExclusion({
      name: c.name, type: c.type, status: c.status,
      tags: c.school_admin ? [...MEAL_DUTY_EXCLUDED_TAGS] : [],
      weeklyPeriods: c.weekly_periods, hasDutySeat: c.has_duty_seat,
    }),
  }));
  const known = new Set(people.map((p) => p.name));
  const pool = people.filter((p) => !p.exclusion && !excluded.has(p.name)).map((p) => p.name).sort((a, b) => a.localeCompare(b, 'ko'));
  const busy = new Set(src.busy.map((b) => busyKey(b.name, b.dow)));
  const absences = new Map<string, { kind: string; title: string }[]>();
  for (const a of src.absences) {
    const key = `${a.date}|${a.name}`;
    absences.set(key, [...(absences.get(key) ?? []), { kind: a.kind, title: a.title }]);
  }
  const existing = new Map(src.history.filter((r) => r.date.startsWith(monthKey)).map((r) => [r.date, r.names]));
  const { days, closed } = listMealDutyDays(src.year, src.month, src.calendar);
  const isSkipped = (d: { date: string; defaultSkip?: string }) => !!d.defaultSkip !== toggled.has(d.date);
  const openDays = days
    .filter((d) => d.date >= src.today && !isSkipped(d) && !existing.has(d.date))
    .map((d) => ({ ...d, headcount: opts.headcounts?.[d.date] ?? d.headcount ?? MEAL_DUTY_PER_DAY }));
  const plan = planMealDuty({ days: openDays, pool, busy, lastAssigned: lastAssignedByName(src.history, nextMonthStart) });
  const ctx = { busy, absences };

  const unknownOverride: string[] = [];
  const finalPlan = plan.map((day) => {
    const o = opts.overrides?.[day.date];
    const n = day.headcount ?? MEAL_DUTY_PER_DAY;
    const slots = Array.from({ length: o ? Math.max(o.length, 1) : n }, (_, i) => (o ? o[i] ?? null : day.assignees[i] ?? null));
    for (const s of slots) if (s && !known.has(s)) unknownOverride.push(s);
    const withSlots = { ...day, slots };
    return { ...withSlots, issues: slots.map((_, i) => slotIssues(withSlots, i, ctx)) };
  });
  const issueCount = { empty: 0, busy: 0, absent: 0, duplicate: 0 };
  for (const d of finalPlan) for (const list of d.issues) for (const i of list) issueCount[i.kind]++;

  return {
    month: monthKey,
    time: MEAL_DUTY_DEFAULT_TIME,
    pool_size: pool.length,
    pool,
    not_in_pool: people.filter((p) => p.exclusion).map((p) => ({ name: p.name, reason: MEAL_DUTY_EXCLUSION_LABEL[p.exclusion!] })),
    excluded_by_request: [...excluded].filter((n) => known.has(n)),
    closed_days: closed.map((c) => ({ date: c.date, reason: c.reason })),
    already_made: [...existing].map(([date, names]) => ({ date, names })),
    skipped_days: days.filter((d) => d.date >= src.today && !existing.has(d.date) && isSkipped(d))
      .map((d) => ({ date: d.date, reason: d.defaultSkip ?? '쉬기로 함(toggle_skip)' })),
    days: finalPlan.map((d) => ({
      date: d.date,
      day: dayLabel(d.date, d.dow),
      ...(d.notes.length ? { notes: d.notes } : {}),
      names: d.slots,
      title: mealDutyTitle(d.slots.filter(Boolean) as string[]),
      ...(d.issues.some((l) => l.length) ? { issues: d.issues.flatMap((l, i) => l.map((x) => `${i + 1}번째 칸: ${x.label}`)) } : {}),
    })),
    issue_count: issueCount,
    ...(unknownOverride.length ? { unknown_names: [...new Set(unknownOverride)] } : {}),
    note: '초안이다 — 아직 아무것도 만들지 않았다. 규칙: 그 요일 3교시가 빈 교사만 · 지난 명단에서 이어지는 순환 · 하루 2명(수학여행·현장체험학습 1명) · ' +
      '전 학년 시험일은 기본으로 쉼. 출장·연수(issues)는 시스템이 아는 것만이고 개인 사정은 모른다 — 사용자와 확인한 뒤 create_meal_duty_schedules 로 만든다.',
  };
}

// ─────────────────────────────── 자습 감독 배정 ───────────────────────────────

export interface SupervisionSources {
  today: string;
  grade: number;
  year: number;
  month: number;
  academic_year: number;
  pool: { name: string; grades: number[] }[];
  rooms: StudyRoomRow[];
  history: { meeting_id: string; date: string; slot: string; with_morning: boolean; names: string[] }[];
  /** 그 달 전 학년 아침 당번 날짜(학년별 화면용), 학년도 안에 쓴 적이 있나 */
  school_morning_dates: string[];
  school_morning_in_year: boolean;
  /** 그 달 학사일정 행 + (전 학년 아침이면) 9~12월 행 */
  calendar_rows: { starts_at: string; ends_at: string; meta: unknown }[];
  csat_rows: { starts_at: string; ends_at: string; meta: unknown }[];
  absences: { date: string; name: string; title: string }[];
  unavailability: { name: string; weekday: number | null; date: string | null; from: string | null; until: string | null; slots: string[]; note: string | null }[];
}

export interface SupervisionOptions {
  slots?: Partial<Record<SupervisionSlot, boolean>>;
  morning_mode?: MorningMode;
  exclude?: string[];
  /** 만들지 않을 칸 `YYYY-MM-DD|slot` */
  skip?: string[];
  /** 칸 손 보정 `YYYY-MM-DD|slot` → 이름(null = 빈칸) */
  overrides?: Record<string, string | null>;
  /** 전 학년 아침에서 3학년 선생님을 빼기 시작하는 날(기본 = 수능일), 'off' = 빼지 않음 */
  senior_cutoff?: string | 'off' | null;
}

const SLOTS: SupervisionSlot[] = ['morning', 'evening', 'saturday'];

/** 웹 `SupervisionPlanTab` 의 model 과 같은 계산 */
export function supervisionDraft(src: SupervisionSources, opts: SupervisionOptions = {}) {
  const isSchool = src.grade === SCHOOL_GRADE;
  const config = isSchool ? schoolMorningConfig(src.rooms) : gradeSlotConfig(src.rooms, src.grade);
  const enabled: Record<SupervisionSlot, boolean> = isSchool
    ? { morning: true, evening: false, saturday: false }
    : { morning: true, evening: true, saturday: true, ...(opts.slots ?? {}) };
  const morningMode: MorningMode = isSchool ? 'separate' : opts.morning_mode ?? (src.school_morning_in_year ? 'school' : 'separate');
  const monthKey = `${src.year}-${String(src.month).padStart(2, '0')}`;
  const seed = `${monthKey}|${src.grade}`;

  // 그 달 날짜 판정(학기 기간 미적용, 전 학년 아침 = 학교 전체)
  const index = indexCalendar(expandScheduleRows(src.calendar_rows));
  const days = new Map<string, SchoolDayInfo>();
  const last = new Date(src.year, src.month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const key = toDateKey(new Date(src.year, src.month - 1, d));
    days.set(key, classifySchoolDay(key, index.get(key) ?? [], null, isSchool ? null : src.grade));
  }

  const excluded = new Set(opts.exclude ?? []);
  const known = new Set(src.pool.map((p) => p.name));
  const pool = src.pool.map((p) => p.name).filter((n) => !excluded.has(n));
  const csat = findCsatDate(expandScheduleRows(src.csat_rows));
  const cutoff = opts.senior_cutoff === 'off' ? null : (opts.senior_cutoff ?? csat);
  const seniors = src.pool.filter((p) => p.grades.includes(3)).map((p) => p.name);
  const autoRules = isSchool && cutoff ? seniorExclusionRules(seniors, cutoff) : [];
  const stored: UnavailabilityRule[] = src.unavailability.map((r) => ({
    name: r.name, weekday: r.weekday, date: r.date, from: r.from, until: r.until,
    slots: r.slots.filter((s): s is SupervisionSlot => (SLOTS as string[]).includes(s)), note: r.note,
  }));
  const rules = [...autoRules, ...stored];

  const history = src.history
    .filter((r) => (SLOTS as string[]).includes(r.slot))
    .map((r) => ({ date: r.date, slot: r.slot as SupervisionSlot, names: r.names, withMorning: r.with_morning }));
  const existing = new Map<string, string[]>();
  for (const row of history) {
    if (!row.date.startsWith(monthKey)) continue;
    existing.set(cellKey(row), row.names);
    if (row.slot === 'evening' && row.withMorning) existing.set(cellKey({ date: row.date, slot: 'morning' }), row.names);
  }
  const schoolMorning = new Set(src.school_morning_dates);
  const absent = new Set(src.absences.map((a) => `${a.date}|${a.name}`));
  const absentTitles = new Map<string, string[]>();
  for (const a of src.absences) absentTitles.set(`${a.date}|${a.name}`, [...(absentTitles.get(`${a.date}|${a.name}`) ?? []), a.title]);
  const skipped = new Set(opts.skip ?? []);

  const allCells = listSupervisionCells({ days, config, enabled, morningMode, from: src.today })
    .filter((c) => isSchool || c.slot !== 'morning' || !schoolMorning.has(c.date));
  const openCells = allCells.filter((c) => !existing.has(cellKey(c)) && !skipped.has(cellKey(c)));
  const draft = planSupervision({ cells: openCells, pool, history, absent, unavailable: rules, seed });
  const unknownOverride: string[] = [];
  const plan: PlannedCell[] = draft.map((c) => {
    const key = cellKey(c);
    if (opts.overrides && key in opts.overrides) {
      const name = opts.overrides[key];
      if (name && !known.has(name)) unknownOverride.push(name);
      return { ...c, assignee: name };
    }
    return c;
  });
  const issues = plan.map((_, i) => cellIssues(plan, i, absent, rules));
  const loads = loadsWithPlan(pool, history, plan);

  return {
    grade: src.grade,
    grade_label: gradeLabel(src.grade),
    month: monthKey,
    academic_year: src.academic_year,
    morning_mode: morningMode,
    slots: SLOTS.filter((s) => config.available[s]).map((s) => ({
      slot: s, label: SLOT_LABEL[s], on: enabled[s], time: config.times[s], rooms: config.rooms[s],
    })),
    ...(isSchool ? { senior_cutoff: cutoff, csat_date: csat } : {}),
    pool,
    already_made: [...existing].map(([key, names]) => ({ cell: key, names })),
    cells: plan.map((c, i) => ({
      cell: cellKey(c),
      date: c.date,
      day: dayLabel(c.date, c.dow),
      slot: c.slot,
      label: c.slot === 'evening' && c.withMorning ? '아침·저녁' : SLOT_LABEL[c.slot],
      ...(c.withMorning ? { with_morning: true } : {}),
      name: c.assignee,
      ...(c.notes.length ? { notes: c.notes } : {}),
      ...(issues[i].length ? {
        issues: issues[i].map((x) => x === 'absent' && c.assignee
          ? `${CELL_ISSUE_LABEL[x]} · ${(absentTitles.get(`${c.date}|${c.assignee}`) ?? []).join(', ')}`
          : x === 'unavailable' && c.assignee
            ? `${CELL_ISSUE_LABEL[x]} · ${unavailabilityReason(rules, c.assignee, c) ?? ''}`
            : CELL_ISSUE_LABEL[x]),
      } : {}),
      title: c.assignee ? supervisionTitle(src.grade, c.slot, c.assignee, !!c.withMorning) : null,
    })),
    loads: pool.map((name) => {
      const l = loads.get(name);
      return { name, total: l?.total ?? 0, morning: l?.bySlot.morning ?? 0, evening: l?.bySlot.evening ?? 0, saturday: l?.bySlot.saturday ?? 0 };
    }),
    ...(unknownOverride.length ? { unknown_names: [...new Set(unknownOverride)] } : {}),
    note: '초안이다 — 아직 아무것도 만들지 않았다. 학년도 누적 횟수(시간대별) 균등 + 요일 분산, 같은 날 두 칸 금지, 출장·연수·못 하는 날은 피한다. ' +
      '빈칸(name=null)은 후보가 없는 칸이다. 사용자와 확인한 뒤 create_supervision_schedules 로 만든다(cells 의 cell·name 을 그대로 넘긴다).',
  };
}

/** 만들기 직전 — 초안을 다시 계산해 «웹과 같은 시각·열람실»을 붙인다(에이전트가 시각을 지어내지 않게) */
export function supervisionCreatePayload(
  src: SupervisionSources,
  opts: SupervisionOptions,
  picks: { cell: string; name: string }[],
) {
  const isSchool = src.grade === SCHOOL_GRADE;
  const config = isSchool ? schoolMorningConfig(src.rooms) : gradeSlotConfig(src.rooms, src.grade);
  const draft = supervisionDraft(src, opts);
  const byCell = new Map(draft.cells.map((c) => [c.cell, c]));
  const missing: string[] = [];
  const rows = picks.map((p) => {
    const cell = byCell.get(p.cell);
    if (!cell) { missing.push(p.cell); return null; }
    const slot = cell.slot as SupervisionSlot;
    const rooms = config.rooms[slot];
    const range = config.times[slot];
    return {
      date: cell.date,
      slot,
      with_morning: !!cell.with_morning,
      name: p.name,
      start: range.start,
      end: range.end,
      description: [
        rooms.length > 0 ? `열람실: ${rooms.join(', ')}` : null,
        cell.with_morning ? `아침 자습도 함께 감독합니다(${config.times.morning.start}~${config.times.morning.end}).` : null,
        '교체는 스케줄 › 부가 기능 › 자습 감독 배정 › 내 감독·교체에서 신청할 수 있습니다.',
      ].filter(Boolean).join('\n'),
    };
  });
  return { rows: rows.filter(Boolean), missing };
}

/** 학년도 — 3월 시작 */
export function academicYearOfMonth(year: number, month: number): number {
  return month >= 3 ? year : year - 1;
}

// ─────────────────────────────── 일정 설문 결과 ───────────────────────────────

export interface SurveyResultSource {
  survey: { id: string; title: string; status: string; candidate_dates: string[]; target_resource_ids: string[]; due_date: string | null; allow_custom_dates: boolean };
  /** respondent_name 은 서버가 정한 표시 이름(학생 = «N학년 N반 N번») */
  responses: { respondent_resource_id: string; respondent_name: string | null; items: unknown; comment: string | null }[];
  /** 대상자 표시 이름(id → 이름) */
  target_names: Record<string, string>;
}

/** 웹 결과 표와 같은 집계 — 기본은 «가능 인원 많은 순» */
export function surveyResult(src: SurveyResultSource, order: 'availability' | 'date' = 'availability') {
  const agg = aggregateSurvey(src.survey, src.responses as unknown as ScheduleSurveyResponse[], order);
  return {
    survey_id: src.survey.id,
    title: src.survey.title,
    status: src.survey.status,
    order: order === 'availability' ? '가능 인원 많은 순' : '날짜순',
    responded: `${agg.respondedCount}/${agg.targetCount}`,
    pending: agg.pendingTargetIds.map((id) => src.target_names[id] ?? '(이름 없음)'),
    dates: agg.dates.map((t) => ({
      date: t.date,
      day: dayLabel(t.date, isoDow(t.date)),
      candidate: t.isCandidate,
      available: t.availableCount,
      available_names: t.availableNames,
      unavailable_names: t.unavailableNames,
      ...(t.activities.length ? { activities: t.activities } : {}),
      ...(suggestTitleForDate(t) ? { suggested_title: suggestTitleForDate(t) } : {}),
    })),
    comments: src.responses.filter((r) => r.comment?.trim()).map((r) => ({ name: r.respondent_name, comment: r.comment })),
  };
}
