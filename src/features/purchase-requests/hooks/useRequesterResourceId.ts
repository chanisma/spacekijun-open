import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';

// 새 테이블 / 동적 lookup 컬럼이 supabase 자동 타입에 매핑되지 않은 부분 우회용.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

const KEY = ['purchase-requester-resource'] as const;

/**
 * 신청자(특히 학생)의 resource_id 를 보장 — `user_resource` 가 비어있는 학생도 작동.
 *
 * 동작 순서:
 * 1) `useCurrentResourceId`(user_resource 기반) 결과가 있으면 그대로 반환.
 * 2) 없으면 이메일 prefix(`user233@example.com` → `00-00472`)로
 *    `resource(type='student', meta->>'id'=prefix)` 1건 조회.
 * 3) 매칭되는 학생 리소스가 있으면 `user_resource` 에 자가 INSERT(RLS 본인 row 허용)
 *    하고 그 resource_id 반환.
 *
 * 매칭이 실패하면 null 을 반환해 호출부에서 "리소스 없음" 안내 가능.
 */
export function useRequesterResourceId() {
  const { user, profile } = useAuth();
  const { data: existingId, isLoading: existingLoading } = useCurrentResourceId();
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: [...KEY, user?.id, existingId],
    queryFn: async (): Promise<string | null> => {
      // 이미 user_resource 링크가 있으면 그대로 사용.
      if (existingId) return existingId;
      if (!user?.id || !user.email) return null;

      const prefix = user.email.split('@')[0];
      if (!prefix) return null;

      // 학생 패턴(예: 00-00472)인지 가벼운 검사
      const looksLikeStudentCode = /^\d{2}-\d+$/.test(prefix);

      // 우선 학생 리소스에서 찾고, 못 찾으면 staff/teacher 까지 확장
      const types = looksLikeStudentCode
        ? ['student']
        : ['student', 'teacher', 'staff'];

      const { data: resources, error } = await supabase
        .from('resource')
        .select('id, type, name, meta')
        .in('type', types)
        .eq('meta->>id', prefix)
        .limit(1);

      if (error) {
        console.warn('[useRequesterResourceId] resource lookup failed:', error.message);
        return null;
      }

      const resource = (resources || [])[0];
      if (!resource) return null;

      // 본인 user_resource 자가 링크 (RLS 본인 row 허용 정책에 의해 통과)
      const { error: linkError } = await supabase
        .from('user_resource')
        .insert({ user_id: user.id, resource_id: resource.id });

      if (linkError && linkError.code !== '23505') {
        // 중복 외의 에러는 경고만 남기고 진행 (다른 세션이 동시에 link 했을 수 있음)
        console.warn('[useRequesterResourceId] user_resource link failed:', linkError.message);
      }

      return resource.id as string;
    },
    enabled: !!user?.id && !existingLoading,
    staleTime: 5 * 60 * 1000,
  });

  // 링크가 새로 생긴 경우 useCurrentResourceId 캐시도 무효화 → 다음 호출부터 fast-path
  useEffect(() => {
    if (result.data && !existingId) {
      queryClient.invalidateQueries({ queryKey: ['current-resource-id'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedAuth'] });
    }
  }, [result.data, existingId, queryClient]);

  return {
    data: result.data ?? existingId ?? null,
    isLoading: existingLoading || result.isLoading,
    profileRole: profile?.role,
  };
}
