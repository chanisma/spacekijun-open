// 자습실 통계 — 표시용 순수 함수. 판정은 서버가 하고, 여기는 이름·색·날짜 칸만 만든다.
import type { AttendanceStatus, DayEntry, StatsFilters, StatsRoom } from '../types';

/** 오늘(KST)이 속한 달의 1일 ~ 말일 */
export function defaultMonthFilters(now: Date = new Date()): StatsFilters {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, '0');
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(last).padStart(2, '0')}`,
    grade: null,
    room: null,
    includeFuture: false,
  };
}

/** 같은 길이의 직전 기간으로 옮기기(달 단위면 달 단위로) */
export function shiftMonth(f: StatsFilters, delta: number): StatsFilters {
  const [y, m] = f.start.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const ny = d.getUTCFullYear();
  const nm = d.getUTCMonth();
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const mm = String(nm + 1).padStart(2, '0');
  return { ...f, start: `${ny}-${mm}-01`, end: `${ny}-${mm}-${String(last).padStart(2, '0')}` };
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  attended: '출석',
  excused: '인정',
  supplement: '보완',
  absent: '결석',
  pending: '대기',
};

/** 상태 색 — 앱 규약(에메랄드=완료 · 로즈=결석 · 슬레이트=대기). 표면 대비 3:1 이상 */
export const STATUS_COLOR: Record<AttendanceStatus, string> = {
  attended: '#059669',
  excused: '#0284c7',
  supplement: '#7c3aed',
  absent: '#e11d48',
  pending: '#94a3b8',
};

export const STATUS_CELL: Record<AttendanceStatus, string> = {
  attended: 'bg-emerald-500 text-white',
  excused: 'bg-sky-600 text-white',
  supplement: 'bg-violet-600 text-white',
  absent: 'bg-rose-500 text-white',
  pending: 'bg-slate-200 text-slate-600',
};

/** 학년 선 색(차트) — 학년 의미로만 쓴다 */
export const GRADE_COLOR: Record<string, string> = {
  '1': '#2563eb',
  '2': '#059669',
  '3': '#d97706',
};

/**
 * 하루 대표 상태 — 교시가 여럿일 때 가장 «주의가 필요한» 것을 보인다.
 * 결석 > 대기 > 인정 > 보완 > 출석 (seaton 일별 매트릭스 요약 보기와 같은 순서).
 */
const DAY_PRIORITY: AttendanceStatus[] = ['absent', 'pending', 'excused', 'supplement', 'attended'];
export function dayStatus(entries: DayEntry[] | undefined): AttendanceStatus | null {
  if (!entries || entries.length === 0) return null;
  for (const s of DAY_PRIORITY) if (entries.some((e) => e[1] === s)) return s;
  return null;
}

/** 기간의 날짜 목록(YYYY-MM-DD). 주말은 기록이 있는 날만 남긴다. */
export function dateColumns(start: string, end: string, usedDates: Set<string>): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  const cur = new Date(Date.UTC(ys, ms - 1, ds));
  const last = new Date(Date.UTC(ye, me - 1, de));
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10);
    const dow = cur.getUTCDay();
    if ((dow !== 0 && dow !== 6) || usedDates.has(iso)) out.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

export function weekdayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 월~금 칸 — 아침/야간 열람실을 나눠 «아침·야간» 표기 */
export function weekdaySessions(roomIdx: number[] | undefined, rooms: StatsRoom[]): { morning: boolean; evening: boolean } {
  let morning = false;
  let evening = false;
  for (const i of roomIdx ?? []) {
    if (rooms[i]?.[2]) morning = true;
    else evening = true;
  }
  return { morning, evening };
}

export function formatRate(rate: number | null | undefined): string {
  return rate == null ? '—' : `${rate.toFixed(1)}%`;
}

export function formatSigned(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** 학번 표기 — 학년·반·번호가 있으면 10419 꼴, 없으면 학적 코드 */
export function studentNo(p: { grade: number | null; class: number | null; number: number | null; sid?: string | null }): string {
  if (p.grade && p.class && p.number) {
    return `${p.grade}${String(p.class).padStart(2, '0')}${String(p.number).padStart(2, '0')}`;
  }
  return p.sid ?? '';
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y.slice(2)}.${Number(m)}월`;
}

export function weekLabel(isoMonday: string): string {
  const [, m, d] = isoMonday.split('-').map(Number);
  return `${m}/${d}주`;
}
