/* eslint-disable @typescript-eslint/no-explicit-any -- timetable_plan은 생성된 Supabase 타입에 아직 없어 untyped 테이블로 접근한다 (exam_schedule 서비스와 동일 규약) */
import { supabase } from '@/integrations/supabase/client';
import type {
  Grade,
  Placement,
  SavedTimetablePlan,
  TimetableCandidate,
  TimetableInput,
  TimetableRunResult,
} from '../types';
import type { EnrollmentRow, OfferingRow, SelectionGroupRow } from '../utils/buildInput';
import { prepareTimetableFinalization } from '../utils/planFinalization';
import { sourceFromStudentTimetable, type StudentSourceRow, type TeacherSourceRow } from '../utils/studentTimetableSource';

// ── 소스 데이터 적재 (course_offering + student_enrollment) ──────────────

export type { SelectionGroupRow };

export interface TimetableSourceData {
  offerings: OfferingRow[];
  originalOfferings?: OfferingRow[];
  basis?: 'student-timetable' | 'enrollment';
  enrollments: EnrollmentRow[];
  /** 선택군 그룹(블록 솔버용). 조회 실패/미존재 시 빈 배열 → buildBlockInput이 추론 폴백 */
  selectionGroups: SelectionGroupRow[];
}

function normalizeGroupName(name: string): string {
  return name.replace(/^\d+\s*학년\s+/, '').trim();
}

/** 대상 학년의 선택군 그룹을 적재 (FK 네이밍 비의존: 4개 쿼리 JS 조인 + 정규화 병합) */
export async function fetchSelectionGroups(grades: Grade[]): Promise<SelectionGroupRow[]> {
  try {
    const { data: groups, error: gErr } = await supabase
      .from('course_selection_group')
      .select('id, target_grade, name')
      .in('target_grade', grades);
    if (gErr) throw gErr;
    const groupRows = (groups ?? []) as { id: string; target_grade: number; name: string }[];
    if (groupRows.length === 0) return [];
    const groupById = new Map(groupRows.map((g) => [g.id, g]));

    const { data: slots, error: sErr } = await supabase
      .from('course_selection_slot')
      .select('id, group_id, pick_count')
      .in('group_id', groupRows.map((g) => g.id));
    if (sErr) throw sErr;
    const slotRows = (slots ?? []) as { id: string; group_id: string; pick_count: number }[];
    if (slotRows.length === 0) return [];
    const slotById = new Map(slotRows.map((s) => [s.id, s]));

    const { data: links, error: lErr } = await supabase
      .from('course_selection_slot_subject')
      .select('slot_id, selectable_subject_id')
      .in('slot_id', slotRows.map((s) => s.id));
    if (lErr) throw lErr;
    const linkRows = (links ?? []) as { slot_id: string; selectable_subject_id: string }[];

    const subjIds = [...new Set(linkRows.map((l) => l.selectable_subject_id))];
    const { data: subs, error: subErr } = await supabase
      .from('course_selectable_subject')
      .select('id, name')
      .in('id', subjIds);
    if (subErr) throw subErr;
    const subNameById = new Map(((subs ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

    // (targetGrade, 정규화 그룹명)별 집계: 과목 union, pickCount = max
    const agg = new Map<string, { targetGrade: number; groupName: string; pickCount: number; subjects: Set<string> }>();
    for (const link of linkRows) {
      const slot = slotById.get(link.slot_id);
      if (!slot) continue;
      const group = groupById.get(slot.group_id);
      if (!group) continue;
      const subName = subNameById.get(link.selectable_subject_id);
      if (!subName) continue;
      const norm = normalizeGroupName(group.name);
      const key = `${group.target_grade}|${norm}`;
      let e = agg.get(key);
      if (!e) { e = { targetGrade: group.target_grade, groupName: norm, pickCount: slot.pick_count, subjects: new Set() }; agg.set(key, e); }
      e.pickCount = Math.max(e.pickCount, slot.pick_count);
      e.subjects.add(subName);
    }
    return [...agg.values()].map((e) => ({ targetGrade: e.targetGrade, groupName: e.groupName, pickCount: e.pickCount, subjects: [...e.subjects] }));
  } catch {
    return []; // 조회 실패 → 추론 폴백 (block 솔버가 enrollment로 K 추정)
  }
}

/** 선택한 기준으로 대상 학기의 수업·명단을 적재 (RLS: teacher/admin 세션 필요). */
export async function fetchTimetableSourceData(
  academicYear: number,
  semester: number,
  grades: Grade[],
  basis: 'student-timetable' | 'enrollment' = 'enrollment',
): Promise<TimetableSourceData> {
  const { data: offerings, error: offErr } = await supabase
    .from('course_offering')
    .select('id, grade, subject_name, credits, class_label, room_no, classroom, teacher_name, teacher_resource_id, meta')
    .eq('academic_year', academicYear)
    .eq('semester', semester)
    .in('grade', grades);
  if (offErr) throw offErr;

  // 수강 명단은 행이 많아(수천) 페이지네이션으로 모두 가져온다
  const enrollments: EnrollmentRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('student_enrollment')
      .select('course_offering_id, student_resource_id, student_grade, student_class, student_no, student_name')
      .eq('academic_year', academicYear)
      .eq('semester', semester)
      .in('student_grade', grades)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    enrollments.push(...(data as EnrollmentRow[]));
    if (data.length < pageSize) break;
  }

  if (basis === 'student-timetable') {
    const readPages = async <T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> => {
      const rows: T[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await fetchPage(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as T[]));
        if (!data || data.length < pageSize) return rows;
      }
    };
    const [students, teachers, selectionGroups] = await Promise.all([
      readPages<StudentSourceRow>((from, to) => supabase.from('student_timetable')
        .select('resource_id, student_grade, student_class, student_no, student_name, day_of_week, period, subject, teacher_resource_id, teacher_name, course_offering_id')
        .eq('academic_year', academicYear).eq('semester', semester).in('student_grade', grades).order('id').range(from, to)),
      readPages<TeacherSourceRow>((from, to) => supabase.from('teacher_timetable')
        .select('grade, day_of_week, period, subject_name, teacher_resource_id, course_offering_id')
        .eq('academic_year', academicYear).eq('semester', semester).in('grade', grades).order('id').range(from, to)),
      fetchSelectionGroups(grades),
    ]);
    return { ...sourceFromStudentTimetable((offerings ?? []) as OfferingRow[], enrollments, students, teachers), selectionGroups };
  }

  // resource.meta(grade/class)를 학생 반의 권위 출처로 사용 — enrollment의 학년/반을 덮어쓴다.
  // (담임 기준 명부. 현재 enrollment와 일치하지만 enrollment 미갱신 학기에도 정확한 반을 보장.)
  const studentIds = [...new Set(enrollments.map((e) => e.student_resource_id).filter((x): x is string => !!x))];
  const metaById = new Map<string, { grade: number; cls: string }>();
  for (let i = 0; i < studentIds.length; i += 500) {
    const chunk = studentIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from('resource')
      .select('id, meta')
      .eq('type', 'student')
      .in('id', chunk);
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; meta: { grade?: unknown; class?: unknown } | null }[]) {
      const g = Number(r.meta?.grade);
      const c = r.meta?.class;
      if (Number.isFinite(g) && c != null) metaById.set(r.id, { grade: g, cls: String(c) });
    }
  }
  for (const e of enrollments) {
    const m = e.student_resource_id ? metaById.get(e.student_resource_id) : undefined;
    if (m) {
      e.student_grade = m.grade;
      e.student_class = m.cls;
    }
  }

  const selectionGroups = await fetchSelectionGroups(grades);
  return { offerings: (offerings ?? []) as OfferingRow[], enrollments, selectionGroups, basis };
}

// ── PII 제거 저장 ────────────────────────────────────────────────

/** 저장 전 studentCodes(PII) 제거 — studentCount는 보존 */
function sanitizeInput(input: TimetableInput): TimetableInput {
  return {
    ...input,
    lessons: input.lessons.map((l) => ({
      ...l,
      studentCodes: [],
      studentCount: l.studentCount ?? l.studentCodes.length,
    })),
  };
}

// ── CRUD (exam_schedule와 동일 규약, 'timetable_plan' as any) ──────────────

export interface CreatePlanArgs {
  academicYear: number;
  semester: number;
  title: string;
  input: TimetableInput;
  result: TimetableRunResult;
  selectedCandidateId?: string | null;
  status?: 'draft' | 'finalized' | 'archived';
  createdByResourceId?: string | null;
}

export async function createTimetablePlan(args: CreatePlanArgs): Promise<SavedTimetablePlan> {
  const payload = {
    academic_year: args.academicYear,
    semester: args.semester,
    title: args.title,
    status: args.status ?? 'draft',
    input_payload: sanitizeInput(args.input) as unknown,
    candidates: args.result.candidates as unknown,
    selected_candidate_id: args.selectedCandidateId ?? null,
    finalized_placements: null,
    diagnostics: args.result.diagnostics as unknown,
    created_by: args.createdByResourceId ?? null,
  };
  const { data, error } = await supabase
    .from('timetable_plan' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SavedTimetablePlan;
}

export async function updateTimetablePlan(
  id: string,
  patch: Partial<{
    title: string;
    status: 'draft' | 'finalized' | 'archived';
    selected_candidate_id: string | null;
    finalized_placements: Placement[] | null;
    candidates: TimetableCandidate[];
  }>,
): Promise<SavedTimetablePlan> {
  const { data, error } = await supabase
    .from('timetable_plan' as any)
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as SavedTimetablePlan;
}

export async function listTimetablePlans(): Promise<SavedTimetablePlan[]> {
  const { data, error } = await supabase
    .from('timetable_plan' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SavedTimetablePlan[];
}

export async function getTimetablePlan(id: string): Promise<SavedTimetablePlan | null> {
  const { data, error } = await supabase
    .from('timetable_plan' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SavedTimetablePlan) ?? null;
}

export async function deleteTimetablePlan(id: string): Promise<void> {
  const { error } = await supabase.from('timetable_plan' as any).delete().eq('id', id);
  if (error) throw error;
}

// ── 확정 전개: placements → student_timetable / teacher_timetable ──────────

const TT_SOURCE = 'timetable-generator';

async function chunkInsert(table: string, rows: Record<string, unknown>[], chunk = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from(table as any).insert(slice as any);
    if (error) throw error;
  }
}

export interface FinalizeArgs {
  plan: SavedTimetablePlan;
  placements: Placement[];
  source: TimetableSourceData;
  selectedCandidateId?: string;
  /** 대상 학기에 기존 행이 있으면 우리가 만든(plan source) 행만 지우고 다시 쓴다 */
  replaceExisting?: boolean;
}

/**
 * 확정: 대상 학기의 timetable에 전개해 write.
 * 안전장치 — 대상 학기에 우리가 만들지 않은 행이 있으면 replaceExisting 없이는 거부한다
 * (기존 import 시간표 보호). replaceExisting=true면 timetable-generator가 만든 행만 삭제 후 재기록.
 */
export async function finalizeTimetablePlan(args: FinalizeArgs): Promise<{ studentRows: number; teacherRows: number }> {
  const { plan, placements, source } = args;
  const year = plan.academic_year;
  const sem = plan.semester;
  const { studentRows, teacherRows } = prepareTimetableFinalization(plan, placements, source);

  // 기존 행 점검 (우리 소스 vs 외부)
  const { count: foreignCount, error: cErr } = await supabase
    .from('student_timetable')
    .select('id', { count: 'exact', head: true })
    .eq('academic_year', year)
    .eq('semester', sem)
    .in('student_grade', plan.input_payload.grades)
    .or(`meta->>source.is.null,meta->>source.neq.${TT_SOURCE}`);
  if (cErr) throw cErr;
  if ((foreignCount ?? 0) > 0 && !args.replaceExisting) {
    throw new Error(
      `대상 학기 ${year}-${sem}에 이미 다른 출처의 시간표(${foreignCount}행)가 있습니다. 덮어쓰려면 replaceExisting을 켜세요.`,
    );
  }

  // 우리가 만든 기존 행 삭제 (재확정 시 중복 방지)
  for (const table of ['student_timetable', 'teacher_timetable']) {
    const { error } = await supabase
      .from(table as any)
      .delete()
      .eq('academic_year', year)
      .eq('semester', sem)
      .in(table === 'student_timetable' ? 'student_grade' : 'grade', plan.input_payload.grades)
      .eq('meta->>source', TT_SOURCE);
    if (error) throw error;
  }

  await chunkInsert('student_timetable', studentRows);
  await chunkInsert('teacher_timetable', teacherRows);

  await updateTimetablePlan(plan.id, {
    status: 'finalized', finalized_placements: placements,
    selected_candidate_id: args.selectedCandidateId ?? plan.selected_candidate_id,
  });

  return { studentRows: studentRows.length, teacherRows: teacherRows.length };
}
