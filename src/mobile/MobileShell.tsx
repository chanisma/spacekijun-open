import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Bot, CalendarClock, Loader2, Menu, MessageCircle, StickyNote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { NOTIFICATION_CLICK_MESSAGE, isBrowserNotificationEnabled } from '@/lib/browserNotifications';
import { PUSH_OPEN_PARAM, syncWebPush } from '@/lib/webPush';
import { cn } from '@/lib/utils';
import { DESK_MESSAGE_TYPE } from './data/deskMessages';
import { agentRequestPath } from './data/agentRequests';

export const MobileLoading = ({ label }: { label: string }) => (
  <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 p-6 text-sm text-slate-500">
    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />{label}
  </div>
);

const TABS = [
  { to: '/m', end: true, label: '오늘', icon: CalendarClock },
  { to: '/m/memo', label: '메모', icon: StickyNote },
  { to: '/m/messages', label: '쪽지', icon: MessageCircle, badge: 'messages' as const },
  { to: '/m/alerts', label: '알림', icon: Bell, badge: 'alerts' as const },
  { to: '/m/agents', label: '에이전트', icon: Bot },
];

const TITLES: Record<string, string> = {
  '/m': '오늘', '/m/memo': '스티커 메모', '/m/messages': '쪽지', '/m/alerts': '알림', '/m/agents': '에이전트', '/m/more': '설정',
};

/** 안 읽은 쪽지·알림 수 — 아래 탭의 숫자. 화면을 보는 동안 30초마다 */
export function useUnreadCounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['m-unread', user?.id],
    enabled: !!user,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_events').select('type')
        .eq('is_read', false).neq('type', 'coolmessenger').limit(300);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ type: string }>;
      const messages = rows.filter((row) => row.type === DESK_MESSAGE_TYPE).length;
      return { messages, alerts: rows.length - messages };
    },
  });
}

/** 휴대폰 알림을 누르고 들어왔다 — 쪽지면 쪽지 탭, 작업 요청이면 에이전트 탭, 아니면 알림 탭으로 (sw.js 의 notificationclick 과 짝) */
function usePushLanding() {
  const navigate = useNavigate();
  const { search } = useLocation();
  useEffect(() => {
    const go = async (id: string | null) => {
      if (!id) return;
      const { data } = await supabase.from('notification_events').select('type, meta').eq('id', id).maybeSingle();
      const row = data as { type?: string; meta?: Record<string, unknown> | null } | null;
      // 에이전트 작업 요청(2026-11-11)은 에이전트 탭의 그 요청 카드로
      navigate(row?.type === DESK_MESSAGE_TYPE ? '/m/messages' : row?.type === 'agent_request' ? agentRequestPath(row.meta) : '/m/alerts',
               { replace: true });
    };
    void go(new URLSearchParams(search).get(PUSH_OPEN_PARAM));
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === NOTIFICATION_CLICK_MESSAGE) void go(event.data.notificationId ?? null);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [navigate, search]);
}

export function MobileShell() {
  const { pathname } = useLocation();
  const { data: unread } = useUnreadCounts();
  usePushLanding();
  // 알림을 켜 둔 기기는 열 때마다 구독을 서버와 맞춘다 (본 앱의 BrowserNotificationBridge 와 같다)
  useEffect(() => { void syncWebPush(isBrowserNotificationEnabled()); }, []);
  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/90 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="/logo_sm.png" alt="" className="h-6 w-6" />
          <h1 className="text-base font-bold text-slate-900">{TITLES[pathname.replace(/\/$/, '')] ?? '스페이스기전'}</h1>
        </div>
        <NavLink to="/m/more" aria-label="설정" className={({ isActive }) => cn('rounded-full p-2 text-slate-500', isActive && 'bg-slate-100 text-slate-900')}>
          <Menu className="h-5 w-5" />
        </NavLink>
      </header>
      <main className="flex-1 px-3 pb-[calc(env(safe-area-inset-bottom)+84px)] pt-3">
        {/* 탭은 열 때 따로 받는다(lazy) — 받는 동안의 자리가 없으면 탭을 누를 때 화면 전체가 하얘진다(2026-10-30) */}
        <Suspense fallback={<MobileLoading label="여는 중…" />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {TABS.map(({ to, end, label, icon: Icon, badge }) => {
          const count = badge ? unread?.[badge] ?? 0 : 0;
          return (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'font-semibold text-blue-600' : 'text-slate-500')}>
              <Icon className="h-5 w-5" />
              {label}
              {count > 0 && (
                <span className="absolute right-[calc(50%-20px)] top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
