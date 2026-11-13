import type {
  AlgorithmWeights,
  ExamSubject,
  ExamScheduleInput,
  Grade,
  HardViolation,
  MajorSpreadPolicy,
  ScoreBreakdown,
  SlotAssignment,
  SoftPenalty,
  CandidateMetrics,
} from '../types';
import type { ConflictGraph } from './conflictGraph';
import {
  allPinned,
  buildRoomPool,
  slotSupervision,
  subjectDemandEntry,
} from '../utils/multiGrade';
import { daysOf } from './csp';

/**
 * Apply the user-selected major-subject spread policy to the soft weights.
 */
function applyMajorPolicy(w: AlgorithmWeights, policy: MajorSpreadPolicy): AlgorithmWeights {
  switch (policy) {
    case 'one-per-day':
      return { ...w, majorClustering: w.majorClustering * 20 };
    case 'no-consecutive':
      return { ...w, majorClustering: 0 };
    case 'off':
      return { ...w, majorClustering: 0, majorConsecutive: 0 };
    default:
      return w;
  }
}

export interface ScoreContext {
  input: ExamScheduleInput;
  graph: ConflictGraph;
}

interface SlotKey {
  dayIndex: number;
  period: number;
}

function slotKey(s: SlotKey): string {
  return `${s.dayIndex}|${s.period}`;
}

const MAX_DETAIL_ITEMS = 8;

function summarize(arr: string[]): string[] {
  if (arr.length <= MAX_DETAIL_ITEMS) return arr;
  return [...arr.slice(0, MAX_DETAIL_ITEMS), `…및 ${arr.length - MAX_DETAIL_ITEMS}건 더`];
}

export function evaluate(
  assignments: SlotAssignment[],
  ctx: ScoreContext,
): { score: ScoreBreakdown; metrics: CandidateMetrics } {
  const { input, graph } = ctx;
  let w = applyMajorPolicy(input.weights, input.options.majorSubjectsSpread);
  if (input.options.hardConstraints.maxExamsPerStudentPerDay) {
    w = { ...w, threePlusExamsPerDay: 0 };
  }
  if (input.options.hardConstraints.majorSubjectsSpread) {
    w = { ...w, majorClustering: 0, majorConsecutive: 0 };
  }

  const grades = input.grades;
  const multiGrade = grades.length > 1;
  const gradePrefix = (g: Grade) => (multiGrade ? `${g}학년 ` : '');

  // 학생 → 소속 학년 (각 학생은 정확히 한 학년의 과목만 응시)
  const studentGrade = new Map<string, Grade>();
  for (const s of graph.subjects) {
    for (const code of s.studentCodes) studentGrade.set(code, s.grade);
  }

  const subjectToSlot = new Map<string, SlotKey>();
  for (const a of assignments) {
    subjectToSlot.set(a.subjectId, { dayIndex: a.dayIndex, period: a.period });
  }

  const hard: HardViolation[] = [];

  // H1 학생 충돌 (학년 간 학생 겹침은 없으므로 전역 계산이 안전)
  let studentConflict = 0;
  const slotToSubjects = new Map<string, string[]>();
  for (const a of assignments) {
    const key = slotKey(a);
    if (!slotToSubjects.has(key)) slotToSubjects.set(key, []);
    slotToSubjects.get(key)!.push(a.subjectId);
  }
  for (const list of slotToSubjects.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = graph.bySubjectId.get(list[i]);
        const b = graph.bySubjectId.get(list[j]);
        if (!a || !b) continue;
        const setA = new Set(a.studentCodes);
        for (const code of b.studentCodes) {
          if (setA.has(code)) {
            studentConflict++;
            break;
          }
        }
      }
    }
  }
  hard.push({ id: 'studentConflict', count: studentConflict });

  // H4 고정 과목 위반 (전 학년)
  let pinnedViolations = 0;
  for (const p of allPinned(input)) {
    const slot = subjectToSlot.get(p.subjectId);
    if (!slot || slot.dayIndex !== p.dayIndex || slot.period !== p.period) pinnedViolations++;
  }
  hard.push({ id: 'pinnedAssignment', count: pinnedViolations });

  // 학년×일차별 사용 교시 집합
  const distinctSlotsByGradeDay = new Map<string, Set<string>>();
  for (const a of assignments) {
    const sub = graph.bySubjectId.get(a.subjectId);
    if (!sub) continue;
    const k = `${sub.grade}|${a.dayIndex}`;
    if (!distinctSlotsByGradeDay.has(k)) distinctSlotsByGradeDay.set(k, new Set());
    distinctSlotsByGradeDay.get(k)!.add(`${a.period}`);
  }

  // H5 일일 시험 개수 일치 (학년별)
  let dailyCountMismatch = 0;
  for (const g of grades) {
    for (const day of daysOf(input, g)) {
      const got = distinctSlotsByGradeDay.get(`${g}|${day.dayIndex}`)?.size ?? 0;
      if (got !== day.examCount) dailyCountMismatch += Math.abs(got - day.examCount);
    }
  }
  hard.push({ id: 'dailyExamCount', count: dailyCountMismatch });

  // H5b 매일 최소 1과목 시험 (학년별)
  let emptyExamDays = 0;
  const emptyExamDayDetails: string[] = [];
  for (const g of grades) {
    for (const day of daysOf(input, g)) {
      const got = distinctSlotsByGradeDay.get(`${g}|${day.dayIndex}`)?.size ?? 0;
      if (got < 1) {
        emptyExamDays++;
        emptyExamDayDetails.push(`${gradePrefix(g)}${day.dayIndex + 1}일차 시험 없음`);
      }
    }
  }
  const examEveryDayViolations =
    input.options.requireExamEveryDay && input.options.hardConstraints.examEveryDay
      ? emptyExamDays
      : 0;
  hard.push({ id: 'examEveryDay', count: examEveryDayViolations });

  // H6 비활성 교시 사용 (학년별 교시 설정 기준)
  let invalidPeriod = 0;
  const dayMapByGrade = new Map<Grade, Map<number, Set<number>>>();
  for (const g of grades) {
    const m = new Map<number, Set<number>>();
    for (const day of daysOf(input, g)) m.set(day.dayIndex, new Set(day.availablePeriods));
    dayMapByGrade.set(g, m);
  }
  for (const a of assignments) {
    const sub = graph.bySubjectId.get(a.subjectId);
    if (!sub) continue;
    const allowed = dayMapByGrade.get(sub.grade)?.get(a.dayIndex);
    if (!allowed || !allowed.has(a.period)) invalidPeriod++;
  }
  hard.push({ id: 'dailyPeriodAvailability', count: invalidPeriod });

  // H7 동시 배치 정책 — 같은 학년 안에서만 적용 (학년 간 동시 시험은 정상)
  let concurrentViolations = 0;
  if (!input.options.allowConcurrentElectives) {
    for (const list of slotToSubjects.values()) {
      const byGrade = new Map<Grade, number>();
      for (const id of list) {
        const sub = graph.bySubjectId.get(id);
        if (!sub) continue;
        byGrade.set(sub.grade, (byGrade.get(sub.grade) ?? 0) + 1);
      }
      for (const n of byGrade.values()) {
        if (n > 1) concurrentViolations += n - 1;
      }
    }
  }
  hard.push({ id: 'concurrentElectivePolicy', count: concurrentViolations });

  const studentDailyCount = computeStudentDailyCount(assignments, graph);

  // H8 학생당 일일 최대 시험 수
  let studentDailyLimitViolations = 0;
  if (input.options.hardConstraints.maxExamsPerStudentPerDay) {
    for (const counts of studentDailyCount.values()) {
      for (const arr of counts.values()) {
        if (arr.size > input.options.maxExamsPerStudentPerDay) {
          studentDailyLimitViolations += arr.size - input.options.maxExamsPerStudentPerDay;
        }
      }
    }
  }
  hard.push({ id: 'studentDailyLimit', count: studentDailyLimitViolations });

  // S1 두 과목 인접 교시 — (day, p1, p2) 별 영향 학생 수 집계
  let twoInARow = 0;
  const twoInARowMap = new Map<string, number>(); // "day|p1|p2" -> students
  for (const counts of studentDailyCount.values()) {
    for (const [day, arr] of counts.entries()) {
      const periods = Array.from(arr).sort((a, b) => a - b);
      for (let i = 0; i + 1 < periods.length; i++) {
        if (periods[i + 1] - periods[i] === 1) {
          twoInARow++;
          const k = `${day}|${periods[i]}|${periods[i + 1]}`;
          twoInARowMap.set(k, (twoInARowMap.get(k) ?? 0) + 1);
        }
      }
    }
  }
  const twoInARowDetails: string[] = Array.from(twoInARowMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => {
      const [d, p1, p2] = k.split('|').map(Number);
      return `${d + 1}일차 ${p1}→${p2}교시 연속 (학생 ${n}명)`;
    });

  // S2 하루 한도 초과
  let threePlus = 0;
  const threePlusByDay = new Map<number, number>(); // day -> students-affected count
  for (const counts of studentDailyCount.values()) {
    for (const [day, arr] of counts.entries()) {
      if (arr.size > input.options.maxExamsPerStudentPerDay) {
        threePlus += arr.size - input.options.maxExamsPerStudentPerDay;
        threePlusByDay.set(day, (threePlusByDay.get(day) ?? 0) + 1);
      }
    }
  }
  const threePlusDetails: string[] = Array.from(threePlusByDay.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([d, n]) => `${d + 1}일차 한도(${input.options.maxExamsPerStudentPerDay}개) 초과 (학생 ${n}명)`);

  // S3, S4 주요교과 분산 (학년별 평가)
  const majorByGradeDay = new Map<Grade, Map<number, string[]>>();
  for (const a of assignments) {
    const sub = graph.bySubjectId.get(a.subjectId);
    if (sub?.isMajor) {
      let byDay = majorByGradeDay.get(sub.grade);
      if (!byDay) {
        byDay = new Map();
        majorByGradeDay.set(sub.grade, byDay);
      }
      const arr = byDay.get(a.dayIndex) ?? [];
      arr.push(sub.name);
      byDay.set(a.dayIndex, arr);
    }
  }
  let majorClustering = 0;
  const majorClusteringDetails: string[] = [];
  let majorConsecutive = 0;
  const majorConsecutiveDetails: string[] = [];
  for (const [g, byDay] of majorByGradeDay.entries()) {
    for (const [day, names] of byDay.entries()) {
      if (names.length > 1) {
        majorClustering += names.length - 1;
        majorClusteringDetails.push(
          `${gradePrefix(g)}${day + 1}일차 주요교과 ${names.length}개 (${names.join(', ')})`,
        );
      }
    }
    const sortedMajorDays = Array.from(byDay.keys()).sort((a, b) => a - b);
    for (let i = 0; i + 1 < sortedMajorDays.length; i++) {
      if (sortedMajorDays[i + 1] - sortedMajorDays[i] === 1) {
        const a = byDay.get(sortedMajorDays[i]) ?? [];
        const b = byDay.get(sortedMajorDays[i + 1]) ?? [];
        if (a.length >= 1 && b.length >= 1) {
          majorConsecutive++;
          majorConsecutiveDetails.push(
            `${gradePrefix(g)}${sortedMajorDays[i] + 1}일↔${sortedMajorDays[i + 1] + 1}일 연속 주요교과`,
          );
        }
      }
    }
  }

  let majorSpreadHardViolations = 0;
  if (input.options.hardConstraints.majorSubjectsSpread) {
    if (input.options.majorSubjectsSpread === 'one-per-day') {
      majorSpreadHardViolations = majorClustering;
    } else if (input.options.majorSubjectsSpread === 'no-consecutive') {
      majorSpreadHardViolations = majorConsecutive;
    }
  }
  hard.push({ id: 'majorSpreadHard', count: majorSpreadHardViolations });

  // S5 학생별 일차 부담 편차 — 각 학생의 "자기 학년" 시험일 기준으로 계산
  const totalExamsByStudent: number[] = [];
  const dailyLoadStdevs: number[] = [];
  const dayIndexesByGrade = new Map<Grade, number[]>();
  for (const g of grades) {
    dayIndexesByGrade.set(g, daysOf(input, g).map((day) => day.dayIndex));
  }
  for (const [code, counts] of studentDailyCount.entries()) {
    const g = studentGrade.get(code);
    const dayIndexes = (g && dayIndexesByGrade.get(g)) ?? [];
    const dailyLoads = dayIndexes.map((day) => counts.get(day)?.size ?? 0);
    const total = dailyLoads.reduce((acc, x) => acc + x, 0);
    const dailyMean = dailyLoads.length > 0 ? total / dailyLoads.length : 0;
    const dailyVariance =
      dailyLoads.length > 0
        ? dailyLoads.reduce((acc, x) => acc + (x - dailyMean) ** 2, 0) / dailyLoads.length
        : 0;
    totalExamsByStudent.push(total);
    dailyLoadStdevs.push(Math.sqrt(dailyVariance));
  }
  const meanTotal = totalExamsByStudent.length
    ? totalExamsByStudent.reduce((a, b) => a + b, 0) / totalExamsByStudent.length
    : 0;
  const dailyLoadStdev = dailyLoadStdevs.length
    ? dailyLoadStdevs.reduce((a, b) => a + b, 0) / dailyLoadStdevs.length
    : 0;
  const maxDailyLoadStdev = dailyLoadStdevs.length ? Math.max(...dailyLoadStdevs) : 0;
  const minTotal = totalExamsByStudent.length ? Math.min(...totalExamsByStudent) : 0;
  const maxTotal = totalExamsByStudent.length ? Math.max(...totalExamsByStudent) : 0;
  const unevenLoadDetails =
    totalExamsByStudent.length > 0
      ? [
          `학생당 총 시험 수 평균 ${meanTotal.toFixed(2)}개, 최소 ${minTotal}개, 최대 ${maxTotal}개`,
          `일차별 부담 편차 평균 ${dailyLoadStdev.toFixed(2)} (낮을수록 날짜별 부담이 균등)`,
          `일차별 부담 편차 최대 ${maxDailyLoadStdev.toFixed(2)}`,
        ]
      : [];

  // S6 1교시 주요과목 — 옵션 토글로 부호 결정
  let earlyHardCount = 0;
  const earlyHardDetails: string[] = [];
  for (const a of assignments) {
    if (a.period === 1) {
      const sub = graph.bySubjectId.get(a.subjectId);
      if (sub?.isMajor) {
        earlyHardCount++;
        earlyHardDetails.push(`${gradePrefix(sub.grade)}${a.dayIndex + 1}일차 1교시 ${sub.name}`);
      }
    }
  }

  // S7 시험 없는 날 발생: 자기 학년 시험일 중 응시 과목이 0인 날이 있는 학생 수
  let studentEmptyDay = 0;
  const emptyByGradeDay = new Map<string, number>();
  for (const [code, counts] of studentDailyCount.entries()) {
    const g = studentGrade.get(code);
    if (!g) continue;
    let hasEmpty = false;
    for (const dayIndex of dayIndexesByGrade.get(g) ?? []) {
      if (!counts.has(dayIndex)) {
        const k = `${g}|${dayIndex}`;
        emptyByGradeDay.set(k, (emptyByGradeDay.get(k) ?? 0) + 1);
        hasEmpty = true;
      }
    }
    if (hasEmpty) studentEmptyDay++;
  }
  const studentEmptyDayDetails: string[] = Array.from(emptyByGradeDay.entries())
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => {
      const [g, d] = k.split('|').map(Number);
      return `${gradePrefix(g as Grade)}${d + 1}일차 0과목 학생 ${n}명`;
    });

  // earlyMorningHard penalty: option-controlled sign
  const earlyEffectiveWeight = input.options.preferEarlyMajor ? -w.earlyMorningHard : 0;
  const earlyHardPenalty: SoftPenalty = {
    id: 'earlyMorningHard',
    count: earlyHardCount,
    weight: earlyEffectiveWeight,
    penalty: earlyHardCount * earlyEffectiveWeight,
    details: earlyHardDetails.length
      ? summarize(earlyHardDetails)
      : ['1교시 주요과목 배치 없음'],
  };

  // S8 선택과목 동시 배치 장려 — 같은 학년의 선택과목이 같은 슬롯을 공유할 때만
  // 슬롯 절약 효과가 있으므로 학년별로 집계한다.
  let electiveConcurrency = 0;
  const electiveConcurrencyDetails: string[] = [];
  if (input.options.allowConcurrentElectives && input.options.preferConcurrentElectives) {
    for (const [key, list] of slotToSubjects.entries()) {
      const byGrade = new Map<Grade, ExamSubject[]>();
      for (const id of list) {
        const sub = graph.bySubjectId.get(id);
        if (sub?.scope === 'elective') {
          const arr = byGrade.get(sub.grade) ?? [];
          arr.push(sub);
          byGrade.set(sub.grade, arr);
        }
      }
      for (const [g, electives] of byGrade.entries()) {
        if (electives.length < 2) continue;
        electiveConcurrency += electives.length - 1;
        const [day, period] = key.split('|').map(Number);
        electiveConcurrencyDetails.push(
          `${gradePrefix(g)}${day + 1}일차 ${period}교시 선택과목 ${electives.length}개 (${electives
            .map((s) => s.name)
            .join(', ')})`,
        );
      }
    }
  }
  const electiveConcurrencyWeight =
    input.options.allowConcurrentElectives &&
    input.options.preferConcurrentElectives &&
    !input.options.hardConstraints.electiveConcurrency
      ? -Math.abs(w.electiveConcurrency)
      : 0;
  const electiveConcurrencyHardViolations =
    input.options.allowConcurrentElectives &&
    input.options.preferConcurrentElectives &&
    input.options.hardConstraints.electiveConcurrency &&
    hasEligibleElectivePair(graph) &&
    electiveConcurrency === 0
      ? 1
      : 0;
  hard.push({ id: 'electiveConcurrencyHard', count: electiveConcurrencyHardViolations });

  // H9/S9 감독 인력·시험실 — 슬롯별 수요: 공통 과목은 학년 반 수(고정 시험실),
  // 선택과목은 고사실 풀 greedy 배정. 전 학년 합산.
  const sup = input.supervision;
  let peakSupervisorDemand = 0;
  let supervisorOverflow = 0;
  let roomShortageSlots = 0;
  const supervisionDetails: string[] = [];
  if (sup.enabled) {
    const pool = buildRoomPool(sup);
    const demandEntries: Array<{ key: string; demand: number; rooms: number; fits: boolean }> = [];
    for (const [key, list] of slotToSubjects.entries()) {
      const entries = list
        .map((id) => graph.bySubjectId.get(id))
        .filter((s): s is ExamSubject => !!s)
        .map((s) => subjectDemandEntry(s, sup));
      const res = slotSupervision(entries, sup, pool);
      if (res.supervisors > peakSupervisorDemand) peakSupervisorDemand = res.supervisors;
      if (res.supervisors > sup.availableSupervisors) {
        supervisorOverflow += res.supervisors - sup.availableSupervisors;
      }
      if (!res.fits) roomShortageSlots++;
      demandEntries.push({ key, demand: res.supervisors, rooms: res.rooms, fits: res.fits });
    }
    demandEntries.sort((a, b) => b.demand - a.demand);
    for (const { key, demand, rooms, fits } of demandEntries.slice(0, MAX_DETAIL_ITEMS)) {
      const [d, p] = key.split('|').map(Number);
      supervisionDetails.push(
        `${d + 1}일차 ${p}교시 시험실 ${rooms}실 · 감독 ${demand}명 필요 (가용 ${sup.availableSupervisors}명${
          demand > sup.availableSupervisors ? ' — 감독 초과!' : ''
        }${fits ? '' : ' · 고사실 부족!'})`,
      );
    }
  }
  hard.push({
    id: 'supervisorCapacity',
    count: sup.enabled && sup.hard ? supervisorOverflow : 0,
  });
  // 고사실 풀 부족은 물리적 제약 — hard 모드에서 게이트, soft 모드에서는
  // 최소 정원 기준 추정 시험실 수가 수요에 반영되어 overflow 페널티로 흡수된다.
  hard.push({
    id: 'examRoomShortage',
    count: sup.enabled && sup.hard ? roomShortageSlots : 0,
  });
  const supervisorOverflowWeight = sup.enabled && !sup.hard ? w.supervisorOverflow : 0;
  const supervisorPeakWeight = sup.enabled ? w.supervisorPeak : 0;

  const soft: SoftPenalty[] = [
    {
      id: 'examEveryDay',
      count: emptyExamDays,
      weight: input.options.requireExamEveryDay ? w.examEveryDay : 0,
      penalty: emptyExamDays * (input.options.requireExamEveryDay ? w.examEveryDay : 0),
      details:
        emptyExamDays > 0
          ? summarize(emptyExamDayDetails)
          : ['모든 시험일에 최소 1과목 배치됨'],
    },
    {
      id: 'twoExamsInARow',
      count: twoInARow,
      weight: w.twoExamsInARow,
      penalty: twoInARow * w.twoExamsInARow,
      details: twoInARow > 0 ? summarize(twoInARowDetails) : ['연속 교시 시험 없음'],
    },
    {
      id: 'threePlusExamsPerDay',
      count: threePlus,
      weight: w.threePlusExamsPerDay,
      penalty: threePlus * w.threePlusExamsPerDay,
      details: threePlus > 0 ? summarize(threePlusDetails) : ['하루 한도 초과 학생 없음'],
    },
    {
      id: 'majorClustering',
      count: majorClustering,
      weight: w.majorClustering,
      penalty: majorClustering * w.majorClustering,
      details:
        majorClustering > 0
          ? summarize(majorClusteringDetails)
          : ['주요교과 같은 날 집중 없음'],
    },
    {
      id: 'majorConsecutive',
      count: majorConsecutive,
      weight: w.majorConsecutive,
      penalty: majorConsecutive * w.majorConsecutive,
      details:
        majorConsecutive > 0
          ? summarize(majorConsecutiveDetails)
          : ['주요교과 연속일 없음'],
    },
    {
      id: 'unevenLoad',
      count: Number(dailyLoadStdev.toFixed(2)),
      weight: w.unevenLoad,
      penalty: dailyLoadStdev * w.unevenLoad,
      details: unevenLoadDetails,
    },
    earlyHardPenalty,
    {
      id: 'studentEmptyDay',
      count: studentEmptyDay,
      weight: w.studentEmptyDay,
      penalty: studentEmptyDay * w.studentEmptyDay,
      details:
        studentEmptyDay > 0
          ? summarize(studentEmptyDayDetails)
          : ['모든 학생이 매일 시험 응시'],
    },
    {
      id: 'electiveConcurrency',
      count: electiveConcurrency,
      weight: electiveConcurrencyWeight,
      penalty: electiveConcurrency * electiveConcurrencyWeight,
      details:
        electiveConcurrency > 0
          ? summarize(electiveConcurrencyDetails)
          : ['동시 배치된 선택과목 없음'],
    },
    {
      id: 'supervisorOverflow',
      count: supervisorOverflow,
      weight: supervisorOverflowWeight,
      penalty: supervisorOverflow * supervisorOverflowWeight,
      details:
        supervisorOverflow > 0
          ? summarize(supervisionDetails)
          : [sup.enabled ? '감독 인원 초과 슬롯 없음' : '감독 제약 미사용'],
    },
    {
      id: 'supervisorPeak',
      count: peakSupervisorDemand,
      weight: supervisorPeakWeight,
      penalty: peakSupervisorDemand * supervisorPeakWeight,
      details:
        sup.enabled && supervisionDetails.length > 0
          ? summarize(supervisionDetails)
          : [sup.enabled ? '감독 수요 없음' : '감독 제약 미사용'],
    },
  ];

  const totalSoft = soft.reduce((acc, s) => acc + s.penalty, 0);
  const hardCount = hard.reduce((acc, h) => acc + h.count, 0);
  const totalHard = hardCount > 0 ? Number.POSITIVE_INFINITY : 0;
  const score = totalHard + totalSoft;

  let maxOneDay = 0;
  for (const counts of studentDailyCount.values()) {
    for (const arr of counts.values()) {
      if (arr.size > maxOneDay) maxOneDay = arr.size;
    }
  }

  const metrics: CandidateMetrics = {
    avgExamsPerStudent: meanTotal,
    maxExamsPerStudentInOneDay: maxOneDay,
    studentLoadStdev: dailyLoadStdev,
    majorClusterCount: majorClustering,
    peakSupervisorDemand,
    hardFeasible: hard.every((h) => h.count === 0),
  };

  return {
    score: { total: score, hard, soft },
    metrics,
  };
}

function computeStudentDailyCount(
  assignments: SlotAssignment[],
  graph: ConflictGraph,
): Map<string, Map<number, Set<number>>> {
  const out = new Map<string, Map<number, Set<number>>>();
  for (const a of assignments) {
    const sub = graph.bySubjectId.get(a.subjectId);
    if (!sub) continue;
    for (const code of sub.studentCodes) {
      let byDay = out.get(code);
      if (!byDay) {
        byDay = new Map();
        out.set(code, byDay);
      }
      let set = byDay.get(a.dayIndex);
      if (!set) {
        set = new Set();
        byDay.set(a.dayIndex, set);
      }
      set.add(a.period);
    }
  }
  return out;
}

export function isFeasible(score: ScoreBreakdown): boolean {
  return score.hard.every((h) => h.count === 0);
}

/** 같은 학년 안에서 응시자가 겹치지 않는 선택과목 쌍이 존재하는가 */
function hasEligibleElectivePair(graph: ConflictGraph): boolean {
  const electives = graph.subjects.filter((s) => s.scope === 'elective');
  for (let i = 0; i < electives.length; i++) {
    for (let j = i + 1; j < electives.length; j++) {
      if (electives[i].grade !== electives[j].grade) continue;
      const a = electives[i].id;
      const b = electives[j].id;
      if (!(graph.adjacency.get(a) ?? new Set<string>()).has(b)) return true;
    }
  }
  return false;
}
