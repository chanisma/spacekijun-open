/**
 * 운영 시간표 조회·저장. 판정 규칙은 SQL `teacher_timetable_effective()` 한 곳 —
 * 순수 함수·엑셀 파서는 `src/lib/timetableOverride.ts`.
 */
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { EffectiveTeacherSlot, ParsedOverrideSlot, TimetableOverrideKind } from '@/lib/timetableOverride';

export interface EffectiveTimetableQuery {
  year: number;
  semester: number;
  from: Date | string;
  to: Date | string;
  teacherResourceId?: string | null;
}

const toDateText = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : format(d, 'yyyy-MM-dd'));

/** 그 기간에 실제로 들어가는 교사 수업(날짜별로 펼친 행, 최대 63일) */
export async function fetchEffectiveTeacherTimetable(q: EffectiveTimetableQuery): Promise<EffectiveTeacherSlot[]> {
  const { data, error } = await supabase.rpc('teacher_timetable_effective', {
    p_academic_year: q.year,
    p_semester: q.semester,
    p_from: toDateText(q.from),
    p_to: toDateText(q.to),
    p_teacher_resource_id: q.teacherResourceId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as EffectiveTeacherSlot[];
}

export interface TimetableOverride {
  id: string;
  title: string;
  kind: TimetableOverrideKind;
  academic_year: number;
  semester: number;
  start_date: string;
  end_date: string;
  grades: number[] | null;
  status: 'active' | 'archived';
  note: string | null;
  created_at: string;
  updated_at: string;
  slot_count?: number;
}

export async function listTimetableOverrides(): Promise<TimetableOverride[]> {
  const { data, error } = await supabase
    .from('timetable_override')
    .select('*, timetable_override_slot(count)')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { timetable_override_slot, ...rest } = row as typeof row & { timetable_override_slot?: { count: number }[] };
    return { ...(rest as TimetableOverride), slot_count: timetable_override_slot?.[0]?.count ?? 0 };
  });
}

export interface CreateOverrideInput {
  title: string;
  kind: TimetableOverrideKind;
  academic_year: number;
  semester: number;
  start_date: string;
  end_date: string;
  grades: number[] | null;
  note?: string | null;
  slots: (ParsedOverrideSlot & { teacher_resource_id: string | null })[];
}

/**
 * 운영 시간표를 만든다. 칸을 넣다 실패하면 방금 만든 머리 행을 지워 «칸 없는 운영 시간표»가
 * 정규 수업만 가리는 상태(= 그 학년 시간표가 통째로 비어 보임)를 남기지 않는다.
 */
export async function createTimetableOverride(input: CreateOverrideInput): Promise<string> {
  const { slots, ...head } = input;
  const { data: created, error } = await supabase
    .from('timetable_override')
    .insert({ ...head, note: head.note ?? null })
    .select('id')
    .single();
  if (error) throw error;

  const rows = slots.map((s) => ({
    override_id: created.id,
    day_of_week: s.day_of_week,
    period: s.period,
    grade: s.grade,
    class_label: s.class_label,
    subject_name: s.subject_name,
    activity_type: s.activity_type,
    teacher_name: s.teacher_name,
    teacher_resource_id: s.teacher_resource_id,
    meta: { raw: s.raw, source: 'xlsx_override_grid' },
  }));
  const { error: slotError } = await supabase.from('timetable_override_slot').insert(rows);
  if (slotError) {
    await supabase.from('timetable_override').delete().eq('id', created.id);
    throw slotError;
  }
  return created.id;
}

export async function updateTimetableOverride(
  id: string,
  patch: Partial<Pick<TimetableOverride, 'title' | 'start_date' | 'end_date' | 'status' | 'note' | 'kind'>>
): Promise<void> {
  const { error } = await supabase.from('timetable_override').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTimetableOverride(id: string): Promise<void> {
  const { error } = await supabase.from('timetable_override').delete().eq('id', id);
  if (error) throw error;
}
