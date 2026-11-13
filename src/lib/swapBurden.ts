/**
 * 수업 교체·대체가 **상대 선생님에게 지우는 부담**을 점수화한다 (React 비의존 순수 모듈).
 *
 * 왜 필요한가: 후보 목록을 요일·교시 순으로 늘어놓으면 신청자는 "누가 덜 힘든가"를 알 수 없어
 * 맨 위 사람에게 몰아서 부탁하게 된다. 부담이 적은 순으로 세우면 기본 선택이 곧 배려가 된다.
 *
 * 기준값은 **학교가 이미 쓰고 있는 시간표 자동생성기의 교사 부하 제약**을 그대로 가져왔다
 * (`src/features/timetable-generator/constants.ts` — 하루 4개 / 연속 2교시 / 마지막 교시 주 3회).
 * 새 잣대를 만들면 생성기가 지키는 규칙과 화면이 권하는 순서가 어긋난다.
 */

/** 시간표 자동생성기와 동일한 교사 부하 한계 */
export const TEACHER_LOAD_LIMITS = {
  /** 하루 최대 수업 수 */
  maxPerDay: 4,
  /** 연속 최대 교시 수 (3연강부터 위반) */
  maxConsecutive: 2,
  /** 마지막 교시로 취급할 교시 */
  lastPeriod: 7,
  /** 마지막 교시 주간 최대 횟수 */
  maxLastPeriodPerWeek: 3,
} as const;

/**
 * 요인별 가중치. 상대적 크기만 의미가 있다.
 * 연강 > 일일 초과 > 빈 날 소멸 > 마지막 교시 순으로 체감 부담이 크다고 본다.
 */
const WEIGHTS = {
  consecutive: 3,
  dailyOver: 2,
  emptyDayLost: 2,
  lastPeriodOver: 1,
} as const;

export interface BurdenSlot {
  weekday: number;
  period: number;
}

export type BurdenLevel = 'low' | 'medium' | 'high';

export interface BurdenResult {
  /** 부담 증가량. 낮을수록 좋고, 음수면 오히려 가벼워진다 */
  delta: number;
  /** 교체·대체 후 주간 수업 수 — 동점일 때 덜 바쁜 교사를 앞세우는 데 쓴다 */
  totalAfter: number;
  level: BurdenLevel;
  /** 새로 생기는 문제만 사람 말로. 문제가 없으면 빈 배열 */
  reasons: string[];
}

interface PenaltyBreakdown {
  score: number;
  consecutiveExcess: number;
  dailyExcess: number;
  emptyDays: number;
  lastPeriodExcess: number;
  /** 하루 수업 수가 가장 많은 날의 개수 (사유 문구용) */
  maxDailyCount: number;
}

const slotKey = (slot: BurdenSlot) => `${slot.weekday}-${slot.period}`;

/** 주간 슬롯 집합의 절대 부담 점수 */
function penaltyOf(slots: Set<string>): PenaltyBreakdown {
  const byDay = new Map<number, number[]>();
  let lastPeriodCount = 0;

  for (const key of slots) {
    const [weekdayText, periodText] = key.split('-');
    const weekday = Number(weekdayText);
    const period = Number(periodText);
    if (!Number.isFinite(weekday) || !Number.isFinite(period)) continue;

    const periods = byDay.get(weekday) ?? [];
    periods.push(period);
    byDay.set(weekday, periods);

    if (period >= TEACHER_LOAD_LIMITS.lastPeriod) lastPeriodCount += 1;
  }

  let consecutiveExcess = 0;
  let dailyExcess = 0;
  let emptyDays = 0;
  let maxDailyCount = 0;

  // 평일 5일을 기준으로 본다 — 수업이 하나도 없는 날(=온전한 여유)을 셀 수 있어야 하므로
  // byDay 를 순회하는 것으로는 부족하다.
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    const periods = (byDay.get(weekday) ?? []).slice().sort((a, b) => a - b);
    if (periods.length === 0) {
      emptyDays += 1;
      continue;
    }

    maxDailyCount = Math.max(maxDailyCount, periods.length);
    dailyExcess += Math.max(0, periods.length - TEACHER_LOAD_LIMITS.maxPerDay);

    // 연속 구간마다 한계를 넘는 만큼 누적 (3연강 = 1, 4연강 = 2 …)
    let runLength = 1;
    for (let i = 1; i <= periods.length; i += 1) {
      const continues = i < periods.length && periods[i] === periods[i - 1] + 1;
      if (continues) {
        runLength += 1;
        continue;
      }
      consecutiveExcess += Math.max(0, runLength - TEACHER_LOAD_LIMITS.maxConsecutive);
      runLength = 1;
    }
  }

  const lastPeriodExcess = Math.max(
    0,
    lastPeriodCount - TEACHER_LOAD_LIMITS.maxLastPeriodPerWeek
  );

  const score =
    consecutiveExcess * WEIGHTS.consecutive +
    dailyExcess * WEIGHTS.dailyOver +
    lastPeriodExcess * WEIGHTS.lastPeriodOver -
    // 여유로운 날은 감점(=점수를 낮춘다). 그 날에 수업이 생기면 자연히 delta 가 오른다.
    emptyDays * WEIGHTS.emptyDayLost;

  return { score, consecutiveExcess, dailyExcess, emptyDays, lastPeriodExcess, maxDailyCount };
}

/**
 * 상대 교사가 `add` 시간을 맡고(교체라면 `remove` 시간을 내려놓을 때) 늘어나는 부담.
 *
 * - 교체: add = 내 수업 시간, remove = 상대의 원래 수업 시간
 * - 대체: add = 내 수업 시간, remove 없음 (수업이 순수하게 하나 늘어난다)
 */
export function evaluateSwapBurden(params: {
  teacherSlots: BurdenSlot[];
  add: BurdenSlot;
  remove?: BurdenSlot;
}): BurdenResult {
  const { teacherSlots, add, remove } = params;

  const before = new Set(teacherSlots.map(slotKey));
  const after = new Set(before);
  if (remove) after.delete(slotKey(remove));
  after.add(slotKey(add));

  const beforePenalty = penaltyOf(before);
  const afterPenalty = penaltyOf(after);
  const delta = afterPenalty.score - beforePenalty.score;

  const reasons: string[] = [];
  if (afterPenalty.consecutiveExcess > beforePenalty.consecutiveExcess) {
    reasons.push(`연속 ${TEACHER_LOAD_LIMITS.maxConsecutive + 1}교시 이상 수업이 생깁니다`);
  }
  if (afterPenalty.dailyExcess > beforePenalty.dailyExcess) {
    reasons.push(`그날 수업이 ${afterPenalty.maxDailyCount}개가 됩니다`);
  }
  if (afterPenalty.emptyDays < beforePenalty.emptyDays) {
    reasons.push('수업이 없던 날에 수업이 생깁니다');
  }
  if (afterPenalty.lastPeriodExcess > beforePenalty.lastPeriodExcess) {
    reasons.push(`마지막 교시 수업이 주 ${TEACHER_LOAD_LIMITS.maxLastPeriodPerWeek}회를 넘습니다`);
  }

  return {
    delta,
    totalAfter: after.size,
    level: delta <= 0 ? 'low' : delta <= 2 ? 'medium' : 'high',
    reasons,
  };
}

export const BURDEN_LEVEL_LABEL: Record<BurdenLevel, string> = {
  low: '부담 적음',
  medium: '보통',
  high: '부담 큼',
};

/**
 * 부담이 적은 순 비교자. 동점이면 덜 바쁜 교사 → 이른 요일·교시 순.
 * (정렬을 화면마다 다시 쓰지 않도록 여기서 한 번만 정의한다.)
 */
export function compareBurden(
  a: { burden: BurdenResult; weekday?: number; period?: number },
  b: { burden: BurdenResult; weekday?: number; period?: number }
): number {
  if (a.burden.delta !== b.burden.delta) return a.burden.delta - b.burden.delta;
  if (a.burden.totalAfter !== b.burden.totalAfter) return a.burden.totalAfter - b.burden.totalAfter;
  if ((a.weekday ?? 0) !== (b.weekday ?? 0)) return (a.weekday ?? 0) - (b.weekday ?? 0);
  return (a.period ?? 0) - (b.period ?? 0);
}
