/**
 * 업무 후보 조회·수정·삭제 (2026-09-24).
 *
 * 판정·모양은 전부 `src/lib/workCandidates.ts`. 여기는 왕복만 한다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeCandidateDraft,
  parseEvidence,
  parseProcedures,
  type EvidenceDoc,
  type ProcedureEntry,
  type WorkCandidate,
  type WorkCandidateDraft,
} from '@/lib/workCandidates';

export const workCandidateKeys = {
  all: ['work-candidates'] as const,
  year: (year: number) => ['work-candidates', year] as const,
  evidence: (id: string) => ['work-candidates', 'evidence', id] as const,
  procedures: (id: string) => ['work-candidates', 'procedures', id] as const,
};

/**
 * 목록 조회 칼럼 — ⚠️ `evidence`(근거 문서)·`procedures`(절차 검토)를 **빼고** 적는다 (2026-09-28·29).
 * 업무 하나에 근거가 1,000건을 넘고 전체 약 400KB 라, `select('*')` 로 두면 지도를 열 때마다
 * 통째로 내려받는다. 근거는 서랍에서 펼칠 때 `useWorkCandidateEvidence` 가 한 줄씩 읽는다.
 * 칼럼을 새로 만들면 여기에도 적어야 화면에 온다.
 */
const LIST_COLUMNS = [
  'id', 'academic_year', 'kind', 'code', 'name', 'area_name',
  'seat_id', 'seat_label', 'department', 'brm', 'work_type', 'scale', 'load',
  'months', 'repeat_hint', 'counts', 'budget', 'note', 'meta', 'created_at', 'updated_at',
].join(', ');

/**
 * ⚠️ 306행이라 기본 상한(1000)에 걸리지 않지만, 해마다 쌓이면 넘는다.
 * 학년도로 거르고 `range` 로 명시해 **조용히 잘리는 일**을 막는다(CLAUDE.md 「무제한 select」).
 */
export function useWorkCandidates(academicYear: number | null) {
  return useQuery({
    queryKey: workCandidateKeys.year(academicYear ?? 0),
    enabled: academicYear !== null,
    queryFn: async (): Promise<WorkCandidate[]> => {
      const { data, error, count } = await supabase
        .from('work_candidate')
        .select(LIST_COLUMNS, { count: 'exact' })
        .eq('academic_year', academicYear!)
        .order('kind', { ascending: true })
        .order('load', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true })
        .range(0, 1999);
      if (error) throw error;
      const rows = (data ?? []) as unknown as WorkCandidate[];
      if (typeof count === 'number' && count > rows.length) {
        console.warn(`[work-candidate] ${count}건 중 ${rows.length}건만 받았습니다 — 페이징이 필요합니다.`);
      }
      return rows;
    },
    staleTime: 60_000,
  });
}

/** 후보 한 줄의 근거 문서 — 서랍에서 펼쳤을 때만 읽는다(`enabled`) */
export function useWorkCandidateEvidence(candidateId: string | null) {
  return useQuery({
    queryKey: workCandidateKeys.evidence(candidateId ?? ''),
    enabled: Boolean(candidateId),
    queryFn: async (): Promise<EvidenceDoc[]> => {
      const { data, error } = await supabase
        .from('work_candidate')
        .select('evidence')
        .eq('id', candidateId!)
        .maybeSingle();
      if (error) throw error;
      return parseEvidence((data as { evidence?: unknown } | null)?.evidence);
    },
    // 근거는 시드로만 바뀐다 — 한 번 받으면 세션 동안 다시 받을 이유가 없다
    staleTime: 10 * 60_000,
  });
}

/** 후보 한 줄의 절차 검토 — 서랍에서 펼쳤을 때만 읽는다 */
export function useWorkCandidateProcedures(candidateId: string | null) {
  return useQuery({
    queryKey: workCandidateKeys.procedures(candidateId ?? ''),
    enabled: Boolean(candidateId),
    queryFn: async (): Promise<ProcedureEntry[]> => {
      const { data, error } = await supabase
        .from('work_candidate')
        .select('procedures')
        .eq('id', candidateId!)
        .maybeSingle();
      if (error) throw error;
      return parseProcedures((data as { procedures?: unknown } | null)?.procedures);
    },
    staleTime: 10 * 60_000,
  });
}

export function useUpdateWorkCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: WorkCandidateDraft }) => {
      const patch = normalizeCandidateDraft(draft);
      const { error } = await supabase.from('work_candidate').update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workCandidateKeys.all }),
  });
}

export function useCreateWorkCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ academicYear, draft }: { academicYear: number; draft: WorkCandidateDraft }) => {
      const { data: auth } = await supabase.auth.getSession();
      const payload = {
        ...normalizeCandidateDraft(draft),
        academic_year: academicYear,
        // 사람이 만든 후보는 code 가 없다 — 시드 갱신 대상이 아니라는 표시이기도 하다
        code: null,
        created_by: auth.session?.user?.id ?? null,
      };
      const { error } = await supabase.from('work_candidate').insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workCandidateKeys.all }),
  });
}

export function useDeleteWorkCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_candidate').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workCandidateKeys.all }),
  });
}
