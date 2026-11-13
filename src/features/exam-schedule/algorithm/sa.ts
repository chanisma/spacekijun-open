import type { ExamScheduleInput, ScheduleCandidate, SlotAssignment } from '../types';
import type { ConflictGraph } from './conflictGraph';
import { evaluate, isFeasible } from './score';
import { pickMove } from './moves';
import { EliteArchive } from './eliteArchive';
import { SA_CONFIG } from '../constants';
import type { Rng } from './rng';

export interface SAConfig {
  Tstart: number;
  Tend: number;
  alpha: number;
  maxIter: number;
  timeBudgetMs: number;
}

export interface SAStats {
  iterations: number;
  acceptedMoves: number;
}

export function runSimulatedAnnealing(
  initialAssignments: SlotAssignment[],
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
  archive: EliteArchive,
  cfg: SAConfig,
  onProgress?: (iter: number, total: number) => void,
): { best: SlotAssignment[]; stats: SAStats } {
  const ctx = { input, graph };

  let current = initialAssignments;
  const initEval = evaluate(current, ctx);
  let currentScore = initEval.score.total;
  let best = current;
  let bestScore = currentScore;

  const stats: SAStats = { iterations: 0, acceptedMoves: 0 };

  if (initEval.metrics.hardFeasible) {
    archive.tryAdmit(buildCandidate(input, current, ctx, rng));
  }

  let T = cfg.Tstart;
  const startTime = Date.now();
  // Cool every reportEvery feasible attempts so the schedule is anchored to
  // actual exploration progress, not no-op moves.
  let feasibleAttempts = 0;

  while (T > cfg.Tend && stats.iterations < cfg.maxIter) {
    if (Date.now() - startTime > cfg.timeBudgetMs) break;

    const proposal = pickMove(current, input, graph, rng);
    stats.iterations++;
    if (!proposal) {
      // Skip cooling on no-op proposals
      continue;
    }
    const evalRes = evaluate(proposal, ctx);
    if (!isFeasible(evalRes.score)) {
      // Hard constraints are gates, not weighted objectives. Infeasible
      // proposals count toward iteration budget but never enter the search path.
      continue;
    }
    feasibleAttempts++;
    const newScore = evalRes.score.total;
    const dE = newScore - currentScore;
    let accept = false;
    if (dE < 0) accept = true;
    else if (rng.next() < Math.exp(-dE / Math.max(T, 0.0001))) accept = true;

    if (accept) {
      current = proposal;
      currentScore = newScore;
      stats.acceptedMoves++;
      if (newScore < bestScore) {
        best = proposal;
        bestScore = newScore;
      }
      archive.tryAdmit(buildCandidate(input, proposal, ctx, rng));
    }

    if (feasibleAttempts > 0 && feasibleAttempts % SA_CONFIG.reportEvery === 0) {
      T *= cfg.alpha;
      onProgress?.(stats.iterations, cfg.maxIter);
    }
  }

  // Final progress emit so UI bars reach completion if exit was via time budget
  onProgress?.(cfg.maxIter, cfg.maxIter);

  return { best, stats };
}

let candidateSerial = 0;

function buildCandidate(
  input: ExamScheduleInput,
  assignments: SlotAssignment[],
  ctx: { input: ExamScheduleInput; graph: ConflictGraph },
  _rng: Rng,
): ScheduleCandidate {
  const { score, metrics } = evaluate(assignments, ctx);
  candidateSerial++;
  const dayConfigsByGrade: ScheduleCandidate['dayConfigsByGrade'] = {};
  for (const g of input.grades) {
    dayConfigsByGrade[g] = (input.gradeInputs[g]?.days ?? []).map((d) => ({ ...d }));
  }
  return {
    id: `cand-${Date.now()}-${candidateSerial}`,
    grades: [...input.grades],
    assignments: assignments.map((a) => ({ ...a })),
    dayConfigsByGrade,
    scoreBreakdown: score,
    metrics,
    createdAt: new Date().toISOString(),
  };
}
