import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathHidden } from '@/lib/menuVisibility';

/**
 * 비활성 메뉴의 라우트 차단막.
 *
 * ----------------------------------------
 * 왜 라우트까지 막는가
 * ----------------------------------------
 * 메뉴만 감추면 URL 직접 입력·기존 북마크·다른 화면의 링크로 그대로 들어와진다.
 * "개발 중이라 노출하지 않는다"가 목적이므로 진입 자체를 막아야 뜻이 선다.
 *
 * ----------------------------------------
 * 왜 라우트마다가 아니라 한 곳인가
 * ----------------------------------------
 * `<Routes>` 전체를 감싸면 `ProtectedRoute`가 없는 라우트(`/schedule` 등)까지 함께
 * 덮이고, 새 라우트를 추가할 때 가드를 빠뜨릴 자리가 없다. 판정은 경로 접두(세그먼트
 * 단위)라 `/exam-schedule/new` 같은 하위 경로도 자동으로 포함된다.
 *
 * ----------------------------------------
 * 배치 위치가 곧 깜빡임 대책이다
 * ----------------------------------------
 * `App.tsx`에서 **`RequireAuth` 바깥**(BrowserRouter 바로 안)에 둔다. 그래야 설정
 * 쿼리가 앱 마운트와 동시에 시작되어 인증 확인과 **병렬로** 끝난다. 안쪽에 두면
 * 인증이 끝난 뒤에야 조회가 시작돼, 그 사이 차단 대상 화면이 잠깐 보였다 사라진다.
 * 인증 자체는 여기서 판정하지 않는다(`RequireAuth` 담당).
 */
export const MenuRouteGate = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, isAdmin, effectiveRole } = useAuth();
  const location = useLocation();
  const { config, isLoading } = useMenuVisibility();

  // 미로그인·프로필 미해결 상태의 판단은 RequireAuth/ProtectedRoute의 몫이다.
  // 여기서 먼저 홈으로 보내면 로그인 후 원래 주소로 돌아가는 흐름이 끊긴다.
  if (!user || !profile) return <>{children}</>;

  // 설정을 아직 못 읽었으면 열어 둔다(fail-open). 이 게이트는 보안 경계가 아니라
  // 운영상의 커튼이고, 반대로 막으면 네트워크가 흔들릴 때 앱이 통째로 빈 화면이 된다.
  // "개발 중" 기본값은 코드(menuRegistry)에 있어 이 구간에서도 이미 적용된다.
  if (isLoading) return <>{children}</>;

  // isAdmin은 미리보기를 반영한다 — 관리자가 교사 미리보기 중이면 교사 기준으로 막힌다.
  if (isPathHidden(config, location.pathname, { isAdmin, role: effectiveRole })) {
    // 왜 홈으로 왔는지를 함께 넘긴다 — 홈이 한 번만 배너로 알려준다.
    // 무음 리다이렉트는 사용자에게 "클릭이 안 먹었다"로 보인다(권한 차단과 구분도 안 된다).
    return (
      <Navigate
        to="/"
        replace
        state={{ blockedFrom: location.pathname, blockedReason: 'menu' as const }}
      />
    );
  }

  return <>{children}</>;
};
