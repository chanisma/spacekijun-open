/**
 * 결강 수업 판정 — 출장·개인일정 시간에 걸린 내 수업과 그 처리 상태.
 *
 * 일정(meeting)과 수업 교체(class_swap)를 잇는 **단일 출처**다. 일정 생성 모달의 미리보기,
 * 저장 직후 뜨는 「결강 처리」 모달, 일정 상세의 `수업 처리 N/M` 칩이 전부 이 함수들을 부른다.
 * 화면마다 겹침·상태를 따로 계산하면 "상세에는 2/3인데 처리 모달에는 3/3" 이 된다.
 *
 * React·supabase 비의존(회귀 = `scripts/absence-lessons-test/run.mts`).
 *
 * 설계 결정 (2026-09-27 사용자 결정):
 * - 대상은 **출장(`event`)과 개인일정(`personal`)** 뿐이다. 여러 날 일정은 다루지 않는다
 *   (애초에 일정 생성이 하루짜리다) — 끝이 다음 날로 넘어가면 시작일의 하루로 자른다.
 * - **처리 상태는 저장하지 않고 계산한다.** 그 날짜·교시에 내가 요청한 교체/대체 행이 정본이다.
 *   `class_swap.meta.absence_meeting_id` 는 출처 표시·삭제 경고용이지 상태 판정에 쓰지 않는다
 *   — 시간표에서 먼저 신청해 둔 교체도 "처리됨" 으로 잡혀야 하기 때문이다.
 * - 개인일정의 **내용은 상대에게 보이지 않는다**. 교체 사유는 `개인 사정` 으로만 채운다.
 */

import { format } from 'date-fns';
// 상대 경로 — 회귀 스크립트가 `--tsconfig` 없이 이 모듈을 불러오게 한다
import { TIME_CONFIG } from './timeUtils';

export type AbsenceKind = 'event' | 'personal';

/** 결강을 만드는 일정 종류. 표시 라벨은 `EVENT_LABELS` 가 아니라 여기서 정한다(개인일정 표현이 다르다) */
export const ABSENCE_KIND_LABEL: Record<AbsenceKind, string> = {
  event: '출장',
  personal: '개인일정',
};

export function isAbsenceKind(kind: unknown): kind is AbsenceKind {
  return kind === 'event' || kind === 'personal';
}

/** 하루 안의 결강 구간. 분 단위(0~1440) */
export interface AbsenceWindow {
  /** 로컬 날짜 yyyy-MM-dd */
  date: string;
  /** ISO 요일 1(월)~7(일) */
  weekday: number;
  startMinutes: number;
  endMinutes: number;
}

export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * 일정의 시작·끝에서 결강 구간을 만든다.
 * - `dateOnly`(하루 종일)면 그날 전체.
 * - 끝이 다음 날 이후면 시작일 자정까지로 자른다(여러 날 일정은 다루지 않는다).
 * - 끝이 시작보다 앞서거나 같으면 구간이 없다(null).
 */
export function absenceWindowOf(
  startsAt: string | Date,
  endsAt: string | Date,
  dateOnly?: boolean
): AbsenceWindow | null {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const date = format(start, 'yyyy-MM-dd');
  const weekday = isoWeekday(start);
  if (dateOnly) return { date, weekday, startMinutes: 0, endMinutes: 24 * 60 };

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes =
    format(end, 'yyyy-MM-dd') === date ? end.getHours() * 60 + end.getMinutes() : 24 * 60;
  if (endMinutes <= startMinutes) return null;
  return { date, weekday, startMinutes, endMinutes };
}

type PeriodTimes = Record<number, { start: string; end: string }>;

/**
 * 결강 구간과 **조금이라도** 겹치는 교시. 10:30 에 나가면 2교시(10:00~10:50)도 걸린다.
 * 끝이 교시 시작과 딱 맞으면(10:00 까지) 그 교시는 걸리지 않는다 — 경계는 반열린 구간이다.
 */
export function periodsInWindow(
  window: Pick<AbsenceWindow, 'startMinutes' | 'endMinutes'>,
  periodTimes: PeriodTimes = TIME_CONFIG.PERIOD_TIMES
): number[] {
  return Object.entries(periodTimes)
    .map(([period, time]) => ({
      period: Number(period),
      start: hhmmToMinutes(time.start),
      end: hhmmToMinutes(time.end),
    }))
    .filter((p) => p.start < window.endMinutes && p.end > window.startMinutes)
    .map((p) => p.period)
    .sort((a, b) => a - b);
}

/** 그 날짜·교시가 결강 구간 안인가 — 교체 상대 날짜를 고를 때 쓴다 */
export function isSlotInAbsence(
  window: AbsenceWindow,
  date: string,
  period: number,
  periodTimes: PeriodTimes = TIME_CONFIG.PERIOD_TIMES
): boolean {
  if (date !== window.date) return false;
  return periodsInWindow(window, periodTimes).includes(period);
}

/**
 * 교체 요청에 남길 사유.
 * ⚠ 개인일정은 제목·설명을 절대 싣지 않는다 — 사유는 상대 선생님의 교체 관리 목록에 그대로 보인다.
 */
export function absenceReason(kind: AbsenceKind, title?: string): string {
  if (kind === 'personal') return '개인 사정으로 수업을 할 수 없습니다.';
  const t = title?.trim();
  return t ? `출장(${t})으로 수업을 할 수 없습니다.` : '출장으로 수업을 할 수 없습니다.';
}

/**
 * 이 일정에 **내가** 빠지는가.
 * - 개인일정: 만든 사람 본인.
 * - 출장: 대상자(`meta.assignee`) 에 내가 있다. 저장 형식이 두 갈래다 —
 *   `{ "이름": { name } }` 객체(현행) · 쉼표로 이은 이름/id 문자열(구 데이터).
 *   대상자가 없는 출장(교무회의처럼 쓰인 행)은 아무도 빠지지 않는 것으로 본다.
 */
export function isAbsenceParticipant(
  meeting: { kind: string; created_by?: string | null; assignee?: unknown },
  me: { resourceId?: string | null; name?: string | null }
): boolean {
  if (meeting.kind === 'personal') {
    return !!me.resourceId && meeting.created_by === me.resourceId;
  }
  if (meeting.kind !== 'event') return false;
  const participants = absenceParticipantKeys(meeting.assignee);
  return (
    (!!me.resourceId && participants.includes(me.resourceId)) ||
    (!!me.name && participants.includes(me.name.trim()))
  );
}

/** 출장 대상자 표기를 이름/id 목록으로 편다 */
export function absenceParticipantKeys(assignee: unknown): string[] {
  if (!assignee) return [];
  if (typeof assignee === 'string') {
    return assignee
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(assignee)) {
    return assignee.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof assignee === 'object') {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(assignee as Record<string, unknown>)) {
      keys.push(key.trim());
      const name = (value as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.trim() && name.trim() !== key.trim()) {
        keys.push(name.trim());
      }
    }
    return keys.filter(Boolean);
  }
  return [];
}

/* ─────────────────────────── 결강 수업 목록 ─────────────────────────── */

/** 시간표 한 칸 — `useTimetableData` 의 `TimetableEntry` 중 여기서 쓰는 필드만 */
export interface AbsenceTimetableEntry {
  id: string;
  type: 'pattern' | 'meeting';
  weekday: number;
  period: number;
  subject?: string;
  grade?: number;
  class_number?: string;
  section_id?: string;
  is_swapped?: boolean;
  swap_date?: string;
}

/** `class_swap` 행 중 여기서 쓰는 필드만 */
export interface AbsenceSwapRow {
  id: string;
  status: string;
  requester_resource_id: string;
  requester_swap_date: string;
  requester_original_period: number;
  approver_swap_date: string;
  approver_original_period: number;
  requested_at?: string;
  meta?: {
    type?: string;
    approver_name?: string;
    requester_section_name?: string;
    grade?: number | string;
    class?: number | string;
    absence_meeting_id?: string;
  } | null;
}

/**
 * - `unhandled`: 아무 요청도 없다(또는 거절·취소만 있다)
 * - `pending`: 요청을 보내고 응답을 기다린다
 * - `approved`: 교체/대체가 승인됐다 → 결강 해결
 * - `swapped_in`: 다른 교체로 **내가 맡게 된** 수업이다. 여기서 다시 교체할 수 없고
 *   원래 교체를 조정해야 한다(교체 관리) — 처리 대상이지만 이 화면의 버튼으로는 못 푼다.
 */
export type AbsenceLessonState = 'unhandled' | 'pending' | 'approved' | 'swapped_in';

export interface AbsenceLesson<E extends AbsenceTimetableEntry = AbsenceTimetableEntry> {
  period: number;
  state: AbsenceLessonState;
  /** 시간표 칸. 승인돼 시간표에서 빠진 수업은 없을 수 있다 */
  entry?: E;
  subject: string;
  gradeClass?: string;
  /** pending/approved 를 만든 요청 */
  swap?: AbsenceSwapRow;
  /** 가장 최근의 거절 — `unhandled` 일 때 "거절됨, 다시 요청" 을 말하려고 */
  lastRejected?: AbsenceSwapRow;
}

const gradeClassText = (grade?: number | string, cls?: number | string) =>
  grade != null && cls != null && String(grade) !== '' && String(cls) !== ''
    ? `${grade}학년 ${cls}반`
    : undefined;

const byRequestedDesc = (a: AbsenceSwapRow, b: AbsenceSwapRow) =>
  String(b.requested_at ?? '').localeCompare(String(a.requested_at ?? ''));

/**
 * 결강 구간에 걸린 내 수업과 처리 상태.
 *
 * @param entries  그 **주**의 실제 시간표(`useTimetableData(나, 그날)`) — 승인된 교체가 이미 반영돼 있다.
 * @param mySwaps  내가 **요청자**이고 `requester_swap_date` 가 그날인 교체/대체 전부(상태 무관)
 *
 * 승인된 요청의 수업은 실제 시간표에서 이미 빠져 있으므로 `entries` 만 보면 사라진다
 * → 요청 행에서 되살려 `approved` 로 보여 준다(안 그러면 해결한 수업이 목록에서 없어져
 *   "처리 1/3" 이 "처리 0/2" 로 바뀐다).
 */
export function buildAbsenceLessons<E extends AbsenceTimetableEntry>(
  window: AbsenceWindow,
  entries: E[],
  mySwaps: AbsenceSwapRow[],
  myResourceId: string,
  periodTimes: PeriodTimes = TIME_CONFIG.PERIOD_TIMES
): AbsenceLesson<E>[] {
  const periods = new Set(periodsInWindow(window, periodTimes));
  const swapsOn = mySwaps.filter(
    (s) =>
      s.requester_resource_id === myResourceId &&
      s.requester_swap_date === window.date &&
      periods.has(s.requester_original_period)
  );
  const swapsFor = (period: number) =>
    swapsOn.filter((s) => s.requester_original_period === period).sort(byRequestedDesc);

  const rows = new Map<number, AbsenceLesson<E>>();

  for (const entry of entries) {
    if (entry.type !== 'pattern') continue;
    if (entry.weekday !== window.weekday || !periods.has(entry.period)) continue;
    if (entry.is_swapped && entry.swap_date && entry.swap_date !== window.date) continue;

    const subject = entry.subject ?? '수업';
    const gradeClass = gradeClassText(entry.grade, entry.class_number);

    if (entry.is_swapped) {
      rows.set(entry.period, { period: entry.period, state: 'swapped_in', entry, subject, gradeClass });
      continue;
    }

    const related = swapsFor(entry.period);
    const pending = related.find((s) => s.status === 'pending');
    const approved = related.find((s) => s.status === 'approved');
    const lastRejected = related.find((s) => s.status === 'rejected');
    rows.set(entry.period, {
      period: entry.period,
      state: approved ? 'approved' : pending ? 'pending' : 'unhandled',
      entry,
      subject,
      gradeClass,
      swap: approved ?? pending,
      lastRejected: approved || pending ? undefined : lastRejected,
    });
  }

  // 승인돼 시간표에서 빠진 수업을 되살린다
  for (const swap of swapsOn) {
    if (swap.status !== 'approved' || rows.has(swap.requester_original_period)) continue;
    rows.set(swap.requester_original_period, {
      period: swap.requester_original_period,
      state: 'approved',
      subject: swap.meta?.requester_section_name || '수업',
      gradeClass: gradeClassText(swap.meta?.grade, swap.meta?.class),
      swap,
    });
  }

  return [...rows.values()].sort((a, b) => a.period - b.period);
}

export interface AbsenceSummary {
  total: number;
  /** 승인돼 해결된 수 */
  resolved: number;
  pending: number;
  /** 아무 요청이 없거나 교체 관리에서 조정해야 하는 수 */
  open: number;
}

export function summarizeAbsenceLessons(lessons: Pick<AbsenceLesson, 'state'>[]): AbsenceSummary {
  const resolved = lessons.filter((l) => l.state === 'approved').length;
  const pending = lessons.filter((l) => l.state === 'pending').length;
  return { total: lessons.length, resolved, pending, open: lessons.length - resolved - pending };
}

/**
 * 교체·대체 신청 모달에 넘기는 결강 맥락.
 * 있으면 신청 모달이 ①내 날짜를 결강일로 고정하고 ②결강 구간 안의 칸을 막고
 * ③사유를 채우고 ④요청 meta 에 출처를 남긴다.
 */
export interface AbsenceContext {
  meetingId: string;
  kind: AbsenceKind;
  /** 출장 제목. 개인일정이면 넘기지 않는다(사유에 실리면 안 된다) */
  title?: string;
  window: AbsenceWindow;
  /** 같은 출장에 가는 다른 선생님(이름·id) — 이들은 그 시간에 없으므로 상대 후보에서 막는다 */
  coParticipantKeys?: string[];
}

/** 이 선생님이 같은 결강에 함께 빠지는가 */
export function isCoParticipant(
  absence: Pick<AbsenceContext, 'coParticipantKeys'> | undefined,
  teacher: { id?: string | null; name?: string | null }
): boolean {
  const keys = absence?.coParticipantKeys;
  if (!keys || keys.length === 0) return false;
  return (!!teacher.id && keys.includes(teacher.id)) || (!!teacher.name && keys.includes(teacher.name.trim()));
}

/** 요청 meta 에 붙일 결강 출처 — 개인일정은 제목을 싣지 않는다 */
export function absenceSwapMeta(absence: AbsenceContext | undefined) {
  if (!absence) return {};
  return { absence_meeting_id: absence.meetingId, absence_kind: absence.kind };
}

/* ─────────────────────────── 교체 상대 날짜 ─────────────────────────── */

/**
 * 결강 날짜가 정해진 교체에서, 상대 수업을 내가 맡을 날짜 선택지.
 *
 * 기존 신청 모달은 "이번 주부터 4주" 였지만 결강은 한 달 뒤일 수도 있다 →
 * **결강 주의 앞 1주 ~ 뒤 2주** 에서 상대 요일의 날짜를 만들고 지난 날은 뺀다.
 * 결강 구간 안의 칸(같은 날, 걸린 교시)은 `blocked` 로 표시만 한다(목록에서 지우면
 * 왜 그 날이 없는지 알 수 없다).
 */
export function absenceApproverDateOptions(
  window: AbsenceWindow,
  approverWeekday: number,
  approverPeriod: number,
  today: Date,
  periodTimes: PeriodTimes = TIME_CONFIG.PERIOD_TIMES
): { date: string; blocked: boolean }[] {
  const base = new Date(`${window.date}T00:00:00`);
  // 결강 주의 월요일
  const monday = new Date(base);
  monday.setDate(base.getDate() - (window.weekday - 1));
  const todayKey = format(today, 'yyyy-MM-dd');

  const out: { date: string; blocked: boolean }[] = [];
  for (let week = -1; week <= 2; week += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + week * 7 + (approverWeekday - 1));
    const key = format(d, 'yyyy-MM-dd');
    if (key < todayKey) continue;
    out.push({ date: key, blocked: isSlotInAbsence(window, key, approverPeriod, periodTimes) });
  }
  return out;
}
