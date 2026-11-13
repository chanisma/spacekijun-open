// HiGHS(WASM) 기반 ILP seed 솔버. min-conflicts가 plateau에 갇혀 0 충돌을 "증명"하지
// 못하는 빡빡한(여유색≈0) 인스턴스에서, MILP 솔버는 (a) 실현가능하면 0 충돌 해를
// 정확히 찾아 증명하고 (b) 시간 내 못 풀면 min-conflicts 최선해로 안전 폴백한다.
//
// 설계 요지
//  - 변수: 각 Lesson l과 그 도메인 칸 c마다 binary x[l][c]. lessonId가 한글을 포함하므로
//    이름은 lessonId 문자열이 아니라 "정수 인덱스"로 만든다(이름 충돌 방지 — 한글을
//    sanitize하면 서로 다른 과목이 같은 변수명으로 뭉쳐 가짜 infeasible이 난다).
//  - 배치: 비고정 lesson마다 sum_c x[l][c] = 1. 고정(pinned)은 해당 칸 = 1로 못박는다.
//  - 충돌: 충돌그래프는 (학생/교사) 클리크의 합집합이다. 쌍별 간선(x[a][c]+x[b][c]≤1)
//    대신 클리크별 "한 칸에 ≤1"(sum_{l∈clique} x[l][c] ≤ 1) 제약을 쓴다 — 이는 동일
//    의미면서 LP 완화가 훨씬 타이트해 HiGHS의 clique-cut과 맞물려 분기를 급감시킨다.
//  - 하루 한도(subjectDailyCap): offering별·요일별 sum x ≤ maxPerSubjectPerDay.
//  - 목적: feasibility(비용 0). 데드라인 안에 완전 해를 못 디코딩하면 min-conflicts로 폴백.
//
// 브라우저/Web Worker: HiGHS는 외부 .wasm을 fetch하므로 워커에서 `initCpSatSolver`로
// 한 번 비동기 로드해 둔다(SeedFn 시그니처는 동기라 사전 로드가 필수). 로드 전 호출되면
// 그 호출은 min-conflicts로 폴백한다(절대 throw하지 않음).

import type { Lesson, Placement, TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import type { Rng } from './rng';
import {
  type CellKey,
  cellKeyStr,
  enumerateCells,
  minConflictsSeed,
} from './csp';
import {
  collectTeacherViolations,
  teacherHardConfig,
  type TeacherPlacedLesson,
} from './teacherConstraints';

/** highs npm의 solve() 결과 중 우리가 쓰는 부분만 추린 최소 타입 (런타임 의존 회피). */
interface HighsColumn {
  Primal?: number;
}
interface HighsSolution {
  Status: string;
  ObjectiveValue?: number;
  Columns?: Record<string, HighsColumn>;
}
export interface HighsInstance {
  solve(problem: string, options?: Record<string, unknown>): HighsSolution;
}

/** 모듈 캐시: 워커/테스트에서 initCpSatSolver로 1회 주입. 없으면 폴백. */
let highsInstance: HighsInstance | null = null;

/**
 * HiGHS 인스턴스를 주입한다. 이미 로드한 인스턴스가 있으면 그대로 등록(테스트), 없으면
 * 동적 import로 로드(워커/브라우저). locateFile은 .wasm 위치를 알려준다.
 * 워커 부팅 시 1회 await 해 두면 이후 동기 cpSatSeed가 곧바로 솔버를 쓴다.
 */
export async function initCpSatSolver(opts?: {
  instance?: HighsInstance;
  locateFile?: (file: string) => string;
  wasmBinary?: ArrayBuffer | Uint8Array;
}): Promise<HighsInstance | null> {
  if (opts?.instance) {
    highsInstance = opts.instance;
    return highsInstance;
  }
  if (highsInstance) return highsInstance;
  try {
    const mod = await import('highs');
    const loader = (mod.default ?? mod) as (
      o?: Record<string, unknown>,
    ) => Promise<HighsInstance>;
    const loaderOpts: Record<string, unknown> = {};
    if (opts?.locateFile) loaderOpts.locateFile = opts.locateFile;
    if (opts?.wasmBinary) loaderOpts.wasmBinary = opts.wasmBinary;
    highsInstance = await loader(loaderOpts);
  } catch {
    highsInstance = null;
  }
  return highsInstance;
}

/** 테스트/재구성용: 캐시 비우기. */
export function resetCpSatSolver(): void {
  highsInstance = null;
}

/** 현재 솔버 로드 여부. */
export function isCpSatReady(): boolean {
  return highsInstance !== null;
}

/** 주입된 HiGHS 인스턴스 접근 (bruteforceRepair 등 공유 솔버용). */
export function getHighsInstance(): HighsInstance | null {
  return highsInstance;
}

/** 배치 결과의 실제 하드 충돌 수(인접 동거 간선 + 하루 한도 초과)를 센다. */
function countConflicts(
  placements: Placement[],
  graph: ConflictGraph,
  input: TimetableInput,
): number {
  const cellOcc = new Map<string, string[]>();
  for (const p of placements) {
    const k = cellKeyStr({ dayIndex: p.dayIndex, period: p.period });
    const arr = cellOcc.get(k);
    if (arr) arr.push(p.lessonId);
    else cellOcc.set(k, [p.lessonId]);
  }
  let edges = 0;
  for (const ids of cellOcc.values()) {
    for (let i = 0; i < ids.length; i++) {
      const adj = graph.adjacency.get(ids[i]);
      if (!adj) continue;
      for (let j = i + 1; j < ids.length; j++) {
        if (adj.has(ids[j])) edges++;
      }
    }
  }
  let cap = 0;
  if (input.options.hard.subjectDailyCap) {
    const maxPer = input.options.maxPerSubjectPerDay;
    const offDay = new Map<string, number>();
    for (const p of placements) {
      const off = graph.byLessonId.get(p.lessonId)?.offeringId;
      if (!off) continue;
      const k = `${off}|${p.dayIndex}`;
      offDay.set(k, (offDay.get(k) ?? 0) + 1);
    }
    for (const n of offDay.values()) if (n > maxPer) cap += n - maxPer;
  }
  // 교사 하드 제약 위반 — 디코딩 해 신뢰 게이트에 포함 (0충돌 판정이 4종 제약까지 봄)
  let teacher = 0;
  const tcfg = teacherHardConfig(input);
  if (tcfg.any) {
    const placed: TeacherPlacedLesson[] = [];
    for (const p of placements) {
      const l = graph.byLessonId.get(p.lessonId);
      if (!l?.teacherId) continue;
      placed.push({
        lessonId: p.lessonId,
        teacherId: l.teacherId,
        subjectName: l.subjectName,
        offeringId: l.offeringId,
        dayIndex: p.dayIndex,
        period: p.period,
      });
    }
    teacher = collectTeacherViolations(tcfg, input.grid.days, placed).violations;
  }
  return edges + cap + teacher;
}

/** deadlineMs(절대 시각) → HiGHS time_limit(초). 최소 1초, 약간의 디코딩 여유를 남긴다. */
function deadlineToSeconds(deadlineMs: number): number {
  const remainMs = deadlineMs - Date.now();
  // 디코딩·후처리에 ~300ms 남기고, 음수/과소면 1초 하한.
  return Math.max(1, (remainMs - 300) / 1000);
}

/**
 * 충돌그래프의 클리크(서로 전부 인접한 lesson 집합)들을 복원한다.
 * 충돌그래프는 (학생→lessons) + (교사→lessons) 클리크의 합집합으로 만들어지므로,
 * 이 두 그룹이 그대로 maximal-ish 클리크다. 중복 그룹은 제거한다.
 */
export function recoverCliques(
  input: TimetableInput,
  graph: ConflictGraph,
): string[][] {
  const seen = new Set<string>();
  const cliques: string[][] = [];
  const add = (ids: string[]): void => {
    if (ids.length < 2) return;
    const key = [...ids].sort().join('');
    if (seen.has(key)) return;
    seen.add(key);
    cliques.push(ids);
  };
  // 학생 클리크 (같은 학생을 듣는 lesson들은 서로 전부 인접)
  for (const ids of graph.studentToLessons.values()) add(ids);
  // 교사 클리크 (교사충돌이 켜진 경우에만 그래프 간선이 존재)
  if (input.options.hard.teacherConflict) {
    const teacherGroups = new Map<string, string[]>();
    for (const l of input.lessons) {
      if (!l.teacherId) continue;
      const a = teacherGroups.get(l.teacherId);
      if (a) a.push(l.id);
      else teacherGroups.set(l.teacherId, [l.id]);
    }
    for (const ids of teacherGroups.values()) add(ids);
  }
  return cliques;
}

/**
 * HiGHS ILP seed 솔버. minConflictsSeed와 동일 시그니처.
 *  - 솔버 미로드 또는 도메인 구성 불가 → minConflictsSeed로 폴백(또는 null).
 *  - 완전 해 디코딩 성공 → 그 배치 + 실제 충돌 수(보통 0) 반환.
 *  - 시간초과·무incumbent·infeasible → minConflictsSeed 최선해 반환.
 */
export function cpSatSeed(
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
  deadlineMs: number,
  maxSteps: number,
): { placements: Placement[]; conflicts: number } | null {
  // 전체 데드라인으로 min-conflicts (구성 불가 등 HiGHS 시간 소모 전 폴백용).
  const fallbackFull = () =>
    minConflictsSeed(input, graph, rng, domains, pinned, deadlineMs, maxSteps);

  // 솔버가 아직 로드되지 않았으면 min-conflicts로.
  const highs = highsInstance;
  if (!highs) return fallbackFull();

  // 오케스트레이션 예산. min-conflicts는 feasible 실데이터를 수백 ms 안에 0충돌로 푸는
  // 신뢰할 수 있는 incumbent 제공자이고, HiGHS는 그것이 우연히 실패하거나(무작위) 0을
  // "증명"해야 할 때의 정밀 오라클이다. 그래서 흐름은:
  //   (1) 짧은 min-conflicts 프로브 — 0이면 즉시 반환(대부분의 feasible 케이스).
  //   (2) HiGHS 증명 창 — 0을 찾으면 반환(프로브가 놓친 feasible 케이스 구제·증명).
  //   (3) 남은 전 예산으로 min-conflicts 1회 장기 실행 — hard 인스턴스 최선해.
  // 이로써 cpSatSeed는 "동일 예산 단일 min-conflicts 호출"을 절대 밑돌지 않으면서
  // (3이 사실상 그 호출), feasible 인스턴스에선 0을 빠르게 찾고/증명한다.
  const totalMs = Math.max(0, deadlineMs - Date.now());
  // 프로브는 짧게(대부분의 feasible 실데이터는 수백 ms 안에 0), HiGHS 증명 창도 작게 잡아
  // hard 인스턴스에서 장기 min-conflicts 단계가 거의 전 예산을 갖도록 한다.
  const probeMs = Math.min(1200, totalMs * 0.1);
  const highsBudgetMs = Math.min(totalMs * 0.25, 5000);

  const best = (
    a: { placements: Placement[]; conflicts: number } | null,
    b: { placements: Placement[]; conflicts: number } | null,
  ) => (!a ? b : !b ? a : b.conflicts < a.conflicts ? b : a);

  // (1) 짧은 min-conflicts 프로브.
  let incumbent = minConflictsSeed(
    input, graph, rng, domains, pinned, Date.now() + Math.max(500, probeMs), maxSteps,
  );
  if (incumbent && incumbent.conflicts === 0) return incumbent;

  // HiGHS는 "거의 feasible"(프로브 잔여가 작음)할 때만 0-증명 가치가 있다. 프로브가 0에서
  // 멀면(명백히 hard/infeasible) HiGHS는 시간초과 후 쓸모없는 값만 주므로 건너뛰고, 그 시간을
  // 장기 min-conflicts에 몰아준다. (이로써 hard 인스턴스에서 "동예산 단일 min-conflicts"와 동급.)
  const HIGHS_TRIGGER = 8;
  const tryHighs = !incumbent || incumbent.conflicts <= HIGHS_TRIGGER;
  if (!tryHighs) {
    const long = minConflictsSeed(input, graph, rng, domains, pinned, deadlineMs, maxSteps);
    return best(incumbent, long) ?? incumbent;
  }

  const cells = enumerateCells(input.grid);
  const cellIdx = new Map<string, number>();
  cells.forEach((c, i) => cellIdx.set(cellKeyStr(c), i));

  // 변수: lessonId → 정수 인덱스(이름 충돌 방지). v(lessonIdx, cellIdx).
  const lidIdx = new Map<string, number>();
  input.lessons.forEach((l, i) => lidIdx.set(l.id, i));
  const vname = (lessonId: string, ci: number): string => `x_${lidIdx.get(lessonId)}_${ci}`;

  // 고정 칸: pinned lesson은 input.pinned의 칸으로 못박는다.
  const pinnedCell = new Map<string, CellKey>();
  for (const p of input.pinned) {
    pinnedCell.set(p.lessonId, { dayIndex: p.dayIndex, period: p.period });
  }

  // lesson별 (cellIdx, varName) 목록. 비어 있으면 구성 불가 → null(폴백도 null 반환).
  const lessonVarCells = new Map<string, { ci: number; v: string }[]>();
  const allVars: string[] = [];
  for (const l of input.lessons) {
    let dom = domains.get(l.id) ?? [];
    // pinned면 도메인을 그 칸 하나로 축소(고정 의미). 그 칸이 도메인에 없으면 그대로 두고
    // 아래에서 = 1 제약이 모순이 되어 HiGHS가 처리(또는 폴백). 보통은 도메인 안에 있다.
    const fixed = pinnedCell.get(l.id);
    if (fixed) {
      const fk = cellKeyStr(fixed);
      const inDom = dom.some((c) => cellKeyStr(c) === fk);
      dom = inDom ? [fixed] : [fixed];
    }
    if (dom.length === 0) {
      // 도메인이 빈 lesson이 있으면 ILP는 구성 불가 → min-conflicts에 위임.
      return best(incumbent, fallbackFull());
    }
    const vs = dom.map((c) => {
      const ci = cellIdx.get(cellKeyStr(c));
      if (ci === undefined) return null;
      const v = vname(l.id, ci);
      allVars.push(v);
      return { ci, v };
    });
    const clean = vs.filter((x): x is { ci: number; v: string } => x !== null);
    if (clean.length === 0) return best(incumbent, fallbackFull());
    lessonVarCells.set(l.id, clean);
  }

  // ── CPLEX LP 문자열 조립 ───────────────────────────────────────────
  const body: string[] = [];
  let cc = 0;

  // 배치 제약: 비고정 = sum=1, 고정 = (도메인이 1칸이므로) 그 변수 = 1
  for (const l of input.lessons) {
    const vs = lessonVarCells.get(l.id)!;
    body.push(` a${cc++}: ${vs.map((x) => x.v).join(' + ')} = 1`);
  }

  // 클리크 제약: 각 클리크·각 공통 칸에서 sum x ≤ 1 (학생/교사 동시 금지를 한 줄로)
  const cliques = recoverCliques(input, graph);
  for (const clq of cliques) {
    const perCell = new Map<number, string[]>();
    for (const lid of clq) {
      const vs = lessonVarCells.get(lid);
      if (!vs) continue;
      for (const { ci, v } of vs) {
        const a = perCell.get(ci);
        if (a) a.push(v);
        else perCell.set(ci, [v]);
      }
    }
    for (const vs of perCell.values()) {
      if (vs.length > 1) body.push(` k${cc++}: ${vs.join(' + ')} <= 1`);
    }
  }

  // 하루 한도: offering별·요일별 sum x ≤ maxPerSubjectPerDay
  if (input.options.hard.subjectDailyCap) {
    const maxPer = input.options.maxPerSubjectPerDay;
    for (const ids of graph.byOffering.values()) {
      if (ids.length < 2) continue;
      for (let d = 0; d < input.grid.days; d++) {
        const vs: string[] = [];
        for (const lid of ids) {
          const lvs = lessonVarCells.get(lid);
          if (!lvs) continue;
          for (const { ci, v } of lvs) if (cells[ci].dayIndex === d) vs.push(v);
        }
        if (vs.length > maxPer) body.push(` d${cc++}: ${vs.join(' + ')} <= ${maxPer}`);
      }
    }
  }

  // 교사 부하 하드 제약 4종 — teacherConstraints.ts와 동일 의미론의 선형화.
  //  daily: 교사·요일별 sum ≤ cap / consec: (maxRun+1)-교시 슬라이딩 윈도 sum ≤ maxRun
  //  last: 교사별 주간 마지막 교시 sum ≤ lastCap / subjAdj: (교사,분반)·인접 교시쌍 sum ≤ 1
  const tcfg = teacherHardConfig(input);
  if (tcfg.any) {
    const P = input.grid.periodsPerDay;
    const days = input.grid.days;
    const byTeacher = new Map<string, Lesson[]>();
    for (const l of input.lessons) {
      if (!l.teacherId) continue;
      const arr = byTeacher.get(l.teacherId);
      if (arr) arr.push(l);
      else byTeacher.set(l.teacherId, [l]);
    }
    // (d,p)별 변수 수집 헬퍼 (교사/과목 그룹 공용)
    const collectAt = (lessons: Lesson[]): string[][][] => {
      const at: string[][][] = Array.from({ length: days }, () =>
        Array.from({ length: P }, () => [] as string[]),
      );
      for (const l of lessons) {
        for (const { ci, v } of lessonVarCells.get(l.id) ?? []) {
          at[cells[ci].dayIndex][cells[ci].period - 1].push(v);
        }
      }
      return at;
    };
    for (const lessons of byTeacher.values()) {
      const at = collectAt(lessons);
      for (let d = 0; d < days; d++) {
        if (tcfg.daily) {
          const dayVars = at[d].flat();
          if (dayVars.length > tcfg.cap) body.push(` t${cc++}: ${dayVars.join(' + ')} <= ${tcfg.cap}`);
        }
        if (tcfg.consec) {
          for (let w = 0; w + tcfg.maxRun < P; w++) {
            const winVars: string[] = [];
            for (let k = 0; k <= tcfg.maxRun; k++) winVars.push(...at[d][w + k]);
            if (winVars.length > tcfg.maxRun) body.push(` t${cc++}: ${winVars.join(' + ')} <= ${tcfg.maxRun}`);
          }
        }
      }
      if (tcfg.last) {
        const lastVars: string[] = [];
        for (let d = 0; d < days; d++) lastVars.push(...at[d][tcfg.lastPeriod - 1]);
        if (lastVars.length > tcfg.lastCap) body.push(` t${cc++}: ${lastVars.join(' + ')} <= ${tcfg.lastCap}`);
      }
      if (tcfg.subjAdj) {
        const byOff = new Map<string, Lesson[]>();
        for (const l of lessons) {
          const arr = byOff.get(l.offeringId);
          if (arr) arr.push(l);
          else byOff.set(l.offeringId, [l]);
        }
        for (const group of byOff.values()) {
          if (group.length < 2) continue;
          const gAt = collectAt(group);
          for (let d = 0; d < days; d++) {
            for (let p = 0; p + 1 < P; p++) {
              const pair = [...gAt[d][p], ...gAt[d][p + 1]];
              if (pair.length > 1) body.push(` t${cc++}: ${pair.join(' + ')} <= 1`);
            }
          }
        }
      }
    }
  }

  const lp = [
    'Minimize',
    ` obj: 0 ${allVars[0]}`,
    'Subject To',
    ...body,
    'Binaries',
    ' ' + allVars.join(' '),
    'End',
  ].join('\n');

  // (2) HiGHS 증명 창. 남은 예산의 일부만 쓴다(시간초과 시 쓸모없는 완화값만 주므로).
  const highsDeadline = Date.now() + Math.max(1000, highsBudgetMs);
  let sol: HighsSolution | null = null;
  try {
    sol = highs.solve(lp, {
      time_limit: deadlineToSeconds(highsDeadline),
      presolve: 'on',
      output_flag: false,
      log_to_console: false,
      mip_rel_gap: 0,
      mip_heuristic_effort: 0.3,
    });
  } catch {
    sol = null;
  }

  // HiGHS 해 디코딩 시도. 이 feasibility 모델은 모든 제약이 하드라, "진짜" 정수 incumbent는
  // 정의상 0충돌이다. 시간초과 시 HiGHS가 돌려주는 Columns는 LP 완화/반올림값일 수 있어
  // 디코딩하면 충돌이 가득한 쓰레기 배치가 나온다. 따라서 디코딩 결과가 0충돌일 때만 신뢰한다.
  const decoded = sol?.Columns ? decodeHighs(sol.Columns, input, cells, lessonVarCells) : null;
  if (decoded && countConflicts(decoded, graph, input) === 0) {
    return { placements: decoded, conflicts: 0 };
  }

  // (3) 남은 전 예산으로 min-conflicts 1회 장기 실행. 프로브 incumbent와 비교해 최선 반환.
  //     (이 단계가 "동일 예산 단일 min-conflicts 호출"에 해당 — cpSatSeed가 그 밑돌지 않음을 보장.)
  if (Date.now() < deadlineMs - 300) {
    const long = minConflictsSeed(input, graph, rng, domains, pinned, deadlineMs, maxSteps);
    incumbent = best(incumbent, long);
  }
  if (incumbent) return incumbent;
  // incumbent가 전혀 없으면(거의 없음) HiGHS 디코딩 해라도 (충돌 포함) 반환.
  if (decoded) return { placements: decoded, conflicts: countConflicts(decoded, graph, input) };
  return null;
}

/** HiGHS Columns → 완전 배치(모든 lesson에 칸 1개). 미배정 lesson이 있으면 null. */
function decodeHighs(
  cols: Record<string, HighsColumn>,
  input: TimetableInput,
  cells: CellKey[],
  lessonVarCells: Map<string, { ci: number; v: string }[]>,
): Placement[] | null {
  const placements: Placement[] = [];
  for (const l of input.lessons) {
    let chosen = -1;
    for (const { ci, v } of lessonVarCells.get(l.id)!) {
      const col = cols[v];
      if (col && (col.Primal ?? 0) > 0.5) {
        chosen = ci;
        break;
      }
    }
    if (chosen < 0) return null;
    const c = cells[chosen];
    placements.push({ lessonId: l.id, dayIndex: c.dayIndex, period: c.period });
  }
  return placements;
}
