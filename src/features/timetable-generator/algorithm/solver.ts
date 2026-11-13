import type {
  InfeasibilityCertificate,
  Lesson,
  Placement,
  SectioningAttemptReport,
  SectioningDiagnostics,
  SolverDiagnostics,
  SolverProgress,
  TimetableCandidate,
  TimetableInput,
  TimetableRunResult,
} from '../types';
import { buildGradeSubInput, isPhantomLessonId, orderGradesByDifficulty } from './gradeSequential';
import { buildConflictGraph } from './conflictGraph';
import { assignmentSignature, type CellKey, cellKeyStr, enumerateCells, minConflictsSeed } from './csp';
import { blockAwareSeed } from './blockAwareSolver';
import { enhancedLocalSeed } from './enhancedLocalSolver';
import { cpSatSeed } from './cpSatSolver';
import type { Rng } from './rng';
import type { ConflictGraph } from './conflictGraph';
import type { SolverStrategy } from '../types';
import { runSimulatedAnnealing } from './sa';
import { evaluateFull } from './score';
import { type MoveContext, type MoveTeacherCtx } from './moves';
import {
  collectTeacherViolations,
  type TeacherHardConfig,
  teacherHardConfig,
  type TeacherPlacedLesson,
} from './teacherConstraints';
import { createRng } from './rng';
import { runPreflight } from './preflight';
import { sectionStudents } from './sectioning';
import { buildSectioningFinalReport, lessonsWithSectioning, roundFromSectioning } from '../utils/sectioningReport';
import { rebalanceTeacherLoad, type TightenResult, tightenTeacherHard } from './teacherRebalance';
import { cpSatFull, lnsTeacherRepair, type MilpOut } from './bruteforceRepair';
import { diagnoseTeacherFeasibility } from './diagnosis';
import { runCoordinatedSolver } from './coordinatedSolver';
import { EXACT_BUDGET, ELITE_ARCHIVE_SIZE, RUN_MODE_LIMITS, SA_CONFIG, TEACHER_HARD_TIER1_IDS } from '../constants';

export type ProgressCallback = (p: SolverProgress) => void;

/** Phase-1 seed 솔버 시그니처 (minConflictsSeed와 동일). */
type SeedFn = (
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
  deadlineMs: number,
  maxSteps: number,
) => { placements: Placement[]; conflicts: number } | null;

/**
 * 전략별 seed 솔버 선택. 'enhanced-local'·'cp-sat'은 모듈 완성 후 연결되며,
 * 미연결 동안에는 min-conflicts로 안전하게 폴백한다.
 */
function pickSeedSolver(strategy: SolverStrategy | undefined): SeedFn {
  switch (strategy) {
    case 'block-aware':
      return blockAwareSeed;
    case 'enhanced-local':
      return enhancedLocalSeed;
    case 'cp-sat':
      return cpSatSeed;
    case 'min-conflicts':
    default:
      return minConflictsSeed;
  }
}

function emptyDiag(reason: string, elapsedMs: number, preflight?: SolverDiagnostics['preflight']): SolverDiagnostics {
  return {
    elapsedMs,
    csp: { seedsAttempted: 0, feasibleSeeds: 0, selectedSeeds: 0 },
    sa: { iterations: 0, acceptedMoves: 0 },
    preflight,
    reason,
  };
}

function dedupeBySignature(candidates: TimetableCandidate[]): TimetableCandidate[] {
  const seen = new Set<string>();
  const out: TimetableCandidate[] = [];
  for (const c of candidates) {
    const sig = assignmentSignature(c.placements);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(c);
  }
  return out;
}

// ── 하드 위반 계층 (절대불가 vs 교사 부하) ─────────────────────────
// tier0 = 학생/교사 동시수업·차단칸·같은 과목 하루중복·미배치·고정위반 (절대 어기면 안 됨)
// tier1 = 교사 부하 4종 (하루 상한·3연속·7교시 상한·같은과목 인접) — 강한 선호지만
//         tier0과 맞교환 불가. 최선안 선택·완화 폴백 판단이 전부 이 사전순을 쓴다.
function tierCounts(hard: ReadonlyArray<{ id: string; count: number }>): { t0: number; t1: number } {
  let t0 = 0;
  let t1 = 0;
  for (const h of hard) {
    if (TEACHER_HARD_TIER1_IDS.has(h.id)) t1 += h.count;
    else t0 += h.count;
  }
  return { t0, t1 };
}

/**
 * 후보의 (tier0, tier1). tier1은 하드 플래그가 꺼진 완화 평가에서도 참값이 필요하므로
 * metrics에서 계산하되, **cfg에서 켜진 종류만** 합산한다 — 부분 활성 구성(예: 하루 상한만
 * 하드)에서 소프트인 종류가 t1을 부풀려 "활성 제약 준수 안"이 "위반 안"에 밀리는 것 방지.
 */
function candTiers(c: TimetableCandidate | undefined, cfg: TeacherHardConfig): { t0: number; t1: number } {
  if (!c) return { t0: Number.POSITIVE_INFINITY, t1: Number.POSITIVE_INFINITY };
  const { t0 } = tierCounts(c.scoreBreakdown.hard);
  let t1 = 0;
  if (cfg.daily) t1 += c.metrics.teacherOverCap;
  if (cfg.consec) t1 += c.metrics.teacherConsecutiveTotal;
  if (cfg.last) t1 += c.metrics.teacherLastPeriodOver ?? 0;
  if (cfg.subjAdj) t1 += c.metrics.teacherSubjectAdjacent ?? 0;
  return { t0, t1 };
}

function tierBetter(a: { t0: number; t1: number }, b: { t0: number; t1: number }): boolean {
  return a.t0 < b.t0 || (a.t0 === b.t0 && a.t1 < b.t1);
}

export function runSolver(input: TimetableInput, onProgress?: ProgressCallback): TimetableRunResult {
  const startedAt = Date.now();
  const seed = input.options.randomSeed ?? (Date.now() >>> 0);

  onProgress?.({ phase: 'init', current: 0, total: 1, message: '사전 검사 중' });
  const preflight = runPreflight(input);
  if (!preflight.feasible) {
    return {
      candidates: [],
      diagnostics: emptyDiag(preflight.warnings.join(' '), Date.now() - startedAt, preflight),
    };
  }

  const graph = buildConflictGraph(input.lessons, {
    teacher: input.options.hard.teacherConflict,
    room: input.options.hard.roomConflict,
  });
  const limits = RUN_MODE_LIMITS[input.options.runMode];

  // 정적 도메인: 각 lesson의 (전체 칸 − 차단 칸)
  const cells = enumerateCells(input.grid);
  const domains = new Map<string, CellKey[]>();
  for (const l of input.lessons) {
    const blocked = new Set(l.blockedCells);
    domains.set(l.id, cells.filter((c) => !blocked.has(cellKeyStr(c))));
  }
  const pinned = new Set(input.pinned.map((p) => p.lessonId));
  const movableIds = input.lessons.filter((l) => !pinned.has(l.id)).map((l) => l.id);
  // 교사 하드 제약이 켜져 있으면 SA 무브 검사용 컨텍스트를 함께 전달 (전부 off면 레거시)
  const tcfg = teacherHardConfig(input);
  let teacherCtx: MoveTeacherCtx | undefined;
  if (tcfg.any) {
    const byTeacher = new Map<string, string[]>();
    for (const l of input.lessons) {
      if (!l.teacherId) continue;
      const arr = byTeacher.get(l.teacherId);
      if (arr) arr.push(l.id);
      else byTeacher.set(l.teacherId, [l.id]);
    }
    teacherCtx = { cfg: tcfg, days: input.grid.days, byTeacher };
  }
  const mctx: MoveContext = { movableIds, domains, teacher: teacherCtx };

  // Phase 1: CSP 초기해 (min-conflicts 국소탐색, 여러 번 재시작)
  onProgress?.({ phase: 'csp', current: 0, total: limits.cspSeeds, message: 'CSP 초기 시간표 탐색' });
  const cspDeadline = startedAt + limits.timeBudgetMs;
  // step 상한을 크게 잡아 시도당 8초 데드라인이 binding되게 한다 (kick이 충분히 작동하도록)
  const mcMaxSteps = Math.max(500000, input.lessons.length * 3000);
  const seedSolver = pickSeedSolver(input.options.strategy);
  const seeds: Placement[][] = [];
  const seedSigs = new Set<string>();
  let cspAttempts = 0;
  let bestEffort: { placements: Placement[]; conflicts: number; t0: number; t1: number } | null = null;
  while (seeds.length < limits.cspSeeds && Date.now() < cspDeadline) {
    cspAttempts++;
    const attemptDeadline = Math.min(cspDeadline, Date.now() + 8000);
    const seedRng = createRng((seed ^ (cspAttempts * 0x9e3779b1)) >>> 0);
    const sol = seedSolver(input, graph, seedRng, domains, pinned, attemptDeadline, mcMaxSteps);
    onProgress?.({
      phase: 'csp',
      current: seeds.length,
      total: limits.cspSeeds,
      message: `CSP 초기 시간표 탐색 (${seeds.length}/${limits.cspSeeds})`,
    });
    if (!sol) continue;
    if (sol.conflicts === 0) {
      const sig = assignmentSignature(sol.placements);
      if (!seedSigs.has(sig)) {
        seedSigs.add(sig);
        seeds.push(sol.placements);
      }
    } else {
      // 최선안은 사전순(tier0, tier1)으로 고른다 — 시드의 flat conflicts로 고르면
      // 학생/교사 동시수업(절대불가)이 교사 부하 위반과 1:1로 맞교환된 안이 선택된다.
      const { score } = evaluateFull(sol.placements, { input, graph });
      const { t0, t1 } = tierCounts(score.hard);
      if (!bestEffort || t0 < bestEffort.t0 || (t0 === bestEffort.t0 && t1 < bestEffort.t1)) {
        bestEffort = { placements: sol.placements, conflicts: sol.conflicts, t0, t1 };
      }
    }
  }
  onProgress?.({ phase: 'csp', current: limits.cspSeeds, total: limits.cspSeeds });

  if (seeds.length === 0) {
    // 무충돌 해 실패 — 최선안(잔여 충돌)이라도 후보로 제시해 사용자가 원인을 파악·조정하게 함
    if (bestEffort) {
      const { score, metrics } = evaluateFull(bestEffort.placements, { input, graph });
      return {
        candidates: [
          {
            id: 'cand-besteffort',
            grades: [...input.grades],
            placements: bestEffort.placements,
            scoreBreakdown: score,
            metrics,
            createdAt: new Date().toISOString(),
          },
        ],
        diagnostics: {
          ...emptyDiag(
            `완전한 무충돌 시간표를 찾지 못했습니다 — 최선안에 기본 충돌(학생/교사 동시 수업 등) ${bestEffort.t0}건, 교사 부하 위반 ${bestEffort.t1}건이 남았습니다. 수강 신청 구조상 무충돌 배치에 필요한 교시 수가 현재 가용 칸보다 많거나, 교사 부하 제약(하루 최대·3연속 금지·7교시 상한·같은 과목 연속 금지)이 빡빡할 수 있습니다. 공강(배치 금지 칸)을 줄여 가용 칸을 늘리는 것이 가장 효과적이고, 그래도 부족하면 특정 교사의 분반·시수를 조정해 주세요 — 학생마다 빈 교시가 생기는 것은 정상이며, 복잡한 선택과목 편성은 모든 학생을 빈틈없이 채우는 것이 구조적으로 불가능할 수 있습니다.`,
            Date.now() - startedAt,
            preflight,
          ),
          csp: { seedsAttempted: cspAttempts, feasibleSeeds: 0, selectedSeeds: 0 },
        },
      };
    }
    return {
      candidates: [],
      diagnostics: {
        ...emptyDiag(
          'Min-conflicts로 초기 시간표를 만들지 못했습니다. 배치 가능한 칸이 없는 수업(차단 과다)이 있는지 확인해 주세요.',
          Date.now() - startedAt,
          preflight,
        ),
        csp: { seedsAttempted: cspAttempts, feasibleSeeds: 0, selectedSeeds: 0 },
      },
    };
  }

  // Phase 2: 시드별 SA
  const perSeedTime = Math.max(1000, Math.floor(limits.timeBudgetMs / seeds.length));
  const totalBudgetEnd = startedAt + limits.timeBudgetMs * 2;
  const candidates: TimetableCandidate[] = [];
  let totalIter = 0;
  let totalAccepted = 0;

  for (let i = 0; i < seeds.length; i++) {
    const remaining = Math.max(500, totalBudgetEnd - Date.now());
    const budget = Math.min(perSeedTime, remaining);
    if (budget < 500) break;
    const seedRng = createRng((seed ^ ((i + 1) * 0x9e3779b1)) >>> 0);
    const sa = runSimulatedAnnealing(
      seeds[i],
      input,
      graph,
      seedRng,
      {
        Tstart: SA_CONFIG.Tstart,
        Tend: SA_CONFIG.Tend,
        alpha: SA_CONFIG.alpha,
        maxIter: limits.saMaxIter,
        timeBudgetMs: budget,
      },
      mctx,
      (iter, total) => {
        onProgress?.({
          phase: 'sa',
          current: i * limits.saMaxIter + iter,
          total: seeds.length * limits.saMaxIter,
          message: `시드 ${i + 1}/${seeds.length} 최적화 (${iter}/${total})`,
        });
      },
    );
    totalIter += sa.stats.iterations;
    totalAccepted += sa.stats.acceptedMoves;

    // 교사 부하 재배치 (0충돌 보존 Kempe 후처리). 슬랙0에서 SA가 못 움직이는 보드를
    // Kempe 무브로 개선한다. 전체 soft가 줄 때만 수용하므로 품질이 나빠지지 않는다.
    let placements = sa.best;
    let { score, metrics } = evaluateFull(placements, { input, graph });
    const rebRng = createRng((seed ^ ((i + 1) * 0x85ebca6b)) >>> 0);
    const rebalanced = rebalanceTeacherLoad(sa.best, input, graph, rebRng, Math.min(4000, perSeedTime));
    if (rebalanced !== sa.best) {
      const re = evaluateFull(rebalanced, { input, graph });
      const hardBefore = score.hard.reduce((a, h) => a + h.count, 0);
      const hardAfter = re.score.hard.reduce((a, h) => a + h.count, 0);
      // 안전장치: 하드충돌이 늘지 않고 총점이 개선될 때만 채택 (0충돌 절대 보존)
      if (hardAfter <= hardBefore && re.score.total <= score.total) {
        placements = rebalanced;
        score = re.score;
        metrics = re.metrics;
      }
    }
    candidates.push({
      id: `cand-${i + 1}`,
      grades: [...input.grades],
      placements,
      scoreBreakdown: score,
      metrics,
      createdAt: new Date().toISOString(),
    });
  }

  // Phase 3: TOP-K 정리
  onProgress?.({ phase: 'finalize', current: 0, total: 1, message: '후보 정리 중' });
  candidates.sort((a, b) => a.scoreBreakdown.total - b.scoreBreakdown.total);
  const feasible = candidates.filter((c) => c.metrics.hardFeasible);
  const pool = feasible.length > 0 ? feasible : candidates;
  const top = dedupeBySignature(pool).slice(0, ELITE_ARCHIVE_SIZE);

  const diagnostics: SolverDiagnostics = {
    elapsedMs: Date.now() - startedAt,
    csp: {
      seedsAttempted: cspAttempts,
      feasibleSeeds: seeds.length,
      selectedSeeds: seeds.length,
    },
    sa: { iterations: totalIter, acceptedMoves: totalAccepted },
    preflight,
    reason:
      top.length === 0
        ? '하드 제약을 모두 만족하는 시간표를 찾지 못했습니다. 제약을 완화해 주세요.'
        : feasible.length === 0
          ? '하드 위반이 남아 있습니다 (최선 후보 표시).'
          : undefined,
  };

  onProgress?.({ phase: 'finalize', current: 1, total: 1 });
  return { candidates: top, diagnostics };
}

/**
 * placements 기준 sectioning을 적용해 선택과목 lesson의 studentCodes(로스터)를 재배정한 새 input.
 * lesson ID는 불변(placements 호환). 재배정 대상(선택과목)이 없으면 null.
 */
function sectionInput(input: TimetableInput, placements: Placement[], sec?: ReturnType<typeof sectionStudents>): TimetableInput | null {
  try {
    const result = sec ?? sectionStudents(input.lessons, placements);
    const lessons = lessonsWithSectioning(input.lessons, result);
    const changed = lessons.some((l, i) => {
      if (!l.isElective) return false;
      const prev = input.lessons[i].studentCodes;
      if (prev.length !== l.studentCodes.length) return true;
      const a = [...prev].sort().join('\0');
      const b = [...l.studentCodes].sort().join('\0');
      return a !== b;
    });
    return changed ? { ...input, lessons } : null;
  } catch {
    return null;
  }
}

function attachSectioning(
  result: TimetableRunResult,
  originalLessons: Lesson[],
  finalInput: TimetableInput,
  attempts: SectioningAttemptReport[],
): TimetableRunResult {
  const best = result.candidates[0];
  if (!best) return result;
  const sectioning: SectioningDiagnostics = {
    attempts,
    final: buildSectioningFinalReport(originalLessons, finalInput.lessons, best.placements),
  };
  return { ...result, diagnostics: { ...result.diagnostics, sectioning } };
}

/**
 * solve → (하드 위반 남으면) sectioning → re-solve.
 *
 * 1차 솔브가 하드 위반을 남기면(특히 enrollment의 분반 고정에서 비롯된 학생충돌 — 배치로는 해소
 * 불가, exact MILP로 증명됨), 그 배치를 기준으로 학생을 재분반(sectioning)한 뒤 새 인스턴스에서
 * 다시 푼다. 학생충돌이 제거돼 인스턴스가 feasible해지면 솔버가 0충돌(교사충돌 포함)을 찾는다.
 * 검증(run-bruteforce-compare): 통합 814 lessons, baseline 9(학생7+교차교사2) → sectioning →
 * 재솔브 → 0. 재수리(LNS)가 아니라 재탐색이 핵심.
 *
 * 반환 finalInput = 최종 채택 결과가 평가된 (재분반 반영) 입력 — 순차 분해가 학년별
 * 재분반 로스터를 합산할 때 필요하다. (export는 회귀 테스트 직접 호출용)
 */
export function solveWithSectioning(
  input: TimetableInput,
  onProgress: ProgressCallback | undefined,
  maxRounds: number,
  attemptLabel = '초기 솔브',
): { result: TimetableRunResult; finalInput: TimetableInput; sectioning: SectioningAttemptReport } {
  let result = runSolver(input, onProgress);
  let cur = input;
  const cfg = teacherHardConfig(input);
  const rounds: SectioningAttemptReport['rounds'] = [];
  let applied = false;
  for (let round = 0; round < maxRounds; round++) {
    const best = result.candidates[0];
    if (!best) break;
    const tiers = candTiers(best, cfg);
    if (tiers.t0 === 0 && tiers.t1 === 0) break;
    const sec = sectionStudents(cur.lessons, best.placements);
    const sectioned = sectionInput(cur, best.placements, sec);
    if (!sectioned) break;
    applied = true;
    const r2 = runSolver(sectioned, onProgress);
    const tiers2 = candTiers(r2.candidates[0], cfg);
    const accepted = tierBetter(tiers2, tiers);
    rounds.push(roundFromSectioning(round + 1, tiers.t0, tiers.t1, tiers2.t0, tiers2.t1, accepted, sec));
    if (accepted) {
      result = r2;
      cur = sectioned;
      if (tiers2.t0 === 0 && tiers2.t1 === 0) break;
    } else break;
  }
  return {
    result,
    finalInput: cur,
    sectioning: { label: attemptLabel, applied, rounds },
  };
}

/** 교사 부하 4종 하드 플래그만 끈 입력 (소프트 가중치·rebalance가 부하를 최소화) */
function relaxTeacherHard(input: TimetableInput): TimetableInput {
  return {
    ...input,
    options: {
      ...input.options,
      hard: {
        ...input.options.hard,
        teacherDailyCap: false,
        teacherConsecutive: false,
        teacherLastPeriodCap: false,
        teacherSubjectConsecutive: false,
      },
    },
  };
}

/**
 * 학년 순차 분해 실행: 어려운 학년부터 풀고 교차 교사 수업을 팬텀 pinned로 이월.
 * 전 학년 성공 시 합집합은 구성상 전역 실현가능. 일부 학년이 예산 내 실패하면
 * 그 최선안까지 합친 근사해를 **통합 웜스타트 수리**(전 lesson 자유)로 다듬는다 —
 * 순차 고정이 만든 앞 학년의 교사 용량 선점을 여기서 되돌릴 수 있다.
 * 하드 전부 만족 시 SA 소프트 폴리시까지 수행. 후보조차 없을 때만 null.
 * (export는 회귀 테스트 직접 호출용 — 프로덕션 진입점은 runSolverPipeline)
 */
export function trySequentialByGrade(
  input: TimetableInput,
  onProgress: ProgressCallback | undefined,
  maxRounds: number,
): TimetableRunResult | null {
  const order = orderGradesByDifficulty(input);
  const byId = new Map(input.lessons.map((l) => [l.id, l]));
  const accPlacements: Placement[] = [];
  const accLessons: Lesson[] = [];
  let attempts = 0;
  let iters = 0;
  let accepted = 0;
  let feasibleGrades = 0;
  let allFeasible = true;
  const baseSeed = (input.options.randomSeed ?? 7) >>> 0;
  const seqCfg = teacherHardConfig(input);
  for (const g of order) {
    // 학년 부분문제는 시드 의존 확률 문제(임계점 다중 재시작)라, 실패 시 다른 시드로
    // 1회 재시도한다 — 성공하면 합집합이 구성상 정확해가 되어 통합 수리가 불필요해진다.
    let bestOfGrade: TimetableCandidate | null = null;
    let bestFinalInput: TimetableInput | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      onProgress?.({
        phase: 'csp', current: 0, total: 1,
        message: `학년 순차 배치 — ${g}학년 (교차 교사 제약 이월${attempt > 0 ? ', 재시도' : ''})`,
      });
      const sub0 = buildGradeSubInput(input, g, accPlacements, byId);
      const sub = attempt === 0
        ? sub0
        : { ...sub0, options: { ...sub0.options, randomSeed: ((baseSeed + 0x9e37 * attempt + g * 131) >>> 0) } };
      const { result, finalInput } = solveWithSectioning(sub, onProgress, maxRounds, `${g}학년 솔브`);
      attempts += result.diagnostics.csp.seedsAttempted;
      iters += result.diagnostics.sa.iterations;
      accepted += result.diagnostics.sa.acceptedMoves;
      const best = result.candidates[0];
      if (best && (!bestOfGrade || tierBetter(candTiers(best, seqCfg), candTiers(bestOfGrade, seqCfg)))) {
        bestOfGrade = best;
        bestFinalInput = finalInput;
      }
      if (best?.metrics.hardFeasible) break;
    }
    if (!bestOfGrade || !bestFinalInput) return null; // 최선안조차 없음 — 포기
    if (bestOfGrade.metrics.hardFeasible) feasibleGrades++;
    else allFeasible = false; // 실패 학년도 최선안으로 이어가고, 마지막에 통합 수리
    const real = bestFinalInput.lessons.filter((l) => !isPhantomLessonId(l.id));
    accLessons.push(...real);
    const realIds = new Set(real.map((l) => l.id));
    for (const p of bestOfGrade.placements) if (realIds.has(p.lessonId)) accPlacements.push(p);
  }

  let curInput: TimetableInput = { ...input, lessons: accLessons };
  let curGraph = buildConflictGraph(curInput.lessons, {
    teacher: curInput.options.hard.teacherConflict,
    room: curInput.options.hard.roomConflict,
  });
  const cells = enumerateCells(curInput.grid);
  const domains = new Map<string, CellKey[]>();
  for (const l of curInput.lessons) {
    const blocked = new Set(l.blockedCells);
    domains.set(l.id, cells.filter((c) => !blocked.has(cellKeyStr(c))));
  }
  const pinnedSet = new Set(curInput.pinned.map((p) => p.lessonId));
  const limits = RUN_MODE_LIMITS[curInput.options.runMode];
  const seed = (curInput.options.randomSeed ?? 7) >>> 0;
  let placements = accPlacements;

  if (!allFeasible) {
    // 통합 웜스타트 수리: 잔여 충돌은 교차 교사 주변에 국소화되어 있고, 여기서는
    // (순차 고정과 달리) 모든 학년의 lesson이 자유라 앞 학년의 선점도 되돌릴 수 있다.
    // maxSteps는 사실상 무한 — 데드라인이 바인딩되게 한다(2.4M 스텝 ≈ 15s에 조기 소진 방지).
    onProgress?.({ phase: 'csp', current: 0, total: 1, message: '학년 순차 근사해 통합 수리 (웜스타트)' });
    const budget = Math.min(90_000, Math.round(limits.timeBudgetMs * 1.5));
    const REPAIR_STEPS = 100_000_000;
    let repaired = enhancedLocalSeed(
      curInput,
      curGraph,
      createRng((seed ^ 0x9e3779b9) >>> 0),
      domains,
      pinnedSet,
      Date.now() + budget,
      REPAIR_STEPS,
      accPlacements,
    );
    if (repaired) placements = repaired.placements;
    // 잔여가 남으면 재분반(sectioning) 라운드 후 웜스타트 재수리 — "solve→section→re-solve"
    // 승리 패턴의 웜스타트판. 잔여 학생충돌은 enrollment 분반 고정에서 오는 경우가 많다.
    if (repaired && repaired.conflicts > 0) {
      const sectioned = sectionInput(curInput, placements);
      if (sectioned) {
        curInput = sectioned; // 로스터만 교체 — blockedCells 불변이라 domains 재사용 가능
        curGraph = buildConflictGraph(curInput.lessons, {
          teacher: curInput.options.hard.teacherConflict,
          room: curInput.options.hard.roomConflict,
        });
        onProgress?.({ phase: 'csp', current: 0, total: 1, message: '재분반 후 통합 재수리' });
        const r2 = enhancedLocalSeed(
          curInput,
          curGraph,
          createRng((seed ^ 0x517cc1b7) >>> 0),
          domains,
          pinnedSet,
          Date.now() + budget,
          REPAIR_STEPS,
          placements,
        );
        if (r2) {
          repaired = r2;
          placements = r2.placements;
        }
      }
    }
    if (!repaired) return null;
  }

  // 하드 전부 만족이면 SA로 소프트(공강·분산 등)를 다듬는다 (무브가 하드 보존).
  let evaluated = evaluateFull(placements, { input: curInput, graph: curGraph });
  if (evaluated.score.hard.reduce((s, h) => s + h.count, 0) === 0) {
    const tcfg2 = teacherHardConfig(curInput);
    let teacherCtx: MoveTeacherCtx | undefined;
    if (tcfg2.any) {
      const byTeacher = new Map<string, string[]>();
      for (const l of curInput.lessons) {
        if (!l.teacherId) continue;
        const arr = byTeacher.get(l.teacherId);
        if (arr) arr.push(l.id);
        else byTeacher.set(l.teacherId, [l.id]);
      }
      teacherCtx = { cfg: tcfg2, days: curInput.grid.days, byTeacher };
    }
    const movableIds = curInput.lessons.filter((l) => !pinnedSet.has(l.id)).map((l) => l.id);
    const sa = runSimulatedAnnealing(
      placements,
      curInput,
      curGraph,
      createRng((seed ^ 0x85ebca6b) >>> 0),
      {
        Tstart: SA_CONFIG.Tstart,
        Tend: SA_CONFIG.Tend,
        alpha: SA_CONFIG.alpha,
        maxIter: limits.saMaxIter,
        timeBudgetMs: Math.min(20_000, limits.timeBudgetMs),
      },
      { movableIds, domains, teacher: teacherCtx },
    );
    iters += sa.stats.iterations;
    accepted += sa.stats.acceptedMoves;
    placements = sa.best;
    evaluated = evaluateFull(placements, { input: curInput, graph: curGraph });
  }

  return {
    candidates: [
      {
        id: 'cand-seq',
        grades: [...input.grades],
        placements,
        scoreBreakdown: evaluated.score,
        metrics: evaluated.metrics,
        createdAt: new Date().toISOString(),
      },
    ],
    diagnostics: {
      elapsedMs: 0,
      csp: { seedsAttempted: attempts, feasibleSeeds: feasibleGrades, selectedSeeds: input.grades.length },
      sa: { iterations: iters, acceptedMoves: accepted },
    },
  };
}

/**
 * 승리 파이프라인 (계층적):
 *   1) 통합 solve→section→re-solve — 하드 전부(교사 부하 4종 포함) 만족이면 즉시 반환.
 *   2) 완화 + 조이기(relax-then-tighten) — 교사 부하 4종을 잠시 소프트로 낮춰
 *      **절대불가 충돌(학생/교사 동시 수업 등) 0을 먼저 보장**하고(검증된 완화 경로),
 *      그 0충돌 보드에서 부하 위반을 0충돌-보존 Kempe 하강(tightenTeacherHard)으로
 *      직접 깎는다. 완화 솔브는 확률적이라 **다중 시드 재시도**로 tier0=0 확보율을
 *      높인다 (1회 실패 시 조이기가 통째로 건너뛰어져 부하 수백 건의 원시 완화 해가
 *      반환되던 파국 방지 — 실측: 표준 모드 기본 7+부하 242).
 *   3) 'exact'(최정밀) 모드 한정 — Stage B: LNS+MILP 정확 수리(교사 4종 슬랙 최소화)
 *      × Kempe 조이기 포트폴리오 교대, Stage C: 전체 인스턴스 MILP(0위반 증명 또는
 *      최소 위반 최적성 증명). 잔여 위반이 남으면 교사별 구조적 불가능 진단
 *      (diagnoseTeacherFeasibility)으로 원인 인증서를 발급한다.
 * 후보 비교는 항상 사전순 (기본충돌 tier0 ≫ 교사부하 tier1).
 * (학년 순차 분해 trySequentialByGrade는 t0>0 잔여가 남아 사전순에서 항상 완화+조이기에
 *  밀리는 것이 실측 확인되어 파이프라인에서 제외 — 모듈은 연구·회귀용으로 유지.)
 */
export function runSolverPipeline(
  input: TimetableInput,
  onProgress?: ProgressCallback,
  maxRounds = 2,
  initial?: Placement[],
): TimetableRunResult {
  if (input.options.strategy === 'coordinated') return runCoordinatedSolver(input, onProgress, initial).result;
  const startedAt = Date.now();
  const first = solveWithSectioning(input, onProgress, maxRounds, '초기 솔브');
  const sectioningAttempts: SectioningAttemptReport[] = [first.sectioning];
  const tcfg = teacherHardConfig(input);
  if (!tcfg.any) {
    return attachSectioning(first.result, input.lessons, first.finalInput, sectioningAttempts);
  }

  const bestResult = first.result;
  const bestTiers = candTiers(bestResult.candidates[0], tcfg);
  if (bestTiers.t0 === 0 && bestTiers.t1 === 0) {
    return attachSectioning(bestResult, input.lessons, first.finalInput, sectioningAttempts);
  }

  // 2) 완화 + 조이기 — 절대불가 충돌 0 최우선. 완화 솔브는 시드 운에 따라 tier0>0으로
  //    실패할 수 있으므로 시드를 바꿔 재시도한다 (tier0=0 발견 즉시 다음 단계).
  const isExact = input.options.runMode === 'exact';
  const relaxAttempts = Math.max(
    1,
    isExact ? EXACT_BUDGET.relaxAttempts : input.options.runMode === 'thorough' ? 3 : 2,
  );
  const baseSeed = (input.options.randomSeed ?? 7) >>> 0;
  let relaxed: { result: TimetableRunResult; finalInput: TimetableInput; sectioning: SectioningAttemptReport } | null = null;
  for (let a = 0; a < relaxAttempts; a++) {
    onProgress?.({
      phase: 'csp',
      current: a,
      total: relaxAttempts,
      message: `교사 부하 제약 완화 솔브 ${a + 1}/${relaxAttempts} (기본 충돌 0 우선)`,
    });
    const rIn = relaxTeacherHard(input);
    const attempt = solveWithSectioning(
      a === 0 ? rIn : { ...rIn, options: { ...rIn.options, randomSeed: (baseSeed ^ ((0x9e3779b9 * a) >>> 0)) >>> 0 } },
      onProgress,
      maxRounds,
      `완화 솔브 ${a + 1}`,
    );
    sectioningAttempts.push(attempt.sectioning);
    if (
      !relaxed ||
      tierBetter(candTiers(attempt.result.candidates[0], tcfg), candTiers(relaxed.result.candidates[0], tcfg))
    ) {
      relaxed = attempt;
    }
    if (relaxed.result.candidates[0]?.metrics.hardFeasible) break;
  }
  if (!relaxed) {
    return attachSectioning(bestResult, input.lessons, first.finalInput, sectioningAttempts);
  }

  const rBest = relaxed.result.candidates[0];
  let rGraph = buildConflictGraph(relaxed.finalInput.lessons, {
    teacher: relaxed.finalInput.options.hard.teacherConflict,
    room: relaxed.finalInput.options.hard.roomConflict,
  });
  // 교사 부하 위반 수 — placements+교사/과목만 쓰므로(명단 무관) 로스터 교체와 무관하게 유효
  const byIdT = new Map(relaxed.finalInput.lessons.map((l) => [l.id, l]));
  const violCount = (pl: Placement[]): number => {
    const placed: TeacherPlacedLesson[] = [];
    for (const p of pl) {
      const l = byIdT.get(p.lessonId);
      if (!l?.teacherId) continue;
      placed.push({ lessonId: p.lessonId, teacherId: l.teacherId, subjectName: l.subjectName, offeringId: l.offeringId, dayIndex: p.dayIndex, period: p.period });
    }
    return collectTeacherViolations(tcfg, relaxed!.finalInput.grid.days, placed).violations;
  };
  // 분반 교체(rosters) 반영 입력 생성 (조이기·exact 스테이지 공용)
  const withRosters = (base: TimetableInput, rosters: Map<string, string[]>): TimetableInput => ({
    ...base,
    lessons: base.lessons.map((l) => {
      const roster = rosters.get(l.offeringId);
      return roster ? { ...l, studentCodes: roster, studentCount: roster.length } : l;
    }),
  });
  const certs: InfeasibilityCertificate[] = [];

  if (rBest?.metrics.hardFeasible) {
    onProgress?.({ phase: 'csp', current: 0, total: 1, message: '교사 부하 조이기 (0충돌 보존 Kempe + 분반 교체)' });
    // 조이기는 실행 간 분산이 크므로(잔여 19~31 실측) 다른 시드로 2회 재시작해 최선 채택.
    const totalBudget = Math.min(120_000, RUN_MODE_LIMITS[input.options.runMode].timeBudgetMs * 2);
    const TIGHTEN_TRIES = 2;
    let tightened: TightenResult = { placements: rBest.placements, rosters: null };
    let bestViol = violCount(rBest.placements);
    for (let a = 0; a < TIGHTEN_TRIES && bestViol > 0; a++) {
      const r = tightenTeacherHard(
        rBest.placements,
        relaxed.finalInput,
        tcfg, // 원 입력 기준 하드 4종 의미론
        rGraph,
        createRng((baseSeed ^ ((0xc2b2ae35 + a * 0x9e3779b9) >>> 0)) >>> 0),
        Math.round(totalBudget / TIGHTEN_TRIES),
      );
      const v = violCount(r.placements);
      if (v < bestViol) {
        bestViol = v;
        tightened = r;
      }
    }
    if (tightened.rosters || tightened.placements !== rBest.placements) {
      // 분반 교체가 있었으면 갱신 명단을 입력에 반영 (학생 간선이 달라지므로 그래프 재구축)
      let tightInput = relaxed.finalInput;
      let tightGraph = rGraph;
      if (tightened.rosters) {
        tightInput = withRosters(relaxed.finalInput, tightened.rosters);
        tightGraph = buildConflictGraph(tightInput.lessons, {
          teacher: tightInput.options.hard.teacherConflict,
          room: tightInput.options.hard.roomConflict,
        });
      }
      const re = evaluateFull(tightened.placements, { input: tightInput, graph: tightGraph });
      const cand2: TimetableCandidate = { ...rBest, placements: tightened.placements, scoreBreakdown: re.score, metrics: re.metrics };
      // 사전순으로 나빠지지 않으면 교체 (tier 개선이 목적 — soft는 부차)
      if (!tierBetter(candTiers(rBest, tcfg), candTiers(cand2, tcfg))) {
        relaxed.result.candidates[0] = cand2;
        if (tightened.rosters) {
          // 명단이 바뀌면 tail 후보(구 명단 기준 배치)는 의미 비교가 불가 — 조이기 후보만
          // 유지하고, 이후 strict 재평가·저장이 갱신 명단 기준이 되도록 입력을 교체한다.
          relaxed.result.candidates = [cand2];
          relaxed.finalInput = tightInput;
          rGraph = tightGraph;
        }
      }
    }

    // ── 3) exact 전용 Stage B/C: LNS+MILP 정확 수리 포트폴리오 → 전체 MILP 증명 ──
    if (isExact && violCount(relaxed.result.candidates[0]!.placements) > 0) {
      let curPl = relaxed.result.candidates[0]!.placements;
      let curViol = violCount(curPl);
      // 도메인은 blockedCells만의 함수 — 로스터 교체와 무관해 재사용 가능
      const cells = enumerateCells(relaxed.finalInput.grid);
      const domains = new Map<string, CellKey[]>();
      for (const l of relaxed.finalInput.lessons) {
        const blocked = new Set(l.blockedCells);
        domains.set(l.id, cells.filter((c) => !blocked.has(cellKeyStr(c))));
      }
      const pinnedSet = new Set(relaxed.finalInput.pinned.map((p) => p.lessonId));
      // 수용 게이트: 기본충돌(tier0) 0 보존 + 위반 감소 (독립 재계산)
      const tier0Of = (pl: Placement[]): number => {
        const { score } = evaluateFull(pl, { input: relaxed!.finalInput, graph: rGraph });
        return tierCounts(score.hard).t0;
      };

      const repairDeadline = Date.now() + EXACT_BUDGET.repairMs;
      let round = 0;
      let staleRounds = 0;
      while (curViol > 0 && Date.now() < repairDeadline && staleRounds < 2) {
        round++;
        const violBefore = curViol;
        onProgress?.({
          phase: 'csp',
          current: round,
          total: round,
          message: `MILP 정확 수리 라운드 ${round} — 잔여 교사 부하 위반 ${curViol}건`,
        });
        // (a) LNS + exact 부분 재풀이 (교사 4종 슬랙 최소화)
        const lnsEnd = Math.min(repairDeadline, Date.now() + EXACT_BUDGET.repairRoundMs);
        const lns = lnsTeacherRepair(relaxed.finalInput, tcfg, rGraph, domains, pinnedSet, curPl, lnsEnd, {
          seed: (baseSeed ^ ((round * 0x51ed270b) >>> 0)) >>> 0,
        });
        if (lns.violations < curViol && lns.baseConflicts === 0 && tier0Of(lns.placements) === 0) {
          curPl = lns.placements;
          curViol = lns.violations;
        }
        if (curViol === 0 || Date.now() >= repairDeadline) break;
        // (b) Kempe 조이기 교대 (분반 교체 포함) — 다른 지역최소 경로
        const kem = tightenTeacherHard(
          curPl,
          relaxed.finalInput,
          tcfg,
          rGraph,
          createRng((baseSeed ^ ((round * 0x9e3779b9) >>> 0) ^ 0x7f4a7c15) >>> 0),
          Math.min(EXACT_BUDGET.repairRoundMs, Math.max(1000, repairDeadline - Date.now())),
        );
        const kv = violCount(kem.placements);
        if (kv < curViol) {
          const kInput = kem.rosters ? withRosters(relaxed.finalInput, kem.rosters) : relaxed.finalInput;
          const kGraph = kem.rosters
            ? buildConflictGraph(kInput.lessons, {
                teacher: kInput.options.hard.teacherConflict,
                room: kInput.options.hard.roomConflict,
              })
            : rGraph;
          const { score } = evaluateFull(kem.placements, { input: kInput, graph: kGraph });
          if (tierCounts(score.hard).t0 === 0) {
            curPl = kem.placements;
            curViol = kv;
            if (kem.rosters) {
              relaxed.finalInput = kInput;
              rGraph = kGraph;
              relaxed.result.candidates = [relaxed.result.candidates[0]!]; // 구 명단 tail 제거
            }
          }
        }
        if (curViol >= violBefore) staleRounds++;
        else staleRounds = 0;
      }

      // Stage C: 전체 인스턴스 MILP — 0위반 발견 또는 "현 분반 구성 기준 최솟값" 최적성 증명
      if (curViol > 0 && Date.now() < repairDeadline + EXACT_BUDGET.fullMilpMs) {
        onProgress?.({
          phase: 'csp',
          current: 0,
          total: 1,
          message: `전체 MILP 증명 시도 — 잔여 부하 위반 ${curViol}건 (최대 ${Math.round(EXACT_BUDGET.fullMilpMs / 60000)}분)`,
        });
        const out: MilpOut = {};
        const full = cpSatFull(relaxed.finalInput, rGraph, domains, Date.now() + EXACT_BUDGET.fullMilpMs, {
          symmetry: true,
          teacher: { cfg: tcfg, soft: true },
          out,
        });
        if (full) {
          const fv = violCount(full.placements);
          if (fv < curViol && tier0Of(full.placements) === 0) {
            curPl = full.placements;
            curViol = fv;
          }
        }
        if (out.status === 'Optimal' && (out.objective ?? 0) > 0.5) {
          certs.push({
            teacherId: null,
            teacherName: null,
            kind: 'global',
            reason: `현재 분반 구성 기준, 교사 부하 위반의 수학적 최솟값은 ${Math.round(out.objective!)}건입니다 (MILP 최적성 증명) — 0위반은 분반 구성 변경 또는 제약 완화 없이 불가능합니다.`,
          });
        }
      }

      if (curPl !== relaxed.result.candidates[0]!.placements) {
        const re2 = evaluateFull(curPl, { input: relaxed.finalInput, graph: rGraph });
        relaxed.result.candidates[0] = {
          ...relaxed.result.candidates[0]!,
          placements: curPl,
          scoreBreakdown: re2.score,
          metrics: re2.metrics,
        };
      }
    }
  }
  // 모든 완화 후보를 **원 입력(하드 플래그) 의미론으로 재평가** — 완화 평가의 거짓
  // "hardFeasible=true·teacher hard=0" 라벨이 UI 칩/경고 배너와 저장본(timetable_plan)에
  // 새는 것을 차단한다 (리뷰 확정: 미조정 tail 후보가 '제약 충족'으로 무경고 확정 가능하던 결함).
  const strictInput: TimetableInput = {
    ...relaxed.finalInput,
    options: { ...relaxed.finalInput.options, hard: input.options.hard },
  };
  relaxed.result.candidates = relaxed.result.candidates.map((c) => {
    const re = evaluateFull(c.placements, { input: strictInput, graph: rGraph });
    return { ...c, scoreBreakdown: re.score, metrics: re.metrics };
  });
  // 사전순(+동률 시 soft) 재정렬 — 조이기된 안이 항상 '안 1'이 되게
  relaxed.result.candidates.sort((a, b) => {
    const ta = candTiers(a, tcfg);
    const tb = candTiers(b, tcfg);
    if (ta.t0 !== tb.t0) return ta.t0 - tb.t0;
    if (ta.t1 !== tb.t1) return ta.t1 - tb.t1;
    const d = a.scoreBreakdown.total - b.scoreBreakdown.total;
    return Number.isNaN(d) ? 0 : d;
  });
  const rTiers = candTiers(relaxed.result.candidates[0], tcfg);

  // exact 모드에서 위반이 남으면 구조적 원인 진단 (교사별 폐형 하한 + 단독 exact 증명)
  if (isExact && (rTiers.t0 > 0 || rTiers.t1 > 0)) {
    onProgress?.({ phase: 'finalize', current: 0, total: 1, message: '구조적 불가능 진단 (교사별 exact 체크)' });
    try {
      certs.push(...diagnoseTeacherFeasibility(strictInput, { deadlineMs: Date.now() + 60_000 }));
    } catch {
      /* 진단 실패는 결과에 영향 없음 */
    }
  }

  // 동률이면 완화 결과(조이기·재분반·정직 라벨 반영)를 선호 — strict 비교로 1차 결과가
  // 남는 비일관 방지
  if (relaxed.result.candidates.length > 0 && !tierBetter(bestTiers, rTiers)) {
    const certNote = certs.length > 0 ? ` 구조적 원인 진단 ${certs.length}건이 검출되었습니다 — 상세 진단을 확인해 주세요.` : '';
    const reason =
      rTiers.t0 === 0
        ? rTiers.t1 === 0
          ? undefined // 완화+조이기로 하드 4종까지 전부 만족 — 사유 표시 불필요
          : `교사 부하 하드 제약(하루 최대·3연속 금지·7교시 상한·같은 과목 연속 금지)을 시간 예산 내에 전부 만족하지 못해, 기본 충돌(학생/교사 동시 수업 등) 0을 우선 보장한 뒤 부하 위반을 최소화했습니다 — 잔여 부하 위반 ${rTiers.t1}건.${isExact ? '' : " '최정밀' 실행 모드로 다시 생성하면 MILP 정확 수리로 더 줄어들거나 0이 될 수 있습니다."}${certNote}`
        : `기본 충돌 ${rTiers.t0}건 + 교사 부하 위반 ${rTiers.t1}건이 남았습니다. 공강(배치 금지 칸)을 줄이거나 분반·시수를 조정해 주세요.${certNote}`;
    return attachSectioning(
      {
        ...relaxed.result,
        diagnostics: {
          ...relaxed.result.diagnostics,
          reason,
          elapsedMs: Date.now() - startedAt,
          ...(certs.length > 0 ? { infeasibility: certs } : {}),
        },
      },
      input.lessons,
      relaxed.finalInput,
      sectioningAttempts,
    );
  }
  const out = certs.length > 0
    ? { ...bestResult, diagnostics: { ...bestResult.diagnostics, infeasibility: certs } }
    : bestResult;
  return attachSectioning(out, input.lessons, first.finalInput, sectioningAttempts);
}
