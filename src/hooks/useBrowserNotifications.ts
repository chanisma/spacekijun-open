/**
 * 알림 도착 → 브라우저(OS) 알림.
 *
 * `notification_events` 에 내 앞으로 행이 들어오면 실시간으로 받아, 앱을 보고 있지 않은
 * 사용자에게 브라우저 알림을 띄운다. 휴대폰에서 다른 앱을 보는 중에도 알림이 뜨게 하는
 * 것이 목적이다.
 *
 * ## 배관은 이미 깔려 있었다
 * `notification_events` 는 **`supabase_realtime` 퍼블리케이션에 이미 등록**돼 있다(실측:
 * 이 퍼블리케이션의 유일한 테이블). 그래서 서버 쪽 변경 없이 구독만 하면 된다.
 * SELECT 정책 `owns_notification_resource(resource_id)` 가 realtime 에도 그대로 적용되므로
 * 남의 알림은 애초에 오지 않는다 — 그런데도 `filter` 를 함께 거는 이유는 보안이 아니라
 * **트래픽**이다(내 것이 아닌 행까지 브로드캐스트 받아 버리는 낭비를 막는다).
 *
 * ## 탭을 닫아도 — Web Push (2026-10-07, 다마고찌 Phase 4)
 * 2026-09-09 엔 «탭이 살아 있는 동안만»이었다. 지금은 브라우저 알림을 켠 사람의 구독을 서버에 맡겨
 * 탭을 닫아도 온다(`src/lib/webPush.ts`). 이 훅의 realtime 경로는 그대로 두고(앱 안 토스트·배지 갱신),
 * 같은 알림은 tag 가 같아 두 번 울리지 않는다. Web Push 로 온 알림을 누르면 워커가 알림 **id** 만 돌려주므로
 * 여기서 행을 읽어 목적지를 계산한다(`openNotificationById`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useToast } from '@/hooks/use-toast';
import type { NotificationEvent } from '@/hooks/useNotifications';
import { getNotificationDestination } from '@/components/notifications/notificationNavigation';
import { COLLECT_KEY } from '@/features/task-workflow/hooks/useCollectInput';
import {
  NOTIFICATION_CLICK_MESSAGE,
  type BrowserNotificationDestination,
  type BrowserNotificationSupport,
  ensureNotificationServiceWorker,
  getBrowserNotificationPermission,
  getBrowserNotificationSupport,
  isBrowserNotificationEnabled,
  requestBrowserNotificationPermission,
  setBrowserNotificationEnabled,
  shouldShowBrowserNotifications,
  showBrowserNotification,
} from '@/lib/browserNotifications';
import { PUSH_OPEN_PARAM, subscribeWebPush, syncWebPush, unsubscribeWebPush } from '@/lib/webPush';

/**
 * 이미 알린 id 를 기억하는 상한. 재구독·이펙트 이중 실행(StrictMode)에서 같은 알림이
 * 두 번 뜨는 것을 막는다. 브라우저의 `tag` 병합이 화면상의 중복은 이미 지워 주지만,
 * 그건 **그리고 나서** 합치는 것이라 소리·진동은 두 번 난다.
 */
const SEEN_LIMIT = 300;

/** 사용자가 지금 앱을 실제로 보고 있는가. */
function isUserLookingAtApp(): boolean {
  if (typeof document === 'undefined') return false;
  // `visibilityState` 만 보면 **다른 창에 가려진 경우**를 놓친다(탭은 여전히 visible).
  // 그 상태에서 토스트만 띄우면 사용자는 아무것도 보지 못한다.
  return document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * 앱 전역에 **한 번만** 마운트한다(`App.tsx` 의 `RequireAuth` 안). 여러 곳에서 부르면
 * 채널이 여러 개 열려 알림이 중복된다.
 */
export function useNotificationBrowserAlerts(): void {
  const { resourceId } = useCurrentResourceId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const seenIdsRef = useRef<Set<string>>(new Set());

  /**
   * 알림 클릭 → 목적지로 이동. 앱 안 알림 목록과 **같은 판정**(`getNotificationDestination`)을
   * 쓰므로 클릭 결과가 두 경로에서 갈리지 않는다.
   */
  const goToDestination = useCallback(
    (destination: BrowserNotificationDestination | null) => {
      if (!destination?.to) return;
      navigate(destination.to, { state: destination.state });
    },
    [navigate],
  );

  // 이펙트가 `resourceId` 에만 의존하도록 콜백을 ref 로 넘긴다. 매 렌더마다 의존성이
  // 바뀌면 채널을 다시 열게 되고, 그 사이에 도착한 알림이 유실된다.
  const handleIncomingRef = useRef<(row: NotificationEvent) => void>(() => {});

  handleIncomingRef.current = (row: NotificationEvent) => {
    if (!row?.id || seenIdsRef.current.has(row.id)) return;

    seenIdsRef.current.add(row.id);
    if (seenIdsRef.current.size > SEEN_LIMIT) {
      // 오래된 것부터 버린다(Set 은 삽입 순서를 유지한다).
      const oldest = seenIdsRef.current.values().next().value as string | undefined;
      if (oldest) seenIdsRef.current.delete(oldest);
    }

    // 벨·목록이 새 알림을 바로 반영하도록. 알림을 못 띄우는 환경에서도 이건 해야 한다.
    queryClient.invalidateQueries({ queryKey: ['notifications', resourceId] });
    // 새 입력 요청 — 메뉴 배지·홈 「나의 업무」·내 할 일 「입력 요청」이 같은 조회를 쓴다(2026-09-27).
    // 안 하면 앱을 켜 둔 채 요청을 받아도 배지가 창을 다시 볼 때까지 늘지 않는다.
    if (row.type === 'collect_input_requested' || row.type === 'submission_requested') {
      void queryClient.invalidateQueries({ queryKey: [COLLECT_KEY] });
    }

    const destination = getNotificationDestination(row) ?? null;

    // 앱을 보고 있으면 OS 알림 대신 앱 안 토스트. 한 사건에 신호를 두 번 주지 않는다.
    if (isUserLookingAtApp()) {
      toast({
        title: row.title || '새 알림',
        description: row.message || undefined,
      });
      return;
    }

    if (!shouldShowBrowserNotifications()) return;

    void showBrowserNotification({
      title: row.title || '새 알림',
      body: row.message || undefined,
      // 알림 id 를 tag 로 — 탭을 여러 개 열어 둬도 같은 알림이 한 번만 남는다.
      tag: `notification-${row.id}`,
      destination: destination ? { to: destination.to, state: destination.state } : null,
      onClick: goToDestination,
    });
  };

  // realtime 구독
  useEffect(() => {
    if (!resourceId) return;

    let disposed = false;
    const refreshNotifications = () => {
      if (disposed) return;
      void queryClient.invalidateQueries({ queryKey: ['notifications', resourceId], exact: true });
    };

    const channel = supabase
      .channel(`notification-alerts:${resourceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_events',
          filter: `resource_id=eq.${resourceId}`,
        },
        (payload) => {
          if (disposed) return;
          handleIncomingRef.current(payload.new as NotificationEvent);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notification_events',
          filter: `resource_id=eq.${resourceId}`,
        },
        refreshNotifications,
      )
      // 구독 실패는 **완전히 조용하다** — 오류도 안 나고 화면도 멀쩡한데 알림만 영영
      // 오지 않는다. 알림은 원래 뜸하게 오는 기능이라 며칠이 지나도 눈치채기 어려우므로,
      // 최소한 콘솔에는 남겨 진단할 실마리를 둔다.
      .subscribe((status, error) => {
        if (disposed) return;
        // 최초 연결과 재연결 사이에 놓친 알림을 서버에서 다시 가져온다.
        if (status === 'SUBSCRIBED') refreshNotifications();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[useNotificationBrowserAlerts] 알림 실시간 구독 상태:', status, error ?? '');
        }
      });

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [resourceId, queryClient]);

  /**
   * Web Push 로 온 알림 → 알림 id 로 행을 읽어 앱 안 목록과 **같은 판정**으로 목적지를 정한다.
   * 행을 못 읽으면(지워짐·다른 계정) 알림 목록으로.
   */
  const openNotificationById = useCallback(
    async (id: string) => {
      const { data } = await supabase
        .from('notification_events')
        .select('id, type, meta, related_meeting_id')
        .eq('id', id)
        .maybeSingle();
      const destination = data ? getNotificationDestination(data as Pick<NotificationEvent, 'type' | 'meta' | 'related_meeting_id'>) : undefined;
      goToDestination(destination ? { to: destination.to, state: destination.state } : { to: '/notifications' });
    },
    [goToDestination],
  );

  // 서비스 워커가 보낸 알림 클릭 → 열려 있는 이 탭에서 이동.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== NOTIFICATION_CLICK_MESSAGE) return;
      if (!event.data.destination && typeof event.data.notificationId === 'string') {
        void openNotificationById(event.data.notificationId);
        return;
      }
      goToDestination(event.data.destination ?? null);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [goToDestination, openNotificationById]);

  // 열린 탭이 없을 때 워커가 연 새 창(`/?push_open=<id>`) — 한 번 읽고 주소에서 지운다.
  useEffect(() => {
    if (!resourceId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get(PUSH_OPEN_PARAM);
    if (!id) return;
    params.delete(PUSH_OPEN_PARAM);
    const rest = params.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    void openNotificationById(id);
  }, [resourceId, openNotificationById]);

  // 이미 켜 둔 사용자는 알림이 오기 전에 워커를 준비시켜 둔다 — 첫 알림에서 등록·활성화를
  // 기다리다 표시가 늦는 것을 막는다. 켜지 않은 사용자에게는 워커를 남기지 않는다.
  useEffect(() => {
    if (!shouldShowBrowserNotifications()) return;
    ensureNotificationServiceWorker()?.catch((error) => {
      console.warn('[useNotificationBrowserAlerts] 서비스 워커 준비 실패:', error);
    });
  }, []);

  // 켜 둔 사람은 «탭을 닫아도» 구독을 지금 로그인한 계정 앞으로 맞춘다(webPush.syncWebPush 의 세 이유).
  useEffect(() => {
    if (!resourceId) return;
    void syncWebPush(shouldShowBrowserNotifications());
  }, [resourceId]);
}

export interface BrowserNotificationSettings {
  /** 이 브라우저가 알림을 지원하는가 + 안 되면 무엇을 하면 되는지. */
  support: BrowserNotificationSupport;
  permission: NotificationPermission | 'unsupported';
  /** 사용자 설정(권한과 별개). */
  enabled: boolean;
  /** 실제로 알림이 뜨는 상태인가. */
  active: boolean;
  requesting: boolean;
  /** 권한을 요청하고 켠다. **클릭 핸들러 안에서만** 부를 것(브라우저가 제스처를 요구한다). */
  enable: () => Promise<void>;
  disable: () => void;
}

/** 설정 UI 용. 권한 상태와 사용자 설정을 함께 다룬다. */
export function useBrowserNotificationSettings(): BrowserNotificationSettings {
  const { toast } = useToast();
  const [support] = useState(() => getBrowserNotificationSupport());
  const [permission, setPermission] = useState(() => getBrowserNotificationPermission());
  const [enabled, setEnabled] = useState(() => isBrowserNotificationEnabled());
  const [requesting, setRequesting] = useState(false);

  const enable = useCallback(async () => {
    if (!support.supported) return;

    setRequesting(true);
    try {
      const result = await requestBrowserNotificationPermission();
      setPermission(result);

      if (result !== 'granted') {
        toast({
          title: '브라우저 알림을 켜지 못했습니다',
          description:
            result === 'denied'
              ? '브라우저가 알림을 차단하고 있습니다. 주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꾼 뒤 다시 시도해 주세요.'
              : '알림 권한이 허용되지 않았습니다.',
          variant: 'destructive',
        });
        return;
      }

      setBrowserNotificationEnabled(true);
      setEnabled(true);

      // 권한을 받은 지금이 워커를 등록할 자리다.
      try {
        await ensureNotificationServiceWorker();
      } catch (error) {
        console.warn('[useBrowserNotificationSettings] 서비스 워커 등록 실패:', error);
      }

      // 탭을 닫아도 받도록 구독을 서버에 맡긴다. 실패해도 «탭이 열려 있을 때» 알림은 그대로 된다 — 그 사실을 말한다.
      try {
        await subscribeWebPush();
      } catch (error) {
        console.warn('[useBrowserNotificationSettings] 푸시 구독 실패:', error);
        toast({
          title: '앱을 닫았을 때의 알림은 켜지 못했어요',
          description: error instanceof Error ? `${error.message} 앱이 열려 있을 때는 알림이 옵니다.` : '앱이 열려 있을 때는 알림이 옵니다.',
        });
      }

      // 실제로 뜨는지 여기서 확인시켜 준다 — 알림은 "켰는데 안 오는" 상태를 스스로
      // 드러내지 못하므로, 켠 직후 한 번 보여 주는 것이 유일한 확인 수단이다.
      await showBrowserNotification({
        title: '브라우저 알림이 켜졌습니다',
        body: '앱을 보고 있지 않을 때 새 알림을 이렇게 알려 드립니다.',
        tag: 'spacekijun-test',
        destination: { to: '/notifications' },
      });
    } finally {
      setRequesting(false);
    }
  }, [support.supported, toast]);

  const disable = useCallback(() => {
    setBrowserNotificationEnabled(false);
    setEnabled(false);
    void unsubscribeWebPush();
  }, []);

  return {
    support,
    permission,
    enabled,
    active: permission === 'granted' && enabled,
    requesting,
    enable,
    disable,
  };
}
