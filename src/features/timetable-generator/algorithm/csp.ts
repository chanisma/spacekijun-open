import type { GridConfig, Placement, TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import type { Rng } from './rng';
import { type TeacherHardConfig, teacherHardConfig, teacherPlaceCost } from './teacherConstraints';

export interface CellKey {
  dayIndex: number;
  period: number;
}

export function cellKeyStr(c: CellKey): string {
  return `${c.dayIndex}|${c.period}`;
}

export function parseCellKey(s: string): CellKey {
  const [d, p] = s.split('|').map(Number);
  return { dayIndex: d, period: p };
}

/** 격자의 모든 칸 (요일 0..days-1 × 교시 1..periodsPerDay) */
export function enumerateCells(grid: GridConfig): CellKey[] {
  const out: CellKey[] = [];
  for (let d = 0; d < grid.days; d++) {
    for (let p = 1; p <= grid.periodsPerDay; p++) {
      out.push({ dayIndex: d, period: p });
    }
  }
  return out;
}

interface SearchState {
  // lessonId -> 배치된 칸
  assignment: Map<string, CellKey>;
  // "offeringId|day" -> 그 날 배치된 같은 강좌 인스턴스 수 (subjectDailyCap)
  offeringDayCount: Map<string, number>;
  // lessonId -> 남은 도메인 (칸 키 집합) — forward checking 상태
  domains: Map<string, Set<string>>;
  steps: number;
}

/** FC가 깎은 도메인 항목의 되돌리기 기록 (변경분만 유지) */
interface RemovalRecord {
  lessonId: string;
  cells: string[];
}

const MAX_BACKTRACK_STEPS = 2_000_000;

export interface InitialSolutionSearchResult {
  solutions: Placement[][];
  attempts: number;
  duplicates: number;
}

export function assignmentSignature(placements: Placement[]): string {
  return placements
    .map((a) => `${a.lessonId}:${a.dayIndex}:${a.period}`)
    .sort()
    .join('|');
}

function offeringOf(graph: ConflictGraph, lessonId: string): string | null {
  return graph.byLessonId.get(lessonId)?.offeringId ?? null;
}

/** Lesson을 칸에 둘 수 있는가 (정적 차단 + 인접 충돌 + 같은 과목 하루 한도) */
function isCellValid(
  lessonId: string,
  cell: CellKey,
  input: TimetableInput,
  graph: ConflictGraph,
  st: SearchState,
): boolean {
  const lesson = graph.byLessonId.get(lessonId);
  if (!lesson) return false;

  const key = cellKeyStr(cell);

  // 정적 차단 칸 (학년/반 차단 ∪ 교사 불가 ∪ 창체 점유)
  if (lesson.blockedCells.includes(key)) return false;

  // 인접(학생/교사/교실 공유) 충돌: 같은 칸에 이미 인접 lesson이 있으면 불가
  const adj = graph.adjacency.get(lessonId);
  if (adj) {
    for (const nb of adj) {
      const placed = st.assignment.get(nb);
      if (placed && placed.dayIndex === cell.dayIndex && placed.period === cell.period) {
        return false;
      }
    }
  }

  // 같은 과목 하루 한도
  if (input.options.hard.subjectDailyCap) {
    const cnt = st.offeringDayCount.get(`${lesson.offeringId}|${cell.dayIndex}`) ?? 0;
    if (cnt >= input.options.maxPerSubjectPerDay) return false;
  }

  return true;
}

function placeLesson(
  lessonId: string,
  cell: CellKey,
  graph: ConflictGraph,
  st: SearchState,
): void {
  st.assignment.set(lessonId, cell);
  const off = offeringOf(graph, lessonId);
  if (off) {
    const k = `${off}|${cell.dayIndex}`;
    st.offeringDayCount.set(k, (st.offeringDayCount.get(k) ?? 0) + 1);
  }
}

function removeLesson(
  lessonId: string,
  cell: CellKey,
  graph: ConflictGraph,
  st: SearchState,
): void {
  st.assignment.delete(lessonId);
  const off = offeringOf(graph, lessonId);
  if (off) {
    const k = `${off}|${cell.dayIndex}`;
    const next = (st.offeringDayCount.get(k) ?? 1) - 1;
    if (next <= 0) st.offeringDayCount.delete(k);
    else st.offeringDayCount.set(k, next);
  }
}

function undoRemovals(st: SearchState, records: RemovalRecord[]): void {
  for (let i = records.length - 1; i >= 0; i--) {
    const dom = st.domains.get(records[i].lessonId);
    if (!dom) continue;
    for (const c of records[i].cells) dom.add(c);
  }
}

/**
 * Targeted forward checking. 배치가 영향을 주는 도메인만 깎는다:
 * - 인접(미배치) 이웃: 방금 점유한 칸을 도메인에서 제거
 * - 같은 강좌(미배치) 인스턴스: subjectDailyCap이면 그 날 모든 칸 제거
 * 어떤 미배치 도메인이 비면 dead-end(false).
 */
function forwardCheck(
  placedId: string,
  cell: CellKey,
  input: TimetableInput,
  graph: ConflictGraph,
  st: SearchState,
  records: RemovalRecord[],
): boolean {
  const key = cellKeyStr(cell);
  const placed = graph.byLessonId.get(placedId);
  if (!placed) return true;

  // 이웃: 같은 칸 제거
  for (const nb of graph.adjacency.get(placedId) ?? []) {
    if (st.assignment.has(nb)) continue;
    const dom = st.domains.get(nb);
    if (!dom || !dom.has(key)) continue;
    dom.delete(key);
    records.push({ lessonId: nb, cells: [key] });
    if (dom.size === 0) return false;
  }

  // 같은 강좌 인스턴스: 그 날 전체 교시 제거 (하루 한도 1 가정의 일반화)
  if (input.options.hard.subjectDailyCap && input.options.maxPerSubjectPerDay === 1) {
    const dayPrefix = `${cell.dayIndex}|`;
    for (const sib of graph.lessons) {
      if (sib.offeringId !== placed.offeringId || sib.id === placedId) continue;
      if (st.assignment.has(sib.id)) continue;
      const dom = st.domains.get(sib.id);
      if (!dom) continue;
      let removed: string[] | null = null;
      for (const c of dom) {
        if (c.startsWith(dayPrefix)) (removed ??= []).push(c);
      }
      if (removed) {
        for (const c of removed) dom.delete(c);
        records.push({ lessonId: sib.id, cells: removed });
        if (dom.size === 0) return false;
      }
    }
  }

  return true;
}

/** MRV: 남은 도메인이 가장 작은 미배치 lesson, 동률은 충돌차수 큰 쪽, 그래도 동률은 무작위 */
function selectNextLesson(graph: ConflictGraph, st: SearchState, rng: Rng): string | null {
  let best: string | null = null;
  let bestSize = Number.POSITIVE_INFINITY;
  let bestDeg = -1;
  let ties = 0;
  for (const [id, dom] of st.domains) {
    if (st.assignment.has(id)) continue;
    const size = dom.size;
    const deg = graph.adjacency.get(id)?.size ?? 0;
    if (size < bestSize || (size === bestSize && deg > bestDeg)) {
      best = id;
      bestSize = size;
      bestDeg = deg;
      ties = 1;
    } else if (size === bestSize && deg === bestDeg) {
      ties++;
      if (rng.next() < 1 / ties) best = id;
    }
  }
  return best;
}

/**
 * Least-Constraining Value 순서. 각 칸을 그 칸에 두면 "아직 미배치인 이웃들의
 * 도메인에서 그 칸이 몇 개나 사라지는가"(impact)로 평가해 impact가 작은 칸을
 * 먼저 시도한다. 이웃의 선택지를 가장 적게 줄이는 칸을 우선해 백트래킹을 급감시킨다.
 * (시험솔버의 날짜 분산 휴리스틱은 채색형 완전 배치엔 역효과라 LCV로 대체.)
 * 동률은 무작위로 섞어 시드 다양성을 만든다.
 */
function orderCells(
  lessonId: string,
  cells: CellKey[],
  graph: ConflictGraph,
  st: SearchState,
  rng: Rng,
): CellKey[] {
  const neighbors: string[] = [];
  for (const nb of graph.adjacency.get(lessonId) ?? []) {
    if (!st.assignment.has(nb)) neighbors.push(nb);
  }
  return cells
    .map((c) => {
      const key = cellKeyStr(c);
      let impact = 0;
      for (const nb of neighbors) {
        const dom = st.domains.get(nb);
        if (dom && dom.has(key)) impact++;
      }
      return { c, impact, j: rng.next() };
    })
    .sort((a, b) => a.impact - b.impact || a.j - b.j)
    .map((x) => x.c);
}

export function findInitialSolution(
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  deadlineMs?: number,
): Placement[] | null {
  const cells = enumerateCells(input.grid);
  const allKeys = cells.map(cellKeyStr);

  // 도메인 초기화: 전체 칸 − 정적 차단 칸
  const domains = new Map<string, Set<string>>();
  for (const l of graph.lessons) {
    const blocked = new Set(l.blockedCells);
    const dom = new Set<string>();
    for (const k of allKeys) if (!blocked.has(k)) dom.add(k);
    domains.set(l.id, dom);
  }

  const st: SearchState = {
    assignment: new Map(),
    offeringDayCount: new Map(),
    domains,
    steps: 0,
  };

  // 고정 배치(pinned) 선반영
  const pinnedIds = new Set<string>();
  for (const p of input.pinned) {
    const cell = { dayIndex: p.dayIndex, period: p.period };
    if (!isCellValid(p.lessonId, cell, input, graph, st)) return null;
    const dom = st.domains.get(p.lessonId);
    if (!dom) return null;
    const keep = cellKeyStr(cell);
    for (const k of [...dom]) if (k !== keep) dom.delete(k);
    placeLesson(p.lessonId, cell, graph, st);
    pinnedIds.add(p.lessonId);
    if (!forwardCheck(p.lessonId, cell, input, graph, st, [])) return null;
  }

  let aborted = false;
  function backtrack(): boolean {
    if (aborted) return false;
    if (st.steps++ > MAX_BACKTRACK_STEPS) {
      aborted = true;
      return false;
    }
    // 데드라인 초과 시 전체 탐색 중단 (한 시도가 무한정 thrash하지 않도록)
    if (deadlineMs !== undefined && (st.steps & 0x3ff) === 0 && Date.now() > deadlineMs) {
      aborted = true;
      return false;
    }
    const lessonId = selectNextLesson(graph, st, rng);
    if (lessonId === null) return true; // 전부 배치 완료

    const dom = st.domains.get(lessonId);
    if (!dom || dom.size === 0) return false;
    const candidates = orderCells(
      lessonId,
      Array.from(dom).map(parseCellKey),
      graph,
      st,
      rng,
    );

    for (const cell of candidates) {
      if (aborted) return false;
      if (!isCellValid(lessonId, cell, input, graph, st)) continue;
      const records: RemovalRecord[] = [];
      placeLesson(lessonId, cell, graph, st);
      if (forwardCheck(lessonId, cell, input, graph, st, records)) {
        if (backtrack()) return true;
      }
      removeLesson(lessonId, cell, graph, st);
      undoRemovals(st, records);
    }
    return false;
  }

  if (!backtrack()) return null;

  return graph.lessons.map((l) => {
    const cell = st.assignment.get(l.id)!;
    return { lessonId: l.id, dayIndex: cell.dayIndex, period: cell.period };
  });
}

function placementDistance(a: Placement[], b: Placement[]): number {
  const mb = new Map<string, string>();
  for (const x of b) mb.set(x.lessonId, `${x.dayIndex}|${x.period}`);
  let diff = 0;
  for (const x of a) {
    if (mb.get(x.lessonId) !== `${x.dayIndex}|${x.period}`) diff++;
  }
  return diff;
}

function selectDiverse(pool: Placement[][], target: number): Placement[][] {
  if (pool.length <= target) return pool;
  const selected: Placement[][] = [pool[0]];
  const remaining = pool.slice(1);
  while (selected.length < target && remaining.length > 0) {
    let bestIdx = 0;
    let bestMin = -1;
    for (let i = 0; i < remaining.length; i++) {
      const minD = Math.min(...selected.map((s) => placementDistance(remaining[i], s)));
      if (minD > bestMin) {
        bestMin = minD;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}

// ── Min-Conflicts 휴리스틱 ────────────────────────────────────────
// 백트래킹은 채색수에 가까운(여유 색이 적은) 빡빡한 인스턴스에서 thrash한다.
// Min-conflicts는 완전 배치에서 출발해 "충돌하는 lesson을 충돌이 최소인 칸으로"
// 옮기길 반복하는 국소탐색으로, 대규모 CSP(시간표 채색)에 훨씬 강건하다.
// 0 충돌에 도달하면 완전 실현가능 해. 증분 충돌 추적으로 한 스텝이 저렴하다.

/**
 * 교사 하드 제약 4종의 증분 점유 상태 (멀티셋 카운트 + count>0 파생 마스크).
 * 수선 도중 같은 교사의 두 lesson이 일시적으로 같은 칸에 겹칠 수 있어(간선 위반으로
 * 별도 계수) 카운트가 원본이고 마스크는 파생값이다. cfg.any=false면 아예 만들지 않는다.
 */
interface McTeacherState {
  cfg: TeacherHardConfig;
  days: number;
  P: number;
  tOf: Map<string, number>; // lessonId -> 교사 정수 (교사 없는 lesson은 미등록)
  sOf: Map<string, number>; // lessonId -> (교사,과목) 정수
  /** t -> 그 교사의 모든 lessonId (이동 시 같은 교사 수업의 충돌 상태 재평가용) */
  lessonsOfT: string[][];
  occ: Int32Array; // (t*days+d)*P+(p-1) 멀티셋 카운트
  mask: Int32Array; // t*days+d 점유 비트마스크
  dayCount: Int32Array; // t*days+d 수업 수(멀티셋 합)
  lastCount: Int32Array; // t 주간 마지막 교시 수업 수
  sOcc: Int32Array; // (s*days+d)*P+(p-1)
  sMask: Int32Array; // s*days+d
}

function buildMcTeacherState(input: TimetableInput, graph: ConflictGraph): McTeacherState | null {
  const cfg = teacherHardConfig(input);
  if (!cfg.any) return null;
  const days = input.grid.days;
  const P = input.grid.periodsPerDay;
  const tIdx = new Map<string, number>();
  const sIdx = new Map<string, number>();
  const tOf = new Map<string, number>();
  const sOf = new Map<string, number>();
  const lessonsOfT: string[][] = [];
  for (const l of graph.lessons) {
    if (!l.teacherId) continue;
    let t = tIdx.get(l.teacherId);
    if (t === undefined) {
      t = tIdx.size;
      tIdx.set(l.teacherId, t);
      lessonsOfT.push([]);
    }
    tOf.set(l.id, t);
    lessonsOfT[t].push(l.id);
    const sk = `${t}|${l.offeringId}`;
    let s = sIdx.get(sk);
    if (s === undefined) {
      s = sIdx.size;
      sIdx.set(sk, s);
    }
    sOf.set(l.id, s);
  }
  return {
    cfg, days, P, tOf, sOf, lessonsOfT,
    occ: new Int32Array(tIdx.size * days * P),
    mask: new Int32Array(tIdx.size * days),
    dayCount: new Int32Array(tIdx.size * days),
    lastCount: new Int32Array(tIdx.size),
    sOcc: new Int32Array(sIdx.size * days * P),
    sMask: new Int32Array(sIdx.size * days),
  };
}

function tsApply(ts: McTeacherState, id: string, day: number, period: number, delta: 1 | -1): void {
  const t = ts.tOf.get(id);
  if (t === undefined) return;
  const bit = 1 << (period - 1);
  const dk = t * ts.days + day;
  const ok = dk * ts.P + (period - 1);
  ts.occ[ok] += delta;
  ts.dayCount[dk] += delta;
  if (delta > 0 ? ts.occ[ok] === 1 : ts.occ[ok] === 0) {
    if (delta > 0) ts.mask[dk] |= bit;
    else ts.mask[dk] &= ~bit;
  }
  if (period === ts.cfg.lastPeriod) ts.lastCount[t] += delta;
  const s = ts.sOf.get(id)!;
  const sdk = s * ts.days + day;
  const sok = sdk * ts.P + (period - 1);
  ts.sOcc[sok] += delta;
  if (delta > 0 ? ts.sOcc[sok] === 1 : ts.sOcc[sok] === 0) {
    if (delta > 0) ts.sMask[sdk] |= bit;
    else ts.sMask[sdk] &= ~bit;
  }
}

/** id를 cell에 둘 때의 교사 하드 한계 비용 (자기 자신의 현 배치는 제외하고 평가) */
function tsCost(ts: McTeacherState, id: string, cell: CellKey, cur: CellKey | undefined): number {
  const t = ts.tOf.get(id);
  if (t === undefined) return 0;
  const d = cell.dayIndex;
  const dk = t * ts.days + d;
  let dayCount = ts.dayCount[dk];
  let mask = ts.mask[dk];
  let last = ts.lastCount[t];
  const s = ts.sOf.get(id)!;
  const sdk = s * ts.days + d;
  let subjMask = ts.sMask[sdk];
  if (cur) {
    if (cur.dayIndex === d) {
      dayCount--;
      const bit = 1 << (cur.period - 1);
      if (ts.occ[dk * ts.P + (cur.period - 1)] === 1) mask &= ~bit;
      if (ts.sOcc[sdk * ts.P + (cur.period - 1)] === 1) subjMask &= ~bit;
    }
    if (cur.period === ts.cfg.lastPeriod) last--;
  }
  return teacherPlaceCost(ts.cfg, dayCount, mask, last, subjMask, cell.period);
}

interface MCState {
  assignment: Map<string, CellKey>;
  occupants: Map<string, Set<string>>; // cellKey -> lessonIds
  offeringDay: Map<string, number>; // "offeringId|day" -> count
  /** 교사 하드 제약 점유 상태 (플래그 전부 off면 null = 레거시 경로 그대로) */
  ts: McTeacherState | null;
}

/** id를 cell에 둘 때의 충돌 비용 (인접 동거 + 같은 과목 하루 한도 초과) */
function mcCost(
  id: string,
  cell: CellKey,
  st: MCState,
  graph: ConflictGraph,
  input: TimetableInput,
): number {
  let cost = 0;
  const adj = graph.adjacency.get(id);
  const occ = st.occupants.get(cellKeyStr(cell));
  if (occ && adj) for (const o of occ) if (o !== id && adj.has(o)) cost++;
  if (input.options.hard.subjectDailyCap) {
    const off = graph.byLessonId.get(id)?.offeringId;
    if (off) {
      let n = st.offeringDay.get(`${off}|${cell.dayIndex}`) ?? 0;
      const cur = st.assignment.get(id);
      if (cur && cur.dayIndex === cell.dayIndex) n--; // 자기 자신 제외
      if (n >= input.options.maxPerSubjectPerDay) cost += n - input.options.maxPerSubjectPerDay + 1;
    }
  }
  if (st.ts) cost += tsCost(st.ts, id, cell, st.assignment.get(id));
  return cost;
}

function mcPlace(id: string, cell: CellKey, st: MCState, graph: ConflictGraph): void {
  st.assignment.set(id, cell);
  const k = cellKeyStr(cell);
  let set = st.occupants.get(k);
  if (!set) {
    set = new Set();
    st.occupants.set(k, set);
  }
  set.add(id);
  const off = graph.byLessonId.get(id)?.offeringId;
  if (off) {
    const ok = `${off}|${cell.dayIndex}`;
    st.offeringDay.set(ok, (st.offeringDay.get(ok) ?? 0) + 1);
  }
  if (st.ts) tsApply(st.ts, id, cell.dayIndex, cell.period, 1);
}

function mcRemove(id: string, st: MCState, graph: ConflictGraph): void {
  const cell = st.assignment.get(id);
  if (!cell) return;
  st.occupants.get(cellKeyStr(cell))?.delete(id);
  const off = graph.byLessonId.get(id)?.offeringId;
  if (off) {
    const ok = `${off}|${cell.dayIndex}`;
    const n = (st.offeringDay.get(ok) ?? 1) - 1;
    if (n <= 0) st.offeringDay.delete(ok);
    else st.offeringDay.set(ok, n);
  }
  if (st.ts) tsApply(st.ts, id, cell.dayIndex, cell.period, -1);
}

function mcConflicted(id: string, st: MCState, graph: ConflictGraph, input: TimetableInput): boolean {
  const cell = st.assignment.get(id);
  if (!cell) return false;
  return mcCost(id, cell, st, graph, input) > 0;
}

function mcBestCell(
  id: string,
  domain: CellKey[],
  st: MCState,
  graph: ConflictGraph,
  input: TimetableInput,
  rng: Rng,
): CellKey {
  let bestCost = Number.POSITIVE_INFINITY;
  let best: CellKey[] = [];
  for (const c of domain) {
    const cost = mcCost(id, c, st, graph, input);
    if (cost < bestCost) {
      bestCost = cost;
      best = [c];
    } else if (cost === bestCost) best.push(c);
  }
  return best.length === 1 ? best[0] : best[rng.int(best.length)];
}

/**
 * Min-conflicts 한 회. 완전 실현가능(0 충돌) 해를 반환, 데드라인/스텝 내에 못 풀면 null.
 */
export function minConflictsSeed(
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
  deadlineMs: number,
  maxSteps: number,
): { placements: Placement[]; conflicts: number } | null {
  const st: MCState = {
    assignment: new Map(),
    occupants: new Map(),
    offeringDay: new Map(),
    ts: buildMcTeacherState(input, graph),
  };
  const pinnedCell = new Map<string, CellKey>();
  for (const p of input.pinned) pinnedCell.set(p.lessonId, { dayIndex: p.dayIndex, period: p.period });

  // 1) 그리디 초기 배치: 충돌차수 높은 lesson부터 충돌 최소 칸에
  const order = [...graph.lessons].sort(
    (a, b) => (graph.adjacency.get(b.id)?.size ?? 0) - (graph.adjacency.get(a.id)?.size ?? 0),
  );
  for (const l of order) {
    const fixed = pinnedCell.get(l.id);
    if (fixed) {
      mcPlace(l.id, fixed, st, graph);
      continue;
    }
    const dom = domains.get(l.id) ?? [];
    if (dom.length === 0) return null; // 배치 불가능한 lesson
    mcPlace(l.id, mcBestCell(l.id, dom, st, graph, input, rng), st, graph);
  }

  // 2) 충돌 집합 구성
  const conflicted = new Set<string>();
  for (const l of graph.lessons) {
    if (!pinned.has(l.id) && mcConflicted(l.id, st, graph, input)) conflicted.add(l.id);
  }

  // 3) 반복 수선 (min-conflicts + plateau kick + 최선해 보존)
  const snapshot = (): Placement[] =>
    graph.lessons.map((l) => {
      const c = st.assignment.get(l.id)!;
      return { lessonId: l.id, dayIndex: c.dayIndex, period: c.period };
    });

  // 한 lesson을 target 칸으로 옮기고 영향받은 lesson들의 충돌 상태를 갱신
  const moveAndUpdate = (id: string, target: CellKey): void => {
    const old = st.assignment.get(id)!;
    if (old.dayIndex === target.dayIndex && old.period === target.period) {
      if (!mcConflicted(id, st, graph, input)) conflicted.delete(id);
      return;
    }
    const affected = new Set<string>([id]);
    for (const o of st.occupants.get(cellKeyStr(old)) ?? []) affected.add(o);
    for (const o of st.occupants.get(cellKeyStr(target)) ?? []) affected.add(o);
    mcRemove(id, st, graph);
    mcPlace(id, target, st, graph);
    for (const o of st.occupants.get(cellKeyStr(target)) ?? []) affected.add(o);
    const off = graph.byLessonId.get(id)?.offeringId;
    if (off) {
      for (const sib of graph.byOffering.get(off) ?? []) {
        const sc = st.assignment.get(sib);
        if (sc && (sc.dayIndex === old.dayIndex || sc.dayIndex === target.dayIndex)) affected.add(sib);
      }
    }
    // 교사 하드 제약: 같은 교사의 다른 수업도 (마스크 변화로) 위반 상태가 바뀔 수 있다
    if (st.ts) {
      const t = st.ts.tOf.get(id);
      if (t !== undefined) for (const mate of st.ts.lessonsOfT[t]) affected.add(mate);
    }
    for (const a of affected) {
      if (pinned.has(a)) continue;
      if (mcConflicted(a, st, graph, input)) conflicted.add(a);
      else conflicted.delete(a);
    }
  };

  // 두 lesson의 칸을 교환 (얽힌 충돌 해소 — 단일 재배치로 못 푸는 A↔B 상호 점유)
  const swapAndUpdate = (a: string, b: string): void => {
    const ca = st.assignment.get(a)!;
    const cb = st.assignment.get(b)!;
    if (ca.dayIndex === cb.dayIndex && ca.period === cb.period) return;
    const affected = new Set<string>([a, b]);
    for (const o of st.occupants.get(cellKeyStr(ca)) ?? []) affected.add(o);
    for (const o of st.occupants.get(cellKeyStr(cb)) ?? []) affected.add(o);
    mcRemove(a, st, graph);
    mcRemove(b, st, graph);
    mcPlace(a, cb, st, graph);
    mcPlace(b, ca, st, graph);
    for (const id of [a, b]) {
      const off = graph.byLessonId.get(id)?.offeringId;
      if (off) {
        for (const sib of graph.byOffering.get(off) ?? []) {
          const sc = st.assignment.get(sib);
          if (sc && (sc.dayIndex === ca.dayIndex || sc.dayIndex === cb.dayIndex)) affected.add(sib);
        }
      }
      if (st.ts) {
        const t = st.ts.tOf.get(id);
        if (t !== undefined) for (const mate of st.ts.lessonsOfT[t]) affected.add(mate);
      }
    }
    for (const x of affected) {
      if (pinned.has(x)) continue;
      if (mcConflicted(x, st, graph, input)) conflicted.add(x);
      else conflicted.delete(x);
    }
  };

  const movable = graph.lessons.filter((l) => !pinned.has(l.id)).map((l) => l.id);
  let best = snapshot();
  let bestConflicts = conflicted.size;
  let sinceImprove = 0;
  const plateauLimit = Math.max(3000, graph.lessons.length * 4);
  const kickSize = Math.max(2, Math.round(graph.lessons.length * 0.03));
  const META_T = 0.7; // Metropolis 온도 (충돌 +Δ 이동을 exp(-Δ/T)로 수용 — 여유≈0 채색 탈출)

  for (let step = 0; step < maxSteps; step++) {
    if (conflicted.size === 0) break;
    if ((step & 0x1ff) === 0 && Date.now() > deadlineMs) break;

    if (conflicted.size < bestConflicts) {
      bestConflicts = conflicted.size;
      best = snapshot();
      sinceImprove = 0;
    } else if (++sinceImprove > plateauLimit) {
      // 국소최소 탈출: 충돌 영역(충돌 lesson + 그 이웃)을 집중 perturb (targeted kick)
      sinceImprove = 0;
      const pool: string[] = [];
      for (const cid of conflicted) {
        if (!pinned.has(cid)) pool.push(cid);
        for (const nb of graph.adjacency.get(cid) ?? []) if (!pinned.has(nb)) pool.push(nb);
      }
      const kickPool = pool.length > 0 ? pool : movable;
      for (let k = 0; k < kickSize && kickPool.length > 0; k++) {
        const kid = kickPool[rng.int(kickPool.length)];
        const kdom = domains.get(kid) ?? [];
        if (kdom.length > 0) moveAndUpdate(kid, kdom[rng.int(kdom.length)]);
      }
      continue;
    }

    // 충돌 lesson 1개를 충돌 최소 칸으로 (8% 무작위)
    let pick: string | null = null;
    let r = rng.int(conflicted.size);
    for (const id of conflicted) {
      if (r-- === 0) {
        pick = id;
        break;
      }
    }
    if (pick === null) break;
    const dom = domains.get(pick) ?? [];
    if (dom.length === 0) {
      conflicted.delete(pick);
      continue;
    }
    const oldCell = st.assignment.get(pick)!;
    const before = conflicted.size;
    // 25%: pick을 best 칸의 점유 lesson과 교환(스왑). 단 상대도 pick의 칸에 합법 배치 가능해야 함
    if (rng.next() < 0.25) {
      const swapTarget = mcBestCell(pick, dom, st, graph, input, rng);
      const occ = [...(st.occupants.get(cellKeyStr(swapTarget)) ?? [])].filter(
        (o) =>
          o !== pick && !pinned.has(o) &&
          (domains.get(o) ?? []).some((c) => c.dayIndex === oldCell.dayIndex && c.period === oldCell.period),
      );
      if (occ.length > 0) {
        const b = occ[rng.int(occ.length)];
        swapAndUpdate(pick, b);
        const delta = conflicted.size - before;
        if (delta > 0 && rng.next() >= Math.exp(-delta / META_T)) swapAndUpdate(pick, b); // 거절 → 되돌리기
        continue;
      }
    }
    // 단일 재배치 + Metropolis 수용
    const target = rng.next() < 0.08 ? dom[rng.int(dom.length)] : mcBestCell(pick, dom, st, graph, input, rng);
    moveAndUpdate(pick, target);
    const delta = conflicted.size - before;
    if (delta > 0 && rng.next() >= Math.exp(-delta / META_T)) moveAndUpdate(pick, oldCell);
  }

  // 0 충돌이면 완전 실현가능 해, 아니면 최선해(잔여 충돌 수 포함) 반환
  if (conflicted.size === 0) return { placements: snapshot(), conflicts: 0 };
  return { placements: best, conflicts: bestConflicts };
}

export function findDiverseInitialSolutions(
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  target: number,
  deadlineMs?: number,
): InitialSolutionSearchResult {
  const out: Placement[][] = [];
  const seen = new Set<string>();
  let attempts = 0;
  let duplicates = 0;
  const maxAttempts = Math.max(target * 6, 12);

  while (out.length < Math.max(target * 2, target) && attempts < maxAttempts) {
    if (deadlineMs !== undefined && Date.now() > deadlineMs) break;
    attempts++;
    // 시도별 예산: 막힌 시도는 5초 안에 접고 다른 무작위 시드로 재시도
    const attemptDeadline = Math.min(
      deadlineMs ?? Number.POSITIVE_INFINITY,
      Date.now() + 5000,
    );
    const sol = findInitialSolution(input, graph, rng, attemptDeadline);
    if (!sol) continue;
    const sig = assignmentSignature(sol);
    if (seen.has(sig)) {
      duplicates++;
      continue;
    }
    seen.add(sig);
    out.push(sol);
  }

  return { solutions: selectDiverse(out, target), attempts, duplicates };
}
