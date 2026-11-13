import type { TimetableInput } from '../types';
import type { ConflictGraph } from './conflictGraph';
import { type CellKey } from './csp';
import type { AssignmentMap } from './score';
import type { Rng } from './rng';
import { type TeacherHardConfig, teacherViolationsOf } from './teacherConstraints';

export type Move =
  | { kind: 'move'; id: string; from: CellKey; to: CellKey }
  | { kind: 'swap'; idA: string; idB: string; cellA: CellKey; cellB: CellKey };

export interface MoveTeacherCtx {
  cfg: TeacherHardConfig;
  days: number;
  /** teacherId -> 그 교사의 모든 lessonId (pinned 포함 — 점유는 map에서 읽음) */
  byTeacher: Map<string, string[]>;
}

export interface MoveContext {
  /** 이동 가능한 lesson id (pinned 제외) */
  movableIds: string[];
  /** 정적 도메인: 각 lesson의 (전체 칸 − 차단 칸) */
  domains: Map<string, CellKey[]>;
  /** 교사 하드 제약 (플래그 전부 off면 undefined = 레거시 경로, 추가 비용 0) */
  teacher?: MoveTeacherCtx;
}

function sameCell(a: CellKey, b: CellKey): boolean {
  return a.dayIndex === b.dayIndex && a.period === b.period;
}

export function applyMove(map: AssignmentMap, move: Move): void {
  if (move.kind === 'move') {
    map.set(move.id, move.to);
  } else {
    map.set(move.idA, move.cellB);
    map.set(move.idB, move.cellA);
  }
}

export function revertMove(map: AssignmentMap, move: Move): void {
  if (move.kind === 'move') {
    map.set(move.id, move.from);
  } else {
    map.set(move.idA, move.cellA);
    map.set(move.idB, move.cellB);
  }
}

/**
 * lesson을 cell에 둘 수 있는가 (현재 배치 기준).
 * ignore: 검사에서 제외할 lesson(보통 swap 상대 — 곧 자리를 비울 lesson).
 */
function feasibleAt(
  map: AssignmentMap,
  graph: ConflictGraph,
  input: TimetableInput,
  id: string,
  cell: CellKey,
  ignore?: string,
): boolean {
  // 인접(학생/교사/교실) 충돌
  for (const nb of graph.adjacency.get(id) ?? []) {
    if (nb === ignore) continue;
    const c = map.get(nb);
    if (c && c.dayIndex === cell.dayIndex && c.period === cell.period) return false;
  }
  // 같은 과목 하루 한도
  if (input.options.hard.subjectDailyCap) {
    const lesson = graph.byLessonId.get(id);
    if (lesson) {
      let cnt = 0;
      for (const sib of graph.byOffering.get(lesson.offeringId) ?? []) {
        if (sib === id || sib === ignore) continue;
        const c = map.get(sib);
        if (c && c.dayIndex === cell.dayIndex) cnt++;
      }
      if (cnt >= input.options.maxPerSubjectPerDay) return false;
    }
  }
  return true;
}

/** 무브 적용 후 한 교사의 하드 위반 총수 (overrides = 이번 무브로 옮겨질 lesson의 새 칸) */
function teacherViolationsWith(
  map: AssignmentMap,
  graph: ConflictGraph,
  tctx: MoveTeacherCtx,
  teacherId: string,
  overrides: ReadonlyArray<readonly [string, CellKey]> | null,
): number {
  const entries: { dayIndex: number; period: number; offeringId: string }[] = [];
  for (const id of tctx.byTeacher.get(teacherId) ?? []) {
    let cell = map.get(id);
    if (overrides) for (const [oid, oc] of overrides) if (oid === id) cell = oc;
    if (!cell) continue;
    entries.push({
      dayIndex: cell.dayIndex,
      period: cell.period,
      offeringId: graph.byLessonId.get(id)?.offeringId ?? id,
    });
  }
  return teacherViolationsOf(tctx.cfg, tctx.days, entries);
}

/**
 * 무브가 교사 하드 위반을 늘리지 않는가. "0 유지"가 아니라 "비증가"를 요구해,
 * 위반이 있는 시드에서 출발해도 SA가 위반을 줄이는 방향으로만 움직이게 한다.
 * 같은 교사의 두 lesson을 맞바꾸는 swap도 (교시 집합이 통째로 평가되므로) 정확하다.
 */
function teacherMoveOk(
  map: AssignmentMap,
  graph: ConflictGraph,
  mctx: MoveContext,
  changes: ReadonlyArray<readonly [string, CellKey]>,
): boolean {
  const tctx = mctx.teacher;
  if (!tctx) return true;
  const teachers = new Set<string>();
  for (const [id] of changes) {
    const tid = graph.byLessonId.get(id)?.teacherId;
    if (tid) teachers.add(tid);
  }
  for (const tid of teachers) {
    const before = teacherViolationsWith(map, graph, tctx, tid, null);
    const after = teacherViolationsWith(map, graph, tctx, tid, changes);
    if (after > before) return false;
  }
  return true;
}

function pickMoveOne(
  map: AssignmentMap,
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  mctx: MoveContext,
): Move | null {
  if (mctx.movableIds.length === 0) return null;
  const id = mctx.movableIds[rng.int(mctx.movableIds.length)];
  const from = map.get(id);
  if (!from) return null;
  const domain = mctx.domains.get(id) ?? [];
  if (domain.length < 2) return null;
  // 무작위 시작 오프셋으로 도메인을 훑어 첫 실현가능 칸 채택
  const start = rng.int(domain.length);
  for (let k = 0; k < domain.length; k++) {
    const to = domain[(start + k) % domain.length];
    if (sameCell(to, from)) continue;
    if (feasibleAt(map, graph, input, id, to, id) && teacherMoveOk(map, graph, mctx, [[id, to]])) {
      return { kind: 'move', id, from, to };
    }
  }
  return null;
}

function pickSwap(
  map: AssignmentMap,
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  mctx: MoveContext,
): Move | null {
  if (mctx.movableIds.length < 2) return null;
  const idA = mctx.movableIds[rng.int(mctx.movableIds.length)];
  const idB = mctx.movableIds[rng.int(mctx.movableIds.length)];
  if (idA === idB) return null;
  const cellA = map.get(idA);
  const cellB = map.get(idB);
  if (!cellA || !cellB || sameCell(cellA, cellB)) return null;
  // 교환 후 양쪽 모두 실현가능해야 한다 (상대를 ignore로 빼고 검사)
  if (!feasibleAt(map, graph, input, idA, cellB, idB)) return null;
  if (!feasibleAt(map, graph, input, idB, cellA, idA)) return null;
  // 도메인(차단 칸) 위반 방지: 상대 칸이 자기 정적 도메인에 있어야 한다
  const domA = mctx.domains.get(idA);
  const domB = mctx.domains.get(idB);
  if (domA && !domA.some((c) => sameCell(c, cellB))) return null;
  if (domB && !domB.some((c) => sameCell(c, cellA))) return null;
  if (!teacherMoveOk(map, graph, mctx, [[idA, cellB], [idB, cellA]])) return null;
  return { kind: 'swap', idA, idB, cellA, cellB };
}

export function pickMove(
  map: AssignmentMap,
  input: TimetableInput,
  graph: ConflictGraph,
  rng: Rng,
  mctx: MoveContext,
): Move | null {
  return rng.next() < 0.7
    ? pickMoveOne(map, input, graph, rng, mctx)
    : pickSwap(map, input, graph, rng, mctx);
}
