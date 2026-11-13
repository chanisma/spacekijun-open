import type { Placement, TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import { type AssignmentMap, evaluateSoft, mapToPlacements, placementsToMap, type ScoreContext } from './score';
import { applyMove, type MoveContext, pickMove, revertMove } from './moves';
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

/**
 * Simulated annealing. 무브가 항상 하드-실현가능을 보장하므로 매 스텝 소프트 점수만
 * 재계산한다 (반 단위 집계라 저렴). 가변 맵을 적용/되돌려 배열 복제를 피한다.
 */
export function runSimulatedAnnealing(
  initial: Placement[],
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  cfg: SAConfig,
  mctx: MoveContext,
  onProgress?: (iter: number, total: number) => void,
): { best: Placement[]; bestSoft: number; stats: SAStats } {
  const ctx: ScoreContext = { input, graph };
  const current: AssignmentMap = placementsToMap(initial);
  let currentSoft = evaluateSoft(current, ctx).total;
  let best: AssignmentMap = new Map(current);
  let bestSoft = currentSoft;

  const stats: SAStats = { iterations: 0, acceptedMoves: 0 };
  let T = cfg.Tstart;
  const startTime = Date.now();
  let feasibleAttempts = 0;

  while (T > cfg.Tend && stats.iterations < cfg.maxIter) {
    if (Date.now() - startTime > cfg.timeBudgetMs) break;

    const move = pickMove(current, input, graph, rng, mctx);
    stats.iterations++;
    if (!move) continue;

    applyMove(current, move);
    const newSoft = evaluateSoft(current, ctx).total;
    const dE = newSoft - currentSoft;
    let accept = dE < 0;
    if (!accept && rng.next() < Math.exp(-dE / Math.max(T, 1e-4))) accept = true;

    if (accept) {
      currentSoft = newSoft;
      stats.acceptedMoves++;
      if (newSoft < bestSoft - 1e-9) {
        best = new Map(current);
        bestSoft = newSoft;
      }
    } else {
      revertMove(current, move);
    }

    feasibleAttempts++;
    if (feasibleAttempts % SA_CONFIG.reportEvery === 0) {
      T *= cfg.alpha;
      onProgress?.(stats.iterations, cfg.maxIter);
    }
  }

  onProgress?.(cfg.maxIter, cfg.maxIter);
  return { best: mapToPlacements(best), bestSoft, stats };
}
