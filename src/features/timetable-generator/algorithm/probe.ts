// 공강 적정성 진단(feasibility probe).
//
// 배경: 무충돌 시간표가 가능한지는 "학생 최대 부하"(클리크 하한)만으로 알 수 없다.
// 실제 필요한 칸 수는 그래프 채색수 χ이고, 선택과목 교차수강 구조 때문에 χ가 부하보다
// 몇 칸 높을 수 있다(2026-1 2학년: 부하 30~31인데 χ≈34). 그래서 가용 칸이 부하보다
// 많아도 충돌이 남을 수 있다. 이 진단은 학년별로 "현재 공강에서 무충돌이 가능한지"와
// "가능하려면 공강을 몇 칸까지 줄여야 하는지(추정)"를 빠른 채색 시도로 측정한다.
//
// 솔버(SA 포함)가 아니라 minConflictsSeed만 짧게 돌려 빠르게 답한다. 학년은 독립적으로
// (학생 충돌이 지배적) 진단하므로 교사가 여러 학년을 가르치는 경우 실제론 1~2칸 더 필요할
// 수 있다 — 그래서 결과는 "추정"이다.

import type { GradeProbe, ProbeReport, TimetableInput } from '../types';
import { buildConflictGraph } from './conflictGraph';
import { cellKeyStr, enumerateCells, minConflictsSeed, parseCellKey, type CellKey } from './csp';
import { createRng } from './rng';

const ATTEMPTS = 2; // probe당 채색 재시도 수
const BUDGET_MS = 2200; // 시도당 시간 예산

/** 학년별로 현재 공강의 무충돌 가능성과 권장 공강(추정)을 진단한다. */
export function probeFeasibility(input: TimetableInput): ProbeReport {
  const allCells = enumerateCells(input.grid);
  const allKeys = allCells.map(cellKeyStr);
  const grades: GradeProbe[] = [];

  for (const grade of input.grades) {
    const gl = input.lessons.filter((l) => l.grade === grade);
    if (gl.length === 0) continue;
    const graph = buildConflictGraph(gl, {
      teacher: input.options.hard.teacherConflict,
      room: input.options.hard.roomConflict,
    });

    // 학생 최대 부하 (클리크 하한)
    const load = new Map<string, number>();
    for (const l of gl) for (const s of l.studentCodes) load.set(s, (load.get(s) ?? 0) + 1);
    const maxStudentLoad = load.size > 0 ? Math.max(...load.values()) : 0;

    // 균일 공강 = 모든 grade lesson에 공통으로 막힌 칸 (= 학년 공강. 교사불가/창체는 일부 lesson만)
    let uniform: Set<string> | null = null;
    for (const l of gl) {
      const b = new Set(l.blockedCells);
      if (uniform === null) uniform = b;
      else for (const k of [...uniform]) if (!b.has(k)) uniform.delete(k);
    }
    const uniformBlocked = [...(uniform ?? new Set<string>())];
    const currentBlocked = uniformBlocked.length;

    // addBack: 균일 공강 중 일부를 되돌려(=공강 감소) 도메인을 넓힌다
    const buildDomains = (addBack: Set<string>) => {
      const dom = new Map<string, CellKey[]>();
      for (const l of gl) {
        const blocked = new Set(l.blockedCells);
        const cells: CellKey[] = [];
        for (const k of allKeys) {
          if (blocked.has(k) && !addBack.has(k)) continue;
          cells.push(parseCellKey(k));
        }
        dom.set(l.id, cells);
      }
      return dom;
    };

    const subInput: TimetableInput = { ...input, grades: [grade], lessons: gl, pinned: [] };
    const probe = (addBack: Set<string>): boolean => {
      const domains = buildDomains(addBack);
      for (let s = 0; s < ATTEMPTS; s++) {
        const rng = createRng(((0x9e3779b1 * (s + 1)) ^ grade) >>> 0);
        const sol = minConflictsSeed(
          subInput,
          graph,
          rng,
          domains,
          new Set(),
          Date.now() + BUDGET_MS,
          gl.length * 3000,
        );
        if (sol && sol.conflicts === 0) return true;
      }
      return false;
    };

    // blocked=B로 줄였을 때 무충돌 가능? (균일 공강에서 currentBlocked−B 칸 되돌림)
    const feasibleAt = (b: number) => probe(new Set(uniformBlocked.slice(0, currentBlocked - b)));

    const feasibleAtCurrent = feasibleAt(currentBlocked);
    let recommendedMaxBlocked: number | null;
    if (feasibleAtCurrent) {
      recommendedMaxBlocked = currentBlocked;
    } else {
      // 단조성(공강 적을수록 쉬움)을 이용한 이분탐색: [0, currentBlocked−1]에서 무충돌 가능한
      // 최대 공강 B를 찾는다. 한 칸씩 줄이는 선형탐색과 달리, 답이 멀어도 ~log2 번이면 끝.
      let lo = 0;
      let hi = currentBlocked - 1;
      let ans: number | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (feasibleAt(mid)) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      recommendedMaxBlocked = ans; // null = 공강 0(가용 전체)에서도 무충돌 불가 — 매우 빡빡
    }

    grades.push({
      grade,
      lessons: gl.length,
      maxStudentLoad,
      currentBlocked,
      currentAvail: allCells.length - currentBlocked,
      feasibleAtCurrent,
      recommendedMaxBlocked,
    });
  }

  return { totalCells: allCells.length, grades };
}
