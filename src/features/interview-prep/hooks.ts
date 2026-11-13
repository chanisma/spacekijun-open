import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  KG_VERSION_SCAN_LIMIT,
  interviewPrepStudentIdFor,
  loadActivityCandidates,
  type InterviewActivityCandidate,
  type KgEntityLike,
} from '../../../supabase/functions/_shared/interviewPrep';
import {
  fetchInterviewPrepRecord,
  fetchInterviewPrepState,
  requestInterviewEvaluation,
  requestInterviewQuestion,
  type InterviewPrepRequestBody,
} from './service';
import { buildInterviewThreads, flattenThreads, isInFlight } from './utils';

const db = supabase as unknown as SupabaseClient;

/**
 * 연습에 쓸 학적 코드 — 학생은 이메일 prefix, 교사·관리자는 테스트 학생.
 *
 * **서버와 같은 함수**(`interviewPrepStudentIdFor`)를 쓴다 — 화면이 다른 학생의 활동을
 * 보여 주면 서버가 그 활동을 못 찾는다. 역할은 **미리보기가 아니라 실제 `profile.role`**
 * 이어야 한다(서버는 JWT 의 실제 계정으로 판정한다).
 *
 * **`user_resource` 로 풀지 말 것** — 학생은 그 표를 쓰지 않는다(실측 재학생 630명 중
 * 링크 12명). 협업 보드가 바로 그 이유로 학생에게 통째로 막혔던 이력이 있다.
 */
export function studentCodeOf(
  role: string | null | undefined, email: string | null | undefined,
): string | null {
  return interviewPrepStudentIdFor(role, email);
}

const STATE_KEY = (userId: string) => ['interview-prep', 'state', userId];
const RECORD_KEY = (scope: string) => ['interview-prep', 'record', scope];

/** 오늘의 상태(질문·연습 잔여·누적 일수). 생성 중이면 짧게 폴링한다. */
export function useInterviewPrepState() {
  const { user } = useAuth();
  return useQuery({
    queryKey: STATE_KEY(user?.id ?? ''),
    enabled: !!user,
    queryFn: fetchInterviewPrepState,
    // 다른 탭·기기에서 생성 중일 수 있다. 준비가 끝나면 폴링을 멈춘다.
    refetchInterval: (query) => (query.state.data?.daily?.status === 'generating' ? 3000 : false),
  });
}

/** 본인(학생) 또는 한 학생(교사)의 질문·답변 전부를 묶음으로. */
export function useInterviewPrepThreads(scope: { userId: string } | { studentId: string } | null) {
  const key = scope ? ('userId' in scope ? `u:${scope.userId}` : `s:${scope.studentId}`) : '';
  return useQuery({
    queryKey: RECORD_KEY(key),
    enabled: !!scope,
    staleTime: 30_000,
    queryFn: async () => {
      const record = await fetchInterviewPrepRecord(scope!);
      return buildInterviewThreads(record.questions, record.answers);
    },
    /**
     * 작업 중인 질문·답변이 있으면 짧게 폴링한다.
     *
     * **없으면 화면이 "답변을 읽고 있어요"에 갇힌다** — 다른 탭이 평가를 가져갔거나
     * 엣지 함수가 죽으면 이 탭에는 알려줄 사람이 없다. 임대가 만료되면 `isInFlight`
     * 가 false 가 되므로 폴링도 저절로 멈춘다(무한히 돌지 않는다).
     */
    refetchInterval: (query) => {
      const threads = query.state.data ?? [];
      const busy = flattenThreads(threads).some(
        (node) => isInFlight(node.question) || node.answers.some((answer) => isInFlight(answer)),
      );
      return busy ? 3000 : false;
    },
  });
}

/**
 * 질문 후보가 되는 활동 목록.
 *
 * 버전 선택은 **서버와 같은 함수**(`loadActivityCandidates`)를 쓴다 — 규칙이 갈리면
 * 화면에 보이는 활동을 서버가 못 찾는다.
 */
export function useInterviewActivities(studentCode: string | null) {
  return useQuery<InterviewActivityCandidate[]>({
    queryKey: ['interview-prep', 'activities', studentCode],
    enabled: !!studentCode,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: versions, error } = await db.from('student_kg_versions')
        .select('id,version').eq('student_id', studentCode!)
        .order('version', { ascending: false }).limit(KG_VERSION_SCAN_LIMIT);
      if (error) throw error;
      const found = await loadActivityCandidates(versions ?? [], async (versionId) => {
        const { data, error: rowError } = await db.from('student_kg_entities')
          .select('entity_id,label,type,properties')
          .eq('kg_version_id', versionId).eq('type', 'Activity').limit(500);
        if (rowError) throw rowError;
        return (data ?? []) as KgEntityLike[];
      });
      return found?.candidates ?? [];
    },
  });
}

/** 질문 받기(오늘·연습·꼬리). 성공하면 상태와 기록을 함께 되읽는다. */
export function useRequestQuestion() {
  const { user } = useAuth();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (body: Exclude<InterviewPrepRequestBody, { mode: 'evaluate' }>) =>
      requestInterviewQuestion(body),
    onSettled: () => {
      // 실패해도 되읽는다 — 서버가 행을 failed 로 닫았을 수 있고, 화면이 그 상태를 알아야
      // "준비 중"에 멈추지 않는다.
      void cache.invalidateQueries({ queryKey: STATE_KEY(user?.id ?? '') });
      void cache.invalidateQueries({ queryKey: RECORD_KEY(`u:${user?.id ?? ''}`) });
    },
  });
}

/** 답변 평가받기. */
export function useRequestEvaluation() {
  const { user } = useAuth();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) =>
      requestInterviewEvaluation(questionId, answer),
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: STATE_KEY(user?.id ?? '') });
      void cache.invalidateQueries({ queryKey: RECORD_KEY(`u:${user?.id ?? ''}`) });
    },
  });
}
