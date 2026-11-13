import { supabase } from '@/integrations/supabase/client';
import type {
  ExamScheduleInput,
  Grade,
  MockExamInput,
  SavedExamSchedule,
  ScheduleCandidate,
  ScheduleRunResult,
  SlotAssignment,
  SupervisorPlan,
} from '../types';
import { storedGradeValue } from '../utils/multiGrade';

export interface CreateExamScheduleArgs {
  grades: Grade[];
  title: string;
  input: ExamScheduleInput;
  result: ScheduleRunResult;
  selectedCandidateId?: string | null;
  finalizedAssignments?: SlotAssignment[] | null;
  status?: 'draft' | 'finalized' | 'archived';
  createdByResourceId?: string | null;
}

// Strip studentCodes (PII) from input_payload before persistence so finalized rows
// readable by students of the same grade do not leak cohort enumeration. Algorithm
// regeneration after load is not supported (re-run required) which is acceptable
// for the current spec: candidates and finalized_assignments are sufficient to
// display the saved timetable.
function sanitizeInputForStorage(input: ExamScheduleInput): ExamScheduleInput {
  const gradeInputs: ExamScheduleInput['gradeInputs'] = {};
  for (const g of input.grades) {
    const gi = input.gradeInputs[g];
    if (!gi) continue;
    gradeInputs[g] = {
      ...gi,
      // 코드는 제거하되 응시자 수는 보존 — 저장본 미리보기의 감독 수요 계산에 필요
      subjects: gi.subjects.map((s) => ({
        ...s,
        studentCodes: [],
        studentCount: s.studentCount ?? s.studentCodes.length,
      })),
    };
  }
  return { ...input, gradeInputs };
}

export async function createExamSchedule(
  args: CreateExamScheduleArgs,
): Promise<SavedExamSchedule> {
  const sanitizedInput = sanitizeInputForStorage(args.input);
  const allowedStatuses = new Set(['draft', 'finalized', 'archived']);
  const status = args.status && allowedStatuses.has(args.status) ? args.status : 'draft';
  const payload = {
    // 복수 학년 통합 시간표는 grade=0으로 저장하고 상세는 input_payload.grades 참조
    grade: storedGradeValue(args.grades),
    title: args.title,
    status,
    input_payload: sanitizedInput as unknown,
    candidates: args.result.candidates as unknown,
    selected_candidate_id: args.selectedCandidateId ?? null,
    finalized_assignments: (args.finalizedAssignments ?? null) as unknown,
    diagnostics: args.result.diagnostics as unknown,
    created_by: args.createdByResourceId ?? null,
  };
  const { data, error } = await supabase
    .from('exam_schedule' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SavedExamSchedule;
}

/**
 * 모의고사 감독표 생성. CSP 생성을 거치지 않으므로 candidates/diagnostics는
 * 비워 두고, 교시 구성(input_payload)과 감독 배정(supervisor_assignments)만 저장한다.
 */
export async function createMockExamSchedule(args: {
  grades: Grade[];
  title: string;
  input: MockExamInput;
  supervisorPlan: SupervisorPlan | null;
  status?: 'draft' | 'finalized';
  createdByResourceId?: string | null;
}): Promise<SavedExamSchedule> {
  const payload = {
    grade: storedGradeValue(args.grades),
    title: args.title,
    status: args.status ?? 'draft',
    exam_type: 'mock',
    input_payload: args.input as unknown,
    candidates: [] as unknown,
    selected_candidate_id: null,
    finalized_assignments: null,
    supervisor_assignments: args.supervisorPlan as unknown,
    diagnostics: null,
    created_by: args.createdByResourceId ?? null,
  };
  const { data, error } = await supabase
    .from('exam_schedule' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SavedExamSchedule;
}

export async function updateExamSchedule(
  id: string,
  patch: Partial<{
    title: string;
    status: 'draft' | 'finalized' | 'archived';
    selected_candidate_id: string | null;
    finalized_assignments: SlotAssignment[] | null;
    candidates: ScheduleCandidate[];
    supervisor_assignments: SupervisorPlan | null;
  }>,
): Promise<SavedExamSchedule> {
  const { data, error } = await supabase
    .from('exam_schedule' as any)
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SavedExamSchedule;
}

export async function deleteExamSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('exam_schedule' as any).delete().eq('id', id);
  if (error) throw error;
}

export async function listExamSchedules(): Promise<SavedExamSchedule[]> {
  const { data, error } = await supabase
    .from('exam_schedule' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SavedExamSchedule[];
}

export async function getExamSchedule(id: string): Promise<SavedExamSchedule | null> {
  const { data, error } = await supabase
    .from('exam_schedule' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SavedExamSchedule) ?? null;
}
