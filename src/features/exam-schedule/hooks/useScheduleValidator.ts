import { useMemo } from 'react';
import type { ExamScheduleInput, ScoreBreakdown, SlotAssignment, CandidateMetrics } from '../types';
import { buildConflictGraph } from '../algorithm/conflictGraph';
import { allSubjects } from '../utils/multiGrade';
import { evaluate } from '../algorithm/score';

export interface ValidationResult {
  score: ScoreBreakdown;
  metrics: CandidateMetrics;
}

export function useScheduleValidator(
  input: ExamScheduleInput | null,
  assignments: SlotAssignment[] | null,
): ValidationResult | null {
  return useMemo(() => {
    if (!input || !assignments) return null;
    const graph = buildConflictGraph(allSubjects(input));
    return evaluate(assignments, { input, graph });
  }, [input, assignments]);
}
