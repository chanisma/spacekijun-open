import { buildConflictGraph } from '../algorithm/conflictGraph';
import { evaluateFull } from '../algorithm/score';
import { sectionStudents } from '../algorithm/sectioning';
import type { Placement, SavedTimetablePlan, TimetableCandidate, TimetableInput } from '../types';
import { lessonsWithSectioning } from './sectioningReport';
import { candidateLessons } from './candidateRoster';

export function editCandidate(input: TimetableInput, candidate: TimetableCandidate, placements: Placement[]): TimetableCandidate {
  const lessons = candidate.sectionRoster ? candidateLessons(input, candidate) : lessonsWithSectioning(input.lessons, sectionStudents(input.lessons, placements));
  const graph = buildConflictGraph(lessons, { teacher: input.options.hard.teacherConflict, room: input.options.hard.roomConflict });
  const { score, metrics } = evaluateFull(placements, { input: { ...input, lessons }, graph });
  return { ...candidate, placements, scoreBreakdown: score, metrics };
}

/** Infinity는 JSON 저장 후 null이 된다. 과거 저장본도 안전하게 표시한다. */
export function formatCandidateScore(total: number | null | undefined): string {
  return total != null && Number.isFinite(total) ? total.toFixed(0) : '제약 위반';
}

export function selectedPlanCandidate(plan: SavedTimetablePlan, selectedId: string | null): TimetableCandidate | null {
  const candidate = plan.candidates.find((c) => c.id === (selectedId ?? plan.selected_candidate_id)) ?? plan.candidates[0];
  if (!candidate) return null;
  // 이미 확정된 후보를 볼 때만 마지막 확정 배치를 복원한다.
  return plan.finalized_placements && candidate.id === (plan.selected_candidate_id ?? plan.candidates[0]?.id)
    ? { ...candidate, placements: plan.finalized_placements }
    : candidate;
}
