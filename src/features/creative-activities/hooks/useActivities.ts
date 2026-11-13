// ========================================
// 창의적 체험활동 — TanStack Query hooks
// ========================================

import { useCallback } from 'react';
import { useActivityAccess } from './useActivityAccess';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  createActivity,
  deleteActivity,
  fetchActivitiesRaw,
  decorateActivities,
  fetchActivity,
  fetchLineageNodes,
  fetchMyActivities,
  fetchParticipants,
  setActivityHosts,
  setActivityTeachers,
  setParticipants,
  updateActivity,
  updateParticipation,
  type LineageSeed,
  type RawActivityListRow,
} from '../services/activityService';
import type {
  ActivityFilters,
  ActivityInput,
  ActivityTeacherRole,
  ParticipantInput,
} from '../types';

export const activityKeys = {
  all: ['creative-activities'] as const,
  lineage: () => [...activityKeys.all, 'lineage'] as const,
  list: (filters: ActivityFilters) => [...activityKeys.all, 'list', filters] as const,
  detail: (id: string) => [...activityKeys.all, 'detail', id] as const,
  participants: (id: string) => [...activityKeys.all, 'participants', id] as const,
  mine: (studentCode: string) => [...activityKeys.all, 'mine', studentCode] as const,
};

/**
 * 계보 계산용 경량 목록(전 연도의 id·이름·연도·부모만).
 *
 * 목록이 연도로 걸러져 있어도 "3년째" 배지를 정확히 찍으려면 계보는
 * 연도를 넘어 봐야 한다. 네 컬럼만 읽으므로 오래 캐시해도 안전하다.
 */
export function useLineageNodes() {
  return useQuery({
    queryKey: activityKeys.lineage(),
    queryFn: fetchLineageNodes,
    staleTime: 5 * 60_000,
  });
}

export function useActivities(filters: ActivityFilters = {}) {
  const { data: lineage } = useLineageNodes();
  // 학생에게는 참여자 수를 세지 않는다 — RLS 상 자기 행만 보여 값이 틀린다(그리고 느리다).
  const { clubOnly: isStudent } = useActivityAccess();

  // **계보를 queryKey 에 넣지 않는다.** 넣으면 계보가 도착하는 순간 키가 바뀌어
  // 목록 전체를 한 번 더 받는다 — 콜드 로드마다 같은 2 MB 를 두 번 받고 있었다.
  // 계보 장식은 순수 변환이라 `select` 에서 하면 재조회 없이 붙는다.
  const select = useCallback(
    (rows: RawActivityListRow[]) => decorateActivities(rows, lineage as LineageSeed[] | undefined),
    [lineage]
  );

  return useQuery({
    queryKey: [...activityKeys.list(filters), isStudent ? 'no-count' : 'count'],
    queryFn: () => fetchActivitiesRaw(filters, !isStudent),
    select,
    staleTime: 60_000,
  });
}

export function useActivity(id: string | null) {
  // 목록과 같은 기준 — 학생에게는 참여자 수를 세지 않는다(RLS 상 자기 행만 보여 틀린다).
  // 두 곳이 어긋나면 목록엔 안 나오는데 상세엔 틀린 수가 뜬다.
  const { clubOnly: isStudent } = useActivityAccess();
  return useQuery({
    queryKey: [...activityKeys.detail(id ?? ''), isStudent ? 'no-count' : 'count'],
    queryFn: () => fetchActivity(id!, !isStudent),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useActivityParticipants(activityId: string | null) {
  return useQuery({
    queryKey: activityKeys.participants(activityId ?? ''),
    queryFn: () => fetchParticipants(activityId!),
    enabled: !!activityId,
    staleTime: 30_000,
  });
}

export function useMyActivities(studentCode: string | null) {
  return useQuery({
    queryKey: activityKeys.mine(studentCode ?? ''),
    queryFn: () => fetchMyActivities(studentCode!),
    enabled: !!studentCode,
    staleTime: 60_000,
  });
}

// ----------------------------------------
// Mutations
// ----------------------------------------

/**
 * 활동 생성 — 담당교사·참여자를 한 흐름으로 붙인다.
 *
 * 활동 행이 만들어진 뒤 교사·참여자가 실패해도 활동은 남는다. 부분 실패를
 * 토스트로 알리되 롤백하지 않는 것은 의도적이다 — 활동 기록 자체가 가장
 * 값진 데이터이고, 명단은 나중에 다시 붙일 수 있다.
 */
export function useCreateActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      input: ActivityInput;
      teachers?: { resource_id: string; role: ActivityTeacherRole }[];
      participants?: ParticipantInput[];
      /** 주최(다대다) — 첫 항목이 대표 */
      hostIds?: string[];
    }) => {
      const activity = await createActivity(payload.input);

      const warnings: string[] = [];

      // **주최를 참여자보다 먼저 건다.** 학생 작성자는 서버가 참여자 등록 시
      // "주최 동아리의 부원인가"를 보므로, 주최가 없으면 참여자가 전부 거부된다.
      if (payload.hostIds?.length) {
        try {
          await setActivityHosts(activity.id, payload.hostIds);
        } catch (e) {
          console.error('주최 저장 실패:', e);
          warnings.push('주최');
        }
      }

      if (payload.teachers?.length) {
        try {
          await setActivityTeachers(activity.id, payload.teachers);
        } catch (e) {
          console.error('담당교사 저장 실패:', e);
          warnings.push('담당교사');
        }
      }
      if (payload.participants?.length) {
        try {
          await setParticipants(activity.id, payload.participants);
        } catch (e) {
          console.error('참여자 저장 실패:', e);
          warnings.push('참여자');
        }
      }
      return { activity, warnings };
    },
    onSuccess: ({ activity, warnings }) => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
      if (warnings.length > 0) {
        toast.warning(`활동은 저장됐지만 ${warnings.join('·')} 등록에 실패했습니다.`, {
          description: '활동 상세에서 다시 시도해 주세요.',
        });
      } else {
        toast.success(`'${activity.name}' 활동을 기록했습니다.`);
      }
    },
    onError: (error: Error) => {
      console.error('활동 생성 실패:', error);
      toast.error(error.message || '활동 기록에 실패했습니다.');
    },
  });
}

/**
 * 활동 수정 — **한 번의 저장에 토스트도 하나**다.
 *
 * 예전에는 update / 참여자 / 주최를 페이지가 따로 불러 각자 토스트를 냈고,
 * 참여자 변경이 없으면 "수정했습니다" 바로 뒤에 "변경 사항이 없습니다"가 떠서
 * 저장 전체가 무효인 것처럼 읽혔다(사용자 보고). `useCreateActivity`가 이미
 * 한 mutation에 다 담고 있으므로 수정도 같은 모양으로 맞춘다.
 *
 * **주최를 참여자보다 먼저 저장한다** — 학생 작성자는 서버가 참여자 등록 시
 * "주최 동아리 부원인가"를 보므로 순서가 바뀌면 참여자가 전부 거부된다.
 */
export function useUpdateActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      patch: Partial<ActivityInput>;
      teachers?: { resource_id: string; role: ActivityTeacherRole }[];
      participants?: ParticipantInput[];
      hostIds?: string[];
    }) => {
      await updateActivity(payload.id, payload.patch);
      if (payload.hostIds) await setActivityHosts(payload.id, payload.hostIds);
      if (payload.teachers) await setActivityTeachers(payload.id, payload.teachers);

      let roster: { added: number; removed: number } | null = null;
      if (payload.participants) {
        roster = await setParticipants(payload.id, payload.participants);
      }
      return roster;
    },
    onSuccess: (roster) => {
      qc.invalidateQueries({ queryKey: activityKeys.all });

      // 명단이 실제로 바뀐 경우에만 덧붙인다 — "변경 없음"은 알릴 값어치가 없다
      const parts: string[] = [];
      if (roster?.added) parts.push(`${roster.added}명 추가`);
      if (roster?.removed) parts.push(`${roster.removed}명 제외`);

      toast.success(
        parts.length ? `활동을 수정했습니다 · 참여자 ${parts.join(' · ')}` : '활동을 수정했습니다.'
      );
    },
    onError: (error: Error) => {
      console.error('활동 수정 실패:', error);
      toast.error(error.message || '활동 수정에 실패했습니다.');
    },
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteActivity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
    },
    onError: (error: Error) => {
      console.error('활동 삭제 실패:', error);
      toast.error(error.message || '활동 삭제에 실패했습니다.');
    },
  });
}

export function useUpdateParticipation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      id: string;
      patch: Partial<Pick<ParticipantInput, 'role' | 'status' | 'hours' | 'note'>>;
    }) => updateParticipation(payload.id, payload.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
    },
    onError: (error: Error) => {
      console.error('참여 기록 수정 실패:', error);
      toast.error(error.message || '참여 기록 수정에 실패했습니다.');
    },
  });
}
