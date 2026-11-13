import type { Lesson } from '../types';
import { createRng } from './rng';

/**
 * 선택과목 블록(선택군) 추론. 실데이터 검증: 한국 고교 시간표는 선택과목을 "블록"으로 묶어
 * 같은 시간대(같은 칸)에 병렬 배치하고, 학생은 블록당 1과목을 선택한다. 블록은 충돌그래프의
 * 독립집합(같은 블록 과목끼리 학생/교사/교실 비공유)이다.
 *
 * 추론 규칙(2026-06 실데이터 검증):
 *  - 두 선택 offering이 **교사를 공유**하거나(같은 교사는 동시 불가) **학생을 임계값 초과로
 *    공유**하면 다른 블록(인접). 소수 공유(≤threshold)는 수강정정 잡음으로 흡수(같은 블록 가능).
 *  - **같은 credits**만 한 블록(블록=동일 칸수). 같은 과목이라도 다른 교사 병렬분반은 같은 블록
 *    가능(예: 대수 수준별 3분반 = 조유찬/권하린/서재윤 → 한 블록).
 *  - 블록 수는 per-credit 그래프 채색의 색 수(여러 순서 시도로 최소화).
 */
export interface BlockInfo {
  /** electives의 offeringId -> blockId (`block-{credits}-{color}`). 공통/비블록은 미포함. */
  blockOf: Map<string, string>;
  /** blockId -> 소속 offeringId[] */
  blocks: Map<string, string[]>;
}

export function inferElectiveBlocks(lessons: Lesson[], opts?: { threshold?: number; restarts?: number }): BlockInfo {
  const threshold = opts?.threshold ?? 3;
  const restarts = opts?.restarts ?? 200;

  const offLessons = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const arr = offLessons.get(l.offeringId);
    if (arr) arr.push(l);
    else offLessons.set(l.offeringId, [l]);
  }
  const electiveOffs = [...offLessons.entries()].filter(([, ls]) => ls[0].isElective).map(([oid]) => oid);

  const offStudents = new Map<string, Set<string>>();
  const offTeachers = new Map<string, Set<string>>();
  const offCredits = new Map<string, number>();
  for (const oid of electiveOffs) {
    const ls = offLessons.get(oid)!;
    offStudents.set(oid, new Set(ls[0].studentCodes));
    offCredits.set(oid, ls.length);
    const ts = new Set<string>();
    for (const l of ls) if (l.teacherId) ts.add(l.teacherId);
    offTeachers.set(oid, ts);
  }

  // 인접: 교사 공유 ∨ 학생 공유 > threshold (같은 credits 내에서만 블록화)
  const adj = new Map<string, Set<string>>();
  for (const o of electiveOffs) adj.set(o, new Set());
  for (let i = 0; i < electiveOffs.length; i++) {
    for (let j = i + 1; j < electiveOffs.length; j++) {
      const a = electiveOffs[i], b = electiveOffs[j];
      if (offCredits.get(a) !== offCredits.get(b)) continue;
      let isAdj = false;
      const ta = offTeachers.get(a)!, tb = offTeachers.get(b)!;
      for (const t of ta) if (tb.has(t)) { isAdj = true; break; }
      if (!isAdj) {
        const sa = offStudents.get(a)!, sb = offStudents.get(b)!;
        const [small, big] = sa.size < sb.size ? [sa, sb] : [sb, sa];
        let shared = 0;
        for (const s of small) if (big.has(s)) shared++;
        isAdj = shared > threshold;
      }
      if (isAdj) { adj.get(a)!.add(b); adj.get(b)!.add(a); }
    }
  }

  // 채색 하한 = 학생당 최대 동일-credits 선택과목 수 (clique 하한)
  const lbByCredit = new Map<number, number>();
  {
    const perStudent = new Map<string, Map<number, number>>();
    for (const oid of electiveOffs) {
      const cr = offCredits.get(oid)!;
      for (const s of offStudents.get(oid)!) {
        const m = perStudent.get(s) ?? perStudent.set(s, new Map()).get(s)!;
        m.set(cr, (m.get(cr) ?? 0) + 1);
      }
    }
    for (const m of perStudent.values()) for (const [cr, n] of m) lbByCredit.set(cr, Math.max(lbByCredit.get(cr) ?? 0, n));
  }

  // per-credit 그리디 채색(여러 무작위 순서 → 색 수 최소화, 하한 도달 시 조기 종료)
  const blockOf = new Map<string, string>();
  for (const credit of new Set(offCredits.values())) {
    const group = electiveOffs.filter((o) => offCredits.get(o) === credit);
    if (group.length === 0) continue;
    const lb = lbByCredit.get(credit) ?? 1;
    let bestColoring: Map<string, number> | null = null;
    let bestColors = Infinity;
    for (let attempt = 0; attempt < restarts; attempt++) {
      const rng = createRng((credit * 100000 + attempt + 1) >>> 0);
      const colored = new Map<string, number>();
      const remaining = new Set(group);
      while (remaining.size) {
        let best: string | null = null, bestSat = -1, bestDeg = -1, ties = 0;
        for (const o of remaining) {
          const used = new Set<number>();
          let deg = 0;
          for (const nb of adj.get(o)!) {
            if (remaining.has(nb)) deg++;
            const c = colored.get(nb);
            if (c !== undefined) used.add(c);
          }
          if (used.size > bestSat || (used.size === bestSat && deg > bestDeg)) {
            best = o; bestSat = used.size; bestDeg = deg; ties = 1;
          } else if (used.size === bestSat && deg === bestDeg) {
            ties++;
            if (rng.next() < 1 / ties) best = o;
          }
        }
        const o = best!;
        const used = new Set<number>();
        for (const nb of adj.get(o)!) { const c = colored.get(nb); if (c !== undefined) used.add(c); }
        let color = 0;
        while (used.has(color)) color++;
        colored.set(o, color);
        remaining.delete(o);
      }
      const nc = new Set(colored.values()).size;
      if (nc < bestColors) { bestColors = nc; bestColoring = colored; if (nc <= lb) break; }
    }
    for (const [o, color] of bestColoring!) blockOf.set(o, `block-${credit}-${color}`);
  }

  const blocks = new Map<string, string[]>();
  for (const [oid, bid] of blockOf) {
    const arr = blocks.get(bid);
    if (arr) arr.push(oid);
    else blocks.set(bid, [oid]);
  }
  return { blockOf, blocks };
}
