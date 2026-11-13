/**
 * Course Selection Feature - 타입 정의
 *
 * DB 스키마: course_selection_round → group → slot → slot_subject
 *           course_selection_submission → item
 *           course_selection_audit_log
 */

import type { Database } from '@/integrations/supabase/types';

// ───────────────────────────────────────────────────────────
// DB Row 별칭
// ───────────────────────────────────────────────────────────
export type RoundRow = Database['public']['Tables']['course_selection_round']['Row'];
export type GroupRow = Database['public']['Tables']['course_selection_group']['Row'];
export type SlotRow = Database['public']['Tables']['course_selection_slot']['Row'];
export type SlotSubjectRow = Database['public']['Tables']['course_selection_slot_subject']['Row'];
export type SelectableSubjectRow = Database['public']['Tables']['course_selectable_subject']['Row'];
export type SubmissionRow = Database['public']['Tables']['course_selection_submission']['Row'];
export type ItemRow = Database['public']['Tables']['course_selection_item']['Row'];
export type AuditLogRow = Database['public']['Tables']['course_selection_audit_log']['Row'];

export type RoundInsert = Database['public']['Tables']['course_selection_round']['Insert'];
export type GroupInsert = Database['public']['Tables']['course_selection_group']['Insert'];
export type SlotInsert = Database['public']['Tables']['course_selection_slot']['Insert'];
export type SlotSubjectInsert = Database['public']['Tables']['course_selection_slot_subject']['Insert'];

// ───────────────────────────────────────────────────────────
// 학교 과목군 카테고리 — mockup과 동일
// ───────────────────────────────────────────────────────────
export const CATEGORY_KEYS = ['국어', '영어', '수학', '사회', '과학', '체예', '교양', '기타'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

// ───────────────────────────────────────────────────────────
// 라운드 status — mockup에서 사용하는 상태
// ───────────────────────────────────────────────────────────
export type RoundStatus = 'draft' | 'open' | 'closed' | 'archived';
export type RoundKind = '수요조사' | '최종 신청';

// ───────────────────────────────────────────────────────────
// 트리 응답 (RPC get_course_selection_round_tree)
// ───────────────────────────────────────────────────────────
export interface SlotSubjectView {
  id: string;
  selectable_subject_id: string;
  semester: number | null;
  override_capacity: number | null;
  display_order: number;
  /** 같은 슬롯 안에서 동일 bundle_key를 가진 과목들은 한 세트(묶음)로 선택됨. null이면 단일. */
  bundle_key: string | null;
  bundle_label: string | null;
  name: string;
  category_code: string;
  default_max_capacity: number | null;
  meta: Record<string, unknown>;
  // school_curriculum LEFT JOIN으로 추가 — 일부는 null일 수 있음
  credits?: number | null;
  subject_type?: string | null;
  grading_type?: string | null;
  area?: string | null;
}

// ───────────────────────────────────────────────────────────
// 학생 화면 표시 옵션 — round.meta.display_options에 저장
// ───────────────────────────────────────────────────────────
export interface RoundDisplayOptions {
  show_credits?: boolean;
  show_subject_type?: boolean;
  show_grading_type?: boolean;
  show_capacity_bar?: boolean;
  show_enrollment_count?: boolean;
  show_area?: boolean;
}

export interface ResolvedDisplayOptions {
  show_credits: boolean;
  show_subject_type: boolean;
  show_grading_type: boolean;
  show_capacity_bar: boolean;
  show_enrollment_count: boolean;
  show_area: boolean;
}

export function resolveDisplayOptions(
  round: { meta?: Record<string, unknown> | null } | null | undefined,
): ResolvedDisplayOptions {
  const meta = (round?.meta ?? {}) as Record<string, unknown>;
  const opts = (meta.display_options ?? {}) as RoundDisplayOptions;
  const legacyEnroll = typeof meta.show_enrollment === 'boolean' ? (meta.show_enrollment as boolean) : undefined;
  return {
    show_credits: opts.show_credits ?? false,
    show_subject_type: opts.show_subject_type ?? false,
    show_grading_type: opts.show_grading_type ?? false,
    show_capacity_bar: opts.show_capacity_bar ?? true,
    show_enrollment_count: opts.show_enrollment_count ?? legacyEnroll ?? true,
    show_area: opts.show_area ?? false,
  };
}

/** 슬롯의 subjects를 bundle별로 그룹화 — 학생 카드 렌더링 시 활용. */
export interface SlotChoiceView {
  /** 단일 과목이면 subject_id, 세트면 bundle_key */
  key: string;
  bundleKey: string | null;
  label: string;
  /** 묶음 안의 과목들 (단일 과목이면 길이 1) */
  subjects: SlotSubjectView[];
}

export function groupSlotChoices(subjects: SlotSubjectView[]): SlotChoiceView[] {
  const bundled = new Map<string, SlotSubjectView[]>();
  const singles: SlotChoiceView[] = [];

  for (const sub of subjects) {
    if (sub.bundle_key) {
      const arr = bundled.get(sub.bundle_key) ?? [];
      arr.push(sub);
      bundled.set(sub.bundle_key, arr);
    } else {
      singles.push({
        key: sub.id,
        bundleKey: null,
        label: sub.name,
        subjects: [sub],
      });
    }
  }

  const bundles: SlotChoiceView[] = Array.from(bundled.entries()).map(([bk, subs]) => ({
    key: bk,
    bundleKey: bk,
    label: subs[0]?.bundle_label || subs.map((s) => s.name).join(' + '),
    subjects: subs,
  }));

  // bundle을 단일 위에 표시 (관습)
  return [...bundles, ...singles];
}

export interface SlotView {
  id: string;
  group_id: string;
  /** 사용자 지정 타이틀. 비어있으면 학기/픽수로 자동 생성. */
  title: string | null;
  /** 1 or 2, null이면 학기 미지정 */
  semester: number | null;
  pick_count: number;
  /** 슬롯 기본 정원. 실제 정원은 slot_subject.override_capacity가 우선. */
  capacity: number | null;
  display_order: number;
  meta: Record<string, unknown>;
  subjects: SlotSubjectView[];
}

/** 슬롯 표시용 타이틀 — title이 있으면 그대로, 없으면 학기/픽수로 자동 생성. */
export function slotDisplayTitle(slot: {
  title?: string | null;
  semester?: number | null;
  pick_count: number;
}): string {
  if (slot.title && slot.title.trim()) return slot.title;
  const semText = slot.semester ? `${slot.semester}학기 ` : '';
  return `${semText}${slot.pick_count}과목 선택`;
}

export interface GroupView {
  id: string;
  round_id: string;
  name: string;
  /** 복수 카테고리. 한 선택군이 여러 과목군을 포괄할 수 있음 (예: '체예'+'교양') */
  category_codes: string[];
  /** 수강 연도 — 비어있으면 차수 값으로 fallback */
  academic_year: number | null;
  /** 대상 학년 — 비어있으면 차수 값으로 fallback */
  target_grade: number | null;
  description: string | null;
  display_order: number;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  slots: SlotView[];
}

/** group의 effective 학년/연도 — group 값 우선, 없으면 round 값으로 fallback */
export function effectiveAcademicYear(group: { academic_year: number | null }, round: { academic_year: number | null }): number | null {
  return group.academic_year ?? round.academic_year;
}
export function effectiveTargetGrade(group: { target_grade: number | null }, round: { target_grade: number | null }): number | null {
  return group.target_grade ?? round.target_grade;
}

/** 단일 카테고리만 표시해야 하는 위치(SubjectTag 1개)에서 대표 카테고리 추출 */
export function primaryCategory(codes: string[] | null | undefined): string | null {
  if (!codes || codes.length === 0) return null;
  return codes[0];
}

export interface RoundTree {
  round: RoundRow;
  groups: GroupView[];
}

// ───────────────────────────────────────────────────────────
// 학생 선택 (get_my_course_selection)
// ───────────────────────────────────────────────────────────
export interface MySelectionItem {
  id: string;
  slot_id: string;
  group_id: string;
  selectable_subject_id: string;
  subject_name: string;
  semester: number | null;
  priority: number | null;
  category_code: string | null;
  created_at: string;
}

export interface MySelection {
  submission: SubmissionRow | null;
  items: MySelectionItem[];
  saved_group_ids: string[];
}

// ───────────────────────────────────────────────────────────
// RPC payload
// ───────────────────────────────────────────────────────────
export interface SavePick {
  slot_id: string;
  selectable_subject_id: string;
  subject_name: string;
  semester: number | null;
  priority?: number | null;
  category_code?: string | null;
}

export interface SaveCourseSelectionPayload {
  p_round_id: string;
  p_group_id: string;
  p_student_resource_id: string | null;
  p_student_code: string;
  p_student_name: string;
  p_student_grade: number | null;
  p_student_class: number | null;
  p_student_no: number | null;
  p_picks: SavePick[];
  p_actor_role?: 'student' | 'teacher' | 'admin';
}

export interface SaveResult {
  ok: boolean;
  submission_id: string;
  action: 'created' | 'updated';
  group_id: string;
  items_count: number;
}

// ───────────────────────────────────────────────────────────
// 정원 카운트 (view course_selection_slot_capacity)
// ───────────────────────────────────────────────────────────
export interface SlotCapacityRow {
  slot_id: string;
  group_id: string;
  round_id: string;
  selectable_subject_id: string;
  semester: number | null;
  capacity: number | null;
  enrolled: number;
}

// 클라이언트가 빠르게 lookup하기 위한 맵
export type CapacityMap = Map<string, { capacity: number | null; enrolled: number }>;

export function capacityKey(slot_id: string, subject_id: string): string {
  return `${slot_id}::${subject_id}`;
}

// ───────────────────────────────────────────────────────────
// 저장 상태 — 학생 화면에서 사용
// ───────────────────────────────────────────────────────────
export type GroupSaveState = 'saved' | 'partial' | 'untouched';

export function computeGroupState(
  groupId: string,
  savedGroupIds: string[],
  pendingPicks: Map<string, SavePick[]>,
): GroupSaveState {
  if (savedGroupIds.includes(groupId)) {
    return pendingPicks.has(groupId) ? 'partial' : 'saved';
  }
  return pendingPicks.has(groupId) ? 'partial' : 'untouched';
}
