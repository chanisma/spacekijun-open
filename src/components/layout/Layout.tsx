import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNavigation } from './MobileNavigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Navigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

export const Layout = ({ children, fullWidth = false }: LayoutProps) => {
  const { user, loading, hasNameRegistered, isStudentView } = useAuth();

  // 로그아웃 시 로그인 페이지로 리다이렉트
  if (!loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // 이름이 등록되지 않은 경우 블러 처리 및 클릭 차단 (학생은 제외)
  const isBlocked = hasNameRegistered === false && !isStudentView;

  // 세로 스크롤은 아래 main이 전담한다. 최상위 div에 overflow-x-hidden만 주면
  // CSS 명세상 overflow-y가 auto로 계산돼 이 div까지 스크롤 컨테이너가 되고,
  // 사이드바가 1px이라도 넘치는 순간 스크롤바가 이중으로 생긴다.
  return (
    <div className="flex h-dvh w-full max-w-full overflow-hidden">
      {/* 데스크톱 사이드바 */}
      <div className={`hidden md:flex ${isBlocked ? 'blur-sm pointer-events-none' : ''}`}>
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col h-full overflow-hidden">
        {/* 데스크톱 헤더 */}
        <div className="hidden md:block">
          <Header isBlocked={isBlocked} />
        </div>

        {/* 모바일 네비게이션 */}
        <div className={isBlocked ? 'blur-sm pointer-events-none' : ''}>
          <MobileNavigation />
        </div>

        {/* 메인 콘텐츠 */}
        <main className={`flex-1 overflow-auto overflow-x-hidden ${fullWidth ? 'p-0' : 'p-2 sm:p-3 md:p-4 lg:p-6 pb-[calc(var(--mobile-nav-height,96px)+8px)] md:pb-6'} ${isBlocked ? 'blur-sm pointer-events-none' : ''}`}>
          {children}
          {/* 모바일 하단 nav가 fixed라서 콘텐츠와 겹침 → 스페이서로 여백 확보 */}
          <div className="md:hidden" style={{ height: 'var(--mobile-nav-height, 80px)' }} />
        </main>
      </div>
    </div>
  );
};