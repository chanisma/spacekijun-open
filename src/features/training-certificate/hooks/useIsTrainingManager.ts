import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentTeacherResource } from './useCurrentTeacherResource';

const TRAINING_MANAGER_TAG = '연수담당자';

/** 관리자이거나 '연수담당자' 태그 보유 → 전체 리스트 열람 + 연수 종류 관리 가능 */
export function useIsTrainingManager(): { isManager: boolean; isLoading: boolean } {
  const { isAdmin } = useAuth();
  const { data: resource } = useCurrentTeacherResource();
  const resourceId = resource?.id ?? null;

  const tagsQ = useQuery({
    queryKey: ['training-cert', 'my-tags', resourceId],
    enabled: !!resourceId && !isAdmin, // admin은 태그 조회 불필요
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data: assigns, error: aErr } = await supabase
        .from('resource_tag_assignments')
        .select('tag_id')
        .eq('resource_id', resourceId!);
      if (aErr) throw aErr;
      const tagIds = Array.from(new Set((assigns ?? []).map((a) => a.tag_id)));
      if (tagIds.length === 0) return [];
      const { data: tags, error: tErr } = await supabase
        .from('resource_tags')
        .select('name')
        .in('id', tagIds);
      if (tErr) throw tErr;
      return (tags ?? []).map((t) => t.name);
    },
  });

  const hasTag = (tagsQ.data ?? []).includes(TRAINING_MANAGER_TAG);
  return { isManager: isAdmin || hasTag, isLoading: tagsQ.isLoading && !isAdmin };
}
