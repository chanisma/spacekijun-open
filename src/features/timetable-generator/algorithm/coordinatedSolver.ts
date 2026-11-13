import type { Placement, SolverProgress, TimetableInput, TimetableRunResult } from '../types';
import { TEACHER_HARD_OFF, TEACHER_HARD_TIER1_IDS } from '../constants';
import { buildConflictGraph } from './conflictGraph';
import { cellKeyStr, enumerateCells } from './csp';
import { enhancedLocalSeed } from './enhancedLocalSolver';
import { evaluateFull } from './score';
import { sectionStudents } from './sectioning';
import { lessonsWithSectioning, buildSectioningFinalReport } from '../utils/sectioningReport';
import { createRng } from './rng';
import { teacherHardConfig } from './teacherConstraints';
import { tightenTeacherHard } from './teacherRebalance';
import { repairTimeNeighborhoods } from './temporalRepair';
import { runPreflight } from './preflight';
import { repairByEjection } from './ejectionRepair';

export const COORDINATED_BUDGET_MS = { quick: 20000, standard: 90000, thorough: 240000, exact: 600000 } as const;

/** Saturation-aware pipeline: color → exact student section matching → warm
 * recoloring, then alternate Kempe chains, ejection trees and MILP neighborhoods.
 * One shared deadline bounds every phase. The original constraints never change
 * in candidate evaluation; temporary teacher relaxation is only a search device. */
export function runCoordinatedSolver(
  input: TimetableInput, onProgress?: (p: SolverProgress) => void,
  initial?: Placement[],
): { result: TimetableRunResult; finalInput: TimetableInput } {
  const started = Date.now();
  const deadline = started + COORDINATED_BUDGET_MS[input.options.runMode];
  const preflight = runPreflight(input);
  const diagnostics: TimetableRunResult['diagnostics'] = {
    elapsedMs: 0, preflight,
    csp: { seedsAttempted: 0, feasibleSeeds: 0, selectedSeeds: 0 },
    sa: { iterations: 0, acceptedMoves: 0 },
  };
  if (!preflight.feasible) return { result: { candidates: [], diagnostics: { ...diagnostics, reason: preflight.warnings.join(' ') } }, finalInput: input };
  const cells = enumerateCells(input.grid);
  const domains = new Map(input.lessons.map((l) => [l.id, cells.filter((c) => !l.blockedCells.includes(cellKeyStr(c)))]));
  const pinned = new Set(input.pinned.map((p) => p.lessonId));
  const seed = input.options.randomSeed ?? 7;
  const graphFor = (i: TimetableInput) => buildConflictGraph(i.lessons, { teacher: i.options.hard.teacherConflict, room: i.options.hard.roomConflict });
  const inspect = (i: TimetableInput, p: Placement[]) => {
    const graph = graphFor(i);
    const evaluation = evaluateFull(p, { input: i, graph });
    return { ...evaluation, graph,
      base: evaluation.score.hard.filter((h) => !TEACHER_HARD_TIER1_IDS.has(h.id)).reduce((s, h) => s + h.count, 0),
      teacher: evaluation.score.hard.filter((h) => TEACHER_HARD_TIER1_IDS.has(h.id)).reduce((s, h) => s + h.count, 0),
    };
  };
  type State = { input: TimetableInput; placements: Placement[]; evaluation: ReturnType<typeof inspect> };
  let best: State | null = null;
  const consider = (i: TimetableInput, p: Placement[]): State => {
    const candidate = { input: i, placements: p, evaluation: inspect(i, p) };
    const a = candidate.evaluation, b = best?.evaluation;
    if (!b || a.base < b.base || (a.base === b.base && a.teacher < b.teacher)) best = candidate;
    return candidate;
  };
  let branchInput = input;
  let warm: Placement[] | undefined;
  if (initial) {
    const initialState = consider(input, initial);
    const sectioned = { ...input, lessons: lessonsWithSectioning(input.lessons, sectionStudents(input.lessons, initial)) };
    const matched = consider(sectioned, initial);
    const chosen = matched.evaluation.base <= initialState.evaluation.base ? matched : initialState;
    branchInput = chosen.input;
    warm = initial;
  }
  // Re-section even when the current placement is not yet feasible. A cold
  // restart after every roster change discards the useful nearly-valid coloring.
  let attempt = 0;
  let branch: State | null = best;
  let portfolio = 0;
  while (Date.now() < deadline && (!best || best.evaluation.base || best.evaluation.teacher)) {
    const seedDeadline = Math.min(deadline, Date.now() + 24000);
    while (Date.now() < seedDeadline && (!branch || branch.evaluation.base > 0)) {
      attempt++;
      if (attempt % 4 === 0) { branchInput = input; warm = undefined; }
      const relaxed = { ...branchInput, options: { ...input.options, hard: { ...input.options.hard, ...TEACHER_HARD_OFF } } };
      onProgress?.({ phase: 'csp', current: attempt, total: attempt + 1, message: `공동 재배치 ${attempt}차: 기본 충돌 ${branch?.evaluation.base ?? '탐색 중'}` });
      const solved = enhancedLocalSeed(relaxed, graphFor(relaxed), createRng((seed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0),
        domains, pinned, Math.min(seedDeadline, Date.now() + 4000), 5000000, warm);
      diagnostics.csp.seedsAttempted++;
      if (!solved) continue;
      const original = consider(branchInput, solved.placements);
      const sectioned = { ...branchInput, lessons: lessonsWithSectioning(branchInput.lessons, sectionStudents(branchInput.lessons, solved.placements)) };
      const changed = consider(sectioned, solved.placements);
      branch = changed.evaluation.base <= original.evaluation.base ? changed : original;
      // Matching and coloring are alternating blocks of the same optimization.
      branchInput = changed.input;
      warm = solved.placements;
    }
    if (branch?.evaluation.base === 0) {
      diagnostics.csp.feasibleSeeds++;
      diagnostics.csp.selectedSeeds = 1;
      const cfg = teacherHardConfig(input);
      let round = 0;
      const repairDeadline = Math.min(deadline, Date.now() + 24000);
      while (branch.evaluation.teacher > 0 && Date.now() < repairDeadline) {
        round++;
        const current = branch;
        const improveBranch = (i: TimetableInput, ps: Placement[]) => {
          const state = consider(i, ps);
          if (state.evaluation.base === 0 && state.evaluation.teacher <= branch!.evaluation.teacher) branch = state;
        };
        onProgress?.({ phase: 'csp', current: round, total: round + 1, message: `전체 교시 묶음 수리 ${round}차: 교사 제약 ${current.evaluation.teacher}건` });
        const tightened = tightenTeacherHard(current.placements, current.input, cfg, current.evaluation.graph,
          createRng((seed ^ Math.imul(round + portfolio * 31, 0x85ebca6b)) >>> 0), Math.min(6000, Math.max(0, repairDeadline - Date.now())));
        const nextInput = tightened.rosters ? { ...current.input, lessons: current.input.lessons.map((l) => {
          const roster = tightened.rosters!.get(l.offeringId);
          return roster ? { ...l, studentCodes: roster, studentCount: roster.length } : l;
        }) } : current.input;
        improveBranch(nextInput, tightened.placements);
        if (!branch.evaluation.teacher || Date.now() >= repairDeadline) break;
        // Allow temporary basic conflicts inside the search to cross barriers that
        // a feasible-only Kempe walk cannot cross; the incumbent still uses the
        // original lexicographic validation gate.
        const repairedWarm = enhancedLocalSeed(branch.input, branch.evaluation.graph,
          createRng((seed ^ Math.imul(round + portfolio * 31, 0x51ed270b)) >>> 0), domains, pinned,
          Math.min(repairDeadline, Date.now() + 4000), 5000000, branch.placements);
        if (repairedWarm) improveBranch(branch.input, repairedWarm.placements);
        if (!branch.evaluation.teacher || Date.now() >= repairDeadline) break;
        const ejected = repairByEjection(branch.input, branch.placements, Math.min(repairDeadline, Date.now() + 2000), seed + round + portfolio * 31);
        improveBranch(branch.input, ejected.placements);
        if (!branch.evaluation.teacher || Date.now() >= repairDeadline) break;
        const repaired = repairTimeNeighborhoods(branch.input, branch.placements, Math.min(repairDeadline, Date.now() + 4000), undefined, seed + round + portfolio * 31);
        improveBranch(branch.input, repaired.placements);
      }
    }
    if (best?.evaluation.base === 0 && best.evaluation.teacher === 0) break;
    // Preserve the best witness but leave its local basin after a bounded slice.
    portfolio++;
    branch = null;
    branchInput = input;
    warm = undefined;
    onProgress?.({ phase: 'csp', current: portfolio, total: portfolio + 1, message: `다른 초기 배치 탐색 ${portfolio + 1}차` });
  }
  diagnostics.elapsedMs = Date.now() - started;
  if (!best) return { result: { candidates: [], diagnostics: { ...diagnostics, reason: '제한 시간 내 초기 배치를 찾지 못했습니다.' } }, finalInput: input };
  // Reconstruct from original enrollment exactly as preview/finalization do.
  // A feasible roster found during search must survive this public boundary.
  const witness = best as State;
  const finalInput = { ...input, lessons: lessonsWithSectioning(input.lessons, sectionStudents(input.lessons, witness.placements)) };
  const final: State = { input: finalInput, placements: witness.placements, evaluation: inspect(finalInput, witness.placements) };
  diagnostics.reason = final.evaluation.base || final.evaluation.teacher
    ? `탐색 시간 내 완전한 시간표를 찾지 못했습니다. 기본 충돌 ${final.evaluation.base}건, 교사 부하 위반 ${final.evaluation.teacher}건입니다. 이는 배치 불가능의 증명이 아닙니다.` : undefined;
  diagnostics.sectioning = { attempts: [], final: buildSectioningFinalReport(input.lessons, final.input.lessons, final.placements) };
  diagnostics.elapsedMs = Date.now() - started;
  onProgress?.({ phase: 'finalize', current: 1, total: 1,
    message: final.evaluation.metrics.hardFeasible ? '모든 제약을 만족하는 시간표 검증 완료' : '현재 최선 배치 검증 완료' });
  return {
    result: { candidates: [{ id: 'cand-coordinated', grades: [...input.grades], placements: final.placements,
      scoreBreakdown: final.evaluation.score, metrics: final.evaluation.metrics, createdAt: new Date().toISOString() }], diagnostics },
    finalInput: final.input,
  };
}
