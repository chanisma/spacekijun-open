/**
 * 과목 선택 확인표(출력)용 원자료 조회 — 한 차수(round)의 선택군·슬롯·제출·항목.
 *
 * 분석 화면의 스냅샷(get_course_analyze_snapshot)은 선택군을 지우고 학기로만 평탄화하므로
 * 출력에는 쓸 수 없다(1학년의 2학년/3학년 선택이 한 칸에 섞인다). 여기서는 표를 직접 읽는다.
 * 무제한 select 는 1000행에서 조용히 잘리므로 제출·항목은 range 페이징한다.
 */
import { supabase } from '@/integrations/supabase/client';
import type { SelectionSlipSource } from '../utils/selectionSlips';

const PAGE = 1000;
const ID_CHUNK = 50;

async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await run(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function fetchSelectionSlipSource(roundId: string): Promise<SelectionSlipSource> {
  const { data: round, error: roundErr } = await supabase
    .from('course_selection_round')
    .select('title, target_grade, round_number')
    .eq('id', roundId)
    .single();
  if (roundErr) throw roundErr;

  const { data: groups, error: gErr } = await supabase
    .from('course_selection_group')
    .select('id, name, target_grade, display_order')
    .eq('round_id', roundId);
  if (gErr) throw gErr;
  const groupIds = (groups ?? []).map((g) => g.id);

  const { data: slots, error: sErr } = groupIds.length
    ? await supabase
        .from('course_selection_slot')
        .select('id, group_id, semester, display_order, pick_count')
        .in('group_id', groupIds)
    : { data: [], error: null };
  if (sErr) throw sErr;
  const slotIds = (slots ?? []).map((s) => s.id);

  const slotSubjects = slotIds.length
    ? await fetchAllPages((from, to) =>
        supabase
          .from('course_selection_slot_subject')
          .select('id, slot_id, selectable_subject_id, semester, display_order')
          .in('slot_id', slotIds)
          .order('id')
          .range(from, to),
      )
    : [];

  const submissions = await fetchAllPages((from, to) =>
    supabase
      .from('course_selection_submission')
      .select('id, student_name, student_grade, student_class, student_no, last_modified_at, submitted_at')
      .eq('round_id', roundId)
      .order('id')
      .range(from, to),
  );

  const items: {
    submission_id: string;
    slot_id: string | null;
    selectable_subject_id: string | null;
    subject_name: string;
    semester: number;
  }[] = [];
  const subIds = submissions.map((s) => s.id);
  const chunks: string[][] = [];
  for (let i = 0; i < subIds.length; i += ID_CHUNK) chunks.push(subIds.slice(i, i + ID_CHUNK));
  // 학생당 최대 22항목 × 50명 = 1,100행 → 청크 안에서도 페이징이 필요하다
  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchAllPages((from, to) =>
        supabase
          .from('course_selection_item')
          .select('id, submission_id, slot_id, selectable_subject_id, subject_name, semester')
          .in('submission_id', chunk)
          .order('id')
          .range(from, to),
      ),
    ),
  );
  for (const arr of results) items.push(...arr);

  return {
    roundTitle:
      round.title?.trim() ||
      `${round.target_grade ?? ''}학년 ${round.round_number}차 과목 선택`,
    groups: (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      targetGrade: g.target_grade,
      displayOrder: g.display_order,
    })),
    slots: (slots ?? []).map((s) => ({
      id: s.id,
      groupId: s.group_id,
      semester: s.semester,
      displayOrder: s.display_order,
      pickCount: s.pick_count,
    })),
    slotSubjects: slotSubjects.map((ss) => ({
      slotId: ss.slot_id,
      selectableSubjectId: ss.selectable_subject_id,
      semester: ss.semester,
      displayOrder: ss.display_order,
    })),
    submissions: submissions.map((s) => ({
      id: s.id,
      studentName: s.student_name,
      grade: s.student_grade,
      classNo: s.student_class,
      number: s.student_no,
      lastModifiedAt: s.last_modified_at ?? s.submitted_at,
    })),
    items: items.map((it) => ({
      submissionId: it.submission_id,
      slotId: it.slot_id,
      selectableSubjectId: it.selectable_subject_id,
      subjectName: it.subject_name,
      semester: it.semester,
    })),
  };
}
