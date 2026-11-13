import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  EMPTY_NAV_LAYOUT_CONFIG,
  MENU_LAYOUT_SETTING_KEY,
  parseNavLayoutConfig,
  type NavLayoutConfig,
} from '@/lib/navLayout';

export const MENU_LAYOUT_QUERY_KEY = ['menu-layout'] as const;

const SETTING_DESCRIPTION =
  '메뉴 배치 설정(범례·메뉴 위치). 관리자가 Admin ▸ 메뉴 관리에서 지정하며, 코드의 기본 배치 위에 얹는 차이만 담습니다.';

/**
 * 메뉴 배치 설정 읽기 — `useMenuVisibility` 와 같은 표(`system_settings`, public read)의 다른 키다.
 *
 * 못 읽었거나 아직 읽는 중이면 **빈 설정 = 코드 기본 배치**다. 배치는 보안 경계가 아니므로
 * 읽기 실패로 사이드바를 비우지 않는다(메뉴가 코드의 자리에 그대로 나온다).
 */
export function useMenuLayout() {
  const query = useQuery<NavLayoutConfig>({
    queryKey: MENU_LAYOUT_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', MENU_LAYOUT_SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseNavLayoutConfig(data?.setting_value);
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    config: query.data ?? EMPTY_NAV_LAYOUT_CONFIG,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * 배치 저장 (관리자 전용). 규약은 `useUpdateMenuVisibility` 와 같다 — **RLS 가 막으면 오류가
 * 아니라 0행**이므로 반환 행으로 실제 반영을 확인하고, `created_by` 보존을 위해 upsert 대신
 * 조회 → update/insert 로 나눈다.
 */
export function useUpdateMenuLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ config, userId }: { config: NavLayoutConfig; userId: string }) => {
      const settingValue = config as unknown as Json;

      const { data: existing, error: readError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('setting_key', MENU_LAYOUT_SETTING_KEY)
        .maybeSingle();
      if (readError) throw readError;

      const { data, error } = existing
        ? await supabase
            .from('system_settings')
            .update({ setting_value: settingValue, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select('id')
        : await supabase
            .from('system_settings')
            .insert([
              {
                setting_key: MENU_LAYOUT_SETTING_KEY,
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
      return config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MENU_LAYOUT_QUERY_KEY });
    },
  });
}
