import type { Placement, TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import type { Rng } from './rng';
import { type CellKey, cellKeyStr } from './csp';
import {
  adjacentPairsMask,
  runExcessMask,
  type TeacherHardConfig,
  teacherHardConfig,
  teacherPlaceCost,
} from './teacherConstraints';

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced local-search solver for the timetable graph-coloring CSP.
//
// Target: beat the residual-conflict floor (~6-8 violated edges / ~4 conflicted
// lessons) that plain min-conflicts + Metropolis + swap + plateau-kick reaches on
// the hard "slack-0" real instance (grade2-real, avail=31, χ-lower=31). A
// 0-conflict solution provably exists (the real school timetable), but the
// instance sits at the graph-coloring phase transition (avail == χ), so naive
// single-lesson hill-climbing cycles in deep local minima.
//
// Architecture: a fast INCREMENTAL TabuCol core (Hertz & de Werra), augmented
// with simulated annealing on the hard penalty, Kempe-chain large-neighborhood
// moves, ejection chains, and adaptive restarts. The decisive efficiency trick is
// a maintained conflict table gamma[lesson][cellIndex] = number of adjacent
// lessons currently occupying that cell, so every move's energy delta is O(degree)
// instead of an O(all-occupied-cells) rescan. That lets the search run an order of
// magnitude more iterations within the same budget, which is what actually moves
// the floor at the phase transition.
//
// Conflict model (matches csp.ts / score.ts exactly):
//  - Two adjacent lessons in the SAME cell = 1 violated pair (edge).
//  - subjectDailyCap (when on): same offeringId placed > cap times on a day =
//    (count - cap) excess violations.
//  - blockedCells per lesson forbidden (removed from the domain up front);
//    pinned lessons are fixed.
//  The "conflicts" value we RETURN matches minConflictsSeed: the number of
//  conflicted LESSONS. Internally the SA/Tabu energy is the violated-pair (edge)
//  count plus cap excess — a smoother gradient than the lesson count.
// ─────────────────────────────────────────────────────────────────────────────

type Cell = number; // index into the cells array (compact integer color)

interface Model {
  /** movable lessons, integer-indexed */
  ids: string[];
  idIndex: Map<string, number>;
  /** per-lesson allowed cell indices (domain, blocked cells removed) */
  domain: Cell[][];
  /** per-lesson domain membership for O(1) "is cell c allowed for l" */
  domainSet: Uint8Array[]; // [lesson][cell] 1 if allowed
  /** adjacency as integer lists over movable lessons */
  adj: number[][];
  /** lesson -> offering integer id (or -1 if no cap relevance) */
  offering: Int32Array;
  /** cell -> day, for cap accounting */
  cellDay: Int32Array;
  /** cell -> period (teacher-hard accounting) */
  cellPeriod: Int32Array;
  /** total cells in grid */
  cellCount: number;
  /** number of offerings */
  offeringCount: number;
  capOn: boolean;
  maxPer: number;
  // ── 교사 하드 제약 (tcfg.any=false면 아래 배열/인덱스는 비활성 · 추가 비용 0) ──
  tcfg: TeacherHardConfig;
  days: number;
  P: number;
  /** movable lesson -> 교사 정수 (-1 없음) */
  teacherOf: Int32Array;
  /** movable lesson -> (교사,과목) 정수 (-1 없음) */
  subjOf: Int32Array;
  teacherCount: number;
  subjCount: number;
  /** pinned lesson들의 교사 점유 (buildSearch/greedyInit에서 base로 fold) */
  pinnedTeacherEntries: Array<{ cell: number; t: number; si: number }>;
}

// We fold pinned lessons in by treating them as immovable: their contribution to
// gamma is added once at init and never changes.

interface Search {
  model: Model;
  /** current cell of each movable lesson */
  color: Int32Array;
  /** gamma[lesson*cellCount + cell] = # adjacent (movable+fixed) lessons in `cell` */
  gamma: Int32Array;
  /** occupants[cell] = set of movable lesson indices in that cell */
  occ: Array<Set<number>>;
  /** offeringDay[offering*days + day] = count of that offering's instances that day */
  offeringDay: Int32Array;
  days: number;
  /** current total energy = violated edges + cap excess + teacher-hard violations */
  energy: number;
  /** energy 중 교사 하드 위반 부분 (base = energy − energyT; 사전순 best 기록용) */
  energyT: number;
  /** pinned-neighbor gamma additions (gammaIndex -> count) — replayed on bulk reset */
  pinnedGamma?: Map<number, number>;
  /** pinned offering-day additions (offeringDayIndex -> count) — replayed on bulk reset */
  pinnedOfferingDay?: Map<number, number>;
  // ── 교사 하드 제약 증분 상태 (멀티셋 카운트가 원본, 마스크는 count>0 파생) ──
  tOcc: Int32Array; // (t*days+d)*P+(p-1)
  tMask: Int32Array; // t*days+d
  tDayCount: Int32Array; // t*days+d (멀티셋 합)
  tLastCount: Int32Array; // t
  sOcc: Int32Array; // (si*days+d)*P+(p-1)
  sMask: Int32Array; // si*days+d
  // pinned 기여를 fold한 스냅샷 (rebuildFromColor 시 여기서 복원)
  tOccBase: Int32Array;
  tDayCountBase: Int32Array;
  tLastCountBase: Int32Array;
  sOccBase: Int32Array;
}

// ── Model construction ──────────────────────────────────────────────────────

function buildModel(
  input: TimetableInput,
  graph: ConflictGraph,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
): { model: Model; cells: CellKey[]; pinnedColor: Map<string, number> } | null {
  const cells: CellKey[] = [];
  const cellKeyToIndex = new Map<string, number>();
  for (let d = 0; d < input.grid.days; d++) {
    for (let p = 1; p <= input.grid.periodsPerDay; p++) {
      cellKeyToIndex.set(`${d}|${p}`, cells.length);
      cells.push({ dayIndex: d, period: p });
    }
  }
  const cellCount = cells.length;
  const cellDay = new Int32Array(cellCount);
  const cellPeriod = new Int32Array(cellCount);
  for (let c = 0; c < cellCount; c++) {
    cellDay[c] = cells[c].dayIndex;
    cellPeriod[c] = cells[c].period;
  }

  const movable = graph.lessons.filter((l) => !pinned.has(l.id));
  const ids = movable.map((l) => l.id);
  const idIndex = new Map<string, number>();
  ids.forEach((id, i) => idIndex.set(id, i));

  // Offering integer ids
  const offIndex = new Map<string, number>();
  const offering = new Int32Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const off = graph.byLessonId.get(ids[i])?.offeringId;
    if (off === undefined) {
      offering[i] = -1;
      continue;
    }
    let oi = offIndex.get(off);
    if (oi === undefined) {
      oi = offIndex.size;
      offIndex.set(off, oi);
    }
    offering[i] = oi;
  }

  // Domains (integer cell indices) and membership masks
  const domain: Cell[][] = [];
  const domainSet: Uint8Array[] = [];
  for (let i = 0; i < ids.length; i++) {
    const dk = domains.get(ids[i]) ?? [];
    const arr: number[] = [];
    const mask = new Uint8Array(cellCount);
    for (const c of dk) {
      const ci = cellKeyToIndex.get(cellKeyStr(c));
      if (ci !== undefined) {
        arr.push(ci);
        mask[ci] = 1;
      }
    }
    if (arr.length === 0) return null; // unplaceable lesson
    domain.push(arr);
    domainSet.push(mask);
  }

  // Adjacency over movable lessons only (pinned handled via pinnedColor → gamma).
  const adj: number[][] = [];
  for (let i = 0; i < ids.length; i++) {
    const set = graph.adjacency.get(ids[i]);
    const arr: number[] = [];
    if (set) {
      for (const nb of set) {
        const j = idIndex.get(nb);
        if (j !== undefined) arr.push(j);
      }
    }
    adj.push(arr);
  }

  // Pinned lessons contribute to a movable neighbor's gamma at their fixed cell. We
  // record only "lessonId -> fixed cell"; buildSearch folds the gamma/cap additions.
  const pinnedColor = new Map<string, number>();
  for (const p of input.pinned) {
    const ci = cellKeyToIndex.get(`${p.dayIndex}|${p.period}`);
    if (ci !== undefined) pinnedColor.set(p.lessonId, ci);
  }

  // 교사 하드 제약 인덱싱. 교사/과목 정수는 pinned 포함 전체 lesson에서 등록해
  // pinned 점유가 movable과 같은 인덱스 공간에 fold되도록 한다.
  const tcfg = teacherHardConfig(input);
  const teacherOf = new Int32Array(ids.length).fill(-1);
  const subjOf = new Int32Array(ids.length).fill(-1);
  const pinnedTeacherEntries: Array<{ cell: number; t: number; si: number }> = [];
  let teacherCount = 0;
  let subjCount = 0;
  if (tcfg.any) {
    const tIdx = new Map<string, number>();
    const sIdx = new Map<string, number>();
    const resolve = (teacherId: string, offeringId: string): { t: number; si: number } => {
      let t = tIdx.get(teacherId);
      if (t === undefined) {
        t = tIdx.size;
        tIdx.set(teacherId, t);
      }
      const sk = `${t}|${offeringId}`;
      let si = sIdx.get(sk);
      if (si === undefined) {
        si = sIdx.size;
        sIdx.set(sk, si);
      }
      return { t, si };
    };
    for (let i = 0; i < ids.length; i++) {
      const l = graph.byLessonId.get(ids[i])!;
      if (!l.teacherId) continue;
      const r = resolve(l.teacherId, l.offeringId);
      teacherOf[i] = r.t;
      subjOf[i] = r.si;
    }
    for (const [pid, pcell] of pinnedColor) {
      const l = graph.byLessonId.get(pid);
      if (!l?.teacherId) continue;
      const r = resolve(l.teacherId, l.offeringId);
      pinnedTeacherEntries.push({ cell: pcell, t: r.t, si: r.si });
    }
    teacherCount = tIdx.size;
    subjCount = sIdx.size;
  }

  const model: Model = {
    ids,
    idIndex,
    domain,
    domainSet,
    adj,
    offering,
    cellDay,
    cellPeriod,
    cellCount,
    offeringCount: offIndex.size,
    capOn: input.options.hard.subjectDailyCap,
    maxPer: input.options.maxPerSubjectPerDay,
    tcfg,
    days: input.grid.days,
    P: input.grid.periodsPerDay,
    teacherOf,
    subjOf,
    teacherCount,
    subjCount,
    pinnedTeacherEntries,
  };
  return { model, cells, pinnedColor };
}

// ── Search state with incremental gamma ─────────────────────────────────────

function gIdx(model: Model, lesson: number, cell: number): number {
  return lesson * model.cellCount + cell;
}

/** 원시 배열에 교사 점유 1건 적용 (buildSearch fold·applyMove·rebuild 공용) */
function tApplyRaw(
  m: Model,
  tOcc: Int32Array,
  tMask: Int32Array,
  tDayCount: Int32Array,
  tLastCount: Int32Array,
  sOcc: Int32Array,
  sMask: Int32Array,
  t: number,
  si: number,
  cell: number,
  delta: 1 | -1,
): void {
  const d = m.cellDay[cell];
  const p = m.cellPeriod[cell];
  const bit = 1 << (p - 1);
  const dk = t * m.days + d;
  const ok = dk * m.P + (p - 1);
  tOcc[ok] += delta;
  tDayCount[dk] += delta;
  if (delta > 0 ? tOcc[ok] === 1 : tOcc[ok] === 0) {
    if (delta > 0) tMask[dk] |= bit;
    else tMask[dk] &= ~bit;
  }
  if (p === m.tcfg.lastPeriod) tLastCount[t] += delta;
  if (si >= 0) {
    const sk = si * m.days + d;
    const sok = sk * m.P + (p - 1);
    sOcc[sok] += delta;
    if (delta > 0 ? sOcc[sok] === 1 : sOcc[sok] === 0) {
      if (delta > 0) sMask[sk] |= bit;
      else sMask[sk] &= ~bit;
    }
  }
}

/** occ 카운트에서 count>0 마스크 재파생 (벌크 리셋 후 정합성 복원) */
function deriveMasksFromOcc(P: number, occ: Int32Array, mask: Int32Array): void {
  mask.fill(0);
  const rows = mask.length;
  for (let r = 0; r < rows; r++) {
    let bits = 0;
    const base = r * P;
    for (let p = 0; p < P; p++) if (occ[base + p] > 0) bits |= 1 << p;
    mask[r] = bits;
  }
}

function buildSearch(
  model: Model,
  graph: ConflictGraph,
  input: TimetableInput,
  pinnedColor: Map<string, number>,
  initColors: Int32Array,
): Search {
  const n = model.ids.length;
  const days = input.grid.days;
  const gamma = new Int32Array(n * model.cellCount);
  const occ: Array<Set<number>> = Array.from({ length: model.cellCount }, () => new Set<number>());
  const offeringDay = new Int32Array(model.offeringCount * days);
  const color = initColors.slice();

  // 교사 하드 상태: pinned 점유를 먼저 fold하고 그 스냅샷을 base로 남긴다
  const tOcc = new Int32Array(model.teacherCount * days * model.P);
  const tMask = new Int32Array(model.teacherCount * days);
  const tDayCount = new Int32Array(model.teacherCount * days);
  const tLastCount = new Int32Array(model.teacherCount);
  const sOcc = new Int32Array(model.subjCount * days * model.P);
  const sMask = new Int32Array(model.subjCount * days);
  for (const e of model.pinnedTeacherEntries) {
    tApplyRaw(model, tOcc, tMask, tDayCount, tLastCount, sOcc, sMask, e.t, e.si, e.cell, 1);
  }
  const tOccBase = tOcc.slice();
  const tDayCountBase = tDayCount.slice();
  const tLastCountBase = tLastCount.slice();
  const sOccBase = sOcc.slice();

  // Place movable lessons
  for (let i = 0; i < n; i++) {
    const c = color[i];
    occ[c].add(i);
    const off = model.offering[i];
    if (off >= 0) offeringDay[off * days + model.cellDay[c]]++;
    if (model.tcfg.any && model.teacherOf[i] >= 0) {
      tApplyRaw(model, tOcc, tMask, tDayCount, tLastCount, sOcc, sMask, model.teacherOf[i], model.subjOf[i], c, 1);
    }
  }
  // gamma from movable adjacency
  for (let i = 0; i < n; i++) {
    const c = color[i];
    for (const j of model.adj[i]) gamma[gIdx(model, j, c)]++;
  }
  // gamma contribution from pinned neighbors + their cap accounting. Record the
  // additions so rebuildFromColor() can replay them after a bulk color reset.
  const pinnedGamma = new Map<number, number>();
  const pinnedOfferingDay = new Map<number, number>();
  for (const [pid, pcell] of pinnedColor) {
    const adjSet = graph.adjacency.get(pid);
    if (adjSet) {
      for (const nb of adjSet) {
        const j = model.idIndex.get(nb);
        if (j !== undefined) {
          const key = gIdx(model, j, pcell);
          gamma[key]++;
          pinnedGamma.set(key, (pinnedGamma.get(key) ?? 0) + 1);
        }
      }
    }
    const off = graph.byLessonId.get(pid)?.offeringId;
    if (off !== undefined) {
      const sib = graph.byOffering.get(off)?.find((sb) => model.idIndex.has(sb));
      if (sib !== undefined) {
        const oi = model.offering[model.idIndex.get(sib)!];
        if (oi >= 0) {
          const key = oi * days + model.cellDay[pcell];
          offeringDay[key]++;
          pinnedOfferingDay.set(key, (pinnedOfferingDay.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const s: Search = {
    model, color, gamma, occ, offeringDay, days, energy: 0, energyT: 0,
    pinnedGamma: pinnedGamma.size > 0 ? pinnedGamma : undefined,
    pinnedOfferingDay: pinnedOfferingDay.size > 0 ? pinnedOfferingDay : undefined,
    tOcc, tMask, tDayCount, tLastCount, sOcc, sMask,
    tOccBase, tDayCountBase, tLastCountBase, sOccBase,
  };
  s.energy = computeEnergyFromGamma(s);
  s.energyT = teacherEnergyFull(s);
  return s;
}

/** 교사 하드 위반 총수 (풀스캔 — 벌크 에너지 산출용, 증분 델타와 정확히 일치) */
function teacherEnergyFull(s: Search): number {
  const m = s.model;
  const cfg = m.tcfg;
  if (!cfg.any) return 0;
  let e = 0;
  for (let t = 0; t < m.teacherCount; t++) {
    for (let d = 0; d < m.days; d++) {
      const dk = t * m.days + d;
      if (cfg.daily && s.tDayCount[dk] > cfg.cap) e += s.tDayCount[dk] - cfg.cap;
      if (cfg.consec) e += runExcessMask(s.tMask[dk], cfg.maxRun);
    }
    if (cfg.last && s.tLastCount[t] > cfg.lastCap) e += s.tLastCount[t] - cfg.lastCap;
  }
  if (cfg.subjAdj) {
    for (let k = 0; k < s.sMask.length; k++) e += adjacentPairsMask(s.sMask[k]);
  }
  return e;
}

/**
 * Compute total energy (violated edges + cap excess) directly from the gamma
 * table, which is the single source of truth that moveDelta uses. Edge incidences
 * among movable lessons are double-counted in gamma, so they are halved; pinned
 * neighbors contribute once (only the movable side carries the incidence) and are
 * added back. This guarantees energy stays exactly consistent with the incremental
 * deltas, even after a bulk color reset.
 */
function computeEnergyFromGamma(s: Search): number {
  const model = s.model;
  const n = model.ids.length;
  let twice = 0;
  for (let i = 0; i < n; i++) twice += s.gamma[gIdx(model, i, s.color[i])];
  let pinnedInc = 0;
  if (s.pinnedGamma) {
    for (const [key, add] of s.pinnedGamma) {
      const lesson = (key / model.cellCount) | 0;
      const cell = key - lesson * model.cellCount;
      if (s.color[lesson] === cell) pinnedInc += add;
    }
  }
  const movableTwice = twice - pinnedInc;
  let cap = 0;
  if (model.capOn) {
    for (let k = 0; k < s.offeringDay.length; k++) {
      if (s.offeringDay[k] > model.maxPer) cap += s.offeringDay[k] - model.maxPer;
    }
  }
  return movableTwice / 2 + pinnedInc + cap + teacherEnergyFull(s);
}

/** Greedy seeded initial colors: high-degree first into the min-gamma cell. */
function greedyInit(model: Model, graph: ConflictGraph, pinnedColor: Map<string, number>, rng: Rng): Int32Array {
  const n = model.ids.length;
  const days = Math.max(...Array.from(model.cellDay)) + 1;
  const color = new Int32Array(n).fill(-1);
  const gamma = new Int32Array(n * model.cellCount);
  const offeringDay = new Int32Array(model.offeringCount * days);

  // seed pinned neighbor gamma
  for (const [pid, pcell] of pinnedColor) {
    const adjSet = graph.adjacency.get(pid);
    if (adjSet) for (const nb of adjSet) {
      const j = model.idIndex.get(nb);
      if (j !== undefined) gamma[gIdx(model, j, pcell)]++;
    }
  }

  // 교사 하드 상태 (pinned 점유 fold 포함) — 그리디 비용에 한계 위반을 더한다
  const tcfg = model.tcfg;
  const tOcc = new Int32Array(model.teacherCount * model.days * model.P);
  const tMask = new Int32Array(model.teacherCount * model.days);
  const tDayCount = new Int32Array(model.teacherCount * model.days);
  const tLastCount = new Int32Array(model.teacherCount);
  const sOcc = new Int32Array(model.subjCount * model.days * model.P);
  const sMask = new Int32Array(model.subjCount * model.days);
  if (tcfg.any) {
    for (const e of model.pinnedTeacherEntries) {
      tApplyRaw(model, tOcc, tMask, tDayCount, tLastCount, sOcc, sMask, e.t, e.si, e.cell, 1);
    }
  }

  const order = [...Array(n).keys()].sort((a, b) => model.adj[b].length - model.adj[a].length);
  for (const i of order) {
    const dom = model.domain[i];
    const off = model.offering[i];
    const t = model.teacherOf[i];
    let bestCost = Number.POSITIVE_INFINITY;
    let best: number[] = [];
    for (const c of dom) {
      let cost = gamma[gIdx(model, i, c)];
      if (model.capOn && off >= 0) {
        const cur = offeringDay[off * days + model.cellDay[c]];
        if (cur >= model.maxPer) cost += cur - model.maxPer + 1;
      }
      if (tcfg.any && t >= 0) {
        const dk = t * model.days + model.cellDay[c];
        const sk = model.subjOf[i] * model.days + model.cellDay[c];
        cost += teacherPlaceCost(tcfg, tDayCount[dk], tMask[dk], tLastCount[t], sMask[sk], model.cellPeriod[c]);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = [c];
      } else if (cost === bestCost) best.push(c);
    }
    const c = best.length === 1 ? best[0] : best[rng.int(best.length)];
    color[i] = c;
    for (const j of model.adj[i]) gamma[gIdx(model, j, c)]++;
    if (off >= 0) offeringDay[off * days + model.cellDay[c]]++;
    if (tcfg.any && t >= 0) {
      tApplyRaw(model, tOcc, tMask, tDayCount, tLastCount, sOcc, sMask, t, model.subjOf[i], c, 1);
    }
  }
  return color;
}

// ── Incremental move primitives ──────────────────────────────────────────────

/**
 * 교사 하드 위반 에너지 델타 (순수 계산 — 상태 비변이).
 * lesson i를 from(현재 칸)에서 to로 옮길 때 그 교사의 4종 위반 수 변화량.
 */
function teacherMoveDelta(s: Search, i: number, to: number): number {
  const m = s.model;
  const cfg = m.tcfg;
  const t = m.teacherOf[i];
  if (!cfg.any || t < 0) return 0;
  const from = s.color[i];
  const df = m.cellDay[from];
  const pf = m.cellPeriod[from];
  const dc = m.cellDay[to];
  const pc = m.cellPeriod[to];
  const bitF = 1 << (pf - 1);
  const bitC = 1 << (pc - 1);
  const dkF = t * m.days + df;
  const dkC = t * m.days + dc;
  let delta = 0;

  if (cfg.daily && df !== dc) {
    if (s.tDayCount[dkF] > cfg.cap) delta -= 1; // 떠나는 날의 초과 1 감소
    if (s.tDayCount[dkC] >= cfg.cap) delta += 1; // 들어가는 날의 초과 1 증가
  }

  if (cfg.consec) {
    const mF = s.tMask[dkF];
    // 자기 자신 제거 후 마스크 (같은 칸에 같은 교사 수업이 더 있으면 비트 유지 — 멀티셋)
    const mFAfter = s.tOcc[dkF * m.P + (pf - 1)] === 1 ? mF & ~bitF : mF;
    if (df === dc) {
      delta += runExcessMask(mFAfter | bitC, cfg.maxRun) - runExcessMask(mF, cfg.maxRun);
    } else {
      const mC = s.tMask[dkC];
      delta += runExcessMask(mFAfter, cfg.maxRun) - runExcessMask(mF, cfg.maxRun);
      delta += runExcessMask(mC | bitC, cfg.maxRun) - runExcessMask(mC, cfg.maxRun);
    }
  }

  if (cfg.last && pf !== pc) {
    const lc = s.tLastCount[t];
    if (pf === cfg.lastPeriod) {
      if (lc > cfg.lastCap) delta -= 1;
    } else if (pc === cfg.lastPeriod) {
      if (lc >= cfg.lastCap) delta += 1;
    }
  }

  if (cfg.subjAdj) {
    const si = m.subjOf[i];
    const skF = si * m.days + df;
    const skC = si * m.days + dc;
    const smF = s.sMask[skF];
    const smFAfter = s.sOcc[skF * m.P + (pf - 1)] === 1 ? smF & ~bitF : smF;
    if (df === dc) {
      delta += adjacentPairsMask(smFAfter | bitC) - adjacentPairsMask(smF);
    } else {
      const smC = s.sMask[skC];
      delta += adjacentPairsMask(smFAfter) - adjacentPairsMask(smF);
      delta += adjacentPairsMask(smC | bitC) - adjacentPairsMask(smC);
    }
  }
  return delta;
}

/**
 * Energy delta of recoloring lesson `i` from its current cell to `to`.
 * = gamma[i][to] - gamma[i][from] (edge change) + cap delta on the two days
 *   + teacher-hard violation delta.
 */
function moveDelta(s: Search, i: number, to: number): number {
  const model = s.model;
  const from = s.color[i];
  if (from === to) return 0;
  let d = s.gamma[gIdx(model, i, to)] - s.gamma[gIdx(model, i, from)];
  if (model.capOn) {
    const off = model.offering[i];
    if (off >= 0) {
      const dFrom = model.cellDay[from];
      const dTo = model.cellDay[to];
      if (dFrom !== dTo) {
        const base = off * s.days;
        const nFrom = s.offeringDay[base + dFrom];
        const nTo = s.offeringDay[base + dTo];
        // leaving dFrom: if it was over cap, excess decreases by 1
        if (nFrom > model.maxPer) d -= 1;
        // entering dTo: if it is at/over cap already, excess increases by 1
        if (nTo >= model.maxPer) d += 1;
      }
    }
  }
  d += teacherMoveDelta(s, i, to);
  return d;
}

/** Apply recolor i -> to, updating gamma/occ/offeringDay/energy incrementally. */
function applyMove(s: Search, i: number, to: number): void {
  const model = s.model;
  const from = s.color[i];
  if (from === to) return;
  const dT = teacherMoveDelta(s, i, to);
  const d = moveDelta(s, i, to);
  // update gamma of neighbors
  for (const j of model.adj[i]) {
    s.gamma[gIdx(model, j, from)]--;
    s.gamma[gIdx(model, j, to)]++;
  }
  s.occ[from].delete(i);
  s.occ[to].add(i);
  if (model.capOn) {
    const off = model.offering[i];
    if (off >= 0) {
      s.offeringDay[off * s.days + model.cellDay[from]]--;
      s.offeringDay[off * s.days + model.cellDay[to]]++;
    }
  }
  if (model.tcfg.any && model.teacherOf[i] >= 0) {
    const t = model.teacherOf[i];
    const si = model.subjOf[i];
    tApplyRaw(model, s.tOcc, s.tMask, s.tDayCount, s.tLastCount, s.sOcc, s.sMask, t, si, from, -1);
    tApplyRaw(model, s.tOcc, s.tMask, s.tDayCount, s.tLastCount, s.sOcc, s.sMask, t, si, to, 1);
  }
  s.color[i] = to;
  s.energy += d;
  s.energyT += dT;
}

/** Number of conflicted edges incident to lesson i at its current cell. */
function lessonEdgeConflicts(s: Search, i: number): number {
  return s.gamma[gIdx(s.model, i, s.color[i])];
}

/** lesson i의 현 위치가 교사 하드 위반에 기여하는가 (자기 자신 제외 한계비용 > 0) */
function teacherOwnCost(s: Search, i: number): number {
  const m = s.model;
  const cfg = m.tcfg;
  const t = m.teacherOf[i];
  if (!cfg.any || t < 0) return 0;
  const cell = s.color[i];
  const d = m.cellDay[cell];
  const p = m.cellPeriod[cell];
  const bit = 1 << (p - 1);
  const dk = t * m.days + d;
  const dayCount = s.tDayCount[dk] - 1;
  let mask = s.tMask[dk];
  if (s.tOcc[dk * m.P + (p - 1)] === 1) mask &= ~bit;
  const last = s.tLastCount[t] - (p === cfg.lastPeriod ? 1 : 0);
  const si = m.subjOf[i];
  const sk = si * m.days + d;
  let smask = s.sMask[sk];
  if (s.sOcc[sk * m.P + (p - 1)] === 1) smask &= ~bit;
  return teacherPlaceCost(cfg, dayCount, mask, last, smask, p);
}

/** Is lesson i in conflict (edge, cap, or teacher-hard)? */
function lessonConflicted(s: Search, i: number): boolean {
  if (lessonEdgeConflicts(s, i) > 0) return true;
  if (s.model.capOn) {
    const off = s.model.offering[i];
    if (off >= 0) {
      const day = s.model.cellDay[s.color[i]];
      if (s.offeringDay[off * s.days + day] > s.model.maxPer) return true;
    }
  }
  if (teacherOwnCost(s, i) > 0) return true;
  return false;
}

function countConflictedLessons(s: Search): number {
  let n = 0;
  for (let i = 0; i < s.model.ids.length; i++) if (lessonConflicted(s, i)) n++;
  return n;
}

function snapshot(s: Search, cells: CellKey[], graph: ConflictGraph, pinnedColor: Map<string, number>): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i < s.model.ids.length; i++) {
    const c = cells[s.color[i]];
    out.push({ lessonId: s.model.ids[i], dayIndex: c.dayIndex, period: c.period });
  }
  // include pinned lessons at their fixed cells so the placement set is complete
  for (const [pid, pcell] of pinnedColor) {
    const c = cells[pcell];
    out.push({ lessonId: pid, dayIndex: c.dayIndex, period: c.period });
  }
  void graph;
  return out;
}

// ── Kempe chain (incremental) ────────────────────────────────────────────────

/**
 * Kempe chain between cells X and Y seeded at conflicted lesson `seed`.
 * Builds the connected component of lessons reachable by alternating X/Y occupancy
 * (adjacent lessons in the opposite cell), then flips all of them. Bounded length.
 * Returns the touched indices + their pre-flip cells for rollback, and the exact
 * energy delta computed by summing per-lesson moveDeltas in a temporary apply.
 */
function tryKempe(
  s: Search,
  seed: number,
  cellX: number,
  cellY: number,
  maxChain: number,
): { touched: number[]; oldCells: number[]; delta: number } | null {
  const model = s.model;
  if (cellX === cellY) return null;
  const inChain = new Set<number>();
  const queue: number[] = [seed];
  inChain.add(seed);
  let guard = 0;
  while (queue.length > 0) {
    if (++guard > maxChain) return null;
    const cur = queue.shift()!;
    const curCell = s.color[cur];
    const otherCell = curCell === cellX ? cellY : cellX;
    for (const j of model.adj[cur]) {
      if (inChain.has(j)) continue;
      if (s.color[j] === otherCell) {
        inChain.add(j);
        queue.push(j);
      }
    }
  }
  const touched = [...inChain];
  // Validate every member's destination is in-domain
  const oldCells: number[] = [];
  for (const id of touched) {
    const dest = s.color[id] === cellX ? cellY : cellX;
    if (model.domainSet[id][dest] === 0) return null;
    oldCells.push(s.color[id]);
  }
  // Apply the flip, accumulating delta. moveDelta uses live gamma, so applying
  // sequentially gives the correct total delta.
  const before = s.energy;
  for (const id of touched) {
    const dest = s.color[id] === cellX ? cellY : cellX;
    applyMove(s, id, dest);
  }
  const delta = s.energy - before;
  return { touched, oldCells, delta };
}

function undoKempe(s: Search, touched: number[], oldCells: number[]): void {
  for (let k = touched.length - 1; k >= 0; k--) applyMove(s, touched[k], oldCells[k]);
}

// ── Main solver ──────────────────────────────────────────────────────────────

export function enhancedLocalSeed(
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
  deadlineMs: number,
  maxSteps: number,
  /**
   * 웜스타트 배치 (선택). 주어지면 greedy 초기화 대신 이 배치에서 출발한다 —
   * 잔여 충돌이 국소화된 근사해(예: 학년 순차 분해의 합집합)를 수리하는 용도.
   * 도메인 밖 칸이거나 누락된 lesson은 min-gamma greedy로 보정한다.
   */
  initial?: Placement[],
): { placements: Placement[]; conflicts: number } | null {
  const built = buildModel(input, graph, domains, pinned);
  if (!built) return null;
  const { model, cells, pinnedColor } = built;
  const n = model.ids.length;
  if (n === 0) {
    // only pinned lessons; trivially "solved"
    const out: Placement[] = [];
    for (const [pid, pcell] of pinnedColor) {
      const c = cells[pcell];
      out.push({ lessonId: pid, dayIndex: c.dayIndex, period: c.period });
    }
    return { placements: out, conflicts: 0 };
  }

  let init: Int32Array;
  if (initial) {
    const cellIdx = new Map<string, number>();
    cells.forEach((c, i) => cellIdx.set(`${c.dayIndex}|${c.period}`, i));
    const want = new Map<string, number>();
    for (const p of initial) {
      const ci = cellIdx.get(`${p.dayIndex}|${p.period}`);
      if (ci !== undefined) want.set(p.lessonId, ci);
    }
    // greedy 결과를 베이스로 깔고 웜스타트 칸(도메인 내)으로 덮어쓴다 — 누락/무효는 greedy 유지
    init = greedyInit(model, graph, pinnedColor, rng);
    for (let i = 0; i < n; i++) {
      const ci = want.get(model.ids[i]);
      if (ci !== undefined && model.domainSet[i][ci] === 1) init[i] = ci;
    }
  } else {
    init = greedyInit(model, graph, pinnedColor, rng);
  }
  const s = buildSearch(model, graph, input, pinnedColor, init);

  // Opt-in diagnostics via ENH_DEBUG=1 (Node test harness only). Guarded so the
  // reference to `process` is safe in a browser Web Worker, where it is undefined.
  const DEBUG =
    typeof process !== 'undefined' && process.env != null && process.env.ENH_DEBUG === '1';
  let stepCount = 0;

  // Best tracking — 반환 스냅샷은 **사전순(기본충돌, 교사부하)**: 학생/교사 동시수업 같은
  // 절대불가 위반(base)이 교사 부하 위반(teacher)과 1:1로 맞교환되면 안 된다. 탐색 자체는
  // 검증된 평탄(flat) 에너지 동역학을 유지하고, 기록만 base 우선으로 한다.
  let bestColor = s.color.slice();
  let bestConf = countConflictedLessons(s);
  let bestEnergy = s.energy; // flat (aspiration·plateau 판정용)
  let bestBase = s.energy - s.energyT;
  let bestT = s.energyT;

  const tryRecordBest = (): void => {
    if (s.energy < bestEnergy) bestEnergy = s.energy;
    const base = s.energy - s.energyT;
    if (base < bestBase || (base === bestBase && s.energyT < bestT)) {
      bestBase = base;
      bestT = s.energyT;
      bestConf = countConflictedLessons(s);
      bestColor = s.color.slice();
    }
  };

  // Tabu table: tabu[i*cellCount + c] = step until which placing i into c is tabu.
  const tabu = new Int32Array(n * model.cellCount).fill(-1);
  const baseTenure = Math.max(10, Math.round(0.6 * Math.sqrt(n)));

  // SA temperature on hard energy. Kept modest so the search is a tabu-guided
  // descent with light Metropolis noise, NOT a hot random walk — a hot schedule
  // helps grade2 but scatters the harder grade3 (higher χ, many tangles), so we
  // bias toward stability and rely on Kempe/ejection for the big jumps.
  const T0 = 0.9;
  const Tmin = 0.04;
  let T = T0;

  // Conflicted-lesson worklist (rebuilt lazily)
  let conflictedList: number[] = [];
  const rebuildConflicted = (): void => {
    conflictedList = [];
    for (let i = 0; i < n; i++) if (lessonConflicted(s, i)) conflictedList.push(i);
  };
  rebuildConflicted();

  let sinceImprove = 0;
  let plateauCount = 0;
  const plateauLimit = Math.max(2000, n * 8);
  let iter = 0;

  // Phase mix: mostly TabuCol/SA single moves; periodic Kempe + ejection on plateaus.
  while (iter < maxSteps) {
    iter++;
    stepCount++;
    if (s.energy === 0) break;
    if ((iter & 0x3ff) === 0) {
      if (Date.now() > deadlineMs) break;
    }
    // Cooling
    if ((iter & 0x1ff) === 0) {
      T = Math.max(Tmin, T * 0.995);
    }

    if (conflictedList.length === 0) {
      rebuildConflicted();
      if (conflictedList.length === 0) break;
    }

    const onPlateau = sinceImprove > plateauLimit / 3;

    // Intensification sweep: when stuck at a low energy, try EVERY improving Kempe
    // chain over (conflicted lesson × each domain cell). A single descent pass that
    // can untangle the last few clashes that random Kempes miss. Fires sparingly.
    if (s.energy <= 6 && onPlateau && (iter & 0x3f) === 0) {
      let improvedAny = false;
      for (const seed of [...conflictedList]) {
        if (!lessonConflicted(s, seed)) continue;
        const cellX = s.color[seed];
        const dom = model.domain[seed];
        for (const cellY of dom) {
          if (cellY === cellX) continue;
          const k = tryKempe(s, seed, cellX, cellY, Math.min(60, n));
          if (!k) continue;
          if (k.delta < 0) {
            improvedAny = true;
            break; // keep this improving flip, move to next seed
          }
          undoKempe(s, k.touched, k.oldCells); // non-improving: revert
        }
        if (s.energy === 0) break;
      }
      if (improvedAny) {
        rebuildConflicted();
        const improvedFlat = s.energy < bestEnergy;
        tryRecordBest();
        if (improvedFlat) sinceImprove = 0;
        continue;
      }
    }

    // Periodic Kempe-chain attempt on a random conflicted lesson.
    if (onPlateau && (iter & 0x7) === 0) {
      const seed = conflictedList[rng.int(conflictedList.length)];
      if (lessonConflicted(s, seed)) {
        const cellX = s.color[seed];
        // choose Y = a min-gamma cell for the seed (most promising flip target)
        const dom = model.domain[seed];
        let by = -1;
        let bg = Number.POSITIVE_INFINITY;
        for (const c of dom) {
          if (c === cellX) continue;
          const g = s.gamma[gIdx(model, seed, c)];
          if (g < bg) { bg = g; by = c; }
        }
        if (by >= 0) {
          const maxChain = Math.min(40, Math.max(8, Math.round(n * 0.08)));
          const k = tryKempe(s, seed, cellX, by, maxChain);
          if (k) {
            const accept = k.delta <= 0 || rng.next() < Math.exp(-k.delta / T);
            if (!accept) undoKempe(s, k.touched, k.oldCells);
            rebuildConflicted();
            const improvedFlat = s.energy < bestEnergy;
            tryRecordBest();
            if (improvedFlat) sinceImprove = 0;
            continue;
          }
        }
      }
    }

    // TabuCol/SA single move: pick a conflicted lesson, evaluate all domain cells.
    const i = conflictedList[rng.int(conflictedList.length)];
    if (!lessonConflicted(s, i)) {
      // stale entry; refresh occasionally
      rebuildConflicted();
      continue;
    }
    const from = s.color[i];
    const dom = model.domain[i];

    // Best move by delta, honoring tabu (with aspiration to global best).
    let bestDelta = Number.POSITIVE_INFINITY;
    let bestCells: number[] = [];
    let bestAspDelta = Number.POSITIVE_INFINITY;
    let bestAspCells: number[] = [];
    for (const c of dom) {
      if (c === from) continue;
      const d = moveDelta(s, i, c);
      const isTabu = tabu[i * model.cellCount + c] > iter;
      if (!isTabu) {
        if (d < bestDelta) { bestDelta = d; bestCells = [c]; }
        else if (d === bestDelta) bestCells.push(c);
      } else {
        // aspiration candidate: only if it would set a new global-best energy
        if (s.energy + d < bestEnergy) {
          if (d < bestAspDelta) { bestAspDelta = d; bestAspCells = [c]; }
          else if (d === bestAspDelta) bestAspCells.push(c);
        }
      }
    }

    let target = -1;
    let chosenDelta = 0;
    if (bestAspCells.length > 0 && bestAspDelta <= bestDelta) {
      target = bestAspCells[rng.int(bestAspCells.length)];
      chosenDelta = bestAspDelta;
    } else if (bestCells.length > 0) {
      // SA acceptance among non-tabu: if best non-tabu worsens, sometimes still take
      // a random worsening move via Metropolis to diversify.
      target = bestCells[rng.int(bestCells.length)];
      chosenDelta = bestDelta;
      // Occasionally explore a random non-best cell with Metropolis (diversification)
      if (rng.next() < 0.05) {
        const rc = dom[rng.int(dom.length)];
        if (rc !== from && tabu[i * model.cellCount + rc] <= iter) {
          const rd = moveDelta(s, i, rc);
          if (rd <= chosenDelta || rng.next() < Math.exp(-(rd - chosenDelta) / T)) {
            target = rc;
            chosenDelta = rd;
          }
        }
      }
    } else {
      // all cells tabu and none aspirational — make the least-bad tabu move anyway
      let bd = Number.POSITIVE_INFINITY;
      for (const c of dom) {
        if (c === from) continue;
        const d = moveDelta(s, i, c);
        if (d < bd) { bd = d; target = c; chosenDelta = d; }
      }
      if (target < 0) { rebuildConflicted(); continue; }
    }

    // Metropolis acceptance for worsening best non-tabu moves. On rejection we
    // STAY (no forced random move) — tabu already prevents getting frozen, and the
    // periodic Kempe/perturbation provide the large jumps. Forcing a random uphill
    // move on every rejection (the earlier behavior) scattered the harder grade3.
    if (chosenDelta > 0 && !(s.energy + chosenDelta < bestEnergy)) {
      if (rng.next() >= Math.exp(-chosenDelta / T)) {
        // Reject: brief tabu on the lesson's current cell to nudge diversification,
        // then continue without moving.
        tabu[i * model.cellCount + from] = iter + (baseTenure >> 1);
        continue;
      }
    }

    applyMove(s, i, target);
    // Tabu the reverse (re-entering `from`).
    tabu[i * model.cellCount + from] = iter + baseTenure + rng.int(baseTenure);

    // Refresh conflicted membership for i and its neighbors locally.
    // (Cheaper than full rebuild; rebuild periodically to stay exact.)
    if ((iter & 0x3f) === 0) {
      rebuildConflicted();
    } else {
      // local touch: ensure i and neighbors reflect current conflict state
      // We keep conflictedList as a superset; staleness is corrected by periodic rebuild.
      if (lessonConflicted(s, i)) conflictedList.push(i);
    }

    // Best tracking + plateau handling
    const improvedFlat = s.energy < bestEnergy;
    tryRecordBest();
    if (improvedFlat) {
      sinceImprove = 0;
    } else if (++sinceImprove > plateauLimit) {
      sinceImprove = 0;
      plateauCount++;
      // Strategic oscillation. Most plateaus: perturb IN PLACE (keep exploring the
      // current basin). Every few plateaus: restart from the best (intensify). This
      // mix keeps the harder grade3 stable while still escaping on grade2.
      const restartFromBest = plateauCount % 4 === 0;
      if (restartFromBest) {
        s.color.set(bestColor);
        rebuildFromColor(s);
      }
      // Light reheat, capped — never a hot random walk.
      T = Math.min(T0, T * 1.5 + 0.2);
      tabu.fill(-1);
      rebuildConflicted();
      // Perturb a focused region: conflicted lessons + their neighbors. Kick size
      // scales with the residual energy so we barely disturb a near-feasible board.
      const pool = new Set<number>();
      for (const cid of conflictedList) {
        pool.add(cid);
        for (const j of model.adj[cid]) pool.add(j);
      }
      const poolArr = pool.size > 0 ? [...pool] : [...Array(n).keys()];
      const kick = Math.max(2, Math.min(poolArr.length, Math.round(s.energy * 1.5) + 2));
      for (let k = 0; k < kick; k++) {
        const kid = poolArr[rng.int(poolArr.length)];
        const kdom = model.domain[kid];
        const kc = kdom[rng.int(kdom.length)];
        applyMove(s, kid, kc);
      }
      rebuildConflicted();
    }
  }

  // Restore best and return.
  s.color.set(bestColor);
  rebuildFromColor(s);
  const finalConf = countConflictedLessons(s);
  const placements = snapshot(s, cells, graph, pinnedColor);
  if (DEBUG) {
     
    console.error(`[enh] steps=${stepCount} restarts done; bestConf=${bestConf} bestEnergy=${bestEnergy} restoredEnergy=${s.energy} restoredConf=${finalConf}`);
  }
  if (s.energy === 0 && finalConf === 0) return { placements, conflicts: 0 };
  return { placements, conflicts: bestConf };
}

/** Rebuild gamma/occ/offeringDay/teacher-state/energy from s.color (after a bulk color reset). */
function rebuildFromColor(s: Search): void {
  const model = s.model;
  const n = model.ids.length;
  s.gamma.fill(0);
  for (let c = 0; c < model.cellCount; c++) s.occ[c].clear();
  s.offeringDay.fill(0);
  // 교사 상태: pinned fold 스냅샷(base)에서 복원 후 마스크 재파생, movable은 아래 루프에서 재적용
  if (model.tcfg.any) {
    s.tOcc.set(s.tOccBase);
    s.tDayCount.set(s.tDayCountBase);
    s.tLastCount.set(s.tLastCountBase);
    s.sOcc.set(s.sOccBase);
    deriveMasksFromOcc(model.P, s.tOcc, s.tMask);
    deriveMasksFromOcc(model.P, s.sOcc, s.sMask);
  }
  for (let i = 0; i < n; i++) {
    const c = s.color[i];
    s.occ[c].add(i);
    const off = model.offering[i];
    if (off >= 0) s.offeringDay[off * s.days + model.cellDay[c]]++;
    if (model.tcfg.any && model.teacherOf[i] >= 0) {
      tApplyRaw(model, s.tOcc, s.tMask, s.tDayCount, s.tLastCount, s.sOcc, s.sMask, model.teacherOf[i], model.subjOf[i], c, 1);
    }
  }
  for (let i = 0; i < n; i++) {
    const c = s.color[i];
    for (const j of model.adj[i]) s.gamma[gIdx(model, j, c)]++;
  }
  // Re-apply pinned-neighbor gamma + pinned cap (folded at init; must be restored
  // here so gamma stays exact after a bulk color reset).
  if (s.pinnedGamma) {
    for (const [key, add] of s.pinnedGamma) s.gamma[key] += add;
  }
  if (s.pinnedOfferingDay) {
    for (const [key, add] of s.pinnedOfferingDay) s.offeringDay[key] += add;
  }
  s.energy = computeEnergyFromGamma(s);
  s.energyT = teacherEnergyFull(s);
}

