// 브루트포스 응용 — slack0에서 국소탐색이 못 벗어나는 잔여 충돌을, exact(MILP) 솔버로 제거.
//
// 전제(검증됨): 실제 학교 시간표가 0충돌로 존재 → 0-해는 존재한다. 문제는 "해가 없다"가 아니라
// 단일-이동 국소탐색이 "여러 lesson을 동시에 움직여야 벗어나는" 작은 지역최소에 갇히는 것.
// 순수 브루트포스(35^700)는 불가하지만, exact 솔버를 *작은 막힌 부분*에만 투입하면 탈출 가능.
//
//  A. lnsRepair  — Large Neighborhood Search + exact repair (ruin & recreate):
//       enhanced-local 초기해 → 충돌 핵심(~25 lesson)만 "파괴", 나머지 고정 → 그 부분만 MILP로
//       정확 재풀이 → 적용 → 반복. 작은 부분문제라 즉해. 상용 SW(FET/Untis)의 핵심 전략.
//  C. cpSatFull  — 전체 인스턴스 MILP + 대칭깨기 + 장시간:
//       branch&bound(가지치기된 브루트포스). 동일 분반 순열 대칭을 칸 인덱스 순서로 깨 분기 급감.
//       오프라인 생성(분 단위 허용)이라 큰 예산을 줄 수 있음. 해 있으면 0 증명, 없으면 incumbent.
//
// 공통 엔진 solveMilp: free 집합만 변수, 나머지는 fixed 칸으로 고정. free lesson의 도메인에서
// "고정 인접 lesson이 점유한 칸"을 제거(free↔fixed 충돌 차단) + free끼리 클리크 per-cell≤1.
import type { Lesson, Placement, TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import { type CellKey, cellKeyStr, enumerateCells } from './csp';
import { getHighsInstance, recoverCliques, type HighsInstance } from './cpSatSolver';
import {
  collectTeacherViolations,
  type TeacherHardConfig,
  type TeacherPlacedLesson,
} from './teacherConstraints';

/**
 * 배치 Map의 하드 충돌 수 = 인접 동거 간선 + 하루 한도 초과 (+ tcfg 지정 시 교사 부하 4종).
 * tcfg를 넘기면 collectTeacherViolations와 동일 의미론으로 tier1 위반을 합산한다.
 */
function countConflicts(
  place: Map<string, CellKey>,
  graph: ConflictGraph,
  input: TimetableInput,
  tcfg?: TeacherHardConfig,
): number {
  const cellOcc = new Map<string, string[]>();
  for (const [id, c] of place) {
    const k = cellKeyStr(c);
    (cellOcc.get(k) ?? cellOcc.set(k, []).get(k)!).push(id);
  }
  let edges = 0;
  for (const ids of cellOcc.values())
    for (let i = 0; i < ids.length; i++) {
      const adj = graph.adjacency.get(ids[i]);
      if (!adj) continue;
      for (let j = i + 1; j < ids.length; j++) if (adj.has(ids[j])) edges++;
    }
  let cap = 0;
  if (input.options.hard.subjectDailyCap) {
    const maxPer = input.options.maxPerSubjectPerDay;
    const offDay = new Map<string, number>();
    for (const [id, c] of place) {
      const off = graph.byLessonId.get(id)?.offeringId;
      if (!off) continue;
      const k = `${off}|${c.dayIndex}`;
      offDay.set(k, (offDay.get(k) ?? 0) + 1);
    }
    for (const n of offDay.values()) if (n > maxPer) cap += n - maxPer;
  }
  let teacher = 0;
  if (tcfg?.any) {
    const placed: TeacherPlacedLesson[] = [];
    for (const [id, c] of place) {
      const l = graph.byLessonId.get(id);
      if (!l?.teacherId) continue;
      placed.push({ lessonId: id, teacherId: l.teacherId, subjectName: l.subjectName, offeringId: l.offeringId, dayIndex: c.dayIndex, period: c.period });
    }
    teacher = collectTeacherViolations(tcfg, input.grid.days, placed).violations;
  }
  return edges + cap + teacher;
}

/** 현재 배치의 충돌 간선 목록 [a,b] (둘 다 같은 칸 + 인접) */
function conflictEdges(place: Map<string, CellKey>, graph: ConflictGraph): [string, string][] {
  const cellOcc = new Map<string, string[]>();
  for (const [id, c] of place) (cellOcc.get(cellKeyStr(c)) ?? cellOcc.set(cellKeyStr(c), []).get(cellKeyStr(c))!).push(id);
  const out: [string, string][] = [];
  for (const ids of cellOcc.values())
    for (let i = 0; i < ids.length; i++) {
      const adj = graph.adjacency.get(ids[i]);
      if (!adj) continue;
      for (let j = i + 1; j < ids.length; j++) if (adj.has(ids[j])) out.push([ids[i], ids[j]]);
    }
  return out;
}

/** 결정적 LCG */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

export interface MilpTeacherOpts {
  /** 교사 부하 4종 의미론 (teacherConstraints.ts와 동일) */
  cfg: TeacherHardConfig;
  /**
   * true = 위반을 슬랙 변수로 허용하고 총 슬랙을 최소화 (부분문제가 항상 feasible —
   * 목적값이 collectTeacherViolations의 위반 수와 정확히 일치하도록 선형화됨).
   * false = 하드 강제 (교사 단독 feasibility 증명 등).
   */
  soft: boolean;
}

/** HiGHS 풀이 상태·목적값 반환용 out-파라미터 (증명·진단에 사용) */
export interface MilpOut {
  status?: string;
  objective?: number;
}

/**
 * free 집합만 변수로 MILP를 풀어 free lesson의 칸을 정한다. 나머지는 fixedCell로 고정.
 * 반환: free lessonId → 선택 칸 (완전 정수해), 또는 null(구성불가/무incumbent).
 * opts.teacher를 넘기면 교사 부하 4종을 (고정 lesson 기여를 상수로 반영해) 함께 모델링한다.
 */
export function solveMilp(
  highs: HighsInstance,
  input: TimetableInput,
  graph: ConflictGraph,
  free: Lesson[],
  fixedCell: Map<string, CellKey>,
  domains: Map<string, CellKey[]>,
  cliques: string[][],
  cells: CellKey[],
  cellIdx: Map<string, number>,
  opts: { timeSec: number; symmetry: boolean; teacher?: MilpTeacherOpts; out?: MilpOut },
): Map<string, CellKey> | null {
  const freeSet = new Set(free.map((l) => l.id));
  const lidIdx = new Map<string, number>();
  free.forEach((l, i) => lidIdx.set(l.id, i));

  const lessonVars = new Map<string, { ci: number; v: string }[]>();
  const allVars: string[] = [];
  for (const l of free) {
    // 고정 인접 lesson이 점유한 칸은 도메인에서 제거 (free↔fixed 충돌 차단)
    const forbidden = new Set<number>();
    const adj = graph.adjacency.get(l.id);
    if (adj) for (const nb of adj) if (!freeSet.has(nb)) { const fc = fixedCell.get(nb); if (fc) forbidden.add(cellIdx.get(cellKeyStr(fc))!); }
    const vs: { ci: number; v: string }[] = [];
    for (const c of domains.get(l.id) ?? []) {
      const ci = cellIdx.get(cellKeyStr(c));
      if (ci === undefined || forbidden.has(ci)) continue;
      const v = `x_${lidIdx.get(l.id)}_${ci}`;
      vs.push({ ci, v });
      allVars.push(v);
    }
    if (vs.length === 0) return null; // 갇힘 → D 확장 필요
    lessonVars.set(l.id, vs);
  }

  const body: string[] = [];
  let cc = 0;
  // 배치: free마다 sum = 1
  for (const l of free) body.push(` a${cc++}: ${lessonVars.get(l.id)!.map((x) => x.v).join(' + ')} = 1`);
  // 클리크: free끼리 per-cell ≤ 1
  for (const clq of cliques) {
    const perCell = new Map<number, string[]>();
    for (const lid of clq) {
      if (!freeSet.has(lid)) continue;
      for (const { ci, v } of lessonVars.get(lid) ?? []) (perCell.get(ci) ?? perCell.set(ci, []).get(ci)!).push(v);
    }
    for (const vs of perCell.values()) if (vs.length > 1) body.push(` k${cc++}: ${vs.join(' + ')} <= 1`);
  }
  // 하루 한도
  if (input.options.hard.subjectDailyCap) {
    const maxPer = input.options.maxPerSubjectPerDay;
    for (const ids of graph.byOffering.values()) {
      const freeIds = ids.filter((id) => freeSet.has(id));
      if (freeIds.length === 0) continue;
      for (let d = 0; d < input.grid.days; d++) {
        const fixedCount = ids.reduce((n, id) => (!freeSet.has(id) && fixedCell.get(id)?.dayIndex === d ? n + 1 : n), 0);
        const vs: string[] = [];
        for (const id of freeIds) for (const { ci, v } of lessonVars.get(id)!) if (cells[ci].dayIndex === d) vs.push(v);
        const rhs = Math.max(0, maxPer - fixedCount);
        if (vs.length > rhs) body.push(` d${cc++}: ${vs.join(' + ')} <= ${rhs}`);
      }
    }
  }
  // 교사 부하 4종 — teacherConstraints.ts와 동일 의미론의 선형화.
  // free 변수는 좌변에, 고정 lesson의 점유는 상수로 RHS에서 차감한다.
  // soft 모드는 제약마다 정수 슬랙을 붙여 "총 슬랙 = collectTeacherViolations의 위반 수"가
  // 되게 하고(daily 초과분·window 1건·last 초과분·인접쌍 1건 — 전부 1:1), 그 합을 최소화한다.
  const slacks: string[] = [];
  const tOpt = opts.teacher;
  if (tOpt?.cfg.any) {
    const tcfg = tOpt.cfg;
    const P = input.grid.periodsPerDay;
    const days = input.grid.days;
    const slack = (): string | null => {
      if (!tOpt.soft) return null;
      const s = `s_${slacks.length}`;
      slacks.push(s);
      return s;
    };
    // 제약행 추가 헬퍼: vars − slack ≤ rhs (slack 없으면 vars ≤ rhs).
    // rhs<0인데 변수로 메꿀 수 없으면(hard) 모순 행이 되어 HiGHS가 infeasible을 보고한다 — 의도된 동작.
    const pushRow = (vars: string[], rhs: number): void => {
      if (vars.length === 0) {
        // 변수가 전혀 없는 행: 고정만으로 이미 위반(rhs<0)이어도 표현 불가 — 슬랙도 무의미.
        // (이 위반은 수리 대상 선정에서 해당 lesson을 free로 풀어야 고칠 수 있다.)
        return;
      }
      // 이미 자명하게 만족(모든 변수가 1이어도 rhs 이상)이면 행 생략
      if (vars.length <= rhs) return;
      const s = slack();
      body.push(` t${cc++}: ${vars.join(' + ')}${s ? ` - ${s}` : ''} <= ${rhs}`);
    };

    // 교사별 free/fixed lesson 분리
    const byTeacher = new Map<string, { free: Lesson[]; fixed: Lesson[] }>();
    const consider = (l: Lesson): void => {
      if (!l.teacherId) return;
      const e = byTeacher.get(l.teacherId) ?? { free: [], fixed: [] };
      if (freeSet.has(l.id)) e.free.push(l);
      else if (fixedCell.has(l.id)) e.fixed.push(l);
      byTeacher.set(l.teacherId, e);
    };
    for (const l of input.lessons) consider(l);

    // (d,p)별 free 변수·fixed 상수 수집
    const collect = (lessons: { free: Lesson[]; fixed: Lesson[] }): { at: string[][][]; fx: number[][] } => {
      const at: string[][][] = Array.from({ length: days }, () => Array.from({ length: P }, () => [] as string[]));
      const fx: number[][] = Array.from({ length: days }, () => new Array<number>(P).fill(0));
      for (const l of lessons.free) {
        for (const { ci, v } of lessonVars.get(l.id) ?? []) at[cells[ci].dayIndex][cells[ci].period - 1].push(v);
      }
      for (const l of lessons.fixed) {
        const c = fixedCell.get(l.id)!;
        fx[c.dayIndex][c.period - 1]++;
      }
      return { at, fx };
    };

    for (const group of byTeacher.values()) {
      if (group.free.length === 0) continue; // 전부 고정 — 부분문제에서 바꿀 수 없음
      const { at, fx } = collect(group);
      for (let d = 0; d < days; d++) {
        if (tcfg.daily) {
          const vars = at[d].flat();
          const fixedN = fx[d].reduce((a, b) => a + b, 0);
          pushRow(vars, tcfg.cap - fixedN);
        }
        if (tcfg.consec) {
          for (let w = 0; w + tcfg.maxRun < P; w++) {
            const vars: string[] = [];
            let fixedN = 0;
            for (let k = 0; k <= tcfg.maxRun; k++) {
              vars.push(...at[d][w + k]);
              // 점유는 present(0/1) 의미 — 무충돌 보드에선 fixed 점유가 교시당 ≤1
              fixedN += Math.min(1, fx[d][w + k]);
            }
            pushRow(vars, tcfg.maxRun - fixedN);
          }
        }
        if (tcfg.subjAdj) {
          // (교사,분반,요일)별 인접쌍
          const byOff = new Map<string, { vars: string[][]; fx: number[] }>();
          const offAt = (offeringId: string): { vars: string[][]; fx: number[] } => {
            let e = byOff.get(offeringId);
            if (!e) {
              e = { vars: Array.from({ length: P }, () => [] as string[]), fx: new Array<number>(P).fill(0) };
              byOff.set(offeringId, e);
            }
            return e;
          };
          for (const l of group.free) {
            for (const { ci, v } of lessonVars.get(l.id) ?? []) {
              if (cells[ci].dayIndex === d) offAt(l.offeringId).vars[cells[ci].period - 1].push(v);
            }
          }
          for (const l of group.fixed) {
            const c = fixedCell.get(l.id)!;
            if (c.dayIndex === d) offAt(l.offeringId).fx[c.period - 1]++;
          }
          for (const e of byOff.values()) {
            for (let p = 0; p + 1 < P; p++) {
              const vars = [...e.vars[p], ...e.vars[p + 1]];
              const fixedN = Math.min(1, e.fx[p]) + Math.min(1, e.fx[p + 1]);
              pushRow(vars, 1 - fixedN);
            }
          }
        }
      }
      if (tcfg.last) {
        const vars: string[] = [];
        let fixedN = 0;
        for (let d = 0; d < days; d++) {
          vars.push(...at[d][tcfg.lastPeriod - 1]);
          fixedN += fx[d][tcfg.lastPeriod - 1];
        }
        pushRow(vars, tcfg.lastCap - fixedN);
      }
    }
  }

  // 대칭깨기: 같은 강좌 동일 분반들을 칸 인덱스 오름차순(순열 대칭 제거)
  if (opts.symmetry) {
    const byOff = new Map<string, Lesson[]>();
    for (const l of free) (byOff.get(l.offeringId) ?? byOff.set(l.offeringId, []).get(l.offeringId)!).push(l);
    for (const ls of byOff.values()) {
      if (ls.length < 2) continue;
      ls.sort((a, b) => (a.id < b.id ? -1 : 1));
      for (let i = 0; i + 1 < ls.length; i++) {
        const a = lessonVars.get(ls[i].id)!, b = lessonVars.get(ls[i + 1].id)!;
        const terms = [
          ...a.filter((x) => x.ci > 0).map((x) => `+ ${x.ci} ${x.v}`),
          ...b.filter((x) => x.ci > 0).map((x) => `- ${x.ci} ${x.v}`),
        ];
        if (terms.length) body.push(` y${cc++}: ${terms.join(' ')} <= -1`);
      }
    }
  }

  const objective = slacks.length > 0 ? slacks.join(' + ') : `0 ${allVars[0]}`;
  const lp = [
    'Minimize',
    ` obj: ${objective}`,
    'Subject To',
    ...body,
    ...(slacks.length > 0 ? ['Generals', ' ' + slacks.join(' ')] : []),
    'Binaries',
    ' ' + allVars.join(' '),
    'End',
  ].join('\n');
  let sol;
  try {
    sol = highs.solve(lp, { time_limit: Math.max(0.01, opts.timeSec), presolve: 'on', output_flag: false, log_to_console: false, mip_rel_gap: 0, mip_heuristic_effort: 0.2 });
  } catch {
    return null;
  }
  if (opts.out) {
    opts.out.status = sol?.Status;
    opts.out.objective = sol?.ObjectiveValue;
  }
  if (!sol?.Columns) return null;
  // 디코딩: 각 free lesson에 >0.5 변수 1개. 미배정(분수해/무incumbent)이면 null.
  const out = new Map<string, CellKey>();
  for (const l of free) {
    let chosen = -1;
    for (const { ci, v } of lessonVars.get(l.id)!) { const col = sol.Columns[v]; if (col && (col.Primal ?? 0) > 0.5) { chosen = ci; break; } }
    if (chosen < 0) return null;
    out.set(l.id, cells[chosen]);
  }
  return out;
}

/**
 * 충돌 핵심 파괴집합: 모든 충돌 lesson + 그들이 속한 클리크(학생/교사 그룹)를 포함하고, 남는 여유를
 * 1-hop 이웃으로 채운다(maxD 상한). 클리크 전체를 넣어야 MILP가 그 그룹을 통째로 재배치할 수 있다.
 */
function buildDestroy(
  conflictLessons: Set<string>,
  graph: ConflictGraph,
  lessonCliques: Map<string, string[][]>,
  maxD: number,
  rnd: () => number,
): Set<string> {
  const D = new Set<string>(conflictLessons);
  // 1) 충돌 lesson의 클리크 전체를 우선 포함
  for (const id of conflictLessons) {
    for (const clq of lessonCliques.get(id) ?? []) {
      for (const m of clq) { if (D.size >= maxD) break; D.add(m); }
      if (D.size >= maxD) break;
    }
    if (D.size >= maxD) break;
  }
  // 2) 여유가 있으면 1-hop 이웃으로 채움
  const queue = [...D];
  while (queue.length && D.size < maxD) {
    const id = queue.shift()!;
    const adj = graph.adjacency.get(id);
    if (!adj) continue;
    const nbs = [...adj];
    for (let i = nbs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [nbs[i], nbs[j]] = [nbs[j], nbs[i]]; }
    for (const nb of nbs) { if (D.size >= maxD) break; if (!D.has(nb)) { D.add(nb); queue.push(nb); } }
  }
  return D;
}

export interface RepairResult { placements: Placement[]; conflicts: number; iters: number; infeasibleSubproblems?: number; }

/**
 * A. LNS + exact repair. initial(보통 enhanced-local 결과)에서 출발해 충돌 핵심만 MILP로 반복 재풀이.
 */
export function lnsRepair(
  input: TimetableInput,
  graph: ConflictGraph,
  domains: Map<string, CellKey[]>,
  initial: Placement[],
  deadlineMs: number,
  opts?: { maxD?: number; seed?: number },
): RepairResult {
  const cells = enumerateCells(input.grid);
  const cellIdx = new Map<string, number>();
  cells.forEach((c, i) => cellIdx.set(cellKeyStr(c), i));
  const cur = new Map<string, CellKey>(initial.map((p) => [p.lessonId, { dayIndex: p.dayIndex, period: p.period }]));
  let best = [...cur];
  let bestC = countConflicts(cur, graph, input);

  const highs = getHighsInstance();
  if (!highs || bestC === 0) return { placements: toPlacements(cur), conflicts: bestC, iters: 0 };

  const cliques = recoverCliques(input, graph);
  // lesson → 자신이 속한 클리크들 (파괴 시 충돌 lesson의 전체 클리크를 포함시켜 재배치 여지 확보)
  const lessonCliques = new Map<string, string[][]>();
  for (const clq of cliques) for (const id of clq) (lessonCliques.get(id) ?? lessonCliques.set(id, []).get(id)!).push(clq);

  const maxD = opts?.maxD ?? 60;
  const rnd = lcg(opts?.seed ?? 20260616);
  let iters = 0;
  let stale = 0;
  let infeasibleSubproblems = 0;
  while (Date.now() < deadlineMs && bestC > 0 && stale < 40) {
    iters++;
    const edges = conflictEdges(cur, graph);
    if (edges.length === 0) { bestC = 0; best = [...cur]; break; }
    // 파괴집합 = 모든 충돌 lesson + 그들의 클리크/이웃 (재배치 여지). maxD로 상한.
    const conflictLessons = new Set<string>();
    for (const [a, b] of edges) { conflictLessons.add(a); conflictLessons.add(b); }
    const D = buildDestroy(conflictLessons, graph, lessonCliques, maxD, rnd);
    const free = [...D].map((id) => graph.byLessonId.get(id)).filter((l): l is Lesson => !!l);
    const fixedCell = new Map<string, CellKey>();
    for (const [id, c] of cur) if (!D.has(id)) fixedCell.set(id, c);
    const timeSec = Math.min(8, (deadlineMs - Date.now()) / 1000);
    if (timeSec < 0.5) break;
    const sub = solveMilp(highs, input, graph, free, fixedCell, domains, cliques, cells, cellIdx, { timeSec, symmetry: true });
    if (sub) {
      const snapshot = new Map(cur);
      for (const [id, c] of sub) cur.set(id, c);
      const c2 = countConflicts(cur, graph, input);
      if (c2 < bestC) { bestC = c2; best = [...cur]; stale = 0; }
      else { for (const [id, c] of snapshot) cur.set(id, c); stale++; } // 개선 없으면 롤백
    } else {
      // 부분문제 갇힘(고정 이웃이 다 막음 또는 infeasible) → 충돌 lesson 하나를 무작위 칸으로 흔들어 탈출
      stale++;
      infeasibleSubproblems++;
      const cl = [...conflictLessons];
      const l = cl[Math.floor(rnd() * cl.length)];
      const dom = domains.get(l) ?? [];
      if (dom.length) cur.set(l, dom[Math.floor(rnd() * dom.length)]);
    }
  }
  return { placements: best.map(([id, c]) => ({ lessonId: id, dayIndex: c.dayIndex, period: c.period })), conflicts: bestC, iters, infeasibleSubproblems };
}

/**
 * C. 전체 MILP + 대칭깨기 + 장시간. 해 있으면 0 증명, 시간초과면 incumbent 디코딩.
 * opts.teacher를 넘기면 교사 부하 4종을 함께 모델링한다 (soft=위반 최소화 목적).
 */
export function cpSatFull(
  input: TimetableInput,
  graph: ConflictGraph,
  domains: Map<string, CellKey[]>,
  deadlineMs: number,
  opts?: { symmetry?: boolean; teacher?: MilpTeacherOpts; out?: MilpOut },
): RepairResult | null {
  const highs = getHighsInstance();
  if (!highs) return null;
  const cells = enumerateCells(input.grid);
  const cellIdx = new Map<string, number>();
  cells.forEach((c, i) => cellIdx.set(cellKeyStr(c), i));
  const cliques = recoverCliques(input, graph);
  const pinnedCell = new Map<string, CellKey>();
  for (const p of input.pinned) pinnedCell.set(p.lessonId, { dayIndex: p.dayIndex, period: p.period });
  const free = input.lessons.filter((l) => !pinnedCell.has(l.id));
  const timeSec = Math.max(1, (deadlineMs - Date.now()) / 1000);
  const sub = solveMilp(highs, input, graph, free, pinnedCell, domains, cliques, cells, cellIdx, {
    timeSec, symmetry: opts?.symmetry ?? true, teacher: opts?.teacher, out: opts?.out,
  });
  if (!sub) return null;
  const m = new Map<string, CellKey>(pinnedCell);
  for (const [id, c] of sub) m.set(id, c);
  return { placements: toPlacements(m), conflicts: countConflicts(m, graph, input, opts?.teacher?.cfg), iters: 1 };
}

export interface TeacherRepairResult {
  placements: Placement[];
  /** 잔여 교사 부하 위반 수 (collectTeacherViolations 독립 재계산) */
  violations: number;
  /** 기본충돌(간선+하루한도) — 항상 초기값과 동일해야 한다 (0 보존) */
  baseConflicts: number;
  iters: number;
}

/**
 * B. 교사 부하 위반 전용 LNS + exact 수리 (기본충돌 0-보존).
 *
 * initial(기본충돌 0 보드)에서 출발해, 교사 부하 위반에 관여한 lesson들 + 클리크/1-hop
 * 이웃을 free로 풀고 나머지를 고정한 뒤, 교사 4종을 슬랙 최소화 목적으로 MILP 정확 재풀이.
 * free↔fixed 충돌은 도메인 제거·free↔free는 클리크 행이 하드라 기본충돌 0이 구성적으로
 * 보존된다. 위반 수가 줄어들 때만 수용(독립 재계산), 정체 시 이웃 크기를 키운다.
 *
 * 슬랙0 보드에서 Kempe(tightenTeacherHard)가 못 찾는 "여러 lesson 동시 재배열"을
 * exact 솔버가 찾는 것이 목적 — 두 방법은 포트폴리오로 교대 실행된다.
 */
export function lnsTeacherRepair(
  input: TimetableInput,
  cfg: TeacherHardConfig,
  graph: ConflictGraph,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
  initial: Placement[],
  deadlineMs: number,
  opts?: { seed?: number; maxD?: number },
): TeacherRepairResult {
  const cells = enumerateCells(input.grid);
  const cellIdx = new Map<string, number>();
  cells.forEach((c, i) => cellIdx.set(cellKeyStr(c), i));
  const cur = new Map<string, CellKey>(initial.map((p) => [p.lessonId, { dayIndex: p.dayIndex, period: p.period }]));

  const violOf = (place: Map<string, CellKey>): { violations: number; lessonIds: Set<string> } => {
    const placed: TeacherPlacedLesson[] = [];
    for (const [id, c] of place) {
      const l = graph.byLessonId.get(id);
      if (!l?.teacherId) continue;
      placed.push({ lessonId: id, teacherId: l.teacherId, subjectName: l.subjectName, offeringId: l.offeringId, dayIndex: c.dayIndex, period: c.period });
    }
    return collectTeacherViolations(cfg, input.grid.days, placed);
  };
  const baseOf = (place: Map<string, CellKey>): number => countConflicts(place, graph, input);

  const base0 = baseOf(cur);
  let bestViol = violOf(cur).violations;
  let best = [...cur];
  const highs = getHighsInstance();
  if (!highs || !cfg.any || bestViol === 0) {
    return { placements: toPlacements(cur), violations: bestViol, baseConflicts: base0, iters: 0 };
  }

  const cliques = recoverCliques(input, graph);
  const lessonCliques = new Map<string, string[][]>();
  for (const clq of cliques) for (const id of clq) (lessonCliques.get(id) ?? lessonCliques.set(id, []).get(id)!).push(clq);

  const rnd = lcg(opts?.seed ?? 20260706);
  let maxD = opts?.maxD ?? 80;
  let iters = 0;
  let stale = 0;
  while (Date.now() < deadlineMs && bestViol > 0 && stale < 30) {
    iters++;
    const { violations: curViol, lessonIds } = violOf(cur);
    if (curViol === 0) break;
    // 파괴집합: 위반 관여 lesson(핀 제외) + 클리크/1-hop. 정체 시 이웃 확대.
    const seedIds = new Set<string>([...lessonIds].filter((id) => !pinned.has(id)));
    if (seedIds.size === 0) break; // 전부 pinned — 수리 불가
    const D0 = buildDestroy(seedIds, graph, lessonCliques, maxD, rnd);
    for (const id of [...D0]) if (pinned.has(id)) D0.delete(id);
    const free = [...D0].map((id) => graph.byLessonId.get(id)).filter((l): l is Lesson => !!l);
    if (free.length === 0) break;
    const fixedCell = new Map<string, CellKey>();
    for (const [id, c] of cur) if (!D0.has(id)) fixedCell.set(id, c);
    const timeSec = Math.min(20, (deadlineMs - Date.now()) / 1000);
    if (timeSec < 1) break;
    const sub = solveMilp(highs, input, graph, free, fixedCell, domains, cliques, cells, cellIdx, {
      timeSec, symmetry: true, teacher: { cfg, soft: true },
    });
    if (sub) {
      const snapshot = new Map(cur);
      for (const [id, c] of sub) cur.set(id, c);
      const v2 = violOf(cur).violations;
      // 수용 게이트: 기본충돌 불변(구성상 0 보존이지만 독립 재검증) + 위반 감소
      if (v2 < bestViol && baseOf(cur) <= base0) {
        bestViol = v2;
        best = [...cur];
        stale = 0;
      } else {
        for (const [id, c] of snapshot) cur.set(id, c);
        stale++;
        maxD = Math.min(240, Math.round(maxD * 1.4)); // 지역최소 → 이웃 확대
      }
    } else {
      stale++;
      maxD = Math.min(240, Math.round(maxD * 1.4));
    }
  }
  return {
    placements: best.map(([id, c]) => ({ lessonId: id, dayIndex: c.dayIndex, period: c.period })),
    violations: bestViol,
    baseConflicts: base0,
    iters,
  };
}

function toPlacements(m: Map<string, CellKey>): Placement[] {
  return [...m].map(([id, c]) => ({ lessonId: id, dayIndex: c.dayIndex, period: c.period }));
}
