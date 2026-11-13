import { useEffect } from 'react';
import { useNotificationBrowserAlerts } from '@/hooks/useBrowserNotifications';
import { triggerTaskDeadlineNotices } from '@/services/taskDeadlineNotice';

/**
 * 알림 realtime 구독을 앱에 **한 번만** 붙이는 자리.
 *
 * 화면을 그리지 않는데도 컴포넌트인 이유는, 훅을 부를 수 있는 자리가 컴포넌트뿐이기
 * 때문이다. `App.tsx` 의 `RequireAuth` 안에 두어 ①라우터 컨텍스트(알림 클릭 → 이동)와
 * ②로그인 사용자만이라는 조건을 함께 만족시킨다.
 *
 * **여러 곳에 두지 말 것** — 마운트한 개수만큼 realtime 채널이 열려 같은 알림이
 * 여러 번 뜬다(브라우저 `tag` 병합은 화면만 합칠 뿐 소리·진동은 그대로 반복된다).
 */
export const BrowserNotificationBridge = () => {
  useNotificationBrowserAlerts();
  // 마감 알림도 여기서 한 번 깨운다 — pg_cron 이 없어 «화면이 방아쇠»이고,
  // 이 컴포넌트가 이미 «로그인했고 앱에 한 번만 마운트되는» 자리다(services/taskDeadlineNotice.ts).
  useEffect(triggerTaskDeadlineNotices, []);
  return null;
};
