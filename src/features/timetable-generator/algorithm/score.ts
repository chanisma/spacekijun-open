import type {
  CandidateMetrics,
  Placement,
  ScoreBreakdown,
  SoftPenalty,
  TimetableInput,
} from '../types';
import type { ConflictGraph } from './conflictGraph';
import type { CellKey } from './csp';
import { cellKeyStr } from './csp';

export interface ScoreContext {
  input: TimetableInput;
  graph: ConflictGraph;
}

/** 배치 표현: lessonId -> 칸. SA가 가변으로 적용/되돌리며 점수만 재계산한다. */
export type AssignmentMap = Map<string, CellKey>;

export function placementsToMap(placements: Placement[]): AssignmentMap {
  const m: AssignmentMap = new Map();
  for (const p of placements) m.set(p.lessonId, { dayIndex: p.dayIndex, period: p.period });
  return m;
}

export function mapToPlacements(map: AssignmentMap): Placement[] {
  const out: Placement[] = [];
  for (const [lessonId, cell] of map) {
    out.push({ lessonId, dayIndex: cell.dayIndex, period: cell.period });
  }
  return out;
}

const MAX_DETAIL = 8;
function summarize(arr: string[]): string[] {
  if (arr.length <= MAX_DETAIL) return arr;
  return [...arr.slice(0, MAX_DETAIL), `…및 ${arr.length - MAX_DETAIL}건 더`];
}

/**
 * 정렬된 교시 집합에서 "연속 런이 maxRun을 넘는 칸 수" 합.
 * 런 길이 L이 maxRun 초과면 (L − maxRun)을 더한다 (maxRun=2면 3연속=1, 4연속=2 …).
 * = 길이 L 런이 품는 (maxRun+1)-연속 윈도 개수와 일치하는 매끄러운 그라디언트.
 */
function consecutiveExcess(periods: Set<number>, maxRun: number): number {
  if (periods.size <= maxRun) return 0;
  const sorted = [...periods].sort((a, b) => a - b);
  let excess = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) run++;
    else {
      if (run > maxRun) excess += run - maxRun;
      run = 1;
    }
  }
  if (run > maxRun) excess += run - maxRun;
  return excess;
}

/** day -> 점유 교시 집합에서 내부 공강(첫~끝 사이 빈 교시) 합 */
function internalGaps(byDay: Map<number, Set<number>>): number {
  let gaps = 0;
  for (const periods of byDay.values()) {
    if (periods.size <= 1) continue;
    let min = Infinity;
    let max = -Infinity;
    for (const p of periods) {
      if (p < min) min = p;
      if (p > max) max = p;
    }
    gaps += max - min + 1 - periods.size;
  }
  return gaps;
}

interface Aggregates {
  classDayPeriods: Map<string, Map<number, Set<number>>>; // classKey -> day -> periods
  teacherDayPeriods: Map<string, Map<number, Set<number>>>; // teacherId -> day -> periods
  offeringDay: Map<string, number>; // "offeringId|day" -> count
  offeringDayPeriods: Map<string, Map<number, number[]>>; // offeringId -> day -> periods[]
  classDayMajor: Map<string, number>; // "classKey|day" -> major lesson count
  // "teacherId|offeringId" -> day -> periods (같은 분반-같은 교사 연속 검사)
  teacherSubjectDayPeriods: Map<string, Map<number, Set<number>>>;
  teacherLastPeriodCount: Map<string, number>; // teacherId -> 주간 마지막 교시 수업 수
}

function aggregate(map: AssignmentMap, ctx: ScoreContext): Aggregates {
  const classDayPeriods = new Map<string, Map<number, Set<number>>>();
  const teacherDayPeriods = new Map<string, Map<number, Set<number>>>();
  const offeringDay = new Map<string, number>();
  const offeringDayPeriods = new Map<string, Map<number, number[]>>();
  const classDayMajor = new Map<string, number>();
  const teacherSubjectDayPeriods = new Map<string, Map<number, Set<number>>>();
  const teacherLastPeriodCount = new Map<string, number>();
  const lastPeriod = ctx.input.grid.periodsPerDay;

  const addPeriod = (
    store: Map<string, Map<number, Set<number>>>,
    key: string,
    day: number,
    period: number,
  ) => {
    let byDay = store.get(key);
    if (!byDay) {
      byDay = new Map();
      store.set(key, byDay);
    }
    let set = byDay.get(day);
    if (!set) {
      set = new Set();
      byDay.set(day, set);
    }
    set.add(period);
  };

  for (const [lessonId, cell] of map) {
    const lesson = ctx.graph.byLessonId.get(lessonId);
    if (!lesson) continue;
    const { dayIndex: day, period } = cell;

    for (const ck of lesson.classKeys) {
      addPeriod(classDayPeriods, ck, day, period);
      if (lesson.isMajor) {
        const mk = `${ck}|${day}`;
        classDayMajor.set(mk, (classDayMajor.get(mk) ?? 0) + 1);
      }
    }
    if (lesson.teacherId) {
      addPeriod(teacherDayPeriods, lesson.teacherId, day, period);
      addPeriod(teacherSubjectDayPeriods, `${lesson.teacherId}|${lesson.offeringId}`, day, period);
      if (period === lastPeriod) {
        teacherLastPeriodCount.set(lesson.teacherId, (teacherLastPeriodCount.get(lesson.teacherId) ?? 0) + 1);
      }
    }

    const odk = `${lesson.offeringId}|${day}`;
    offeringDay.set(odk, (offeringDay.get(odk) ?? 0) + 1);
    let byDay = offeringDayPeriods.get(lesson.offeringId);
    if (!byDay) {
      byDay = new Map();
      offeringDayPeriods.set(lesson.offeringId, byDay);
    }
    const arr = byDay.get(day) ?? [];
    arr.push(period);
    byDay.set(day, arr);
  }

  return {
    classDayPeriods,
    teacherDayPeriods,
    offeringDay,
    offeringDayPeriods,
    classDayMajor,
    teacherSubjectDayPeriods,
    teacherLastPeriodCount,
  };
}

/** 인접 교시 쌍 수 (같은 분반 연속 위반 계수) */
function adjacentPairs(periods: Set<number>): number {
  let pairs = 0;
  for (const p of periods) if (periods.has(p + 1)) pairs++;
  return pairs;
}

/** 소프트 점수 (반 단위 집계 — 빠르고 "반별 빈칸 최소화" 목표와 일치) */
export function evaluateSoft(map: AssignmentMap, ctx: ScoreContext): {
  total: number;
  soft: SoftPenalty[];
  agg: Aggregates;
} {
  const w = ctx.input.weights;
  const agg = aggregate(map, ctx);

  // S1 학생(반) 중간 공강
  let classGap = 0;
  const classGapDetails: string[] = [];
  for (const [ck, byDay] of agg.classDayPeriods) {
    const g = internalGaps(byDay);
    if (g > 0) {
      classGap += g;
      classGapDetails.push(`${ck} 공강 ${g}칸`);
    }
  }

  // S2 같은 과목 같은 날 중복
  let subjectSameDay = 0;
  for (const cnt of agg.offeringDay.values()) if (cnt > 1) subjectSameDay += cnt - 1;

  // S3 같은 과목 연속 교시
  let subjectConsecutive = 0;
  for (const byDay of agg.offeringDayPeriods.values()) {
    for (const periods of byDay.values()) {
      const sorted = [...periods].sort((a, b) => a - b);
      for (let i = 0; i + 1 < sorted.length; i++) {
        if (sorted[i + 1] - sorted[i] === 1) subjectConsecutive++;
      }
    }
  }

  // S4 교사 중간 공강
  let teacherGap = 0;
  const teacherGapDetails: string[] = [];
  for (const [tid, byDay] of agg.teacherDayPeriods) {
    const g = internalGaps(byDay);
    if (g > 0) {
      teacherGap += g;
      teacherGapDetails.push(`교사 ${tid.slice(0, 8)} 공강 ${g}칸`);
    }
  }

  // S5 반별 일일 수업 편차 (분산 합)
  let dailyBalance = 0;
  for (const byDay of agg.classDayPeriods.values()) {
    const counts: number[] = [];
    for (const periods of byDay.values()) counts.push(periods.size);
    if (counts.length === 0) continue;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    dailyBalance += variance;
  }

  // S6 주요교과 같은 날 집중
  let majorClustering = 0;
  for (const cnt of agg.classDayMajor.values()) if (cnt > 1) majorClustering += cnt - 1;

  // S7 교사 하루 부하 상한 초과 / S8 교사 연속 수업 상한 초과
  const teacherCap = ctx.input.options.maxPerTeacherPerDay ?? 4;
  const teacherMaxRun = ctx.input.options.maxConsecutivePerTeacher ?? 2;
  let teacherDailyLoad = 0;
  let teacherConsecutive = 0;
  const teacherLoadDetails: string[] = [];
  for (const [tid, byDay] of agg.teacherDayPeriods) {
    for (const periods of byDay.values()) {
      if (periods.size > teacherCap) {
        teacherDailyLoad += periods.size - teacherCap;
        teacherLoadDetails.push(`교사 ${tid.slice(0, 8)} 하루 ${periods.size}개`);
      }
      teacherConsecutive += consecutiveExcess(periods, teacherMaxRun);
    }
  }

  // S9 교사 주간 마지막 교시(7교시) 상한 초과 / S10 같은 분반·같은 교사 인접 교시
  const teacherLastCap = ctx.input.options.maxLastPeriodPerTeacher ?? 3;
  let teacherLastPeriod = 0;
  for (const cnt of agg.teacherLastPeriodCount.values()) {
    if (cnt > teacherLastCap) teacherLastPeriod += cnt - teacherLastCap;
  }
  let teacherSubjectConsecutive = 0;
  for (const byDay of agg.teacherSubjectDayPeriods.values()) {
    for (const periods of byDay.values()) teacherSubjectConsecutive += adjacentPairs(periods);
  }

  const soft: SoftPenalty[] = [
    {
      id: 'studentGap',
      count: classGap,
      weight: w.studentGap,
      penalty: classGap * w.studentGap,
      details: classGap > 0 ? summarize(classGapDetails) : ['반별 중간 공강 없음'],
    },
    {
      id: 'subjectSameDay',
      count: subjectSameDay,
      weight: w.subjectSameDay,
      penalty: subjectSameDay * w.subjectSameDay,
    },
    {
      id: 'subjectConsecutive',
      count: subjectConsecutive,
      weight: w.subjectConsecutive,
      penalty: subjectConsecutive * w.subjectConsecutive,
    },
    {
      id: 'teacherGap',
      count: teacherGap,
      weight: w.teacherGap,
      penalty: teacherGap * w.teacherGap,
      details: teacherGap > 0 ? summarize(teacherGapDetails) : ['교사 중간 공강 없음'],
    },
    {
      id: 'dailyBalance',
      count: Number(dailyBalance.toFixed(2)),
      weight: w.dailyBalance,
      penalty: dailyBalance * w.dailyBalance,
    },
    {
      id: 'majorClustering',
      count: majorClustering,
      weight: w.majorClustering,
      penalty: majorClustering * w.majorClustering,
    },
    {
      id: 'teacherDailyLoad',
      count: teacherDailyLoad,
      weight: w.teacherDailyLoad,
      penalty: teacherDailyLoad * w.teacherDailyLoad,
      details: teacherDailyLoad > 0 ? summarize(teacherLoadDetails) : [`교사 하루 ${teacherCap}개 이하`],
    },
    {
      id: 'teacherConsecutive',
      count: teacherConsecutive,
      weight: w.teacherConsecutive,
      penalty: teacherConsecutive * w.teacherConsecutive,
    },
    // 기본값 0: 이 두 가중치가 없는 입력 = 구 저장본(input_payload) — 원래 없던 소프트
    // 벌점을 주입하지 않아야 레거시 동작이 정확히 재현된다. 새 실행은 DEFAULT_WEIGHTS가
    // 20/18을 명시적으로 제공한다.
    {
      id: 'teacherLastPeriod',
      count: teacherLastPeriod,
      weight: w.teacherLastPeriod ?? 0,
      penalty: teacherLastPeriod * (w.teacherLastPeriod ?? 0),
    },
    {
      id: 'teacherSubjectConsecutive',
      count: teacherSubjectConsecutive,
      weight: w.teacherSubjectConsecutive ?? 0,
      penalty: teacherSubjectConsecutive * (w.teacherSubjectConsecutive ?? 0),
    },
  ];

  const total = soft.reduce((acc, s) => acc + s.penalty, 0);
  return { total, soft, agg };
}

/**
 * 전체 평가 (하드 + 소프트 + 지표). 시드 검증과 후보 스냅샷에 사용한다.
 * SA 매 스텝에는 무브가 하드-실현가능을 보장하므로 evaluateSoft만 쓴다.
 */
export function evaluateFull(
  placements: Placement[],
  ctx: ScoreContext,
): { score: ScoreBreakdown; metrics: CandidateMetrics } {
  const { input, graph } = ctx;
  const map = placementsToMap(placements);
  const placedIds = new Set(map.keys());

  const hard = [];

  // Map 변환으로 숨겨지는 중복·알 수 없는 수업과 격자 밖 배치를 검출한다.
  const seen = new Set<string>();
  let invalidPlacement = 0;
  for (const p of placements) {
    if (seen.has(p.lessonId) || !graph.byLessonId.has(p.lessonId) ||
      !Number.isInteger(p.dayIndex) || p.dayIndex < 0 || p.dayIndex >= input.grid.days ||
      !Number.isInteger(p.period) || p.period < 1 || p.period > input.grid.periodsPerDay) {
      invalidPlacement++;
    }
    seen.add(p.lessonId);
  }
  hard.push({ id: 'invalidPlacement', count: invalidPlacement });

  // H_unplaced 미배치 수업
  let unplaced = 0;
  for (const l of graph.lessons) if (!placedIds.has(l.id)) unplaced++;
  hard.push({ id: 'unplaced', count: unplaced });

  // H_block 차단 칸 침범
  let blockedCell = 0;
  for (const [lessonId, cell] of map) {
    const l = graph.byLessonId.get(lessonId);
    if (l && l.blockedCells.includes(cellKeyStr(cell))) blockedCell++;
  }
  hard.push({ id: 'blockedCell', count: blockedCell });

  // 칸별 점유 목록 → 인접 쌍 충돌을 사유별로 집계
  const cellOccupants = new Map<string, string[]>();
  for (const [lessonId, cell] of map) {
    const k = cellKeyStr(cell);
    const arr = cellOccupants.get(k) ?? [];
    arr.push(lessonId);
    cellOccupants.set(k, arr);
  }
  let studentConflict = 0;
  let teacherConflict = 0;
  let roomConflict = 0;
  for (const ids of cellOccupants.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i] < ids[j] ? ids[i] : ids[j];
        const b = ids[i] < ids[j] ? ids[j] : ids[i];
        const reason = graph.edgeReason.get(`${a}|${b}`);
        if (!reason) continue;
        if (reason & 1) studentConflict++;
        if (reason & 2) teacherConflict++;
        if (reason & 4) roomConflict++;
      }
    }
  }
  hard.push({ id: 'studentConflict', count: studentConflict });
  hard.push({ id: 'teacherConflict', count: input.options.hard.teacherConflict ? teacherConflict : 0 });
  hard.push({ id: 'roomConflict', count: input.options.hard.roomConflict ? roomConflict : 0 });

  // H_cap 같은 과목 하루 한도
  let subjectDailyCap = 0;
  if (input.options.hard.subjectDailyCap) {
    const offeringDay = new Map<string, number>();
    for (const [lessonId, cell] of map) {
      const l = graph.byLessonId.get(lessonId);
      if (!l) continue;
      const k = `${l.offeringId}|${cell.dayIndex}`;
      offeringDay.set(k, (offeringDay.get(k) ?? 0) + 1);
    }
    for (const cnt of offeringDay.values()) {
      if (cnt > input.options.maxPerSubjectPerDay) subjectDailyCap += cnt - input.options.maxPerSubjectPerDay;
    }
  }
  hard.push({ id: 'subjectDailyCap', count: subjectDailyCap });

  // H_pinned 고정 배치 위반
  let pinnedViolation = 0;
  for (const p of input.pinned) {
    const cell = map.get(p.lessonId);
    if (!cell || cell.dayIndex !== p.dayIndex || cell.period !== p.period) pinnedViolation++;
  }
  hard.push({ id: 'pinnedViolation', count: pinnedViolation });

  const { total: softTotal, soft, agg } = evaluateSoft(map, ctx);

  // 지표 + 교사 부하 하드 카운트 (하드 플래그가 켜진 항목만 hard로 승격)
  let classGapTotal = 0;
  let classGapMax = 0;
  for (const byDay of agg.classDayPeriods.values()) {
    const g = internalGaps(byDay);
    classGapTotal += g;
    if (g > classGapMax) classGapMax = g;
  }
  let teacherGapTotal = 0;
  const teacherCap = input.options.maxPerTeacherPerDay ?? 4;
  const teacherMaxRun = input.options.maxConsecutivePerTeacher ?? 2;
  const teacherLastCap = input.options.maxLastPeriodPerTeacher ?? 3;
  let teacherMaxDaily = 0;
  let teacherOverCap = 0;
  let teacherConsecutiveTotal = 0;
  for (const byDay of agg.teacherDayPeriods.values()) {
    teacherGapTotal += internalGaps(byDay);
    for (const periods of byDay.values()) {
      if (periods.size > teacherMaxDaily) teacherMaxDaily = periods.size;
      if (periods.size > teacherCap) teacherOverCap += periods.size - teacherCap;
      teacherConsecutiveTotal += consecutiveExcess(periods, teacherMaxRun);
    }
  }
  let teacherLastPeriodOver = 0;
  for (const cnt of agg.teacherLastPeriodCount.values()) {
    if (cnt > teacherLastCap) teacherLastPeriodOver += cnt - teacherLastCap;
  }
  let teacherSubjectAdjacent = 0;
  for (const byDay of agg.teacherSubjectDayPeriods.values()) {
    for (const periods of byDay.values()) {
      for (const p of periods) if (periods.has(p + 1)) teacherSubjectAdjacent++;
    }
  }

  const h = input.options.hard;
  hard.push({ id: 'teacherDailyOver', count: h.teacherDailyCap ? teacherOverCap : 0 });
  hard.push({ id: 'teacherTripleRun', count: h.teacherConsecutive ? teacherConsecutiveTotal : 0 });
  hard.push({ id: 'teacherLastPeriodOver', count: h.teacherLastPeriodCap ? teacherLastPeriodOver : 0 });
  hard.push({ id: 'teacherSubjectAdjacent', count: h.teacherSubjectConsecutive ? teacherSubjectAdjacent : 0 });

  const hardCount = hard.reduce((acc, x) => acc + x.count, 0);
  const total = hardCount > 0 ? Number.POSITIVE_INFINITY : softTotal;

  const metrics: CandidateMetrics = {
    studentGapTotal: classGapTotal,
    studentGapMax: classGapMax,
    teacherGapTotal,
    teacherMaxDaily,
    teacherOverCap,
    teacherConsecutiveTotal,
    teacherLastPeriodOver,
    teacherSubjectAdjacent,
    placedLessons: placedIds.size,
    totalLessons: graph.lessons.length,
    hardFeasible: hardCount === 0,
  };

  return { score: { total, hard, soft }, metrics };
}

export function isFeasible(score: ScoreBreakdown): boolean {
  return score.hard.every((h) => h.count === 0);
}
