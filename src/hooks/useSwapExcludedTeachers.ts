/**
 * 수업 교체·대체의 **상대방 후보에서 제외**할 교사 (2026-08-14 사용자 결정).
 *
 * `학교관리자` 태그(교장·교감)는 수업을 대신 맡거나 시간을 맞바꾸는 대상이 아니다.
 * 목록에 남겨두면 신청자가 실수로 요청을 보내고, 받은 쪽은 거절만 하게 된다.
 *
 * **시험 감독 제외 목록과는 일부러 분리한다.** 감독은 `학교관리자`에 더해
 * `고사운영교사`(고사 본부 운영)도 빼지만(`supervisionService.ts`), 그건 감독 운영상의
 * 이유이지 수업을 못 맡는다는 뜻이 아니다. 한 상수로 합치면 한쪽 정책을 고칠 때
 * 다른 쪽이 조용히 함께 바뀐다.
 *
 * 제외는 **상대방에만** 적용된다 — 학교관리자 본인이 자기 수업의 교체를 신청하는 것은 막지 않는다.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** 교체·대체 상대에서 빼는 태그 */
export const SWAP_EXCLUDED_TAGS = ['학교관리자'] as const;

export function useSwapExcludedTeacherIds() {
  return useQuery({
    queryKey: ['swap-excluded-teachers', ...SWAP_EXCLUDED_TAGS],
    queryFn: async (): Promise<Set<string>> => {
      const { data: tags, error: tagError } = await supabase
        .from('resource_tags')
        .select('id')
        .in('name', SWAP_EXCLUDED_TAGS as unknown as string[]);

      if (tagError) throw tagError;
      const tagIds = (tags ?? []).map((tag) => tag.id);
      if (tagIds.length === 0) return new Set();

      const { data: assignments, error: assignError } = await supabase
        .from('resource_tag_assignments')
        .select('resource_id')
        .in('tag_id', tagIds);

      if (assignError) throw assignError;
      return new Set((assignments ?? []).map((row) => row.resource_id));
    },
    // 태그는 거의 바뀌지 않는다 — 모달을 열 때마다 다시 묻지 않는다.
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
