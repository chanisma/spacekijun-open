// Phase 1 — 라인 원자블록 배치 (Block Placement).
//
// 블록 구조 시간표 생성의 2단계. Phase 0(선택군 편성)이 만든 라인을 "원자 블록"으로 격자에 배치한다.
//
// 핵심 구조(실데이터 검증):
//  - 선택 라인(밴드)은 학년 전체 블록 → 같은 학년 밴드는 서로소 칸 → 학생 무충돌·**공강 자동 균일**.
//  - 밴드 칸과 공통과목 칸은 서로소 영역 → 교사가 라인+공통을 겸해도 무충돌.
//  - 라인 내부 분반 교사는 서로 다름(편성 시 보장) → 라인 내부 무충돌.
//  → Phase 1의 실질 문제는 (a) 공통과목을 (공강 선지정 후) 남는 칸에 교사충돌 없이 타일링,
//     (b) 학년 간 교사를 공유하는 밴드/공통이 같은 칸에 겹치지 않게(교차교사 #3) — 둘 다 소형.
//
// 균일 공강: 학년별로 공강 칸을 먼저 지정 → 공통과목이 남는 칸을 정확히 타일링 → 모든 반 동일 busy.
// 회귀: scripts/timetable-generator-test/run-phase1-place.mts.
import type { Grade, GridConfig } from '../types';
import { createRng } from './rng';

/** 학년 전체 밴드 블록 = 선택 라인 1개 또는 창체. credits칸을 모든 반이 동시 점유. */
export interface BandBlock {
  id: string;
  grade: Grade;
  /** 점유 칸 수 (라인=과목 학점, 창체=1) */
  credits: number;
  /** 이 밴드에서 수업하는 교사들(모든 분반). 밴드 칸 전체에서 busy → 교차교사 제약에 사용 */
  teachers: string[];
  /** 창체 등 고정 칸 (셀 인덱스). 있으면 이동 안 함 */
  pinnedCells?: number[];
}

/** 반별 공통과목 블록. 그 반의 비-밴드 칸을 타일링. */
export interface CommonBlock {
  id: string;
  grade: Grade;
  /** "학년-반" */
  classKey: string;
  subject: string;
  credits: number;
  teacherId: string | null;
}

export interface BlockPlacementInput {
  grid: GridConfig;
  grades: Grade[];
  /** 학년별 배치 금지 칸 "dayIndex|period" (점심 등 강제 공강) */
  blockedByGrade?: Partial<Record<number, string[]>>;
  bands: BandBlock[];
  commons: CommonBlock[];
  seed?: number;
}

export interface BlockPlacementResult {
  /** blockId(밴드/공통) -> 점유 셀 인덱스 배열 */
  cells: Map<string, number[]>;
  teacherConflicts: number;
  bandOverlap: number;
  classOverlap: number;
  /** 학년별 균일 공강 여부 */
  uniformGongByGrade: Map<number, boolean>;
  /** 학년별 공강 칸 (셀 인덱스) */
  gongCellsByGrade: Map<number, number[]>;
}

export function placeBlocks(input: BlockPlacementInput): BlockPlacementResult {
  const { grid } = input;
  const PER = grid.periodsPerDay;
  const NCELL = grid.days * PER;
  const cellStr = (c: number) => `${Math.floor(c / PER)}|${(c % PER) + 1}`;
  const rng = createRng((input.seed ?? 20260615) >>> 0);

  const bandsByGrade = new Map<number, BandBlock[]>();
  for (const b of input.bands) (bandsByGrade.get(b.grade) ?? bandsByGrade.set(b.grade, []).get(b.grade)!).push(b);
  const commonsByGrade = new Map<number, CommonBlock[]>();
  for (const c of input.commons) (commonsByGrade.get(c.grade) ?? commonsByGrade.set(c.grade, []).get(c.grade)!).push(c);

  const cells = new Map<string, number[]>();
  const gongCellsByGrade = new Map<number, number[]>();

  // ── 1) 밴드 학년통합 동시배치 (간선=같은 학년 ∨ 교사 공유 → 서로소 칸) ──
  placeBandsJoint(input, cells, NCELL, cellStr, rng);

  // ── 2) 학년별 공강 지정 + 공통 타일 칸 산정 (밴드 고정) ──
  const tileCellsByGrade = new Map<number, number[]>();
  for (const grade of input.grades) {
    const blocked = new Set((input.blockedByGrade?.[grade] ?? []).map((s) => s));
    const available = [...Array(NCELL).keys()].filter((c) => !blocked.has(cellStr(c)));
    const bands = bandsByGrade.get(grade) ?? [];
    const commons = commonsByGrade.get(grade) ?? [];

    const usedByBand = new Set<number>();
    for (const b of bands) for (const c of cells.get(b.id) ?? []) usedByBand.add(c);

    // 공통은 전체 비-밴드 영역에 유연 배치(공강은 반마다 다를 수 있음). 좁은 균일 영역에 가두면
    // 소수 교사가 많은 반을 맡는 공통(예: grade-3 영어독해와작문 1교사 5반=15칸)이 들어갈 자리가
    // 부족해 교사충돌이 강제된다. 전체 영역을 주면 그 부하를 주 전체로 분산할 수 있다.
    const commonNeed = Math.round(commons.reduce((a, c) => a + c.credits, 0) / Math.max(1, classCount(commons)));
    const nonBand = available.filter((c) => !usedByBand.has(c));
    tileCellsByGrade.set(grade, nonBand);
    // 균일 공강 칸(여유분) 추정: 비-밴드 − 반당 공통 학점 (양수면 그만큼 공강 여유)
    gongCellsByGrade.set(grade, nonBand.slice(Math.min(nonBand.length, commonNeed)));
  }

  // ── 3) 공통 글로벌 타일링: 밴드 교사 점유를 배경으로, 전 학년 공통을 실제 셀 기준 교사충돌 최소화 ──
  tileCommonsGlobal(input, commonsByGrade, tileCellsByGrade, cells, NCELL, rng);

  // ── 충돌 집계 ──
  const conflicts = countAll(input, cells, NCELL);

  // ── 균일 공강 검증 (학년별: 모든 반 busy 동일) ──
  const uniformGongByGrade = new Map<number, boolean>();
  for (const grade of input.grades) {
    const bandUnion = new Set<number>();
    for (const b of bandsByGrade.get(grade) ?? []) for (const c of cells.get(b.id) ?? []) bandUnion.add(c);
    const commons = commonsByGrade.get(grade) ?? [];
    const byClass = new Map<string, Set<number>>();
    for (const cb of commons) {
      const set = byClass.get(cb.classKey) ?? new Set<number>(bandUnion);
      for (const c of cells.get(cb.id) ?? []) set.add(c);
      byClass.set(cb.classKey, set);
    }
    const keys = [...byClass.values()].map((s) => [...s].sort((a, b) => a - b).join(','));
    uniformGongByGrade.set(grade, new Set(keys).size <= 1);
  }

  return { cells, ...conflicts, uniformGongByGrade, gongCellsByGrade };
}

function classCount(commons: CommonBlock[]): number {
  return new Set(commons.map((c) => c.classKey)).size;
}

function shuffle<T>(arr: T[], rng: ReturnType<typeof createRng>): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * 공통과목 글로벌 타일링. 밴드 교사 점유(고정 배경)를 깔고, 전 학년·전 반의 공통을 각자 학년 타일
 * 칸에 배치하되 **실제 셀 기준 교사 충돌**(같은 교사 같은 칸)을 전역 min-conflicts로 최소화한다.
 * → 학년 간 교사 공유(밴드↔공통·공통↔공통)까지 조율(#3의 공통 버전).
 */
function tileCommonsGlobal(
  input: BlockPlacementInput,
  commonsByGrade: Map<number, CommonBlock[]>,
  tileCellsByGrade: Map<number, number[]>,
  cells: Map<string, number[]>,
  NCELL: number,
  rng: ReturnType<typeof createRng>,
): void {
  // 단위 = (학년, 반). slots = 그 학년 타일 칸에 매핑되는 공통 블록(또는 null)
  interface Unit { grade: number; classKey: string; slots: (CommonBlock | null)[]; tileCells: number[]; }
  const units: Unit[] = [];
  // 교사별 셀 점유 (밴드 = 고정 배경 + 공통 = 가변)
  const tcc = new Map<string, Int32Array>();
  const occ = (t: string) => { let a = tcc.get(t); if (!a) { a = new Int32Array(NCELL); tcc.set(t, a); } return a; };
  const cost = (n: number) => (n > 1 ? n - 1 : 0);
  // 밴드 교사 점유 (고정)
  for (const b of input.bands) for (const t of b.teachers) { const a = occ(t); for (const c of cells.get(b.id) ?? []) a[c]++; }

  // 공통 단위 초기화 + 점유 반영
  for (const grade of input.grades) {
    const tileCells = tileCellsByGrade.get(grade) ?? [];
    const T = tileCells.length;
    const byClass = new Map<string, CommonBlock[]>();
    for (const cb of commonsByGrade.get(grade) ?? []) (byClass.get(cb.classKey) ?? byClass.set(cb.classKey, []).get(cb.classKey)!).push(cb);
    for (const [classKey, cbs] of byClass) {
      const slots: (CommonBlock | null)[] = [];
      for (const cb of cbs) for (let k = 0; k < cb.credits; k++) slots.push(cb);
      while (slots.length < T) slots.push(null);
      shuffle(slots, rng);
      slots.length = T;
      units.push({ grade, classKey, slots, tileCells });
      for (let t = 0; t < T; t++) { const b = slots[t]; if (b?.teacherId) occ(b.teacherId)[tileCells[t]]++; }
    }
  }

  let total = 0;
  for (const a of tcc.values()) for (let c = 0; c < NCELL; c++) total += cost(a[c]);

  const MAXIT = 300000;
  for (let it = 0; it < MAXIT && total > 0; it++) {
    // 충돌 기여 슬롯 수집 (교사가 그 칸에 2회+)
    const u = units[Math.floor(rng.next() * units.length)];
    const T = u.slots.length;
    if (T < 2) continue;
    // 이 단위에서 충돌 슬롯 찾기
    let t1 = -1;
    for (let s = 0; s < T; s++) { const b = u.slots[s]; if (b?.teacherId && occ(b.teacherId)[u.tileCells[s]] > 1) { t1 = s; break; } }
    if (t1 < 0) continue;
    // 최적 swap 상대 슬롯
    let bestT2 = -1, bestDelta = Infinity;
    for (let s = 0; s < T; s++) {
      if (s === t1) continue;
      const d = swapDelta(u, t1, s, tcc, cost);
      if (d < bestDelta || (d === bestDelta && rng.next() < 0.3)) { bestDelta = d; bestT2 = s; }
    }
    if (bestT2 < 0) continue;
    if (bestDelta <= 0 || rng.next() < 0.02) { applySwap(u, t1, bestT2, tcc); total += bestDelta; }
  }

  // 단위 → 블록별 셀
  const blockCells = new Map<string, number[]>();
  for (const u of units) for (let t = 0; t < u.slots.length; t++) {
    const b = u.slots[t]; if (!b) continue;
    (blockCells.get(b.id) ?? blockCells.set(b.id, []).get(b.id)!).push(u.tileCells[t]);
  }
  for (const [id, cs] of blockCells) cells.set(id, cs);
}

/** 단위 u의 슬롯 t1↔t2 교환 시 전역 교사충돌 변화량 (실제 적용 전) */
function swapDelta(
  u: { slots: (CommonBlock | null)[]; tileCells: number[] },
  t1: number, t2: number,
  tcc: Map<string, Int32Array>, cost: (n: number) => number,
): number {
  const tA = u.slots[t1]?.teacherId ?? null;
  const tB = u.slots[t2]?.teacherId ?? null;
  if (tA === tB) return 0;
  const c1 = u.tileCells[t1], c2 = u.tileCells[t2];
  let d = 0;
  if (tA) { const a = tcc.get(tA)!; d += cost(a[c1] - 1) - cost(a[c1]) + cost(a[c2] + 1) - cost(a[c2]); }
  if (tB) { const a = tcc.get(tB)!; d += cost(a[c2] - 1) - cost(a[c2]) + cost(a[c1] + 1) - cost(a[c1]); }
  return d;
}

function applySwap(
  u: { slots: (CommonBlock | null)[]; tileCells: number[] },
  t1: number, t2: number, tcc: Map<string, Int32Array>,
): void {
  const tA = u.slots[t1]?.teacherId ?? null;
  const tB = u.slots[t2]?.teacherId ?? null;
  const c1 = u.tileCells[t1], c2 = u.tileCells[t2];
  if (tA !== tB) {
    if (tA) { const a = tcc.get(tA)!; a[c1]--; a[c2]++; }
    if (tB) { const a = tcc.get(tB)!; a[c2]--; a[c1]++; }
  }
  [u.slots[t1], u.slots[t2]] = [u.slots[t2], u.slots[t1]];
}

function swapSlot(slots: (CommonBlock | null)[], a: number, b: number): void {
  [slots[a], slots[b]] = [slots[b], slots[a]];
}

/**
 * 밴드 학년통합 동시배치. 밴드 충돌그래프(간선 = 같은 학년 ∨ 교사 공유)에서 인접 밴드는
 * 서로소 칸이 되도록 min-conflicts. 학생이 겹치지 않는 타 학년 밴드는 같은 칸을 재사용한다.
 * 교차교사(#3)는 이 단계에서 근본 해소된다(교사 공유 밴드 간 간선).
 */
function placeBandsJoint(
  input: BlockPlacementInput,
  cells: Map<string, number[]>,
  NCELL: number,
  cellStr: (c: number) => string,
  rng: ReturnType<typeof createRng>,
): void {
  const nonPinned = input.bands.filter((b) => !b.pinnedCells);
  for (const b of input.bands) if (b.pinnedCells) cells.set(b.id, [...b.pinnedCells]);
  if (nonPinned.length === 0) return;

  const shareTeacher = (a: BandBlock, b: BandBlock): boolean => {
    if (a.teachers.length === 0 || b.teachers.length === 0) return false;
    const s = new Set(a.teachers);
    return b.teachers.some((t) => s.has(t));
  };
  const adjacent = (a: BandBlock, b: BandBlock): boolean => a.grade === b.grade || shareTeacher(a, b);

  // 인접 리스트
  const adj = new Map<string, BandBlock[]>();
  for (const b of input.bands) adj.set(b.id, []);
  for (let i = 0; i < input.bands.length; i++)
    for (let j = i + 1; j < input.bands.length; j++) {
      const a = input.bands[i], b = input.bands[j];
      if (adjacent(a, b)) { adj.get(a.id)!.push(b); adj.get(b.id)!.push(a); }
    }

  // 도메인: 그 학년 비차단 칸 ∪ (인접 고정밴드 칸 제외)
  const domain = new Map<string, number[]>();
  for (const b of nonPinned) {
    const blk = new Set(input.blockedByGrade?.[b.grade] ?? []);
    const forbidden = new Set<number>();
    for (const nb of adj.get(b.id)!) if (nb.pinnedCells) for (const c of cells.get(nb.id) ?? []) forbidden.add(c);
    domain.set(b.id, [...Array(NCELL).keys()].filter((c) => !blk.has(cellStr(c)) && !forbidden.has(c)));
  }

  const overlap = (a: string, b: string): number => {
    const ca = cells.get(a)!, cb = new Set(cells.get(b)!);
    let n = 0; for (const c of ca) if (cb.has(c)) n++; return n;
  };
  const bandCost = (id: string): number => { let c = 0; for (const nb of adj.get(id)!) c += overlap(id, nb.id); return c; };

  // 초기화: 도메인에서 credits칸 무작위(중복 없이)
  for (const b of nonPinned) {
    const dom = [...domain.get(b.id)!];
    shuffle(dom, rng);
    cells.set(b.id, dom.slice(0, b.credits));
  }

  const totalCost = (): number => { let c = 0; for (const b of nonPinned) c += bandCost(b.id); return c / 2; };
  let cur = totalCost();
  const MAXIT = 100000;
  for (let it = 0; it < MAXIT && cur > 0; it++) {
    // 충돌 밴드 선택
    const bad = nonPinned.filter((b) => bandCost(b.id) > 0);
    if (bad.length === 0) break;
    const b = bad[Math.floor(rng.next() * bad.length)];
    const bc = cells.get(b.id)!;
    const ki = Math.floor(rng.next() * bc.length);
    // 인접 밴드들이 점유한 칸(피해야 함)
    const occ = new Set<number>();
    for (const nb of adj.get(b.id)!) for (const c of cells.get(nb.id) ?? []) occ.add(c);
    // 도메인에서 충돌 적은 칸 선택(현재 밴드 칸 제외)
    const dom = domain.get(b.id)!;
    let bestCell = -1, bestPenalty = Infinity;
    for (let s = 0; s < 24; s++) {
      const cand = dom[Math.floor(rng.next() * dom.length)];
      if (bc.includes(cand)) continue;
      const penalty = occ.has(cand) ? 1 : 0;
      if (penalty < bestPenalty) { bestPenalty = penalty; bestCell = cand; if (penalty === 0) break; }
    }
    if (bestCell < 0) continue;
    const before = bandCost(b.id);
    const old = bc[ki];
    bc[ki] = bestCell;
    const after = bandCost(b.id);
    if (after <= before || rng.next() < 0.03) cur = totalCost(); else bc[ki] = old;
  }
}

function countAll(input: BlockPlacementInput, cells: Map<string, number[]>, NCELL: number): {
  teacherConflicts: number; bandOverlap: number; classOverlap: number;
} {
  // 밴드 겹침 (같은 학년 같은 칸 2밴드)
  let bandOverlap = 0;
  const byGrade = new Map<number, BandBlock[]>();
  for (const b of input.bands) (byGrade.get(b.grade) ?? byGrade.set(b.grade, []).get(b.grade)!).push(b);
  for (const [, bands] of byGrade) {
    const cellCount = new Map<number, number>();
    for (const b of bands) for (const c of cells.get(b.id) ?? []) cellCount.set(c, (cellCount.get(c) ?? 0) + 1);
    for (const n of cellCount.values()) if (n > 1) bandOverlap += n - 1;
  }
  // 반 이중 (공통이 자기 학년 밴드 칸 또는 같은 반 다른 공통과 겹침)
  let classOverlap = 0;
  const commonsByClass = new Map<string, CommonBlock[]>();
  for (const c of input.commons) (commonsByClass.get(c.classKey) ?? commonsByClass.set(c.classKey, []).get(c.classKey)!).push(c);
  for (const [classKey, cbs] of commonsByClass) {
    const grade = cbs[0].grade;
    const bandCells = new Set<number>();
    for (const b of byGrade.get(grade) ?? []) for (const c of cells.get(b.id) ?? []) bandCells.add(c);
    const occ = new Map<number, number>();
    for (const c of bandCells) occ.set(c, 1);
    for (const cb of cbs) for (const c of cells.get(cb.id) ?? []) occ.set(c, (occ.get(c) ?? 0) + 1);
    for (const n of occ.values()) if (n > 1) classOverlap += n - 1;
    void classKey;
  }
  // 교사 충돌 (같은 교사 같은 칸 2수업; 밴드 교사 + 공통 교사 전부)
  let teacherConflicts = 0;
  const tcell = new Map<string, Map<number, number>>();
  const bump = (t: string | null, c: number) => {
    if (!t) return;
    let m = tcell.get(t); if (!m) { m = new Map(); tcell.set(t, m); }
    m.set(c, (m.get(c) ?? 0) + 1);
  };
  for (const b of input.bands) for (const t of b.teachers) for (const c of cells.get(b.id) ?? []) bump(t, c);
  for (const cb of input.commons) for (const c of cells.get(cb.id) ?? []) bump(cb.teacherId, c);
  for (const m of tcell.values()) for (const n of m.values()) if (n > 1) teacherConflicts += n - 1;

  return { teacherConflicts, bandOverlap, classOverlap };
}
