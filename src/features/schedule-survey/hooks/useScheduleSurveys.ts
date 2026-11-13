// ========================================
// 일정 설문 TanStack Query hooks
// schedule_survey / schedule_survey_response CRUD
//
// 열람 범위는 전부 RLS가 정한다 — 클라이언트가 "내 설문만" 같은 필터를
// 따로 걸지 않는다(두 벌이 되면 한쪽만 고쳐진다).
// ========================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { requireUser } from '@/lib/authGuard';
import { toast } from '@/lib/toast';
import { normalizeItems } from '../utils/surveyAggregate';
import type {
  ScheduleSurvey,
  ScheduleSurveyInput,
  ScheduleSurveyResponse,
  SurveyResponseInput,
} from '../types';

export const surveyKeys = {
  all: ['schedule-surveys'] as const,
  list: () => [...surveyKeys.all, 'list'] as const,
  responses: (surveyId: string) => [...surveyKeys.all, 'responses', surveyId] as const,
  people: (ids: string[]) => [...surveyKeys.all, 'people', [...ids].sort().join(',')] as const,
};

const SURVEY_COLUMNS =
  'id, title, description, created_by, owner_resource_id, owner_name, target_resource_ids, candidate_dates, allow_custom_dates, due_date, status, created_at, updated_at';

function toSurvey(row: Record<string, unknown>): ScheduleSurvey {
  return {
    ...(row as unknown as ScheduleSurvey),
    target_resource_ids: (row.target_resource_ids as string[]) ?? [],
    candidate_dates: (row.candidate_dates as string[]) ?? [],
  };
}

/**
 * 내가 볼 수 있는 설문 전부 (주최자·대상자·admin).
 * 학교 규모상 전체 페치 후 화면에서 분류한다.
 */
export function useScheduleSurveys(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: surveyKeys.list(),
    queryFn: async (): Promise<ScheduleSurvey[]> => {
      const { data, error } = await supabase
        .from('schedule_survey')
        .select(SURVEY_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => toSurvey(row as Record<string, unknown>));
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * 한 설문의 응답들.
 * RLS 때문에 **보는 사람에 따라 행 수가 다르다** — 주최자·admin은 전원,
 * 응답자는 자기 것 한 행. 집계 화면은 주최자만 열므로 그대로 쓴다.
 */
export function useSurveyResponses(surveyId: string | null) {
  return useQuery({
    queryKey: surveyKeys.responses(surveyId ?? ''),
    queryFn: async (): Promise<ScheduleSurveyResponse[]> => {
      const { data, error } = await supabase
        .from('schedule_survey_response')
        .select('*')
        .eq('survey_id', surveyId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...(row as unknown as ScheduleSurveyResponse),
        items: normalizeItems((row as Record<string, unknown>).items),
      }));
    },
    enabled: !!surveyId,
    staleTime: 15_000,
  });
}

/**
 * 내가 낸 응답 전부 (설문 목록에서 "응답함/미응답"을 표시하려면 필요).
 * RLS 가 본인 행만 주므로 필터를 따로 걸지 않아도 되지만,
 * 주최자는 남의 응답도 볼 수 있으므로 내 resource id 로 명시적으로 좁힌다.
 */
export function useMySurveyResponses(resourceId: string | null | undefined) {
  return useQuery({
    queryKey: [...surveyKeys.all, 'mine', resourceId ?? ''],
    queryFn: async (): Promise<ScheduleSurveyResponse[]> => {
      const { data, error } = await supabase
        .from('schedule_survey_response')
        .select('*')
        .eq('respondent_resource_id', resourceId!);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...(row as unknown as ScheduleSurveyResponse),
        items: normalizeItems((row as Record<string, unknown>).items),
      }));
    },
    enabled: !!resourceId,
    staleTime: 30_000,
  });
}

/**
 * 아직 답하지 않은, 나에게 온 열린 설문 수 (헤더 배지).
 * 설문이 없으면 두 쿼리 모두 거의 빈 결과라 비용이 작다.
 */
export function usePendingSurveyCount(resourceId: string | null | undefined): number {
  const { data: surveys = [] } = useScheduleSurveys();
  const { data: myResponses = [] } = useMySurveyResponses(resourceId);
  if (!resourceId) return 0;
  const answered = new Set(myResponses.map((response) => response.survey_id));
  return surveys.filter(
    (survey) =>
      survey.status === 'open' &&
      survey.target_resource_ids.includes(resourceId) &&
      !answered.has(survey.id)
  ).length;
}

export interface SurveyPerson {
  id: string;
  name: string;
  type: string;
}

/**
 * resource.id → { 이름, 종류 } 조회. 대상자 명단 표시와 학생 포함 경고에 함께 쓴다.
 *
 * ⚠ 공용 `useResources()`를 쓰지 않는다 — 그 훅은 resource 전체를 상한 없이 읽는데
 *   PostgREST가 1000행에서 **조용히** 자른다(2026-09-17 실측 965행: 졸업 처리 한 번이면 넘는다.
 *   넘는 순간 이름순 뒷부분이 사라지므로 "일부 대상자 이름만 안 보이는" 증상이 된다).
 *   여기서는 필요한 id만 집어 오므로 데이터가 커져도 안전하다.
 */
export function useSurveyPeople(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  return useQuery({
    queryKey: surveyKeys.people(unique),
    queryFn: async (): Promise<Record<string, SurveyPerson>> => {
      if (unique.length === 0) return {};
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type')
        .in('id', unique);
      if (error) throw error;
      const map: Record<string, SurveyPerson> = {};
      for (const row of data ?? []) {
        map[row.id as string] = {
          id: row.id as string,
          name: (row.name as string) ?? '',
          type: (row.type as string) ?? '',
        };
      }
      return map;
    },
    enabled: unique.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateScheduleSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      ownerResourceId,
      ownerName,
    }: {
      input: ScheduleSurveyInput;
      ownerResourceId: string | null;
      ownerName: string | null;
    }): Promise<ScheduleSurvey> => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await supabase
        .from('schedule_survey')
        .insert({
          title: input.title,
          description: input.description || null,
          created_by: user.id,
          owner_resource_id: ownerResourceId,
          owner_name: ownerName,
          target_resource_ids: input.target_resource_ids,
          candidate_dates: input.candidate_dates,
          allow_custom_dates: input.allow_custom_dates,
          due_date: input.due_date,
        })
        .select(SURVEY_COLUMNS)
        .single();

      if (error) throw error;
      return toSurvey(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
    },
    onError: (error) => {
      console.error('일정 설문 생성 실패:', error);
      toast.error('설문을 만들지 못했습니다.');
    },
  });
}

export function useUpdateScheduleSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ScheduleSurveyInput }) => {
      const { data, error } = await supabase
        .from('schedule_survey')
        .update({
          title: input.title,
          description: input.description || null,
          target_resource_ids: input.target_resource_ids,
          candidate_dates: input.candidate_dates,
          allow_custom_dates: input.allow_custom_dates,
          due_date: input.due_date,
        })
        .eq('id', id)
        .select(SURVEY_COLUMNS)
        .single();
      if (error) throw error;
      return toSurvey(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
    },
    onError: (error) => {
      console.error('일정 설문 수정 실패:', error);
      toast.error('설문을 수정하지 못했습니다.');
    },
  });
}

/** 설문 마감/재개 */
export function useSetSurveyStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'open' | 'closed' }) => {
      // RLS 차단은 오류가 아니라 0행이므로 반환 행으로 실제 반영을 확인한다
      const { data, error } = await supabase
        .from('schedule_survey')
        .update({ status })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('설문 상태를 바꿀 권한이 없습니다.');
      }
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
      toast.success(status === 'closed' ? '설문을 마감했습니다.' : '설문을 다시 열었습니다.');
    },
    onError: (error) => {
      console.error('일정 설문 상태 변경 실패:', error);
      toast.error(error instanceof Error ? error.message : '설문 상태를 바꾸지 못했습니다.');
    },
  });
}

export function useDeleteScheduleSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('schedule_survey')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('설문을 삭제할 권한이 없습니다.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
      toast.success('설문을 삭제했습니다.');
    },
    onError: (error) => {
      console.error('일정 설문 삭제 실패:', error);
      toast.error(error instanceof Error ? error.message : '설문을 삭제하지 못했습니다.');
    },
  });
}

/**
 * 내 응답 저장 (없으면 생성, 있으면 교체).
 *
 * 한 사람이 자기 행 하나만 쓰므로 JSONB 통째 교체가 안전하다
 * (여러 사람이 한 JSONB를 갱신할 때 생기는 read-modify-write 유실이 없다).
 */
export function useSaveSurveyResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      respondentResourceId,
      respondentName,
    }: {
      input: SurveyResponseInput;
      respondentResourceId: string;
      respondentName: string | null;
    }) => {
      const { data, error } = await supabase
        .from('schedule_survey_response')
        .upsert(
          {
            survey_id: input.survey_id,
            respondent_resource_id: respondentResourceId,
            respondent_name: respondentName,
            // 생성된 Json 타입은 인덱스 시그니처를 요구한다 — 저장 형태는 JSONB 배열 그대로다
            items: input.items as unknown as Json,
            comment: input.comment || null,
          },
          { onConflict: 'survey_id,respondent_resource_id' }
        )
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // 목록의 '응답함' 배지·결과 집계·내 응답 캐시가 모두 이 접두사 아래에 있다
      queryClient.invalidateQueries({ queryKey: surveyKeys.all });
    },
    onError: (error) => {
      console.error('설문 응답 저장 실패:', error);
      toast.error('응답을 저장하지 못했습니다. 설문 대상자인지 확인해 주세요.');
    },
  });
}
