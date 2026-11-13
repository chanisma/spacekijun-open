import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface EvalogTagPermissionRow {
  id: string;
  tag_id: string;
  permission_key: string;
  grade: number;
}

/**
 * evalog_tag_permissions 테이블에서 전체 권한 설정을 조회하는 훅
 * 반환: Map<compositeKey, Set<tagId>>
 * compositeKey 형식: `${permission_key}@${grade}` (예: "attendance@1", "seteuk:국어@2")
 */
export function useEvalogTagPermissions() {
  return useQuery({
    queryKey: ['evalog-tag-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evalog_tag_permissions' as any)
        .select('id, tag_id, permission_key, grade');

      if (error) throw error;

      const map = new Map<string, Set<string>>();
      ((data as EvalogTagPermissionRow[]) || []).forEach((row) => {
        const compositeKey = `${row.permission_key}@${row.grade}`;
        if (!map.has(compositeKey)) {
          map.set(compositeKey, new Set());
        }
        map.get(compositeKey)!.add(row.tag_id);
      });

      return map;
    },
    staleTime: 5 * 60 * 1000, // 5분
  });
}
