import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { parseDashboardLayout, type DashboardKind, type DashboardLayout } from '@/lib/dashboardLayout';

// 표 `dashboard_layout`(2026-10-25) — 생성 타입에 아직 없어 좁은 모양으로 부른다
const table = () => (supabase as unknown as { from: (t: string) => any }).from('dashboard_layout');

export const dashboardLayoutKey = (userId: string | undefined, kind: DashboardKind) => ['dashboard-layout', userId, kind] as const;

/**
 * 내 홈 배치 — 못 읽었거나 없으면 null(= 코드 기본 배치). 배치는 보안 경계가 아니므로 읽기 실패로 홈을 비우지 않는다.
 * 관리자 학생 미리보기는 관리자 본인의 «학생 홈» 배치를 쓴다(학생 본인의 것을 보지 않는다 — 본인 행만 읽힌다).
 */
export function useDashboardLayout(kind: DashboardKind) {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: dashboardLayoutKey(userId, kind),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DashboardLayout | null> => {
      const { data, error } = await table().select('layout').eq('user_id', userId).eq('kind', kind).maybeSingle();
      if (error) throw error;
      return parseDashboardLayout(data?.layout);
    },
  });
  const save = useMutation({
    mutationFn: async (layout: DashboardLayout | null) => {
      if (!userId) throw new Error('로그인이 필요합니다.');
      // 기본과 같으면 행을 지운다 — 코드 기본 배치가 바뀌면 따라가게
      const { error } = layout
        ? await table().upsert({ user_id: userId, kind, layout, updated_at: new Date().toISOString() }, { onConflict: 'user_id,kind' })
        : await table().delete().eq('user_id', userId).eq('kind', kind);
      if (error) throw error;
      return layout;
    },
    onSuccess: (layout) => qc.setQueryData(dashboardLayoutKey(userId, kind), layout),
  });
  return { layout: query.data ?? null, isLoading: query.isLoading, save };
}
