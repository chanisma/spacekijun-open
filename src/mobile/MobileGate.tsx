import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LogIn, Monitor } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { PrivacyConsentGate } from '@/components/privacy/PrivacyConsentGate';
import { usePrivacyConsent } from '@/hooks/usePrivacyConsent';
import { clearStoredAuthState } from '@/lib/safeLocalStorage';
import { FACULTY_ROLES } from '@/lib/roles';
import { MobileLoading } from './MobileShell';
import { PENDING_REDIRECT_KEY, setViewPreference } from './view';

const STUCK_MS = 6000;   // RequireAuth 와 같다 — 세션 확인이 이보다 오래 걸리면 복구 수단을 보인다

/** 온전한 웹사이트(본 앱)로 — 이 탭에서만. 탭을 닫거나 다시 열면 모바일 */
export function openFullView(path = '/') {
  setViewPreference('full');
  window.location.assign(path);
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-5">
    <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-white p-6 text-center shadow-sm">
      <img src="/logo_sm.png" alt="" className="mx-auto h-12 w-12" />
      <h1 className="text-lg font-bold text-slate-900">{title}</h1>
      {children}
    </div>
  </div>
);

/**
 * 본 앱의 RequireAuth + ProtectedRoute(FACULTY_ROLES) 와 같은 판정 — 로그인 → 개인정보 동의 → 명단 연결 → 교직원.
 * 로그인은 구글로. 돌아올 곳은 PENDING_REDIRECT_KEY 에 적어 둔다 — 구글이 '/' 로 돌려보내도 main.tsx 가 여기로 되돌린다.
 */
export function MobileGate({ children }: { children: React.ReactNode }) {
  const { user, loading, profile, accountLinkStatus, signInWithGoogle, signOut } = useAuth();
  const consent = usePrivacyConsent(user?.id);
  const { pathname, search } = useLocation();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!loading) { setStuck(false); return; }
    const timer = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return stuck ? (
      <Card title="로그인 정보를 확인하지 못했습니다">
        <p className="text-sm text-slate-600">네트워크를 확인한 뒤 다시 열어 주세요. 계속되면 저장된 로그인 정보를 지우고 다시 로그인하세요.</p>
        <button className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white"
                onClick={() => { clearStoredAuthState(); window.location.reload(); }}>로그인 정보 지우고 다시 열기</button>
      </Card>
    ) : <MobileLoading label="로그인 확인 중…" />;
  }

  if (!user) {
    const signIn = () => {
      const here = pathname + search;
      try { sessionStorage.setItem(PENDING_REDIRECT_KEY, here); } catch { /* 저장 못 하면 첫 화면으로 */ }
      void signInWithGoogle(here);
    };
    return (
      <Card title="스페이스기전">
        <p className="text-sm text-slate-600">학교 구글 계정으로 로그인해 주세요.</p>
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white" onClick={signIn}>
          <LogIn className="h-4 w-4" />구글 계정으로 로그인
        </button>
        <button className="flex w-full items-center justify-center gap-1.5 text-xs text-slate-500" onClick={() => openFullView('/auth')}>
          <Monitor className="h-3.5 w-3.5" />전체 웹사이트로 보기
        </button>
      </Card>
    );
  }

  if (consent.isLoading) return <MobileLoading label="개인정보처리방침 동의 여부를 확인하고 있습니다." />;
  if (!consent.hasCurrentConsent) {
    return (
      <PrivacyConsentGate userEmail={user.email} isAccepting={consent.isAccepting} loadError={consent.error}
                          onAccept={consent.acceptCurrentPolicy} onRetry={consent.refresh} onSignOut={signOut} />
    );
  }

  if (!profile) return <MobileLoading label="계정 정보를 불러오는 중…" />;

  // 명단 연결이 안 된 계정·학생은 본 앱에서 안내를 받는다 (연결 절차·학생 화면은 전체 웹사이트에만 있다)
  if (accountLinkStatus === 'unlinked' || !FACULTY_ROLES.includes(profile.role as never)) {
    return (
      <Card title={accountLinkStatus === 'unlinked' ? '계정 연결이 필요합니다' : '교직원용 모바일 화면입니다'}>
        <p className="text-sm text-slate-600">
          {accountLinkStatus === 'unlinked'
            ? '처음 한 번은 전체 웹사이트에서 이름(명단) 연결을 마쳐 주세요.'
            : '학생 화면은 전체 웹사이트에서 볼 수 있어요.'}
        </p>
        <button className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white" onClick={() => openFullView('/')}>전체 웹사이트로 열기</button>
        <button className="w-full text-xs text-slate-500" onClick={() => void signOut()}>다른 계정으로 로그인</button>
      </Card>
    );
  }

  return <>{children}</>;
}
