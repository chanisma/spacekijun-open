import type { Placement, TimetableInput } from '../types';
import { TEACHER_HARD_TIER1_IDS } from '../constants';
import { buildConflictGraph } from './conflictGraph';
import { cellKeyStr, enumerateCells } from './csp';
import { evaluateFull } from './score';
import { createRng } from './rng';
import { collectTeacherViolations, teacherHardConfig, teacherPlaceCost } from './teacherConstraints';

/** Bounded recursive displacement (ejection tree). Putting one lesson in a full
 * cell releases its blockers and recursively finds places for those lessons.
 * A complete chain is committed only after independent original-hard validation. */
export function repairByEjection(
  input: TimetableInput, initial: Placement[], deadline: number, seed = 7,
): { placements: Placement[]; before: number; after: number; attempts: number } {
  const graph = buildConflictGraph(input.lessons, { teacher: input.options.hard.teacherConflict, room: input.options.hard.roomConflict });
  const check = (ps: Placement[]) => {
    const hard = evaluateFull(ps, { input, graph }).score.hard;
    return { base: hard.filter((h) => !TEACHER_HARD_TIER1_IDS.has(h.id)).reduce((s, h) => s + h.count, 0),
      teacher: hard.filter((h) => TEACHER_HARD_TIER1_IDS.has(h.id)).reduce((s, h) => s + h.count, 0) };
  };
  const checked = check(initial);
  const out = { placements: initial, before: checked.teacher, after: checked.teacher, attempts: 0 };
  if (checked.base || !checked.teacher) return out;
  const lessons = input.lessons;
  const index = new Map(lessons.map((l, i) => [l.id, i]));
  const cells = enumerateCells(input.grid);
  const cellIndex = new Map(cells.map((c, i) => [cellKeyStr(c), i]));
  const color = new Int32Array(lessons.length).fill(-1);
  const locked = new Uint8Array(lessons.length);
  for (const p of input.pinned) locked[index.get(p.lessonId)!] = 1;
  const pinned = locked.slice();
  const adjacency = lessons.map((l) => [...(graph.adjacency.get(l.id) ?? [])].map((id) => index.get(id)!));
  const domains = lessons.map((l) => cells.flatMap((c, i) => l.blockedCells.includes(cellKeyStr(c)) ? [] : [i]));
  const byTeacher = new Map<string, number[]>(), byOffering = new Map<string, number[]>();
  lessons.forEach((l, i) => {
    if (l.teacherId) (byTeacher.get(l.teacherId) ?? byTeacher.set(l.teacherId, []).get(l.teacherId)!).push(i);
    (byOffering.get(l.offeringId) ?? byOffering.set(l.offeringId, []).get(l.offeringId)!).push(i);
  });
  const cfg = teacherHardConfig(input), rng = createRng(seed);
  const snapshot = () => lessons.map((l, i) => ({ lessonId: l.id, ...cells[color[i]] }));
  const blockersFor = (i: number, target: number): Set<number> | null => {
    const removed = new Set(adjacency[i].filter((j) => color[j] === target));
    if ([...removed].some((j) => locked[j])) return null;
    const day = cells[target].dayIndex, period = cells[target].period;
    if (input.options.hard.subjectDailyCap) {
      const sameDay = byOffering.get(lessons[i].offeringId)!.filter((j) => j !== i && color[j] >= 0 && !removed.has(j) && cells[color[j]].dayIndex === day);
      const excess = sameDay.length + 1 - input.options.maxPerSubjectPerDay;
      const movable = sameDay.filter((j) => !locked[j]);
      if (excess > movable.length) return null;
      for (let k = 0; k < excess; k++) removed.add(movable[k]);
    }
    const teacher = lessons[i].teacherId;
    if (!teacher || !cfg.any) return removed;
    const peers = byTeacher.get(teacher)!.filter((j) => j !== i && color[j] >= 0);
    const cost = (extra = -1) => {
      let count = 0, mask = 0, last = 0, subjectMask = 0;
      for (const j of peers) {
        if (removed.has(j) || j === extra) continue;
        const c = cells[color[j]];
        if (c.period === cfg.lastPeriod) last++;
        if (c.dayIndex !== day) continue;
        count++;
        mask |= 1 << (c.period - 1);
        if (lessons[j].offeringId === lessons[i].offeringId) subjectMask |= 1 << (c.period - 1);
      }
      return teacherPlaceCost(cfg, count, mask, last, subjectMask, period);
    };
    let current = cost();
    while (current > 0) {
      let bestCost = current, chosen = -1;
      for (const j of peers) {
        if (locked[j] || removed.has(j)) continue;
        const next = cost(j);
        if (next < bestCost) { bestCost = next; chosen = j; }
      }
      if (chosen < 0) return null;
      removed.add(chosen);
      current = bestCost;
    }
    return removed;
  };
  while (Date.now() < deadline && out.after > 0) {
    for (const p of out.placements) color[index.get(p.lessonId)!] = cellIndex.get(cellKeyStr(p))!;
    locked.set(pinned);
    const bad = collectTeacherViolations(cfg, input.grid.days, out.placements.flatMap((p) => {
      const l = lessons[index.get(p.lessonId)!];
      return l.teacherId ? [{ ...p, teacherId: l.teacherId, subjectName: l.subjectName, offeringId: l.offeringId }] : [];
    })).lessonIds;
    const roots = [...bad].map((id) => index.get(id)!).filter((i) => !pinned[i]);
    if (!roots.length) break;
    const root = roots[rng.int(roots.length)], origin = color[root];
    color[root] = -1;
    out.attempts++;
    let nodes = 0;
    const search = (queue: number[], depth: number): boolean => {
      if (++nodes > 2000 || depth > 45 || queue.length > 25 || Date.now() >= deadline) return false;
      if (!queue.length) {
        const placements = snapshot(), c = check(placements);
        if (c.base === 0 && c.teacher < out.after) { out.placements = placements; out.after = c.teacher; return true; }
        return false;
      }
      queue.sort((a, b) => adjacency[b].length - adjacency[a].length);
      const [i, ...tail] = queue;
      const choices = domains[i].flatMap((target) => {
        if (i === root && target === origin) return [];
        const blockers = blockersFor(i, target);
        return blockers ? [{ target, blockers, tie: rng.next() }] : [];
      }).sort((a, b) => a.blockers.size - b.blockers.size || a.tie - b.tie);
      for (const choice of choices.slice(0, depth < 8 ? 4 : 2)) {
        const previous = [...choice.blockers].map((j) => [j, color[j]] as const);
        for (const [j] of previous) color[j] = -1;
        color[i] = choice.target;
        locked[i] = 1;
        if (search([...tail, ...choice.blockers], depth + 1)) return true;
        locked[i] = 0;
        color[i] = -1;
        for (const [j, c] of previous) color[j] = c;
      }
      return false;
    };
    search([root], 0);
  }
  return out;
}
