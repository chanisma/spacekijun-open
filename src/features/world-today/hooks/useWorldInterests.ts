import { useQuery } from '@tanstack/react-query';
import { fetchMyInterests, fetchWorldNewsForMe } from '../services/worldNewsService';
import { normalizeFields } from '../utils/fields';

/** 요즘 세상 화면과 홈 카드가 같은 키를 쓴다 — 한쪽에서 저장하면 다른 쪽도 같은 값을 본다. */
export const worldInterestsKey = (userId: string) => ['world-today', 'interests', userId] as const;
export const worldForMeKey = (userId: string) => ['world-today', 'for-me', userId] as const;

/**
 * 내 관심 분야. 저장 행이 없으면 `saved: false`(아직 한 번도 고르지 않음)이고, 고른 뒤 전부 비운 것과 구분한다 —
 * 앞은 «골라 보세요» 초대를, 뒤는 «관심 분야 없음»을 보여 준다.
 * enabled = false(관리자 미리보기)이면 조회하지 않는다 — 관리자 자신의 관심 분야가 학생 것처럼 보이면 안 된다.
 */
export function useWorldInterests(userId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: worldInterestsKey(userId),
    queryFn: () => fetchMyInterests(userId),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  });
  const fields = normalizeFields(query.data?.fields);
  return { ...query, saved: !!query.data, fields, notify: query.data?.notify ?? true };
}

export function useWorldNewsForMe(userId: string, fields: readonly string[], limit: number, enabled: boolean) {
  return useQuery({
    queryKey: [...worldForMeKey(userId), fields.join('|'), limit],
    queryFn: ({ signal }) => fetchWorldNewsForMe(fields, limit, signal),
    enabled: enabled && !!userId && fields.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
