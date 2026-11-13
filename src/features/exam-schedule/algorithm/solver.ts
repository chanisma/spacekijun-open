import type {
  ExamScheduleInput,
  ScheduleCandidate,
  ScheduleRunResult,
  SolverDiagnostics,
  SolverProgress,
} from '../types';
import { buildConflictGraph } from './conflictGraph';
import { assignmentSignature, findDiverseInitialSolutions } from './csp';
import { runSimulatedAnnealing } from './sa';
import { EliteArchive, hammingDistance, selectDistinctDayStructures } from './eliteArchive';
import { evaluate } from './score';
import { createRng } from './rng';
import { runPreflight } from './preflight';
import { expandExamCountVariants } from './examCountVariants';
import { allSubjects } from '../utils/multiGrade';
import { RUN_MODE_LIMITS, SA_CONFIG, ELITE_ARCHIVE_SIZE } from '../constants';

export type ProgressCallback = (p: SolverProgress) => void;

interface SeedRecord {
  input: ExamScheduleInput;
  assignments: ScheduleCandidate['assignments'];
}

function emptyCspDiagnostics(variantsExplored = 0): SolverDiagnostics['csp'] {
  return {
    seedsAttempted: 0,
    feasibleSeeds: 0,
    uniqueSeeds: 0,
    duplicateSeeds: 0,
    selectedSeeds: 0,
    variantsExplored,
  };
}

function seedSignature(seed: SeedRecord): string {
  const days = seed.input.grades
    .map((g) => {
      const gradeDays = (seed.input.gradeInputs[g]?.days ?? [])
        .map((day) => `${day.dayIndex}:${day.examCount}:${day.availablePeriods.join(',')}`)
        .join('|');
      return `g${g}{${gradeDays}}`;
    })
    .join('~');
  return `${days}::${assignmentSignature(seed.assignments)}`;
}

function selectDiverseSeeds(pool: SeedRecord[], target: number): SeedRecord[] {
  if (pool.length <= target) return pool;
  const selected: SeedRecord[] = [pool[0]];
  const remaining = pool.slice(1);

  while (selected.length < target && remaining.length > 0) {
    let bestIdx = 0;
    let bestMinDistance = -1;
    let bestAverageDistance = -1;

    for (let i = 0; i < remaining.length; i++) {
      const distances = selected.map((seed) =>
        hammingDistance(remaining[i].assignments, seed.assignments),
      );
      const minDistance = Math.min(...distances);
      const averageDistance =
        distances.reduce((acc, distance) => acc + distance, 0) / distances.length;

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

function buildDayConfigsByGrade(
  input: ExamScheduleInput,
): ScheduleCandidate['dayConfigsByGrade'] {
  const out: ScheduleCandidate['dayConfigsByGrade'] = {};
  for (const g of input.grades) {
    out[g] = (input.gradeInputs[g]?.days ?? []).map((d) => ({ ...d }));
  }
  return out;
}

export function runSolver(
  input: ExamScheduleInput,
  onProgress?: ProgressCallback,
): ScheduleRunResult {
  const startedAt = Date.now();
  const seed = input.options.randomSeed ?? (Date.now() >>> 0);
  const rng = createRng(seed);

  onProgress?.({ phase: 'init', current: 0, total: 1, message: '준비 중' });

  const preflight = runPreflight(input);
  if (!preflight.feasible) {
    return {
      candidates: [],
      diagnostics: {
        elapsedMs: Date.now() - startedAt,
        csp: emptyCspDiagnostics(),
        sa: { iterations: 0, acceptedMoves: 0 },
        preflight,
        reason: preflight.warnings.join(' '),
      },
    };
  }

  // 전 학년 과목을 하나의 conflict graph에 통합. 학생 코드가 학년 간 겹치지
  // 않으므로 학년 간 간선은 생기지 않고, 학년 결합은 감독 용량 제약이 담당한다.
  const graph = buildConflictGraph(allSubjects(input));
  const limits = RUN_MODE_LIMITS[input.options.runMode];
  const variantInputs = expandExamCountVariants(input, preflight);

  if (variantInputs.length === 0) {
    return {
      candidates: [],
      diagnostics: {
        elapsedMs: Date.now() - startedAt,
        csp: emptyCspDiagnostics(variantInputs.length),
        sa: { iterations: 0, acceptedMoves: 0 },
        preflight,
        reason:
          '자동 시험 개수 탐색에서 가능한 일차별 시험 개수 조합을 찾지 못했습니다. ' +
          '사용 교시, 시험 일수, 매일 시험 배치 옵션을 확인해 주세요.',
      },
    };
  }

  // Phase 1: CSP seeds
  const minTopSeedCount =
    input.options.runMode === 'quick' ? ELITE_ARCHIVE_SIZE : ELITE_ARCHIVE_SIZE * 2;
  const maxSaSeeds = Math.max(limits.cspSeeds, minTopSeedCount);
  const seedsPerVariant = Math.max(1, Math.ceil(maxSaSeeds / variantInputs.length));
  onProgress?.({
    phase: 'csp',
    current: 0,
    total: variantInputs.length,
    message:
      variantInputs.length > 1
        ? `CSP 초기 해 탐색 (${variantInputs.length}개 시험 개수 조합)`
        : 'CSP 초기 해 탐색',
  });
  const seedPool: SeedRecord[] = [];
  const seenSeeds = new Set<string>();
  let seedsAttempted = 0;
  let duplicateSeeds = 0;
  // CSP 시드 탐색 전체에 SA와 같은 시간 예산을 부여 — 사실상 불가능한 입력에서
  // 시도 횟수 한도까지 수 분간 멈추는 것을 방지한다 (전체 실행 ≤ 2×budget).
  const cspDeadline = startedAt + limits.timeBudgetMs;

  for (let i = 0; i < variantInputs.length; i++) {
    if (Date.now() > cspDeadline) break;
    const found = findDiverseInitialSolutions(
      variantInputs[i],
      graph,
      rng,
      seedsPerVariant,
      cspDeadline,
    );
    seedsAttempted += found.attempts;
    duplicateSeeds += found.duplicates;

    for (const assignments of found.solutions) {
      const seedRecord = { input: variantInputs[i], assignments };
      const signature = seedSignature(seedRecord);
      if (seenSeeds.has(signature)) {
        duplicateSeeds++;
        continue;
      }
      seenSeeds.add(signature);
      seedPool.push(seedRecord);
    }

    onProgress?.({
      phase: 'csp',
      current: i + 1,
      total: variantInputs.length,
    });
  }

  const seeds = selectDiverseSeeds(seedPool, Math.min(maxSaSeeds, seedPool.length));
  const cspDiag = {
    seedsAttempted,
    feasibleSeeds: seedPool.length,
    uniqueSeeds: seedPool.length,
    duplicateSeeds,
    selectedSeeds: seeds.length,
    variantsExplored: variantInputs.length,
  };
  onProgress?.({
    phase: 'csp',
    current: variantInputs.length,
    total: variantInputs.length,
  });

  if (seeds.length === 0) {
    return {
      candidates: [],
      diagnostics: {
        elapsedMs: Date.now() - startedAt,
        csp: cspDiag,
        sa: { iterations: 0, acceptedMoves: 0 },
        preflight,
        reason:
          'CSP 백트래킹으로 hard constraint를 모두 만족하는 초기 해를 찾지 못했습니다. ' +
          '일차별 시험 개수, 비활성 교시, 고정 배치, 감독 인원 설정을 다시 확인해 주세요.',
      },
    };
  }

  // Phase 2: SA per seed with shared archive
  const archive = new EliteArchive(ELITE_ARCHIVE_SIZE);
  let totalIter = 0;
  let totalAccepted = 0;

  // Distribute time budget across seeds
  const perSeedTime = Math.max(500, Math.floor(limits.timeBudgetMs / Math.max(1, seeds.length)));
  const totalBudgetEnd = startedAt + limits.timeBudgetMs;

  for (let i = 0; i < seeds.length; i++) {
    const remainingBudget = Math.max(200, totalBudgetEnd - Date.now());
    const budget = Math.min(perSeedTime, remainingBudget);
    if (budget < 200) break;
    const seedRng = createRng((seed ^ ((i + 1) * 0x9e3779b1)) >>> 0);
    const seedInput = seeds[i].input;
    const sa = runSimulatedAnnealing(
      seeds[i].assignments,
      seedInput,
      graph,
      seedRng,
      archive,
      {
        Tstart: SA_CONFIG.Tstart,
        Tend: SA_CONFIG.Tend,
        alpha: SA_CONFIG.alpha,
        maxIter: limits.saMaxIter,
        timeBudgetMs: budget,
      },
      (iter, total) => {
        onProgress?.({
          phase: 'sa',
          current: i * limits.saMaxIter + iter,
          total: seeds.length * limits.saMaxIter,
          message: `시드 ${i + 1}/${seeds.length} (반복 ${iter}/${total})`,
        });
      },
    );
    totalIter += sa.stats.iterations;
    totalAccepted += sa.stats.acceptedMoves;
  }

  // Phase 3: finalize
  onProgress?.({ phase: 'finalize', current: 0, total: 1, message: 'TOP 5 정리 중' });
  let candidates: ScheduleCandidate[] = selectDistinctDayStructures(
    archive.list(),
    ELITE_ARCHIVE_SIZE,
  );

  // If archive is empty, only surface seeds that satisfy every hard constraint.
  // Hard violations are generation blockers, not comparable candidates.
  if (candidates.length === 0) {
    const fallbackCandidates: ScheduleCandidate[] = [];
    for (const seedRecord of seeds) {
      const ev = evaluate(seedRecord.assignments, { input: seedRecord.input, graph });
      if (!ev.metrics.hardFeasible) continue;
      fallbackCandidates.push({
        id: `seed-${fallbackCandidates.length + 1}`,
        grades: [...seedRecord.input.grades],
        assignments: seedRecord.assignments,
        dayConfigsByGrade: buildDayConfigsByGrade(seedRecord.input),
        scoreBreakdown: ev.score,
        metrics: ev.metrics,
        createdAt: new Date().toISOString(),
      });
    }
    candidates = selectDistinctDayStructures(fallbackCandidates, ELITE_ARCHIVE_SIZE);
  }

  candidates = selectDistinctDayStructures(candidates, ELITE_ARCHIVE_SIZE);

  const diagnostics: SolverDiagnostics = {
    elapsedMs: Date.now() - startedAt,
    csp: cspDiag,
    sa: { iterations: totalIter, acceptedMoves: totalAccepted },
    preflight,
    reason:
      candidates.length === 0
        ? 'Hard constraint를 모두 만족하는 시간표를 찾지 못했습니다. Hard 옵션, 고정 배치, 일차별 시험 개수, 감독 인원 조건을 완화해 주세요.'
        : undefined,
  };

  onProgress?.({ phase: 'finalize', current: 1, total: 1 });

  return { candidates, diagnostics };
}
