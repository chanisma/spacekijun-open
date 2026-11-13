import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  EMPTY_MENU_VISIBILITY,
  MENU_VISIBILITY_SETTING_KEY,
  isPathVisible,
  parseMenuVisibilityConfig,
  type MenuVisibilityConfig,
} from '@/lib/menuVisibility';

export const MENU_VISIBILITY_QUERY_KEY = ['menu-visibility'] as const;

const SETTING_DESCRIPTION =
  '메뉴 활성화 설정. 관리자가 Admin ▸ 메뉴 관리에서 지정하며, 사이드바 노출과 라우트 접근을 함께 제어합니다.';

/**
 * 메뉴 활성화 설정 읽기.
 *
 * `system_settings`는 public read라 로그인한 누구나 읽을 수 있다(쓰기만 admin).
 * 이 훅은 네비게이션 조립(`useNavSections`)과 라우트 게이트(`MenuRouteGate`)가
 * **같은 쿼리 캐시를 공유**하므로 화면당 요청이 늘지 않는다.
 */
export function useMenuVisibility() {
  const query = useQuery<MenuVisibilityConfig>({
    queryKey: MENU_VISIBILITY_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', MENU_VISIBILITY_SETTING_KEY)
        .maybeSingle();

      // 미설정(행 없음)은 정상 — 카탈로그 기본값이 그대로 적용된다.
      if (error) throw error;
      return parseMenuVisibilityConfig(data?.setting_value);
    },
    // 메뉴 구성은 자주 바뀌지 않는다. 저장 시 invalidate로 즉시 반영한다.
    staleTime: 5 * 60 * 1000,
  });

  return {
    /** 저장값이 없거나 아직 못 읽었으면 빈 설정 = 카탈로그 기본값 적용 */
    config: query.data ?? EMPTY_MENU_VISIBILITY,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * 경로/메뉴 href 하나가 지금 사용자에게 보이는지 판정하는 콜백.
 * 미리보기를 반영한 `isAdmin`을 그대로 받는다(관리자가 교사 미리보기 중이면 교사 기준).
 */
export function useIsMenuVisible(isAdmin: boolean, role?: string | null) {
  const { config } = useMenuVisibility();
  return useCallback(
    (pathname: string | undefined) => isPathVisible(config, pathname, { isAdmin, role }),
    [config, isAdmin, role]
  );
}

/**
 * 설정 저장 (관리자 전용).
 *
 * **RLS가 막으면 오류가 아니라 0행**이 온다 — 그냥 두면 '저장됨'으로 보이므로
 * 반환 행으로 실제 반영을 확인한다(이 저장소의 다른 admin 저장 경로와 같은 규약).
 * `created_by`를 보존하기 위해 upsert 대신 조회 → update/insert로 나눈다.
 */
export function useUpdateMenuVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ config, userId }: { config: MenuVisibilityConfig; userId: string }) => {
      const settingValue = config as unknown as Json;

      const { data: existing, error: readError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('setting_key', MENU_VISIBILITY_SETTING_KEY)
        .maybeSingle();
      if (readError) throw readError;

      if (existing) {
        const { data, error } = await supabase
          .from('system_settings')
          .update({ setting_value: settingValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('저장 권한이 없습니다. (관리자만 수정할 수 있습니다)');
        }
      } else {
        const { data, error } = await supabase
          .from('system_settings')
          .insert([
            {
              setting_key: MENU_VISIBILITY_SETTING_KEY,
              setting_value: settingValue,
              description: SETTING_DESCRIPTION,
              created_by: userId,
            },
          ])
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('저장 권한이 없습니다. (관리자만 수정할 수 있습니다)');
        }
      }

      return config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MENU_VISIBILITY_QUERY_KEY });
    },
  });
}
