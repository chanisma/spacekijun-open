import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type { DatasetCount, DatasetCounting } from '@/components/admin/adminDashboardCatalog';
import type { AcademyStats } from '@/components/admin/adminDashboardAcademy';
import type { TamaStats } from '@/components/admin/adminDashboardTamagotchi';

/**
 * 관리자 대시보드 통계.
 *
 * 서버 RPC `get_admin_dashboard_stats()` 한 번으로 전부 받는다. 기능별 건수를
 * 클라이언트에서 표마다 세면 ①왕복이 40번 넘고 ②각 요청이 RLS 를 통과하므로
 * **정책이 좁은 표는 관리자에게도 실제보다 작게 보인다**(운영 지표가 조용히 틀린다).
 *
 * **기능별 자료 건수(`datasets`)는 매번 세지 않는다 (2026-10-08)** — 서버가 표 60여 개를
 * 전수로 세느라 콜드에서 3~5초가 걸렸다. 지금은 `admin_dashboard_snapshot` 한 줄을 읽고
 * (매일 04:30 KST pg_cron + 관리자 [지금 다시 세기]), 나머지 가벼운 블록만 매번 센다.
 * 화면의 [새로고침]은 그 가벼운 부분만 다시 읽는다 — 자료 건수는 `useRecountAdminDatasets`.
 */

export interface AdminDashboardStats {
  generated_at: string;
  datasets: Record<string, DatasetCount>;
  users: {
    total: number;
    student: number;
    teacher: number;
    staff: number;
    admin: number;
    new_30d: number;
    active_7d: number;
    active_30d: number;
    never_logged_in: number;
    links: number;
    unlinked_faculty: number;
    privacy_policy_version: string | null;
    privacy_consented: number | null;
  };
  resources: {
    total: number;
    student_active: number;
    student_graduated: number;
    student_left: number;
    teacher: number;
    staff: number;
    external_menu: number;
  };
  /** 마지막 접속일 분포 (최근 14일). DAU 가 아니다 — `last_login` 은 최신 1회만 남는다 */
  login_recency: Array<{ date: string; count: number }>;
  /**
   * 별빛 탐구 아카데미 장별 진행.
   *
   * 표가 모두 수십 행이라 위 dataset 예산(3.5초)과 무관하게 **항상 정확히** 센다 —
   * 그래서 `DatasetCount` 와 달리 `exact` 플래그가 없다.
   *
   * 서버가 이 블록을 돌려주기 전에 배포된 클라이언트가 있을 수 있으므로 optional.
   */
  academy?: AcademyStats;
  /**
   * 다마고찌(2026-10-06 출시). 표가 없는 배포본이면 null, 구버전 서버면 키 자체가 없다.
   * 계약 = `adminDashboardTamagotchi.ts` 의 `TamaStats`.
   */
  tamagotchi?: TamaStats | null;
  system: {
    academic_term: { year?: number; semester?: number; start_date?: string; end_date?: string } | null;
    menu_visibility: Record<string, { users?: boolean; admin?: boolean }> | null;
    notifications_30d: number;
    notifications_unread: number;
    database_size: string;
  };
  /**
   * 이번 응답에서 몇 개를 실제로 셌고 몇 개를 추정했는지.
   *
   * `budget_hit` 이 true 면 서버가 3.5초 예산을 다 써서 남은 표를 추정으로 돌린 것이다
   * (콜드 캐시에서 일어난다). 화면은 이 값으로 "지금 숫자가 얼마나 정확한지"를 말할 수 있다.
   *
   * **스냅샷을 만들 때의 기록이다** — `generated_at`·`source` 가 그 기준 시각과 출처.
   * 구버전 서버(스냅샷 이전)는 둘이 없다(= 지금 막 센 값).
   */
  counting: DatasetCounting;
  /** 가벼운 블록을 세는 데 걸린 시간(ms). 구버전 서버에는 없다 */
  live_ms?: number;
}

export type { DatasetCount, DatasetCounting };

export const ADMIN_DASHBOARD_STATS_KEY = ['admin-dashboard-stats'] as const;

export function useAdminDashboardStats() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ADMIN_DASHBOARD_STATS_KEY,
    queryFn: async (): Promise<AdminDashboardStats> => {
      // 새 RPC 라 generated types 에 아직 없다. 반환 형태는 위 인터페이스가 계약.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_admin_dashboard_stats');
      if (error) throw error;
      return data as AdminDashboardStats;
    },
    // 미리보기 중에는 isAdmin 이 false 가 되고, 그때 Admin 페이지 자체가 열리지 않는다.
    enabled: !!user?.id && isAdmin,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** `refresh_admin_dashboard_datasets()` 응답 = 스냅샷 한 줄 + 1분 안 재요청이었는지 */
interface DatasetSnapshotRow {
  datasets: Record<string, DatasetCount>;
  counting: Omit<DatasetCounting, 'generated_at' | 'source'>;
  generated_at: string;
  source: NonNullable<DatasetCounting['source']>;
  throttled: boolean;
}

/**
 * [지금 다시 세기] — 기능별 자료 스냅샷을 지금 다시 만든다(관리자, 서버가 재검증).
 *
 * 낮에는 8초 statement_timeout 안이라 종전과 같은 예산(3.5초·20MB)으로 센다 → 큰 표 4개는
 * 다시 추정치가 된다(정확한 값은 다음 야간 집계). 1분 안에 다시 누르면 서버가 세지 않고
 * 방금 값을 돌려준다(`throttled`).
 *
 * 성공하면 대시보드 전체를 다시 읽지 않고 **캐시의 자료 부분만 바꾼다** — 가벼운 블록까지
 * 다시 셀 이유가 없다.
 */
export function useRecountAdminDatasets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DatasetSnapshotRow> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('refresh_admin_dashboard_datasets');
      if (error) throw error;
      return data as DatasetSnapshotRow;
    },
    onSuccess: (snap) => {
      queryClient.setQueryData<AdminDashboardStats>(ADMIN_DASHBOARD_STATS_KEY, (prev) =>
        prev
          ? {
              ...prev,
              datasets: snap.datasets,
              counting: { ...snap.counting, generated_at: snap.generated_at, source: snap.source },
            }
          : prev,
      );
    },
  });
}
