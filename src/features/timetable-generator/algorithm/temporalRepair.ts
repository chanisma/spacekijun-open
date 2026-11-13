import type { Placement, TimetableInput } from '../types';
import { TEACHER_HARD_TIER1_IDS } from '../constants';
import { buildConflictGraph } from './conflictGraph';
import { cellKeyStr, enumerateCells } from './csp';
import { getHighsInstance, recoverCliques } from './cpSatSolver';
import { solveMilp } from './bruteforceRepair';
import { evaluateFull } from './score';
import { collectTeacherViolations, teacherHardConfig } from './teacherConstraints';
import { createRng } from './rng';

/** Release all lessons on three/four selected cells, then whole days. Unlike
 * random graph neighborhoods, these preserve room to move at zero slack. */
export function repairTimeNeighborhoods(
  input: TimetableInput, initial: Placement[], deadlineMs: number,
  onProgress?: (remaining: number, days: number[]) => void,
  seed = 7,
): { placements: Placement[]; before: number; after: number; attempts: number } {
  const graph = buildConflictGraph(input.lessons, { teacher: input.options.hard.teacherConflict, room: input.options.hard.roomConflict });
  const evaluate = (placements: Placement[]) => {
    const { score } = evaluateFull(placements, { input, graph });
    return {
      base: score.hard.filter((h) => !TEACHER_HARD_TIER1_IDS.has(h.id)).reduce((a, h) => a + h.count, 0),
      teacher: score.hard.filter((h) => TEACHER_HARD_TIER1_IDS.has(h.id)).reduce((a, h) => a + h.count, 0),
    };
  };
  const start = evaluate(initial);
  const result = { placements: initial, before: start.teacher, after: start.teacher, attempts: 0 };
  const highs = getHighsInstance();
  if (!highs || start.base || !start.teacher) return result;
  const cells = enumerateCells(input.grid);
  const cellIndex = new Map(cells.map((c, i) => [cellKeyStr(c), i]));
  const cliques = recoverCliques(input, graph);
  const pinned = new Set(input.pinned.map((p) => p.lessonId));
  const cfg = teacherHardConfig(input);
  const rng = createRng(seed);
  const neighborhoods: number[][] = [];
  const placed = initial.flatMap((p) => {
    const l = graph.byLessonId.get(p.lessonId)!;
    return l.teacherId ? [{ ...p, teacherId: l.teacherId, subjectName: l.subjectName, offeringId: l.offeringId }] : [];
  });
  const bad = collectTeacherViolations(cfg, input.grid.days, placed).lessonIds;
  const badCells = [...new Set(initial.filter((p) => bad.has(p.lessonId)).map((p) => cellIndex.get(cellKeyStr(p))!))];
  // Three/four-color exchanges generalize a two-color Kempe flip. Releasing
  // every lesson on these cells also releases the saturated elective blocks.
  for (let k = 0; k < 40 && badCells.length; k++) {
    const a = badCells[rng.int(badCells.length)];
    const sameDay = cells.map((c, i) => i).filter((i) => cells[i].dayIndex === cells[a].dayIndex);
    const pool = k % 3 ? sameDay : cells.map((_, i) => i);
    const group = new Set([a]);
    while (group.size < Math.min(k % 2 ? 4 : 3, pool.length)) group.add(pool[rng.int(pool.length)]);
    neighborhoods.push([...group]);
  }
  for (let d = 0; d < input.grid.days; d++) neighborhoods.push(cells.flatMap((c, i) => c.dayIndex === d ? [i] : []));
  for (const selectedCells of neighborhoods) {
    if (Date.now() >= deadlineMs || !result.after) break;
    const selected = new Set(selectedCells);
    const freeIds = new Set(result.placements.filter((p) => selected.has(cellIndex.get(cellKeyStr(p))!) && !pinned.has(p.lessonId)).map((p) => p.lessonId));
    const free = input.lessons.filter((l) => freeIds.has(l.id));
    if (!free.length) continue;
    const fixed = new Map(result.placements.filter((p) => !freeIds.has(p.lessonId)).map((p) => [p.lessonId, { dayIndex: p.dayIndex, period: p.period }]));
    const domains = new Map(free.map((l) => [l.id, cells.filter((c, i) => selected.has(i) && !l.blockedCells.includes(cellKeyStr(c)))]));
    result.attempts++;
    const sub = solveMilp(highs, input, graph, free, fixed, domains, cliques, cells, cellIndex, {
      timeSec: Math.min(selected.size <= 4 ? 0.8 : 4, (deadlineMs - Date.now()) / 1000),
      symmetry: false, teacher: { cfg, soft: true },
    });
    if (!sub) continue;
    const placements = result.placements.map((p) => sub.has(p.lessonId) ? { lessonId: p.lessonId, ...sub.get(p.lessonId)! } : p);
    const checked = evaluate(placements);
    if (checked.base === 0 && checked.teacher < result.after) {
      result.placements = placements;
      result.after = checked.teacher;
      onProgress?.(result.after, [...new Set(selectedCells.map((i) => cells[i].dayIndex))]);
    }
  }
  return result;
}
