import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 태그별 할당 인원 수를 가져오는 경량 훅.
 * resource_tag_assignments 에서 tag_id 만 select 해 그룹 카운트한다
 * (태그 객체 조인 없이 — 매트릭스는 숫자만 필요하므로).
 *
 * 반환: Map<tag_id, 인원수>
 */
export function useTagAssignmentCounts() {
  return useQuery({
    queryKey: ['tag-assignment-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource_tag_assignments')
        .select('tag_id');

      if (error) throw error;

      const counts = new Map<string, number>();
      (data ?? []).forEach((row: { tag_id: string }) => {
        counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
      });
      return counts;
    },
    staleTime: 60 * 1000,
  });
}
