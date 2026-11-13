import { supabase } from '@/integrations/supabase/client';

/**
 * 사용자가 프로필 편집에서 **스스로** 자기 계정에 연결할 수 있는 resource 종류.
 *
 * 교사(teacher)와 행정 직원(staff)이 대상이다. 학생은 `user_resource` 링크를
 * 만들지 않고 이메일 prefix ↔ `resource.meta->>'id'`로 식별하므로 여기 없다
 * (`unifiedAuth.getUserResources` 주석 참고).
 */
export const SELF_LINKABLE_RESOURCE_TYPES = ['teacher', 'staff'] as const;

/**
 * 이름·종류만 담는다 — `meta` 는 돌려주지 않는다.
 *
 * 이 조회는 **아직 명단에 연결되지 않은 계정**(이름 등록 단계)도 부른다. 그런 계정은 서버
 * 차단막(`account_link_pre_request`, 2026-10-13)이 `resource` 표 직접 조회를 막고, 대신
 * 이름·종류만 주는 RPC `find_self_linkable_resource` 를 연다(`meta` 에는 교사 외부 계정
 * 정보가 있다). meta 가 필요하면 연결한 **뒤에** id 로 다시 읽을 것.
 */
export interface LinkableResource {
  id: string;
  name: string;
  type: string;
}

/**
 * 이름으로 연결 가능한 resource 1건을 찾는다.
 *
 * 같은 이름이 두 종류에 동시에 존재할 수 있어(교사↔학생 동명이인 실제 발생) 전부 받아
 * **teacher를 우선**해 결정적으로 하나를 고른다. 정렬은 RPC 가 이미 teacher 먼저로 준다.
 */
export const findLinkableResourceByName = async (
  name: string,
): Promise<{ resource: LinkableResource | null; error: unknown }> => {
  const { data, error } = await supabase.rpc('find_self_linkable_resource' as never, {
    p_name: name,
  } as never);

  if (error) {
    return { resource: null, error };
  }

  const rows = ((data ?? []) as unknown as LinkableResource[]).filter((row) =>
    (SELF_LINKABLE_RESOURCE_TYPES as readonly string[]).includes(row.type),
  );
  const picked = rows.find((row) => row.type === 'teacher') ?? rows[0] ?? null;

  return { resource: picked, error: null };
};

/** 서버 `my_account_link_status()` 의 값. */
export type AccountLinkStatus = 'linked' | 'unlinked' | 'inactive';

/**
 * 이 계정이 명단(resource)에 연결돼 있는가 — 서버 판정 단일 출처를 읽는다.
 * 실패하면 null(모름)이다. 그때 앱은 막지 않는다 — 서버 차단막이 데이터를 지킨다.
 */
export const fetchMyAccountLinkStatus = async (): Promise<AccountLinkStatus | null> => {
  const { data, error } = await supabase.rpc('my_account_link_status' as never);
  if (error) {
    console.warn('계정 연결 상태 조회 실패:', error);
    return null;
  }
  return data === 'linked' || data === 'unlinked' || data === 'inactive'
    ? (data as AccountLinkStatus)
    : null;
};
