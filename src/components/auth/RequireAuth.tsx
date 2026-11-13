import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, RotateCw, Trash2, UserRoundCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { PrivacyConsentGate } from '@/components/privacy/PrivacyConsentGate';
import { usePrivacyConsent } from '@/hooks/usePrivacyConsent';
import { clearStoredAuthState } from '@/lib/safeLocalStorage';

/**
 * 전역 인증 차단막 (defense-in-depth).
 *
 * 로그인하지 않은(`user === null`) 방문자가 보호 라우트에 접근하면 `/auth`로
 * 리다이렉트한다. RLS가 데이터 노출을 막는 1차 방어선이라면, 이 컴포넌트는
 * 앱 셸 자체가 익명에게 렌더되지 않도록 하는 2차 방어선이다.
 *
 * `PUBLIC_PATHS`에 등록된 경로(로그인 화면, OAuth 콜백, 외부 팝업/인쇄 등
 * 세션 없이도 동작해야 하는 페이지)만 예외로 통과시킨다. 기본값은 "보호"이므로
 * 새 라우트가 추가돼도 명시적으로 화이트리스트에 넣지 않는 한 로그인을 요구한다.
 */

/** prefix 매칭: 해당 경로 또는 그 하위 경로면 public. */
const PUBLIC_PATH_PREFIXES = [
  '/auth',                      // /auth, /auth/callback
  '/privacy',                   // 개인정보처리방침은 로그인 전에도 공개
  '/signature-popup',           // window.open 서명 팝업 (세션 없이 postMessage)
  '/training-signature-print',  // 인쇄용 뷰 (새 창)
  '/iframe',                    // 외부 임베드 컨테이너
  '/videos',                    // 공개 영상 플레이어
  // 로그인 없는 QR 서명. **링크(토큰) 자체가 자격증명**이라 로그인을 요구하지 않는다 —
  // 서버가 토큰으로 신원을 정하고, 토큰은 서명자 1인·1회·만료로 묶여 있다.
  '/sign',
  // 연수 참석 서명 링크(2026-10-25) — 같은 모델(토큰 = 참석자 1인). `/training-sign/:id`(로그인 필수)와는 다른 경로다
  '/training-sign-link',
];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

/**
 * 로그인 후 되돌아갈 경로 (탭 단위).
 *
 * `<Navigate state={{from}}>`만으로는 부족하다 — Google OAuth는 브라우저를 외부로 보냈다가
 * `${origin}/`로 되돌리므로 react-router의 location state가 왕복에서 사라진다.
 * QR로 연 서명 페이지처럼 "그 주소로 바로 가야 하는" 진입에서 이 차이가 드러난다.
 */
const PENDING_REDIRECT_KEY = 'spacekijun-post-login-redirect';

/**
 * 세션 확인이 이만큼 넘게 걸리면 "멈췄다"로 보고 복구 화면을 낸다.
 * 정상 부팅은 수백 ms 다 — 이 값은 느린 네트워크를 넉넉히 덮으면서도
 * 사용자가 백색 화면을 오래 쳐다보지 않게 하는 선이다.
 */
const AUTH_STUCK_MS = 6000;

/**
 * 세션 확인이 멈췄을 때의 화면.
 *
 * 핵심은 **"저장된 로그인 정보 지우기"** 다 — 이 증상이 나면 실제 해결책이 늘
 * "localStorage 를 비우고 새로고침"이었는데, 그건 개발자 도구를 열 줄 아는 사람만
 * 쓸 수 있는 방법이었다. 여기서는 로그인 관련 키만 골라 지우므로(사이드바 상태 같은
 * 무관한 설정은 남는다) 안전하게 한 번에 복구된다.
 */
const AuthStuckScreen = () => {
  const handleClearAndReload = () => {
    const removed = clearStoredAuthState();
    console.warn('[RequireAuth] 세션 확인이 멈춰 저장된 로그인 정보를 지웁니다:', removed);
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-slate-900">로그인 정보를 확인하지 못했습니다</h2>
            <p className="text-sm text-slate-600">
              브라우저에 저장된 로그인 정보가 오래돼 확인이 끝나지 않는 경우가 있습니다.
              아래 버튼으로 지우고 다시 로그인하면 해결됩니다.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleClearAndReload}>
            <Trash2 className="mr-2 h-4 w-4" />
            저장된 로그인 정보 지우고 다시 시도
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RotateCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * 명단(resource)에 연결되지 않은 계정의 화면 (2026-10-13 사용자 결정).
 *
 * 로그인은 되지만 기능은 쓸 수 없다. 서버 차단막(`account_link_pre_request`)이 같은 판정
 * (`account_link_status`)으로 데이터를 막으므로, 여기서 앱을 그리면 모든 화면이 오류로
 * 가득 찬다 — 대신 무엇을 하면 되는지를 말한다.
 *
 * 교직원은 이름을 등록하면 스스로 연결된다(`ProfileEditDialog` — 이 컴포넌트 **바깥**,
 * App 의 ProfileDialogWrapper 가 그리므로 이 화면 위에 뜬다). 연결에 성공하면
 * refreshProfile 이 상태를 다시 읽어 이 화면이 저절로 걷힌다.
 * 학생은 스스로 연결하는 경로가 없다(이메일 학번 ↔ 학생 명단) — 문의만 안내한다.
 */
const AccountLinkGate = ({
  email,
  isStudent,
  onRegister,
  onSignOut,
}: {
  email: string | undefined;
  isStudent: boolean;
  onRegister: () => void;
  onSignOut: () => void;
}) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <div className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <UserRoundCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-slate-900">명단에 연결되지 않은 계정입니다</h2>
          <p className="break-all text-xs text-slate-500">{email}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">
        {isStudent
          ? '이 계정의 학번이 재학생 명단에서 확인되지 않아 기능을 사용할 수 없습니다. 담임 선생님이나 관리자에게 문의해 주세요.'
          : '교직원 명단과 연결된 계정만 기능을 사용할 수 있습니다. 명단에 있는 이름을 등록하면 바로 연결됩니다. 이름으로 연결되지 않으면 관리자에게 문의해 주세요.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!isStudent && (
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={onRegister}>
            <UserRoundCheck className="mr-2 h-4 w-4" />
            이름 등록하고 연결하기
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          로그아웃
        </Button>
      </div>
    </div>
  </div>
);

export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, signOut, profile, accountLinkStatus, setShowProfileDialog } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const privacyConsent = usePrivacyConsent(user?.id);

  // 세션 확인이 끝나지 않고 매달린 경우를 감지한다.
  //
  // 왜 필요한가 — 아래 `if (loading) return null` 은 **완전한 백색 화면**이다. 스피너도,
  // 글자도, 빠져나갈 링크도 없다. 그래서 AuthProvider 가 어떤 이유로든 loading 을 내리지
  // 못하면(저장된 세션이 이상해 supabase 초기화가 끝나지 않는 등) 사용자에게는 "새로고침해도
  // 흰 화면"으로만 보이고, 원인을 알 방법도 복구할 방법도 없다. 원인을 하나하나 막는 것과
  // **별개로**, 어떤 원인이든 화면이 말을 하게 만드는 안전망이 필요하다.
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    if (!loading) {
      setStuck(false);
      return;
    }
    const timer = window.setTimeout(() => setStuck(true), AUTH_STUCK_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // 저장·소비를 렌더가 아니라 effect에서 한다. 렌더 중에 sessionStorage를 지우면
  // StrictMode의 이중 렌더에서 첫 렌더가 값을 지우고 그 출력이 버려져 이동이 유실된다.
  useEffect(() => {
    if (isPublicPath(location.pathname)) return;
    const here = `${location.pathname}${location.search}`;

    if (!user) {
      // 세션 확인 중에는 아직 미로그인인지 알 수 없다.
      if (loading) return;
      try {
        sessionStorage.setItem(PENDING_REDIRECT_KEY, here);
      } catch {
        // 프라이빗 모드 등 저장 불가 — 홈으로 돌아가는 기존 동작으로 후퇴한다.
      }
      return;
    }

    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_REDIRECT_KEY);
      if (pending) sessionStorage.removeItem(PENDING_REDIRECT_KEY);
    } catch {
      pending = null;
    }
    if (pending && pending !== here) navigate(pending, { replace: true });
  }, [user, loading, location.pathname, location.search, navigate]);

  // public 경로는 인증 없이 통과
  if (isPublicPath(location.pathname)) {
    return <>{children}</>;
  }

  // 세션 확인 중에는 아무것도 렌더하지 않아 익명 콘텐츠 깜빡임(FOUC)을 막는다.
  // 다만 **끝나지 않으면** 백색 화면으로 방치하지 않고 원인과 복구 수단을 보여준다.
  if (loading) return stuck ? <AuthStuckScreen /> : null;

  // 미로그인 → 로그인 화면으로. 로그인 후 돌아올 수 있도록 원래 경로를 전달.
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (privacyConsent.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />
          <p className="text-sm text-slate-600">개인정보처리방침 동의 여부를 확인하고 있습니다.</p>
        </div>
      </div>
    );
  }

  if (!privacyConsent.hasCurrentConsent) {
    return (
      <PrivacyConsentGate
        userEmail={user.email}
        isAccepting={privacyConsent.isAccepting}
        loadError={privacyConsent.error}
        onAccept={privacyConsent.acceptCurrentPolicy}
        onRetry={privacyConsent.refresh}
        onSignOut={signOut}
      />
    );
  }

  // 명단에 연결되지 않은 계정 — 기능 대신 연결 안내. 상태를 모르면(null) 막지 않는다
  // (조회 실패로 정상 사용자를 가두지 않기 위해서다. 그 경우에도 서버가 데이터를 막는다).
  if (profile && accountLinkStatus === 'unlinked') {
    return (
      <AccountLinkGate
        email={user.email}
        isStudent={profile.role === 'student'}
        onRegister={() => setShowProfileDialog(true)}
        onSignOut={signOut}
      />
    );
  }

  return <>{children}</>;
};
