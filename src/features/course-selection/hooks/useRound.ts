/**
 * Round-related TanStack Query hooks.
 *
 * 부하 최적화 원칙:
 * - 라운드 목록·트리·정원 카운트는 staleTime 30초 ~ 5분
 * - 학생 화면은 라운드 트리·내 선택만 fetch (정원 카운트는 별도 짧은 폴링)
 * - 저장 후 invalidate는 capacity / my_selection 만 좁게
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  RoundRow,
  RoundTree,
  MySelection,
  SlotCapacityRow,
  SaveCourseSelectionPayload,
  SaveResult,
  CapacityMap,
} from '../types';
import { capacityKey } from '../types';

// ────────────────────────────────────────────────────────────
// 모든 라운드 (관리자/학생 공용)
// ────────────────────────────────────────────────────────────
export function useRounds(opts?: { grade?: number | null; status?: string | null }) {
  return useQuery({
    queryKey: ['cs-rounds', opts?.grade ?? 'all', opts?.status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('course_selection_round')
        .select('*')
        .order('academic_year', { ascending: false })
        .order('target_grade')
        .order('round_number');
      if (opts?.grade != null) q = q.eq('target_grade', opts.grade);
      if (opts?.status) q = q.eq('status', opts.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RoundRow[];
    },
    staleTime: 60_000,
  });
}

// ────────────────────────────────────────────────────────────
// 단일 라운드 트리 (group → slot → subjects)
// ────────────────────────────────────────────────────────────
export function useRoundTree(roundId: string | null | undefined) {
  return useQuery({
    queryKey: ['cs-round-tree', roundId],
    queryFn: async (): Promise<RoundTree | null> => {
      if (!roundId) return null;
      const { data, error } = await supabase.rpc('get_course_selection_round_tree', {
        p_round_id: roundId,
      });
      if (error) throw error;
      return data as unknown as RoundTree;
    },
    enabled: !!roundId,
    staleTime: 30_000,
  });
}

// ────────────────────────────────────────────────────────────
// 학생 본인의 라운드 내 선택
// ────────────────────────────────────────────────────────────
export function useMySelection(roundId: string | null | undefined, studentCode: string | null | undefined) {
  return useQuery({
    queryKey: ['cs-my-selection', roundId, studentCode],
    queryFn: async (): Promise<MySelection | null> => {
      if (!roundId || !studentCode) return null;
      const { data, error } = await supabase.rpc('get_my_course_selection', {
        p_round_id: roundId,
        p_student_code: studentCode,
      });
      if (error) throw error;
      return data as unknown as MySelection;
    },
    enabled: !!roundId && !!studentCode,
    staleTime: 10_000,
  });
}

// ────────────────────────────────────────────────────────────
// 라운드의 슬롯×과목별 정원 카운트
// ────────────────────────────────────────────────────────────
export function useSlotCapacity(roundId: string | null | undefined, opts?: { refetchIntervalMs?: number }) {
  return useQuery({
    queryKey: ['cs-slot-capacity', roundId],
    queryFn: async () => {
      if (!roundId) return [] as SlotCapacityRow[];
      const { data, error } = await supabase
        .from('course_selection_slot_capacity')
        .select('*')
        .eq('round_id', roundId);
      if (error) throw error;
      return (data ?? []) as SlotCapacityRow[];
    },
    enabled: !!roundId,
    staleTime: 5_000,
    refetchInterval: opts?.refetchIntervalMs ?? 15_000,  // 15초 폴링 (학생 작성 중)
  });
}

// ────────────────────────────────────────────────────────────
// 빠른 lookup map
// ────────────────────────────────────────────────────────────
export function toCapacityMap(rows: SlotCapacityRow[]): CapacityMap {
  const m: CapacityMap = new Map();
  for (const r of rows) {
    m.set(capacityKey(r.slot_id, r.selectable_subject_id), {
      capacity: r.capacity,
      enrolled: r.enrolled,
    });
  }
  return m;
}

// ────────────────────────────────────────────────────────────
// 학생 저장 mutation
// ────────────────────────────────────────────────────────────
export function useSaveSelectionGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveCourseSelectionPayload): Promise<SaveResult> => {
      const { data, error } = await supabase.rpc('save_course_selection_group', payload as any);
      if (error) throw error;
      return data as unknown as SaveResult;
    },
    onSuccess: (_res, vars) => {
      // 좁게 invalidate — 본인 선택과 정원 카운트만
      qc.invalidateQueries({ queryKey: ['cs-my-selection', vars.p_round_id, vars.p_student_code] });
      qc.invalidateQueries({ queryKey: ['cs-slot-capacity', vars.p_round_id] });
    },
  });
}

// ────────────────────────────────────────────────────────────
// 변경 로그 조회
// ────────────────────────────────────────────────────────────
export function useAuditLog(
  roundId: string | null | undefined,
  opts?: { actorRole?: string; limit?: number },
) {
  return useQuery({
    queryKey: ['cs-audit-log', roundId, opts?.actorRole, opts?.limit],
    queryFn: async () => {
      if (!roundId) return [];
      let q = supabase
        .from('course_selection_audit_log')
        .select('*')
        .eq('round_id', roundId)
        .order('occurred_at', { ascending: false })
        .limit(opts?.limit ?? 200);
      if (opts?.actorRole) q = q.eq('actor_role', opts.actorRole);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!roundId,
    staleTime: 10_000,
  });
}

// ────────────────────────────────────────────────────────────
// 모든 selectable subjects (관리자 빌더용)
// ────────────────────────────────────────────────────────────
export function useSelectableSubjects() {
  return useQuery({
    queryKey: ['cs-selectable-subjects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_selectable_subject')
        .select('*')
        .eq('is_active', true)
        .order('category_code')
        .order('display_order')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

// ────────────────────────────────────────────────────────────
// 관리자: 차수 CRUD
// ────────────────────────────────────────────────────────────
export function useUpsertRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<RoundRow> & {
        academic_year: number;
        target_grade: number;
        round_number: number;
      },
    ) => {
      if (patch.id) {
        const { data, error } = await supabase
          .from('course_selection_round')
          .update(patch)
          .eq('id', patch.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as RoundRow;
      }
      const { data, error } = await supabase
        .from('course_selection_round')
        .insert(patch as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as RoundRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cs-rounds'] }),
  });
}

// 그룹/슬롯/슬롯-과목 빌더 CRUD
export function useUpsertGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: { id?: string; round_id: string } & Partial<{
        name: string;
        category_codes: string[];
        academic_year: number | null;
        target_grade: number | null;
        display_order: number;
        description: string | null;
      }>,
    ) => {
      if (patch.id) {
        const { data, error } = await supabase
          .from('course_selection_group')
          .update(patch)
          .eq('id', patch.id)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('course_selection_group')
        .insert(patch as any)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; round_id: string }) => {
      const { error } = await supabase.from('course_selection_group').delete().eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

export function useUpsertSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: { id?: string; group_id: string; round_id: string } & Partial<{
        title: string | null;
        semester: number | null;
        pick_count: number;
        capacity: number | null;
        display_order: number;
      }>,
    ) => {
      const { round_id: _omit, ...row } = patch;
      if (patch.id) {
        const { data, error } = await supabase
          .from('course_selection_slot')
          .update(row)
          .eq('id', patch.id)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('course_selection_slot')
        .insert(row as any)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; round_id: string }) => {
      const { error } = await supabase.from('course_selection_slot').delete().eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

export function useAttachSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slot_id: string;
      selectable_subject_id: string;
      semester: number | null;
      round_id: string;
      override_capacity?: number | null;
    }) => {
      const { round_id: _omit, ...row } = vars;
      const { data, error } = await supabase
        .from('course_selection_slot_subject')
        .insert(row as any)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

/** 슬롯에 직접 과목 추가 — school_curriculum + course_selectable_subject + slot_subject를 한 트랜잭션으로 INSERT. */
export interface AddCustomSubjectInput {
  slot_id: string;
  subject: string;
  category: string;
  credits: number;
  semester: number;
  academic_year: number;
  grade: number;
  subject_type?: string | null;
  grading_type?: string | null;
  area?: string | null;
  hours?: number | null;
  override_capacity?: number | null;
  round_id: string;
}
export function useAddCustomSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: AddCustomSubjectInput) => {
      const { data, error } = await supabase.rpc('add_custom_subject_to_slot', {
        p_slot_id: vars.slot_id,
        p_subject: vars.subject,
        p_category: vars.category,
        p_credits: vars.credits,
        p_semester: vars.semester,
        p_academic_year: vars.academic_year,
        p_grade: vars.grade,
        p_subject_type: vars.subject_type ?? null,
        p_grading_type: vars.grading_type ?? null,
        p_area: vars.area ?? null,
        p_hours: vars.hours ?? null,
        p_override_capacity: vars.override_capacity ?? null,
      } as any);
      if (error) throw error;
      return data as unknown as {
        curriculum_id: string;
        subject_id: string;
        subject_name: string;
        curriculum_created: boolean;
        subject_created: boolean;
        attached: boolean;
      };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] });
      qc.invalidateQueries({ queryKey: ['cs-curriculum-subjects-group'] });
    },
  });
}

/** 세트(여러 slot_subject) 정원을 한 값으로 통일 — 세트의 첫 과목 입력에서 호출됨. */
export function useSetBundleCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slot_subject_ids: string[];
      capacity: number | null;
      round_id: string;
    }) => {
      const { data, error } = await supabase.rpc('set_slot_subject_bundle_capacity', {
        p_slot_subject_ids: vars.slot_subject_ids,
        p_capacity: vars.capacity,
      } as any);
      if (error) throw error;
      return data as unknown as { updated: number; capacity: number | null };
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

/** 슬롯 안의 여러 과목을 한 묶음으로 grouping (bundle_key/label 설정). bundle_key를 null로 보내면 해제. */
export function useSetSlotSubjectBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slot_subject_ids: string[];
      bundle_key: string | null;
      bundle_label: string | null;
      round_id: string;
    }) => {
      const { data, error } = await supabase.rpc('set_slot_subject_bundle', {
        p_slot_subject_ids: vars.slot_subject_ids,
        p_bundle_key: vars.bundle_key,
        p_bundle_label: vars.bundle_label,
      });
      if (error) throw error;
      return data as unknown as { updated: number };
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

/** 학교 교육과정 과목들을 한 번에 슬롯에 attach (RPC가 selectable_subject 자동 생성·매핑) */
export function useAttachCurriculumSubjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slot_id: string;
      curriculum_ids: string[];
      round_id: string;
    }) => {
      const { data, error } = await supabase.rpc('attach_curriculum_subjects_to_slot', {
        p_slot_id: vars.slot_id,
        p_curriculum_ids: vars.curriculum_ids,
      });
      if (error) throw error;
      return data as unknown as { attempted: number; added: number; skipped: number; names: string[] };
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

/** @deprecated 학교 교육과정 기반에선 useAttachCurriculumSubjects 권장 */
export function useAttachSubjectsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slot_id: string;
      round_id: string;
      picks: { selectable_subject_id: string; semester: number | null; override_capacity?: number | null }[];
    }) => {
      if (vars.picks.length === 0) return [];
      const rows = vars.picks.map((p) => ({
        slot_id: vars.slot_id,
        selectable_subject_id: p.selectable_subject_id,
        semester: p.semester,
        override_capacity: p.override_capacity ?? null,
      }));
      const { data, error } = await supabase
        .from('course_selection_slot_subject')
        .insert(rows as any)
        .select('*');
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

/** slot_subject 정원(override_capacity) 업데이트 */
export function useUpdateSlotSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      round_id: string;
      override_capacity?: number | null;
    }) => {
      const { id, round_id: _omit, ...patch } = vars;
      const { data, error } = await supabase
        .from('course_selection_slot_subject')
        .update(patch as any)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

export interface CurriculumSubject {
  curriculum_id: string;
  subject: string;
  category: string;
  credits: number;
  semester: number;
  academic_year: number;
  grade: number;
  subject_type: string | null;
  grading_type: string | null;
  selectable_subject_id: string | null;
  default_max_capacity: number | null;
  category_code: string | null;
}

/** school_curriculum에서 group의 학년/연도/학기에 맞는 과목 목록 */
export function useCurriculumSubjectsForGroup(groupId: string | null | undefined, semester: number | null) {
  return useQuery({
    queryKey: ['cs-curriculum-subjects-group', groupId, semester],
    queryFn: async () => {
      if (!groupId) return [] as CurriculumSubject[];
      const { data, error } = await supabase.rpc('get_curriculum_subjects_for_group', {
        p_group_id: groupId,
        p_semester: semester,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CurriculumSubject[];
    },
    enabled: !!groupId,
    staleTime: 5 * 60_000,
  });
}

/** @deprecated useCurriculumSubjectsForGroup 사용 */
export function useCurriculumSubjects(roundId: string | null | undefined, semester: number | null) {
  return useQuery({
    queryKey: ['cs-curriculum-subjects', roundId, semester],
    queryFn: async () => {
      if (!roundId) return [] as CurriculumSubject[];
      const { data, error } = await supabase.rpc('get_curriculum_subjects_for_round', {
        p_round_id: roundId,
        p_semester: semester,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CurriculumSubject[];
    },
    enabled: !!roundId,
    staleTime: 5 * 60_000,
  });
}

export function useDetachSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; round_id: string }) => {
      const { error } = await supabase
        .from('course_selection_slot_subject')
        .delete()
        .eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['cs-round-tree', vars.round_id] }),
  });
}

// ────────────────────────────────────────────────────────────
// 관리자 — 신청 현황 (학생별 진행)
// ────────────────────────────────────────────────────────────
export function useRoundSubmissions(roundId: string | null | undefined) {
  return useQuery({
    queryKey: ['cs-round-submissions', roundId],
    queryFn: async () => {
      if (!roundId) return [];
      const { data, error } = await supabase
        .from('course_selection_submission')
        .select('*')
        .eq('round_id', roundId)
        .order('student_class', { nullsFirst: false })
        .order('student_no', { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!roundId,
    staleTime: 15_000,
  });
}

// ────────────────────────────────────────────────────────────
// 단순 audit log insert (수동 호출용)
// ────────────────────────────────────────────────────────────
export function useLogChange() {
  return useMutation({
    mutationFn: async (vars: {
      p_round_id: string | null;
      p_actor_name: string;
      p_actor_role: 'admin' | 'teacher' | 'student' | 'system';
      p_action: string;
      p_target_type: 'round' | 'group' | 'slot' | 'slot_subject' | 'submission' | 'item' | 'subject';
      p_target_id: string | null;
      p_target_label: string | null;
      p_diff?: Record<string, unknown>;
      p_reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('log_course_selection_change', vars as any);
      if (error) throw error;
      return data;
    },
  });
}
