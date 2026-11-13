import type {
  DayConfig,
  ExamScheduleInput,
  ExamSubject,
  Grade,
  SlotAssignment,
} from '../types';
import type { ConflictGraph } from './conflictGraph';
import {
  allPinned,
  allSubjects,
  buildRoomPool,
  slotSupervision,
  subjectDemandEntry,
  type SlotDemandEntry,
} from '../utils/multiGrade';
import type { Rng } from './rng';

export interface SlotKey {
  dayIndex: number;
  period: number;
}

export function daysOf(input: ExamScheduleInput, grade: Grade): DayConfig[] {
  return input.gradeInputs[grade]?.days ?? [];
}

/** 특정 학년이 사용할 수 있는 (일차, 교시) 슬롯 목록 */
export function enumerateSlotsForGrade(
  input: ExamScheduleInput,
  grade: Grade,
): SlotKey[] {
  const out: SlotKey[] = [];
  for (const day of daysOf(input, grade)) {
    for (const p of day.availablePeriods) {
      out.push({ dayIndex: day.dayIndex, period: p });
    }
  }
  return out;
}

/** 전체 학년 합집합 슬롯 (감독 용량 분석용) */
export function enumerateUnionSlots(input: ExamScheduleInput): SlotKey[] {
  const seen = new Set<string>();
  const out: SlotKey[] = [];
  for (const g of input.grades) {
    for (const slot of enumerateSlotsForGrade(input, g)) {
      const k = slotKey(slot);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(slot);
    }
  }
  return out;
}

interface SearchState {
  assignment: Map<string, SlotKey>;
  slotsBySubject: Map<string, SlotKey>;
  // `${grade}|${dayIndex}` -> 사용 중인 교시 집합. 일일 시험 개수(H5)는 학년별로 센다.
  perGradeDayDistinctSlots: Map<string, Set<string>>;
  // dayIndex -> studentCode -> exam count on that day (H8용 증분 상태)
  studentDayCount: Map<number, Map<string, number>>;
  // `${dayIndex}|${period}` -> 배치된 과목들의 응시 인원 목록. 전 학년 합산이며
  // 시험실 풀 greedy 배정(slotSupervision)의 입력 — cross-grade 결합 제약.
  slotEntries: Map<string, SlotDemandEntry[]>;
  // Forward-checking 도메인 상태
  domains: Map<string, Set<string>>;
  // 학년별 미배정 과목 수 — 일일 시험 개수 "정확 일치" 하한 전파에 사용
  gradeUnassigned: Map<Grade, number>;
  steps: number;
}

/** FC가 깎은 도메인 항목의 되돌리기 기록 (전체 스냅샷 대신 변경분만 유지) */
interface RemovalRecord {
  sid: string;
  slots: string[];
}

const MAX_BACKTRACK_STEPS = 200_000;

export interface InitialSolutionSearchResult {
  solutions: SlotAssignment[][];
  attempts: number;
  duplicates: number;
  uniqueFound: number;
}

export function assignmentSignature(assignments: SlotAssignment[]): string {
  return assignments
    .map((a) => `${a.subjectId}:${a.dayIndex}:${a.period}`)
    .sort()
    .join('|');
}

function assignmentDistance(a: SlotAssignment[], b: SlotAssignment[]): number {
  const bSlots = new Map<string, string>();
  for (const item of b) bSlots.set(item.subjectId, `${item.dayIndex}|${item.period}`);
  let diff = 0;
  for (const item of a) {
    if (bSlots.get(item.subjectId) !== `${item.dayIndex}|${item.period}`) diff++;
  }
  return diff;
}

function minDistanceToSelected(candidate: SlotAssignment[], selected: SlotAssignment[][]): number {
  if (selected.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...selected.map((item) => assignmentDistance(candidate, item)));
}

function selectDiverseAssignments(
  pool: SlotAssignment[][],
  target: number,
): SlotAssignment[][] {
  if (pool.length <= target) return pool;
  const selected: SlotAssignment[][] = [pool[0]];
  const remaining = pool.slice(1);

  while (selected.length < target && remaining.length > 0) {
    let bestIdx = 0;
    let bestMinDistance = -1;
    let bestAverageDistance = -1;

    for (let i = 0; i < remaining.length; i++) {
      const minDistance = minDistanceToSelected(remaining[i], selected);
      const averageDistance =
        selected.reduce((acc, item) => acc + assignmentDistance(remaining[i], item), 0) /
        selected.length;
      if (
        minDistance > bestMinDistance ||
        (minDistance === bestMinDistance && averageDistance > bestAverageDistance)
      ) {
        bestIdx = i;
        bestMinDistance = minDistance;
        bestAverageDistance = averageDistance;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}

/**
 * 일일 시험 개수 "정확 일치" 하한 전파.
 * 미배정 과목 1개는 새 교시를 최대 1개만 열 수 있으므로,
 * (남은 필요 교시 수) > (해당 학년 미배정 과목 수)면 이 가지에서는
 * 어떤 완성 해도 examCount를 정확히 채울 수 없다 — 즉시 가지치기.
 */
function gradeExactCountFeasible(
  grade: Grade,
  st: SearchState,
  input: ExamScheduleInput,
): boolean {
  let required = 0;
  for (const day of daysOf(input, grade)) {
    const got = st.perGradeDayDistinctSlots.get(`${grade}|${day.dayIndex}`)?.size ?? 0;
    required += Math.max(0, day.examCount - got);
  }
  return (st.gradeUnassigned.get(grade) ?? 0) >= required;
}

export function findInitialSolution(
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotAssignment[] | null {
  const subjects = allSubjects(input);
  const subjectIds = subjects.map((s) => s.id);

  const allowConcurrent = input.options.allowConcurrentElectives;

  // Pre-place pinned (모든 학년)
  const pinned = new Map<string, SlotKey>();
  for (const p of allPinned(input)) {
    pinned.set(p.subjectId, { dayIndex: p.dayIndex, period: p.period });
  }

  // 도메인은 과목이 속한 학년의 슬롯으로 제한된다.
  const initialDomains = new Map<string, Set<string>>();
  for (const sid of subjectIds) {
    const subject = graph.bySubjectId.get(sid);
    const slots = subject ? enumerateSlotsForGrade(input, subject.grade) : [];
    initialDomains.set(sid, new Set(slots.map(slotKey)));
  }

  const gradeUnassigned = new Map<Grade, number>();
  for (const s of subjects) {
    gradeUnassigned.set(s.grade, (gradeUnassigned.get(s.grade) ?? 0) + 1);
  }

  const state: SearchState = {
    assignment: new Map(),
    slotsBySubject: new Map(),
    perGradeDayDistinctSlots: new Map(),
    studentDayCount: new Map(),
    slotEntries: new Map(),
    domains: initialDomains,
    gradeUnassigned,
    steps: 0,
  };

  // 시작 전 하한 검사: 과목 수 < Σ examCount면 어떤 배치도 불가
  for (const g of input.grades) {
    if (!gradeExactCountFeasible(g, state, input)) return null;
  }

  // MRV tie-break용 충돌 차수 캐시
  const degree = new Map<string, number>();
  for (const sid of subjectIds) degree.set(sid, graph.adjacency.get(sid)?.size ?? 0);

  // Apply pinned and validate. Pinned subjects collapse their domain to a
  // single slot; targeted forward checking after placement propagates the
  // resulting restriction to affected subjects' domains.
  for (const [sid, slot] of pinned) {
    if (!isSlotValidForSubject(sid, slot, input, graph, state, allowConcurrent)) {
      return null;
    }
    const dom = state.domains.get(sid);
    if (!dom) return null;
    const keep = slotKey(slot);
    for (const k of [...dom]) if (k !== keep) dom.delete(k);
    placeSubject(sid, slot, state, graph, input);
    // pinned는 영구 배치 — 되돌리기 기록 불필요
    if (!forwardCheckTargeted(state, input, graph, allowConcurrent, sid, slot, [])) {
      return null;
    }
  }

  /**
   * MRV(최소 잔여 도메인) 동적 변수 선택. 동률은 충돌 차수가 큰 과목 우선,
   * 그래도 동률이면 rng로 무작위 선택해 반복 시도 간 시드 다양성을 만든다.
   */
  function selectNextSubject(): string | null {
    let best: string | null = null;
    let bestSize = Number.POSITIVE_INFINITY;
    let bestDeg = -1;
    let ties = 0;
    for (const [sid, dom] of state.domains) {
      if (state.assignment.has(sid)) continue;
      const size = dom.size;
      const deg = degree.get(sid) ?? 0;
      if (size < bestSize || (size === bestSize && deg > bestDeg)) {
        best = sid;
        bestSize = size;
        bestDeg = deg;
        ties = 1;
      } else if (size === bestSize && deg === bestDeg) {
        ties++;
        if (rng.next() < 1 / ties) best = sid;
      }
    }
    return best;
  }

  function backtrack(): boolean {
    if (state.steps++ > MAX_BACKTRACK_STEPS) return false;
    const sid = selectNextSubject();
    if (sid === null) return true;

    const dom = state.domains.get(sid);
    if (!dom || dom.size === 0) return false;
    const liveSlots = Array.from(dom).map(parseSlotKey);
    const candidates = orderSlotsByDayPressure(sid, liveSlots, state, input, graph, rng);

    for (const slot of candidates) {
      if (!isSlotValidForSubject(sid, slot, input, graph, state, allowConcurrent)) continue;
      const records: RemovalRecord[] = [];
      placeSubject(sid, slot, state, graph, input);
      if (forwardCheckTargeted(state, input, graph, allowConcurrent, sid, slot, records)) {
        if (backtrack()) return true;
      }
      removeSubject(sid, slot, state, graph, input);
      undoRemovals(state, records);
    }
    return false;
  }

  if (!backtrack()) return null;

  // Verify daily exam count exactly matches (학년별)
  const enforceEveryDay =
    input.options.requireExamEveryDay && input.options.hardConstraints.examEveryDay;
  for (const g of input.grades) {
    for (const day of daysOf(input, g)) {
      const got = state.perGradeDayDistinctSlots.get(`${g}|${day.dayIndex}`)?.size ?? 0;
      if (got !== day.examCount) return null;
      if (enforceEveryDay && got < 1) return null;
    }
  }

  return Array.from(state.assignment.entries()).map(([subjectId, slot]) => ({
    subjectId,
    dayIndex: slot.dayIndex,
    period: slot.period,
  }));
}

function placeSubject(
  subjectId: string,
  slot: SlotKey,
  st: SearchState,
  graph: ConflictGraph,
  input: ExamScheduleInput,
): void {
  st.assignment.set(subjectId, slot);
  st.slotsBySubject.set(subjectId, slot);

  const subject = graph.bySubjectId.get(subjectId);
  if (subject) {
    st.gradeUnassigned.set(
      subject.grade,
      (st.gradeUnassigned.get(subject.grade) ?? 1) - 1,
    );

    const gradeDayKey = `${subject.grade}|${slot.dayIndex}`;
    let set = st.perGradeDayDistinctSlots.get(gradeDayKey);
    if (!set) {
      set = new Set();
      st.perGradeDayDistinctSlots.set(gradeDayKey, set);
    }
    set.add(`${slot.period}`);

    let dayCounts = st.studentDayCount.get(slot.dayIndex);
    if (!dayCounts) {
      dayCounts = new Map();
      st.studentDayCount.set(slot.dayIndex, dayCounts);
    }
    for (const code of subject.studentCodes) {
      dayCounts.set(code, (dayCounts.get(code) ?? 0) + 1);
    }

    if (input.supervision.enabled) {
      const k = slotKey(slot);
      const arr = st.slotEntries.get(k) ?? [];
      arr.push(subjectDemandEntry(subject, input.supervision));
      st.slotEntries.set(k, arr);
    }
  }
}

function removeSubject(
  subjectId: string,
  slot: SlotKey,
  st: SearchState,
  graph: ConflictGraph,
  input: ExamScheduleInput,
): void {
  st.assignment.delete(subjectId);
  st.slotsBySubject.delete(subjectId);

  const subject = graph.bySubjectId.get(subjectId);
  if (subject) {
    st.gradeUnassigned.set(
      subject.grade,
      (st.gradeUnassigned.get(subject.grade) ?? 0) + 1,
    );

    // Recompute this grade-day's distinct periods (same grade의 다른 과목이 아직 사용 중인가?)
    const gradeDayKey = `${subject.grade}|${slot.dayIndex}`;
    const periods = new Set<string>();
    for (const [otherId, a] of st.assignment) {
      if (a.dayIndex !== slot.dayIndex) continue;
      const other = graph.bySubjectId.get(otherId);
      if (other?.grade === subject.grade) periods.add(`${a.period}`);
    }
    if (periods.size === 0) st.perGradeDayDistinctSlots.delete(gradeDayKey);
    else st.perGradeDayDistinctSlots.set(gradeDayKey, periods);

    const dayCounts = st.studentDayCount.get(slot.dayIndex);
    if (dayCounts) {
      for (const code of subject.studentCodes) {
        const next = (dayCounts.get(code) ?? 0) - 1;
        if (next <= 0) dayCounts.delete(code);
        else dayCounts.set(code, next);
      }
      if (dayCounts.size === 0) st.studentDayCount.delete(slot.dayIndex);
    }

    if (input.supervision.enabled) {
      const k = slotKey(slot);
      const arr = st.slotEntries.get(k);
      if (arr) {
        const idx = arr.findIndex((e) => e.key === subjectId);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) st.slotEntries.delete(k);
      }
    }
  }
}

function slotKey(slot: SlotKey): string {
  return `${slot.dayIndex}|${slot.period}`;
}

function parseSlotKey(s: string): SlotKey {
  const [d, p] = s.split('|').map(Number);
  return { dayIndex: d, period: p };
}

function undoRemovals(st: SearchState, records: RemovalRecord[]): void {
  for (let i = records.length - 1; i >= 0; i--) {
    const dom = st.domains.get(records[i].sid);
    if (!dom) continue;
    for (const k of records[i].slots) dom.add(k);
  }
}

/**
 * Targeted forward checking. 한 배치가 영향을 줄 수 있는 도메인만 재검증한다:
 * - 충돌 그래프 이웃: 같은 슬롯 충돌 + H8(학생 일일 한도) → 같은 날 슬롯 전체
 * - 같은 학년 과목: 일일 시험 개수 cap(H5) + 동시 배치 정책 → 같은 날 슬롯 전체
 * - 감독 제약(H9, hard)이 켜져 있으면: 전 학년 미배정 과목의 "그 슬롯" 항목
 * 깎인 항목은 records에 기록되어 backtrack 시 undoRemovals로 복원된다.
 * 어떤 미배정 도메인이 비면 false (dead end).
 */
function forwardCheckTargeted(
  st: SearchState,
  input: ExamScheduleInput,
  graph: ConflictGraph,
  allowConcurrent: boolean,
  placedSid: string,
  placedSlot: SlotKey,
  records: RemovalRecord[],
): boolean {
  const placed = graph.bySubjectId.get(placedSid);
  if (!placed) return true;

  // 학년별 "정확 일치" 하한: 이 학년의 남은 과목으로 남은 필요 교시를 못 채우면 중단
  if (!gradeExactCountFeasible(placed.grade, st, input)) return false;

  const dayPrefix = `${placedSlot.dayIndex}|`;

  // 영향권 1·2: 이웃 + 같은 학년 (같은 날 슬롯만 재검증)
  const targets = new Set<string>();
  for (const nb of graph.adjacency.get(placedSid) ?? []) {
    if (!st.assignment.has(nb)) targets.add(nb);
  }
  for (const s of graph.subjects) {
    if (s.grade === placed.grade && s.id !== placedSid && !st.assignment.has(s.id)) {
      targets.add(s.id);
    }
  }

  for (const sid of targets) {
    const dom = st.domains.get(sid);
    if (!dom) continue;
    let removed: string[] | null = null;
    for (const k of dom) {
      if (!k.startsWith(dayPrefix)) continue;
      if (!isSlotValidForSubject(sid, parseSlotKey(k), input, graph, st, allowConcurrent)) {
        (removed ??= []).push(k);
      }
    }
    if (removed) {
      for (const k of removed) dom.delete(k);
      records.push({ sid, slots: removed });
      if (dom.size === 0) return false;
    }
  }

  // 영향권 3: 감독 수요는 슬롯 단위 — 다른 학년 과목도 "그 슬롯"만 재검증
  if (input.supervision.enabled && input.supervision.hard) {
    const pk = slotKey(placedSlot);
    for (const [sid, dom] of st.domains) {
      if (st.assignment.has(sid) || targets.has(sid)) continue;
      if (!dom.has(pk)) continue;
      if (!isSlotValidForSubject(sid, placedSlot, input, graph, st, allowConcurrent)) {
        dom.delete(pk);
        records.push({ sid, slots: [pk] });
        if (dom.size === 0) return false;
      }
    }
  }

  return true;
}

function peakStudentDayCount(
  st: SearchState,
  dayIndex: number,
  subject: ExamSubject,
): number {
  const dayCounts = st.studentDayCount.get(dayIndex);
  if (!dayCounts) return 0;
  let peak = 0;
  for (const code of subject.studentCodes) {
    const c = dayCounts.get(code) ?? 0;
    if (c > peak) peak = c;
  }
  return peak;
}

/**
 * Slot ordering 휴리스틱 (유효성은 isSlotValidForSubject가 보장, 여기는 순서만):
 * 1. 시험 개수 미달(deficit) 일차 우선 — 일일 시험 개수 "정확 일치"를 탐색 중에
 *    채워 나가도록 유도해 완성 해의 최종 검증 탈락률을 낮춘다.
 * 2. H8 hard 시 같은 날 학생 부담 피크가 낮은 일차 우선.
 * 3. 같은 날 안에서는 deficit이면 새 교시 우선, 아니면 기존 교시 우선.
 *    감독 hard 시 감독 수요가 낮은 교시 우선 (cross-grade 피크 분산).
 */
function orderSlotsByDayPressure(
  subjectId: string,
  slots: SlotKey[],
  st: SearchState,
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotKey[] {
  const subject = graph.bySubjectId.get(subjectId);
  if (!subject) {
    return rng.shuffle(slots.slice());
  }
  const h8Active = input.options.hardConstraints.maxExamsPerStudentPerDay;
  const supActive = input.supervision.enabled && input.supervision.hard;

  const gradeDays = daysOf(input, subject.grade);
  const deficitOf = (d: number): number => {
    const day = gradeDays.find((x) => x.dayIndex === d);
    if (!day) return 0;
    const got = st.perGradeDayDistinctSlots.get(`${subject.grade}|${d}`)?.size ?? 0;
    return Math.max(0, day.examCount - got);
  };

  const slotsByDay = new Map<number, SlotKey[]>();
  for (const slot of slots) {
    const arr = slotsByDay.get(slot.dayIndex) ?? [];
    arr.push(slot);
    slotsByDay.set(slot.dayIndex, arr);
  }

  const dayOrder = Array.from(slotsByDay.keys()).sort((a, b) => {
    const da = deficitOf(a);
    const db = deficitOf(b);
    if (da !== db) return db - da;
    if (h8Active) {
      const pa = peakStudentDayCount(st, a, subject);
      const pb = peakStudentDayCount(st, b, subject);
      if (pa !== pb) return pa - pb;
    }
    return rng.next() < 0.5 ? -1 : 1;
  });

  const out: SlotKey[] = [];
  for (const dayIdx of dayOrder) {
    let daySlots = rng.shuffle(slotsByDay.get(dayIdx)!.slice());
    const usedPeriods =
      st.perGradeDayDistinctSlots.get(`${subject.grade}|${dayIdx}`) ?? new Set<string>();
    const deficit = deficitOf(dayIdx);
    const pool = supActive ? buildRoomPool(input.supervision) : null;
    daySlots = daySlots
      .map((s, i) => ({
        s,
        i,
        // deficit 일차에서는 새 교시(아직 안 쓴 교시)를 먼저 시도
        newPeriod: usedPeriods.has(`${s.period}`) ? 1 : 0,
        load: pool
          ? slotSupervision(
              st.slotEntries.get(slotKey(s)) ?? [],
              input.supervision,
              pool,
            ).supervisors
          : 0,
      }))
      .sort((a, b) => {
        if (deficit > 0 && a.newPeriod !== b.newPeriod) return a.newPeriod - b.newPeriod;
        if (deficit === 0 && a.newPeriod !== b.newPeriod) return b.newPeriod - a.newPeriod;
        if (a.load !== b.load) return a.load - b.load;
        return a.i - b.i;
      })
      .map((x) => x.s);
    out.push(...daySlots);
  }
  return out;
}

function isSlotValidForSubject(
  subjectId: string,
  slot: SlotKey,
  input: ExamScheduleInput,
  graph: ConflictGraph,
  st: SearchState,
  allowConcurrent: boolean,
): boolean {
  const subject = graph.bySubjectId.get(subjectId);
  if (!subject) return false;

  // Period must be available for THIS subject's grade
  const day = daysOf(input, subject.grade).find((d) => d.dayIndex === slot.dayIndex);
  if (!day) return false;
  if (!day.availablePeriods.includes(slot.period)) return false;

  // Day examCount cap (학년별)
  const usedPeriods =
    st.perGradeDayDistinctSlots.get(`${subject.grade}|${slot.dayIndex}`) ?? new Set<string>();
  const newPeriodKey = `${slot.period}`;
  if (!usedPeriods.has(newPeriodKey) && usedPeriods.size + 1 > day.examCount) return false;

  // Conflict graph: if any neighbor placed in same slot, reject (student conflict)
  const adj = graph.adjacency.get(subjectId) ?? new Set<string>();
  for (const nb of adj) {
    const placed = st.assignment.get(nb);
    if (placed && placed.dayIndex === slot.dayIndex && placed.period === slot.period) return false;
  }

  // Concurrent policy: 같은 학년 안에서만 적용. 학년이 다르면 같은 교시 시험이
  // 정상이므로(전교 동시 시험) cross-grade 동시 배치는 항상 허용한다.
  if (!allowConcurrent) {
    for (const [otherId, a] of st.assignment) {
      if (a.dayIndex !== slot.dayIndex || a.period !== slot.period) continue;
      const other = graph.bySubjectId.get(otherId);
      if (other?.grade === subject.grade) return false;
    }
  }

  // H8 (HARD): per-student daily exam cap
  if (input.options.hardConstraints.maxExamsPerStudentPerDay) {
    const cap = input.options.maxExamsPerStudentPerDay;
    const dayCounts = st.studentDayCount.get(slot.dayIndex);
    if (dayCounts) {
      for (const code of subject.studentCodes) {
        if ((dayCounts.get(code) ?? 0) + 1 > cap) return false;
      }
    }
  }

  // H9 (HARD): 슬롯별 감독·시험실 수요 검사. 공통 과목은 반 시험실(고정),
  // 선택과목은 고사실 풀 greedy 배정으로 계산하며, 전 학년 수요가 합산되므로
  // 이 검사가 학년 간 시간표를 실제로 결합한다.
  if (input.supervision.enabled && input.supervision.hard) {
    const entries = [
      ...(st.slotEntries.get(slotKey(slot)) ?? []),
      subjectDemandEntry(subject, input.supervision),
    ];
    const res = slotSupervision(entries, input.supervision, buildRoomPool(input.supervision));
    if (!res.fits) return false;
    if (res.supervisors > input.supervision.availableSupervisors) return false;
  }

  return true;
}

export function findKInitialSolutions(
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
  k: number,
): SlotAssignment[][] {
  return findDiverseInitialSolutions(input, graph, rng, k).solutions;
}

export function findDiverseInitialSolutions(
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
  target: number,
  /** epoch ms 데드라인. 불가능한 입력에서 무한정 재시도하지 않도록 상한을 둔다 */
  deadlineMs?: number,
): InitialSolutionSearchResult {
  const out: SlotAssignment[][] = [];
  const seen = new Set<string>();
  let attempts = 0;
  let duplicates = 0;
  // When H8 (per-student daily cap) or H9 (supervisor capacity) is HARD the
  // feasible region collapses to a few specific day distributions, and each
  // random attempt has a low hit rate. Widen the seed pool and attempt budget.
  const tightConstraint =
    input.options.hardConstraints.maxExamsPerStudentPerDay ||
    (input.supervision.enabled && input.supervision.hard);
  const poolTarget = tightConstraint
    ? Math.max(target * 4, target + 16)
    : Math.max(target, Math.min(target * 2, target + 8));
  const maxAttempts = tightConstraint
    ? Math.max(poolTarget * 8, target * 32)
    : Math.max(poolTarget * 4, target * 4);

  while (out.length < poolTarget && attempts < maxAttempts) {
    if (deadlineMs !== undefined && Date.now() > deadlineMs) break;
    attempts++;
    const sol = findInitialSolution(input, graph, rng);
    if (!sol) continue;

    const signature = assignmentSignature(sol);
    if (seen.has(signature)) {
      duplicates++;
      continue;
    }

    seen.add(signature);
    out.push(sol);
  }

  const solutions = selectDiverseAssignments(out, target);
  return {
    solutions,
    attempts,
    duplicates,
    uniqueFound: out.length,
  };
}
