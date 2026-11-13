import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

// 발급대장 전체 행을 볼 수 있는 태그(= 사이트 관리자/발급대장담당자). 학교관리자가 사이트 관리자 역할.
const SEE_ALL_TAGS = ['학교관리자', '사이트 관리자', '발급대장담당자'];

/**
 * 발급대장 아코디언 표시 범위.
 * - admin 또는 학교관리자/발급대장담당자 태그 → 전체 동아리/반 행 표시(`canSeeAll`)
 * - 그 외 교사 → 본인 담임 반 / 담당 동아리 행만 (필터는 호출부에서 isHomeroomOf·isClubAdvisor로)
 * useIsTrainingManager(연수담당자)와 동일 패턴.
 */
export function useLedgerScope(): { canSeeAll: boolean; isLoading: boolean } {
  const { isAdmin, profile } = useAuth();

  const tagsQ = useQuery({
    queryKey: ['issue-register', 'my-ledger-tags', profile?.name ?? null],
    enabled: !!profile?.name && !isAdmin, // admin은 태그 조회 불필요
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data: res, error: rErr } = await supabase
        .from('resource').select('id').eq('name', profile!.name).eq('type', 'teacher');
      if (rErr) throw new Error(rErr.message);
      const ids = (res ?? []).map(r => r.id);
      if (ids.length === 0) return [];
      const { data: asg, error: aErr } = await supabase
        .from('resource_tag_assignments').select('tag_id').in('resource_id', ids);
      if (aErr) throw new Error(aErr.message);
      const tagIds = Array.from(new Set((asg ?? []).map(a => a.tag_id)));
      if (tagIds.length === 0) return [];
      const { data: tags, error: tErr } = await supabase
        .from('resource_tags').select('name').in('id', tagIds);
      if (tErr) throw new Error(tErr.message);
      return (tags ?? []).map(t => t.name);
    },
  });

  const hasTag = (tagsQ.data ?? []).some(n => SEE_ALL_TAGS.includes(n));
  return { canSeeAll: isAdmin || hasTag, isLoading: tagsQ.isLoading && !isAdmin };
}
