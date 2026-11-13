/**
 * 가벼운 모바일 앱 (2026-10-29 요청) — 휴대폰이 /m 으로 오면 본 앱(App.tsx) 대신 이것만 받는다.
 *
 *   /m            오늘 — 요일별 시간표(운영 시간표 반영)
 *   /m/memo       스티커 메모 — 데스크와 같은 개인 메모 보드
 *   /m/messages   데스크 쪽지 — 학생과 주고받은 쪽지, 답장·사진
 *   /m/alerts     스페이스기전 알림
 *   /m/agents     내 PC 의 에이전트 터미널 — 메시지 보내기·결과 받기
 *   /m/more       휴대폰 알림 켜기 · 전체 웹사이트로 보기 · 로그아웃
 *   /classroom/link/:code · /classroom/type/:code   교실 기기 QR — 본 앱과 같은 본문을 앱 틀 없이
 *
 * 그 밖의 주소는 본 앱으로 넘긴다(주소를 다시 불러 본 앱이 뜬다). 로그인·개인정보 동의·명단 연결·교직원 여부는
 * 본 앱(RequireAuth·ProtectedRoute)과 같은 판정을 `MobileGate` 가 한다. 서버(RLS·RPC)도 같은 것을 막는다.
 */
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
import { AppQueryClient } from '@/lib/appQueryClient';
import { MobileGate } from './MobileGate';
import { MobileShell, MobileLoading } from './MobileShell';
import { LeaveToFull } from './LeaveToFull';
import TodayPage from './pages/TodayPage';

const MemoPage = lazy(() => import('./pages/MemoPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AgentsPage = lazy(() => import('./pages/AgentsPage'));
const MorePage = lazy(() => import('./pages/MorePage'));
const ClassroomLinkBody = lazy(() => import('@/features/classroom-link/ClassroomLinkBody'));
const ClassroomTypeBody = lazy(() => import('@/features/classroom-link/ClassroomTypeBody'));

const queryClient = new AppQueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: true, retry: 2, refetchOnReconnect: true },
    mutations: { retry: 0 },
  },
});

/** 교실 기기 QR — 앱 탭 없이 본문만(본 앱에서도 같은 본문이 Layout 안에 뜬다) */
const QrFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[100dvh] bg-slate-50 px-3 py-4 sm:px-6">
    <Suspense fallback={<MobileLoading label="교실 기기를 확인하는 중…" />}>{children}</Suspense>
  </div>
);

function MobileApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        <BrowserRouter>
          <MobileGate>
            <Routes>
              <Route path="/classroom/link/:code" element={<QrFrame><ClassroomLinkBody /></QrFrame>} />
              <Route path="/classroom/type/:code" element={<QrFrame><ClassroomTypeBody /></QrFrame>} />
              <Route path="/m" element={<MobileShell />}>
                <Route index element={<TodayPage />} />
                <Route path="memo" element={<MemoPage />} />
                <Route path="messages" element={<MessagesPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="agents" element={<AgentsPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="*" element={<Navigate to="/m" replace />} />
              </Route>
              <Route path="*" element={<LeaveToFull />} />
            </Routes>
          </MobileGate>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function mount(root: HTMLElement) {
  createRoot(root).render(<MobileApp />);
}
