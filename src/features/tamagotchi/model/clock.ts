/**
 * 다마고찌의 시계 — 한국 시각과 «학교 시간표 위의 하루».
 *
 * 펫의 시간은 5분 칸(tick)으로 흐른다. 칸 번호는 유닉스 시각을 5분으로 나눈 **절대값**이라
 * 어느 기기에서 언제 계산해도 같은 칸 경계를 쓴다 — 그래서 «A→C 한 번»과 «A→B, B→C 두 번»이
 * 정확히 같은 결과를 낸다(지연 계산의 전제. 회귀가 이 성질을 검사한다).
 *
 * 한국은 서머타임이 없어 UTC+9 고정이다. 기기의 시간대를 믿지 않는다 — 해외에서 열어도
 * 펫은 학교의 시간에 산다.
 */

export const TICK_MS = 5 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const tickOf = (ms: number): number => Math.floor(ms / TICK_MS);
export const tickStartMs = (tick: number): number => tick * TICK_MS;

export interface KstParts {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 1=월 … 7=일 (ISO) */
  weekday: number;
  /** 자정부터의 분 (0..1439) */
  minutes: number;
}

export function kstParts(ms: number): KstParts {
  const shifted = ms + KST_OFFSET_MS;
  const dayIndex = Math.floor(shifted / DAY_MS);
  const minutes = Math.floor((shifted - dayIndex * DAY_MS) / 60000);
  // 1970-01-01 은 목요일(ISO 4)
  const weekday = (((dayIndex + 3) % 7) + 7) % 7 + 1;
  const date = new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
  return { date, weekday, minutes };
}

export const hhmmToMinutes = (value: string): number => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

export interface PeriodWindow {
  period: number;
  start: number; // 분
  end: number; // 분 (끝 미포함)
}

/**
 * 펫이 사는 학교의 일정.
 * - `classes[weekday]` = 수업이 있는 교시 번호들(시간표 패턴). 비어 있으면 그날은 수업이 없다.
 * - `noClassDates` = 휴업일·공휴일처럼 요일 패턴이 있어도 수업이 없는 날.
 * - `noClassPeriods[date]` = 그날만 빠지는 교시(2026-10-13) — 일부 학년만 쉬는 날(1학년 수학여행)에
 *   선생님은 그 학년 수업만 빠진다. 학생은 자기 학년으로 판정해 `noClassDates` 로 충분하다.
 * - `term` = 학기 기간. 주면 그 밖(방학)에는 수업이 없다. 없으면 기간을 모르는 것으로 보고 요일 패턴만 쓴다.
 * - `sleep` = 펫이 자는 시간(분). 자정을 넘는 구간을 허용한다(23:00 → 07:00).
 */
export interface SchoolSchedule {
  classes: Record<number, number[]>;
  periods: PeriodWindow[];
  noClassDates?: ReadonlySet<string>;
  noClassPeriods?: Readonly<Record<string, readonly number[]>>;
  term?: { start: string; end: string } | null;
  sleep: { start: number; end: number };
}

export const DEFAULT_SLEEP = { start: 23 * 60, end: 7 * 60 };

/** 시간표 없이도 펫이 살 수 있는 기본 일정 — 수업 정지가 없을 뿐 잠은 잔다. */
export const EMPTY_SCHEDULE: SchoolSchedule = {
  classes: {},
  periods: [],
  sleep: DEFAULT_SLEEP,
};

export type Activity = 'sleep' | 'class' | 'awake';

export function isSleepMinute(minutes: number, sleep: SchoolSchedule['sleep']): boolean {
  if (sleep.start === sleep.end) return false;
  return sleep.start < sleep.end
    ? minutes >= sleep.start && minutes < sleep.end
    : minutes >= sleep.start || minutes < sleep.end;
}

/** 그 시각에 진행 중인 교시(수업이 실제로 있는 교시만). 없으면 null. */
export function classPeriodAt(ms: number, schedule: SchoolSchedule): number | null {
  const { date, weekday, minutes } = kstParts(ms);
  const periods = schedule.classes[weekday];
  if (!periods || periods.length === 0) return null;
  if (schedule.noClassDates?.has(date)) return null;
  if (schedule.term && (date < schedule.term.start || date > schedule.term.end)) return null;
  const skipped = schedule.noClassPeriods?.[date];
  for (const window of schedule.periods) {
    if (minutes >= window.start && minutes < window.end && periods.includes(window.period) && !skipped?.includes(window.period)) {
      return window.period;
    }
  }
  return null;
}

/**
 * 한 칸의 활동. 칸의 **가운데 시각**으로 판정한다 — 경계(09:00 정각)에서 앞 칸·뒤 칸이
 * 서로 다른 답을 내지 않게.
 */
export function activityOfTick(tick: number, schedule: SchoolSchedule): Activity {
  const mid = tickStartMs(tick) + TICK_MS / 2;
  if (classPeriodAt(mid, schedule) !== null) return 'class';
  if (isSleepMinute(kstParts(mid).minutes, schedule.sleep)) return 'sleep';
  return 'awake';
}
