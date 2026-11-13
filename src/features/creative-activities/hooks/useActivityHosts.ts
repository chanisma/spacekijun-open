// ========================================
// 주최 맥락(동아리 등) hooks
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { createHost, fetchHostMembers, fetchHosts, fetchMyHosts } from '../services/activityService';
import type { ActivityHostInput } from '../types';

export const hostKeys = {
  all: ['creative-activity-hosts'] as const,
  list: () => [...hostKeys.all, 'list'] as const,
  members: (hostId: string, year: number) => [...hostKeys.all, 'members', hostId, year] as const,
};

export function useActivityHosts() {
  return useQuery({
    queryKey: hostKeys.list(),
    queryFn: fetchHosts,
    staleTime: 5 * 60_000,
  });
}

/**
 * 소속 명단. 참여자 선택의 **기본값 씨앗**이지 참여 기록이 아니다.
 *
 * 전출·자퇴한 옛 부원도 그대로 온다(`student_status`로 구분). 당시에는
 * 실제로 소속이었으므로 지우지 않는 것이 맞고, 화면이 표시만 구분한다.
 */
export function useActivityHostMembers(hostId: string | null, academicYear: number | null) {
  return useQuery({
    queryKey: hostKeys.members(hostId ?? '', academicYear ?? 0),
    queryFn: () => fetchHostMembers(hostId!, academicYear!),
    enabled: !!hostId && !!academicYear,
    staleTime: 5 * 60_000,
  });
}

/**
 * 내가 그 해 소속된 동아리 — 학생이 활동을 기록할 때 고를 수 있는 범위.
 * 서버도 같은 제약을 강제한다(`can_link_activity_host`).
 */
export function useMyActivityHosts(studentCode: string | null, academicYear: number | null) {
  return useQuery({
    queryKey: [...hostKeys.all, 'mine', studentCode ?? '', academicYear ?? 0],
    queryFn: () => fetchMyHosts(studentCode!, academicYear!),
    enabled: !!studentCode && !!academicYear,
    staleTime: 5 * 60_000,
  });
}

export function useCreateActivityHost() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: ActivityHostInput) => createHost(input),
    onSuccess: (host) => {
      qc.invalidateQueries({ queryKey: hostKeys.all });
      toast.success(`'${host.name}'을(를) 등록했습니다.`);
    },
    onError: (error: Error) => {
      console.error('주최 등록 실패:', error);
      // 같은 종류에 같은 이름이 이미 있으면 UNIQUE(kind, name) 위반이 온다.
      const message = /duplicate key|23505/.test(error.message)
        ? '같은 이름이 이미 등록돼 있습니다.'
        : error.message || '등록에 실패했습니다.';
      toast.error(message);
    },
  });
}
