import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagMember {
  resourceId: string;
  name: string;
}

/**
 * 모든 태그의 소속 교직원(이름)을 가져오는 훅.
 * resource_tag_assignments → resource(name) 조인.
 *
 * 반환: Map<tag_id, TagMember[]>
 *
 * 기능별 권한 뷰에서 "이 태그를 가진 사람들"을 보여주기 위해 사용한다.
 * 태그가 많지 않으므로 한 번에 전부 가져와 클라이언트에서 그룹화한다.
 */
export function useTagMembers() {
  return useQuery({
    queryKey: ['tag-members'],
    queryFn: async () => {
      // resource_id 는 base 테이블 resource 와 여러 뷰를 동시에 참조하지만
      // 모두 동일한 FK 제약(resource_tag_assignments_resource_id_fkey)을 쓰므로
      // 제약 이름으로 임베드해 모호성을 제거하고 base 테이블(resource)로 해석시킨다.
      const { data, error } = await supabase
        .from('resource_tag_assignments')
        .select(
          'tag_id, resource:resource!resource_tag_assignments_resource_id_fkey(id, name)'
        );

      if (error) throw error;

      // PostgREST 임베드는 생성 타입에서 깔끔히 추론되지 않으므로 결과 형태를
      // 로컬로 명시한다(embed 는 객체 또는 null).
      interface RawRow {
        tag_id: string;
        resource: { id: string; name: string | null } | null;
      }
      const rows = (data ?? []) as unknown as RawRow[];

      const map = new Map<string, TagMember[]>();
      rows.forEach((row) => {
        const res = row.resource;
        if (!res?.name) return;
        if (!map.has(row.tag_id)) map.set(row.tag_id, []);
        map.get(row.tag_id)!.push({ resourceId: res.id, name: res.name });
      });
      // 이름 정렬
      map.forEach((members) =>
        members.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      );
      return map;
    },
    staleTime: 60 * 1000,
  });
}
