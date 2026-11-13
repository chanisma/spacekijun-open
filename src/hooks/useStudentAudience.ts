import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  parseStoredStudentRule,
  validateStudentRule,
  type SavedStudentRule,
  type StudentAudienceResolution,
  type StudentAudienceRule,
  type StudentAudienceVocab,
} from '@/lib/studentAudienceRule';
import {
  parseStoredFacultyRule,
  validateFacultyRule,
  type FacultyAudienceResolution,
  type FacultyAudienceRule,
} from '@/lib/facultyAudienceRule';
import type { SubjectGroupCatalogRow } from '@/lib/subjectClassification';

/**
 * 조건으로 고르기 — 서버 호출.
 * 학생 RPC 는 교사·관리자, 교직원 RPC 는 교직원 전용(서버가 거부한다). 화면은 `enabled` 로 호출 자체를 막는다.
 * (새 함수·표라 생성 타입에 아직 없다 — 이름을 문자열로 부른다)
 * ⚠ `(supabase.rpc as …)(…)` / `(supabase.from as …)(…)` 꼴을 유지할 것 — 괄호로 감싼 멤버 호출이라 `this` 가 살아 있다.
 *   `const rpc = supabase.rpc as …; rpc(…)` 처럼 **변수로 꺼내면** this 가 끊겨 요청이 죽는다.
 */
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;
const callRpc = (fn: string, args: Record<string, unknown>): RpcResult =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => RpcResult)(fn, args);

export async function resolveStudentAudience(rule: StudentAudienceRule): Promise<StudentAudienceResolution> {
  const { data, error } = await callRpc('resolve_student_audience', { p_rule: rule });
  if (error) throw new Error(error.message);
  return data as StudentAudienceResolution;
}

export async function fetchStudentAudienceVocab(): Promise<StudentAudienceVocab> {
  const { data, error } = await callRpc('get_student_audience_vocab', {});
  if (error) throw new Error(error.message);
  const vocab = data as StudentAudienceVocab;
  // 20261001160000 이전 서버라면 두 키가 없다 — 화면이 깨지지 않게 빈 목록으로
  return { ...vocab, teachers: vocab.teachers ?? [], past_subjects: vocab.past_subjects ?? [] };
}

export function useStudentAudienceVocab(enabled: boolean) {
  return useQuery({
    queryKey: ['student-audience-vocab'],
    queryFn: fetchStudentAudienceVocab,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** 규칙이 유효할 때만 해석한다 — 비어 있는 조건을 서버로 보내면 오류 토스트만 늘어난다 */
export function useStudentAudienceResolution(rule: StudentAudienceRule, enabled: boolean) {
  const valid = validateStudentRule(rule) === null;
  return useQuery({
    queryKey: ['student-audience-resolve', JSON.stringify(rule)],
    queryFn: () => resolveStudentAudience(rule),
    enabled: enabled && valid,
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

// ── 교직원 조건 (2026-10-01) ─────────────────────────────────────────────────

export async function resolveFacultyRule(rule: FacultyAudienceRule): Promise<FacultyAudienceResolution> {
  const { data, error } = await callRpc('resolve_faculty_rule', { p_rule: rule });
  if (error) throw new Error(error.message);
  return data as FacultyAudienceResolution;
}

export function useFacultyAudienceResolution(rule: FacultyAudienceRule, enabled: boolean) {
  const valid = validateFacultyRule(rule) === null;
  return useQuery({
    queryKey: ['faculty-audience-resolve', JSON.stringify(rule)],
    queryFn: () => resolveFacultyRule(rule),
    enabled: enabled && valid,
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

/** 교직원 규칙의 어휘(AI 프롬프트·이름 → id 맞추기). 편집기는 기존 AudienceRuleBuilder 의 것을 쓴다 */
export interface FacultyAudienceVocab {
  departments: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  seats: string[];
  clubs: string[];
  subjects: Array<{ subject: string; grades: number[] }>;
}

const HOMEROOM_TAG = /^\d+학년\s*\d+반$/;

export function useFacultyAudienceVocab(enabled: boolean, academicYear: number | null) {
  return useQuery({
    queryKey: ['faculty-audience-vocab', academicYear],
    enabled: enabled && academicYear !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FacultyAudienceVocab> => {
      const year = academicYear!;
      const [departments, tags, seats, clubs, catalog] = await Promise.all([
        supabase.from('department').select('id, name').eq('category', 'school').eq('is_active', true).order('display_order'),
        supabase.from('resource_tags').select('id, name').order('name'),
        supabase.from('duty_seat').select('name').eq('academic_year', year).order('sort_order'),
        supabase.from('club_info').select('name, meta').eq('academic_year', year).order('name'),
        callRpc('subject_group_catalog', {}),
      ]);
      for (const r of [departments, tags, seats, clubs, catalog]) if (r.error) throw new Error(r.error.message);
      return {
        departments: (departments.data ?? []) as Array<{ id: string; name: string }>,
        // 학급 담임 태그는 [담임] 조건이 맡는다(27개가 어휘를 덮지 않게)
        tags: ((tags.data ?? []) as Array<{ id: string; name: string }>).filter((t) => !HOMEROOM_TAG.test(t.name)),
        seats: ((seats.data ?? []) as Array<{ name: string }>).map((s) => s.name),
        clubs: ((clubs.data ?? []) as Array<{ name: string; meta: { status?: string } | null }>)
          .filter((c) => c.meta?.status !== 'inactive')
          .map((c) => c.name),
        subjects: ((catalog.data ?? []) as SubjectGroupCatalogRow[])
          .filter((r) => r.teacher_count > 0)
          .map((r) => ({ subject: r.subject_name, grades: r.taught_grades })),
      };
    },
  });
}

// ── 최근·즐겨찾기 (본인만, student_audience_saved_rule) ──────────────────────
// target = 학생/교직원 규칙(모양이 달라 섞어 풀면 안 된다 — 서버도 target 마다 따로 정리한다)

export type AudienceTarget = 'student' | 'faculty';

type SavedRow = {
  id: string; rule: unknown; label: string; title: string | null; sentence: string | null;
  pinned: boolean; use_count: number; last_used_at: string;
};
type SavedQuery = {
  eq: (col: string, v: string) => SavedQuery;
  order: (col: string, opts: { ascending: boolean }) => SavedQuery;
  then: Promise<{ data: SavedRow[] | null; error: { message: string } | null }>['then'];
};
type SavedTable = {
  select: (cols: string) => SavedQuery;
  update: (values: Record<string, unknown>) => { eq: (col: string, v: string) => Promise<{ error: { message: string } | null }> };
  delete: () => { eq: (col: string, v: string) => Promise<{ error: { message: string } | null }> };
};
const savedTable = () =>
  (supabase.from as unknown as (name: string) => SavedTable)('student_audience_saved_rule');

const savedKey = (target: AudienceTarget) => ['student-audience-saved', target];

export interface SavedRule<R> extends Omit<SavedStudentRule, 'rule'> {
  rule: R;
}

export function useSavedStudentRules(enabled: boolean) {
  return useSavedRules<StudentAudienceRule>('student', parseStoredStudentRule, enabled);
}

export function useSavedFacultyRules(enabled: boolean) {
  return useSavedRules<FacultyAudienceRule>('faculty', parseStoredFacultyRule, enabled);
}

function useSavedRules<R>(target: AudienceTarget, parse: (value: unknown) => R | null, enabled: boolean) {
  return useQuery({
    queryKey: savedKey(target),
    enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SavedRule<R>[]> => {
      const { data, error } = await savedTable()
        .select('id, rule, label, title, sentence, pinned, use_count, last_used_at')
        .eq('target', target)
        .order('pinned', { ascending: false })
        .order('last_used_at', { ascending: false });
      if (error) throw new Error(error.message);
      // 저장된 규칙도 다시 검사한다 — 옛 문법·손상된 행이 패널을 깨뜨리지 않게(못 읽는 행은 버린다)
      return (data ?? []).flatMap((row) => {
        const rule = parse(row.rule);
        return rule ? [{ ...row, rule }] : [];
      });
    },
  });
}

/** [N명 추가]·별표 — 같은 규칙이면 한 줄로 모이고, 별표 없는 것은 대상마다 최근 8개만 남는다(서버가 정리) */
export function useRecordStudentRule(target: AudienceTarget = 'student') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rule: object; ruleKey: string; label: string; sentence?: string | null; pin?: boolean }) => {
      const { error } = await callRpc('record_student_audience_rule', {
        p_rule: input.rule,
        p_rule_key: input.ruleKey,
        p_label: input.label,
        p_sentence: input.sentence ?? null,
        p_pin: input.pin ?? false,
        p_target: target,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: savedKey(target) }),
  });
}

export function useUpdateSavedStudentRule(target: AudienceTarget = 'student') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; pinned?: boolean; remove?: boolean }) => {
      const { error } = input.remove
        ? await savedTable().delete().eq('id', input.id)
        : await savedTable().update({ pinned: input.pinned }).eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: savedKey(target) }),
  });
}
