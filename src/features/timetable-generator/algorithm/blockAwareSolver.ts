import type { Lesson, Placement, TimetableInput } from '../types';
import type { Rng } from './rng';
import { type CellKey, cellKeyStr, enumerateCells, minConflictsSeed } from './csp';
import { type ConflictGraph, edgeKey } from './conflictGraph';
import { inferElectiveBlocks } from './blocks';
import {
  collectTeacherViolations,
  teacherHardConfig,
  type TeacherPlacedLesson,
} from './teacherConstraints';

/**
 * 블록-인지 seed 솔버. 선택과목 블록(선택군)의 멤버를 같은 칸에 정렬(collapse)해 변수를 줄인 뒤
 * 기존 min-conflicts로 푼다. 블록 멤버는 충돌그래프 독립집합이라 collapse가 간선을 잃지 않는다.
 * (검증: 실데이터 2학년 7블록 정렬 — 273 lessons → ~150 units. 슬랙0에선 잔여가 남을 수 있어
 *  best-effort 반환; 사람이 소수 잔여를 정리하는 워크플로를 전제.)
 *
 * minConflictsSeed와 동일 시그니처.
 */
export function blockAwareSeed(
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  domains: Map<string, CellKey[]>,
  pinned: Set<string>,
  deadlineMs: number,
  maxSteps: number,
): { placements: Placement[]; conflicts: number } | null {
  const { blockOf } = inferElectiveBlocks(input.lessons);
  if (blockOf.size === 0) {
    // 블록이 없으면 일반 min-conflicts와 동일
    return minConflictsSeed(input, graph, rng, domains, pinned, deadlineMs, maxSteps);
  }

  // offering -> lessons
  const offLessons = new Map<string, Lesson[]>();
  for (const l of input.lessons) {
    const arr = offLessons.get(l.offeringId);
    if (arr) arr.push(l);
    else offLessons.set(l.offeringId, [l]);
  }

  // 블록 -> 멤버 offering
  const blockMembers = new Map<string, string[]>();
  for (const [oid, bid] of blockOf) {
    const arr = blockMembers.get(bid);
    if (arr) arr.push(oid);
    else blockMembers.set(bid, [oid]);
  }

  // collapse: 블록 멤버의 k번째 lesson을 super-lesson(`{bid}#{k}`)으로 병합
  const collapseId = new Map<string, string>(); // 원 lessonId -> collapsed id
  const superMembers = new Map<string, string[]>();
  for (const [bid, members] of blockMembers) {
    const credits = offLessons.get(members[0])!.length;
    for (let k = 0; k < credits; k++) {
      const sid = `${bid}#${k}`;
      superMembers.set(sid, []);
      for (const oid of members) {
        const ls = offLessons.get(oid)!;
        if (k < ls.length) {
          collapseId.set(ls[k].id, sid);
          superMembers.get(sid)!.push(ls[k].id);
        }
      }
    }
  }
  for (const l of input.lessons) if (!collapseId.has(l.id)) collapseId.set(l.id, l.id);

  // collapsed lessons (super-lesson은 union roster/blocked, offeringId=blockId)
  const collapsedLessons: Lesson[] = [];
  const seen = new Set<string>();
  for (const l of input.lessons) {
    const cid = collapseId.get(l.id)!;
    if (seen.has(cid)) continue;
    seen.add(cid);
    if (cid === l.id) {
      collapsedLessons.push(l);
      continue;
    }
    const memberIds = superMembers.get(cid)!;
    const studentCodes = new Set<string>();
    const blocked = new Set<string>();
    for (const mid of memberIds) {
      const ml = graph.byLessonId.get(mid)!;
      for (const s of ml.studentCodes) studentCodes.add(s);
      for (const bc of ml.blockedCells) blocked.add(bc);
    }
    const bid = cid.slice(0, cid.lastIndexOf('#'));
    collapsedLessons.push({
      ...l,
      id: cid,
      offeringId: bid,
      studentCodes: [...studentCodes],
      studentCount: studentCodes.size,
      blockedCells: [...blocked],
      teacherId: null,
      classKeys: [],
    });
  }

  // collapsed graph (원 adjacency를 collapsed id로 매핑; 블록 내부 간선은 없음=독립집합)
  const cByLessonId = new Map(collapsedLessons.map((l) => [l.id, l]));
  const cByOffering = new Map<string, string[]>();
  for (const l of collapsedLessons) {
    const arr = cByOffering.get(l.offeringId);
    if (arr) arr.push(l.id);
    else cByOffering.set(l.offeringId, [l.id]);
  }
  const cAdjacency = new Map<string, Set<string>>();
  for (const l of collapsedLessons) cAdjacency.set(l.id, new Set());
  const cEdgeReason = new Map<string, number>();
  for (const [a, set] of graph.adjacency) {
    const ca = collapseId.get(a)!;
    for (const b of set) {
      const cb = collapseId.get(b)!;
      if (ca === cb) continue;
      cAdjacency.get(ca)!.add(cb);
      cAdjacency.get(cb)!.add(ca);
      const k = edgeKey(ca, cb);
      cEdgeReason.set(k, (cEdgeReason.get(k) ?? 0) | (graph.edgeReason.get(edgeKey(a, b)) ?? 0));
    }
  }
  const cGraph: ConflictGraph = {
    lessons: collapsedLessons,
    byLessonId: cByLessonId,
    byOffering: cByOffering,
    adjacency: cAdjacency,
    edgeReason: cEdgeReason,
    studentToLessons: new Map(),
  };

  // collapsed domains
  const cells = enumerateCells(input.grid);
  const cDomains = new Map<string, CellKey[]>();
  for (const l of collapsedLessons) {
    const blocked = new Set(l.blockedCells);
    cDomains.set(l.id, cells.filter((c) => !blocked.has(cellKeyStr(c))));
  }

  // pinned 매핑
  const cPinned = new Set<string>();
  for (const p of pinned) cPinned.add(collapseId.get(p) ?? p);
  const cPinnedArr = input.pinned.map((p) => ({ ...p, lessonId: collapseId.get(p.lessonId) ?? p.lessonId }));
  const cInput: TimetableInput = { ...input, lessons: collapsedLessons, pinned: cPinnedArr };

  const cMaxSteps = Math.max(500000, collapsedLessons.length * 3000);
  const sol = minConflictsSeed(cInput, cGraph, rng, cDomains, cPinned, deadlineMs, Math.min(maxSteps, cMaxSteps));
  if (!sol) return null;

  // 펼치기: super 칸 → 멤버 lesson
  const cellOf = new Map(sol.placements.map((p) => [p.lessonId, { dayIndex: p.dayIndex, period: p.period }]));
  const placements: Placement[] = input.lessons.map((l) => {
    const c = cellOf.get(collapseId.get(l.id)!)!;
    return { lessonId: l.id, dayIndex: c.dayIndex, period: c.period };
  });

  // 원 그래프 기준 실제 잔여 충돌 집계 (collapse가 과소평가하지 않도록 재측정)
  const conflicts = countConflicts(placements, input, graph);
  return { placements, conflicts };
}

/** 원 그래프 기준 하드 충돌 수 (인접 동거 + 같은 과목 하루 한도 초과) */
function countConflicts(placements: Placement[], input: TimetableInput, graph: ConflictGraph): number {
  const occ = new Map<string, string[]>();
  for (const p of placements) {
    const k = `${p.dayIndex}|${p.period}`;
    const arr = occ.get(k);
    if (arr) arr.push(p.lessonId);
    else occ.set(k, [p.lessonId]);
  }
  const conflicted = new Set<string>();
  for (const ids of occ.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (graph.adjacency.get(ids[i])?.has(ids[j])) {
          conflicted.add(ids[i]);
          conflicted.add(ids[j]);
        }
      }
    }
  }
  if (input.options.hard.subjectDailyCap) {
    const offDay = new Map<string, string[]>();
    for (const p of placements) {
      const l = graph.byLessonId.get(p.lessonId);
      if (!l) continue;
      const key = `${l.offeringId}|${p.dayIndex}`;
      const arr = offDay.get(key);
      if (arr) arr.push(p.lessonId);
      else offDay.set(key, [p.lessonId]);
    }
    for (const ids of offDay.values()) {
      if (ids.length > input.options.maxPerSubjectPerDay) for (const id of ids) conflicted.add(id);
    }
  }
  // 교사 하드 제약 위반 참여 lesson (collapse가 교사 정보를 잃으므로 원 그래프에서 재측정)
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
    for (const id of collectTeacherViolations(tcfg, input.grid.days, placed).lessonIds) conflicted.add(id);
  }
  return conflicted.size;
}
