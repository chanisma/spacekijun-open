/**
 * SPACEKIJUN 알림 서비스 워커
 *
 * 이 워커가 존재하는 이유는 하나다 — **안드로이드 크롬이 `new Notification()` 을 금지**하기
 * 때문이다(`TypeError: Illegal constructor`). 휴대폰에서 브라우저 알림을 띄울 수 있는 경로는
 * `ServiceWorkerRegistration.showNotification()` 뿐이라, 알림을 그리기 위해서만 워커를 둔다.
 *
 * **의도적으로 하지 않는 것**
 *  · `fetch` 핸들러 없음 — 이 워커는 네트워크에 일절 개입하지 않는다. 캐싱을 시작하면
 *    배포된 새 번들 대신 낡은 자산을 돌려주는 사고가 나는데, 여기서 필요한 것은 캐시가
 *    아니라 알림 표시 권한뿐이다.
 *
 * **두 경로가 이 워커로 알림을 그린다**
 *  1. 탭이 살아 있을 때 — 페이지가 realtime 으로 받아 showNotification 을 부른다(2026-09-09).
 *  2. 탭을 닫았을 때 — Web Push(`push` 이벤트, 2026-10-07 다마고찌 Phase 4. 2026-09-09 의
 *     «Web Push 는 쓰지 않는다» 결정을 대체). 페이로드는 엣지 함수 push-send 가 만든다.
 *  둘 다 tag = `notification-<알림 id>` 라 같은 알림은 소리 없이 서로를 대체한다.
 */

/** 페이지와 주고받는 메시지 타입 — src/lib/browserNotifications.ts 의 NOTIFICATION_CLICK_MESSAGE 와 짝 */
const CLICK_MESSAGE = 'spacekijun:notification-click';
/** 열린 탭이 없을 때 새 창 주소의 파라미터 — src/lib/webPush.ts 의 PUSH_OPEN_PARAM 과 짝 */
const PUSH_OPEN_PARAM = 'push_open';

/**
 * Web Push 수신. 앱을 보고 있으면 그리지 않는다 — 앱 안 토스트(realtime)가 이미 말했다.
 * (크롬은 «보이는 창이 있을 때» 알림 없이 끝나는 push 를 허용한다.)
 * 목적지는 싣지 않는다 — 누르면 페이지가 알림 id 로 목적지를 계산한다(라우팅 단일 출처).
 */
self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (_) {
    payload = null;
  }
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const looking = clientList.some((c) => c.visibilityState === 'visible' && c.focused);
      if (looking) return;
      const title = (payload && payload.title) || '새 알림';
      await self.registration.showNotification(title, {
        body: (payload && payload.body) || undefined,
        tag: (payload && payload.tag) || undefined,
        icon: '/logo_sm.png',
        badge: '/logo_sm.png',
        data: { destination: null, notificationId: (payload && payload.id) || null },
      });
    })(),
  );
});

// 새 워커가 즉시 일하도록 대기 단계를 건너뛴다. fetch 를 가로채지 않으므로
// 페이지 도중에 워커가 바뀌어도 사용자가 보는 화면에는 영향이 없다.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * 알림 클릭 → 이미 열려 있는 탭으로 이동.
 *
 * 새 창을 여는 것은 **마지막 수단**이다. 알림마다 탭이 하나씩 쌓이면 휴대폰에서 금방
 * 감당이 안 되고, 이미 로그인된 탭이 있는데 새로 열면 부팅을 처음부터 다시 한다.
 * 목적지는 페이지가 `data.destination` 에 실어 보낸다(경로 + react-router state) —
 * 워커는 그 값을 해석하지 않고 그대로 되돌려 준다. 라우팅 규칙의 단일 출처는
 * `src/components/notifications/notificationNavigation.ts` 한 곳이어야 하기 때문이다.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const destination = (event.notification.data && event.notification.data.destination) || null;
  // Web Push 로 온 알림은 목적지 대신 알림 id 를 싣는다 — 페이지가 그 id 로 목적지를 계산한다
  const notificationId = (event.notification.data && event.notification.data.notificationId) || null;
  const fallbackUrl = (destination && destination.to)
    || (notificationId ? '/?' + PUSH_OPEN_PARAM + '=' + encodeURIComponent(notificationId) : '/notifications');

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          // state 는 URL 로 표현할 수 없으므로 postMessage 로 넘긴다.
          client.postMessage({ type: CLICK_MESSAGE, destination, notificationId });
          return;
        }
      }

      // 열린 탭이 하나도 없는 경우에만 새 창. 이때는 react-router state 를 실을 방법이
      // 없어 경로까지만 복원된다(주소로 표현되지 않는 상세 모달 등은 열리지 않는다).
      if (self.clients.openWindow) {
        await self.clients.openWindow(fallbackUrl);
      }
    })(),
  );
});
