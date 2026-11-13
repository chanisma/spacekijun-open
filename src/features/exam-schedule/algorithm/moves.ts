import type { ExamScheduleInput, Grade, SlotAssignment } from '../types';
import type { ConflictGraph } from './conflictGraph';
import { daysOf, type SlotKey } from './csp';
import { allPinned } from '../utils/multiGrade';
import type { Rng } from './rng';

export type MoveType = 'swap-slots' | 'move-slot' | 'swap-days' | 'perturb-cluster';

function pinnedSubjectIds(input: ExamScheduleInput): Set<string> {
  return new Set(allPinned(input).map((p) => p.subjectId));
}

function clone(assignments: SlotAssignment[]): SlotAssignment[] {
  return assignments.map((a) => ({ ...a }));
}

function gradeOf(graph: ConflictGraph, subjectId: string): Grade | null {
  return graph.bySubjectId.get(subjectId)?.grade ?? null;
}

/**
 * 이동 연산은 모두 "학년 내부"에서만 작동한다. 학년이 다르면 일차별 시험 개수
 * (H5)가 학년별로 따로 집계되므로, 학년을 넘나드는 swap은 양쪽 학년의 day
 * 구조를 동시에 깨뜨린다. 학년 간 상호작용(감독 수요)은 score가 평가하고
 * SA의 수락/거절로 반영된다.
 */
export function pickMove(
  current: SlotAssignment[],
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotAssignment[] | null {
  const r = rng.next();
  if (r < 0.5) return swapSlots(current, input, graph, rng);
  if (r < 0.8) return moveSlot(current, input, graph, rng);
  if (r < 0.9) return swapDays(current, input, graph, rng);
  return perturbCluster(current, input, graph, rng);
}

export function swapSlots(
  current: SlotAssignment[],
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotAssignment[] | null {
  const pinned = pinnedSubjectIds(input);
  const movable = current.filter((a) => !pinned.has(a.subjectId));
  if (movable.length < 2) return null;

  const a = movable[rng.int(movable.length)];
  const gradeA = gradeOf(graph, a.subjectId);
  const sameGrade = movable.filter(
    (x) => x.subjectId !== a.subjectId && gradeOf(graph, x.subjectId) === gradeA,
  );
  if (sameGrade.length === 0) return null;
  const b = sameGrade[rng.int(sameGrade.length)];

  const next = clone(current);
  for (const item of next) {
    if (item.subjectId === a.subjectId) {
      item.dayIndex = b.dayIndex;
      item.period = b.period;
    } else if (item.subjectId === b.subjectId) {
      item.dayIndex = a.dayIndex;
      item.period = a.period;
    }
  }
  return next;
}

export function moveSlot(
  current: SlotAssignment[],
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotAssignment[] | null {
  const pinned = pinnedSubjectIds(input);
  const movable = current.filter((a) => !pinned.has(a.subjectId));
  if (movable.length === 0) return null;
  const a = movable[rng.int(movable.length)];
  const grade = gradeOf(graph, a.subjectId);
  if (grade === null) return null;
  const days = daysOf(input, grade);

  // 같은 학년의 배치만으로 일차별 사용 교시/셀 점유를 계산 (H5는 학년별 제약)
  const gradeAssignments = current.filter(
    (item) => gradeOf(graph, item.subjectId) === grade,
  );
  const slotsByDay = new Map<number, Set<number>>();
  const subjectsByCell = new Map<string, number>(); // "day|period" -> count
  for (const item of gradeAssignments) {
    const k = `${item.dayIndex}|${item.period}`;
    subjectsByCell.set(k, (subjectsByCell.get(k) ?? 0) + 1);
    let set = slotsByDay.get(item.dayIndex);
    if (!set) {
      set = new Set();
      slotsByDay.set(item.dayIndex, set);
    }
    set.add(item.period);
  }

  const sourceCellCount = subjectsByCell.get(`${a.dayIndex}|${a.period}`) ?? 0;
  const sourceIsLastInCell = sourceCellCount <= 1;

  // Generate targets that preserve dailyExamCount (H5):
  // - target must be on an active period
  // - if moving to a new (day, period) creates a new distinct slot, the source
  //   must currently be the last subject in its slot (so net distinct slots stays the same on source-day)
  //   AND the target day's distinct slot count must remain ≤ examCount
  const targets: SlotKey[] = [];
  for (const day of days) {
    const daySlots = slotsByDay.get(day.dayIndex) ?? new Set<number>();
    for (const p of day.availablePeriods) {
      if (day.dayIndex === a.dayIndex && p === a.period) continue;
      const targetIsExisting = daySlots.has(p);
      if (targetIsExisting) {
        if (day.dayIndex === a.dayIndex) {
          // Same day, same slot count regardless
          targets.push({ dayIndex: day.dayIndex, period: p });
        } else if (!sourceIsLastInCell) {
          // Different day, source slot keeps at least 1 subject left → no slot loss on source
          targets.push({ dayIndex: day.dayIndex, period: p });
        }
      } else {
        // Target opens a new slot. Only OK if source loses one (sourceIsLastInCell) and
        // target day still respects examCount limit.
        if (sourceIsLastInCell && day.dayIndex !== a.dayIndex) {
          const newCount = (slotsByDay.get(day.dayIndex)?.size ?? 0) + 1;
          if (newCount <= day.examCount) targets.push({ dayIndex: day.dayIndex, period: p });
        }
        // Same day, opening a new slot AND closing the source slot keeps count
        if (sourceIsLastInCell && day.dayIndex === a.dayIndex) {
          targets.push({ dayIndex: day.dayIndex, period: p });
        }
      }
    }
  }

  if (targets.length === 0) return null;
  const t = targets[rng.int(targets.length)];
  const next = clone(current);
  for (const item of next) {
    if (item.subjectId === a.subjectId) {
      item.dayIndex = t.dayIndex;
      item.period = t.period;
    }
  }
  return next;
}

export function swapDays(
  current: SlotAssignment[],
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotAssignment[] | null {
  if (input.grades.length === 0) return null;
  const grade = input.grades[rng.int(input.grades.length)];
  const days = daysOf(input, grade);
  if (days.length < 2) return null;

  const gradePinned = input.gradeInputs[grade]?.pinned ?? [];

  // Find two days where examCount and availablePeriods are compatible
  for (let attempt = 0; attempt < 8; attempt++) {
    const i = rng.int(days.length);
    let j = rng.int(days.length);
    while (j === i) j = rng.int(days.length);
    const dA = days[i];
    const dB = days[j];
    if (dA.examCount !== dB.examCount) continue;
    // Skip if pinned subjects exist on either day (이 학년 기준)
    const hasPinned = gradePinned.some(
      (p) => p.dayIndex === dA.dayIndex || p.dayIndex === dB.dayIndex,
    );
    if (hasPinned) continue;
    // Periods must be compatible: each subject in day A needs a target period in day B
    const aPeriods = new Set<number>();
    const bPeriods = new Set<number>();
    for (const item of current) {
      if (gradeOf(graph, item.subjectId) !== grade) continue;
      if (item.dayIndex === dA.dayIndex) aPeriods.add(item.period);
      if (item.dayIndex === dB.dayIndex) bPeriods.add(item.period);
    }
    if (![...aPeriods].every((p) => dB.availablePeriods.includes(p))) continue;
    if (![...bPeriods].every((p) => dA.availablePeriods.includes(p))) continue;

    const next = clone(current);
    for (const item of next) {
      if (gradeOf(graph, item.subjectId) !== grade) continue;
      if (item.dayIndex === dA.dayIndex) item.dayIndex = dB.dayIndex;
      else if (item.dayIndex === dB.dayIndex) item.dayIndex = dA.dayIndex;
    }
    return next;
  }
  return null;
}

export function perturbCluster(
  current: SlotAssignment[],
  input: ExamScheduleInput,
  graph: ConflictGraph,
  rng: Rng,
): SlotAssignment[] | null {
  // Pick a random subject and try moving it to least-loaded day
  return moveSlot(current, input, graph, rng);
}
