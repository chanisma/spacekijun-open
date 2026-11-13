import { Navigate, useLocation } from 'react-router-dom';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isStaffOpenedByMenu } from '@/lib/menuVisibility';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, Loader2 } from 'lucide-react';
import type { AppRole } from '@/lib/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * 허용 역할. 교직원 공용 화면은 `FACULTY_ROLES`(교사+직원+admin),
   * 학생 정보·교무 화면은 `TEACHER_ROLES`(교사+admin)를 쓴다 — `@/lib/roles`.
   */
  allowed: AppRole[];
}

/**
 * Route guard component that redirects users to home if their role is not allowed.
 * Used in App.tsx to wrap routes that should be restricted by role.
 *
 * **세 가지 "못 보여주는 이유"를 구분해 말한다 (2026-09-04).**
 * 종전엔 셋 다 화면에 아무것도 그리지 않거나 조용히 홈으로 보냈다:
 *   · 로딩 중 → `return null`  (빈 화면)
 *   · 프로필 미해결 → `return null`  (빈 화면. 실패하면 **영구히** 빈 화면)
 *   · 역할 불일치 → `<Navigate to="/" />`  (이유 없이 홈으로 튕김)
 * 사용자에게는 셋이 전부 "눌렀는데 아무 일도 안 일어남"으로 보여, 같은 링크를 반복하거나
 * "사이트가 이상하다"고 신고하게 된다. 이제 각각 다른 것을 보여준다.
 */
export const ProtectedRoute = ({ children, allowed }: ProtectedRouteProps) => {
  const { user, profile, profileError, loading, effectiveRole, refreshProfile } = useAuth();
  const location = useLocation();
  const menuVisibility = useMenuVisibility();

  // Fail closed: unauthenticated users go to the login screen, never see content.
  // 로딩 판정보다 먼저 오면 안 된다 — 로딩 중에는 user 가 아직 null 이라 로그인 화면으로 튄다.
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="sr-only">불러오는 중</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // 프로필 조회가 **실패**한 경우: 원인과 재시도를 준다. 종전엔 이 상태가 빈 화면으로
  // 영구히 남았고(새로고침해도 같은 코드가 같은 결과), 사용자는 앱이 고장 났다고 판단했다.
  if (!profile && profileError) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold">내 정보를 불러오지 못했습니다</h2>
              <p className="text-sm text-muted-foreground">
                네트워크가 불안정하거나 일시적인 오류일 수 있습니다. 계속되면 관리자에게 알려주세요.
              </p>
            </div>
          </div>
          <p className="break-words rounded border bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
            {profileError.message}
          </p>
          <Button size="sm" onClick={() => void refreshProfile()}>
            <RotateCw className="mr-2 h-4 w-4" />
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  // 인증은 됐지만 프로필이 아직 없는 과도기: 보호 콘텐츠를 흘리지 않되 빈 화면도 아니게 한다.
  if (!profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="sr-only">내 정보를 확인하는 중</span>
      </div>
    );
  }

  // 미리보기(학생/교사/직원)를 반영한 실효 역할으로 판정한다.
  // admin이 미리보기 중이면 그 역할의 차단까지 그대로 재현된다 — 미리보기의 요점이
  // "어디까지 열리는가"이기 때문. 나가기 칩은 Routes 밖(Layout)이라 항상 남는다.
  const userRole = (effectiveRole ?? profile.role) as AppRole;

  // 직원에게 역할상 닫힌 화면을 관리자가 **메뉴 관리에서 열어 준** 경우 (2026-09-21).
  // 메뉴는 보이는데 눌러도 튕기면 고장처럼 보이므로 같은 설정을 본다. 교사에게 열린 화면에만 적용한다
  // (admin 전용 화면까지 열리면 안 된다). ⚠️ 여는 것은 화면까지다 — 자료는 RLS 가 그대로 판정한다.
  const staffException = userRole === 'staff' && !allowed.includes('staff') && allowed.includes('teacher');
  if (staffException && menuVisibility.isLoading) {
    // 설정을 읽기 전에 튕기면, 열어 준 화면에 주소로 바로 들어온 직원이 매번 홈으로 간다
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="sr-only">메뉴 설정을 확인하는 중</span>
      </div>
    );
  }
  const openedForStaff = staffException && isStaffOpenedByMenu(menuVisibility.config, location.pathname);

  if (!allowed.includes(userRole) && !openedForStaff) {
    // 어디서 왜 튕겼는지를 state 로 넘긴다 — 홈이 한 번만 배너로 알려줄 수 있게.
    // 종전엔 아무 흔적 없이 홈으로 보내 사용자가 클릭이 먹지 않았다고 오해했다.
    return (
      <Navigate
        to="/"
        replace
        state={{ blockedFrom: location.pathname, blockedReason: 'role' as const }}
      />
    );
  }

  return <>{children}</>;
};
