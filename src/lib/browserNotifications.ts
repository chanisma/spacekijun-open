/**
 * 브라우저(OS) 알림 표시 — 단일 출처.
 *
 * 앱 안의 알림(`notification_events`)이 도착했을 때 **브라우저 밖에서도 보이는** 알림을
 * 띄운다. 화면마다 `new Notification(...)` 을 직접 부르지 말고 이 모듈을 거칠 것 —
 * 아래 세 가지가 전부 여기 모여 있어야 한 곳만 고치면 되기 때문이다.
 *
 * ## 1. 안드로이드는 생성자를 금지한다
 * 데스크톱에서는 `new Notification()` 이 동작하지만 **안드로이드 크롬은 `TypeError:
 * Illegal constructor`** 를 던진다. 휴대폰에서 알림을 띄우는 유일한 경로는
 * `ServiceWorkerRegistration.showNotification()` 이라, 서비스 워커(`/sw.js`)를 먼저 쓰고
 * 실패할 때만 생성자로 후퇴한다. 순서를 뒤집으면 정확히 휴대폰에서만 조용히 아무 일도
 * 일어나지 않는다(예외는 콘솔에만 남는다).
 *
 * ## 2. 지원 여부가 "있다/없다"로 끝나지 않는다
 * iOS Safari 는 **홈 화면에 설치한 PWA 안에서만** `Notification` 을 노출한다(16.4+).
 * 일반 탭에서는 `'Notification' in window` 자체가 false 다. 그래서 지원되지 않을 때
 * 화면이 "무엇을 하면 되는지"까지 말할 수 있도록 사유를 구분해 돌려준다.
 *
 * ## 3. 권한과 사용자 설정은 다른 것이다
 * 권한(`Notification.permission`)은 브라우저가 갖고, 앱에서 되돌릴 수 없다 — 한 번
 * `denied` 가 되면 다시 물어볼 수조차 없어 사이트 설정에서 직접 바꿔야 한다. 그래서
 * "잠깐 끄기"는 권한이 아니라 **우리 쪽 설정**으로 둔다.
 */

import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';

/** 서비스 워커 경로. `public/sw.js` 가 루트로 서빙되므로 스코프는 `/` 다. */
const SERVICE_WORKER_PATH = '/sw.js';

/** 알림 아이콘 — manifest 와 같은 로고를 쓴다. */
const NOTIFICATION_ICON = '/logo_sm.png';

/** 사용자 설정(끄기) 저장 키. 권한과 별개다 — 위 3번 참고. */
const PREFERENCE_KEY = 'spacekijun-browser-notifications-v1';

/** 알림 클릭 시 페이지로 되돌아오는 메시지 타입. `public/sw.js` 와 짝이다. */
export const NOTIFICATION_CLICK_MESSAGE = 'spacekijun:notification-click';

/**
 * 알림 목적지. `notificationNavigation.ts` 의 결과를 그대로 실어 나른다 —
 * 이 모듈은 경로 규칙을 알지 않는다(라우팅 판정의 단일 출처를 하나로 유지).
 */
export interface BrowserNotificationDestination {
  to: string;
  state?: Record<string, unknown>;
}

export interface BrowserNotificationSupport {
  supported: boolean;
  /**
   * 지원되지 않을 때 **무엇을 하면 되는지**. 지원되면 null.
   *
   * 판별 유니온(`{supported:true} | {supported:false, message}`)으로 두지 않은 이유 —
   * 소비처가 `ReturnType<typeof ...>` 로 간접 참조하면 TS 가 `if (!supported)` 에서
   * 좁히기를 놓쳐 `message` 를 못 읽는다. 여기서 유니온이 사 주는 것이 없으므로
   * 평평한 모양이 낫다.
   */
  message: string | null;
}

/** iOS 판정 — 아이패드는 데스크톱 UA 를 쓰므로 터치 포인트로 함께 본다. */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** 홈 화면에 설치된 PWA 로 실행 중인가. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari 전용 비표준 플래그
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * 이 브라우저에서 알림을 띄울 수 있는가. 안 되는 경우 **무엇을 하면 되는지**까지 돌려준다 —
 * "지원하지 않습니다"만 보여주면 사용자가 할 수 있는 일이 없다.
 */
export function getBrowserNotificationSupport(): BrowserNotificationSupport {
  if (typeof window === 'undefined') {
    return { supported: false, message: '브라우저 환경이 아닙니다.' };
  }

  if (!('Notification' in window)) {
    return {
      supported: false,
      message:
        isIos() && !isStandalone()
          ? 'iPhone·iPad 는 홈 화면에 앱을 추가한 뒤에야 브라우저 알림을 쓸 수 있습니다. 공유 버튼 → "홈 화면에 추가"를 누르고, 그렇게 설치된 앱에서 다시 켜 주세요.'
          : '이 브라우저는 알림 기능을 지원하지 않습니다. 크롬·엣지·사파리 최신 버전을 사용해 주세요.',
    };
  }

  return { supported: true, message: null };
}

export function isBrowserNotificationSupported(): boolean {
  return getBrowserNotificationSupport().supported;
}

/** 현재 권한. 지원되지 않으면 `'unsupported'`. */
export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * 권한 요청. **사용자 제스처(클릭) 안에서만** 부를 것 — 크롬은 그렇지 않은 요청을
 * 조용히 거부한다. 그래서 앱 시작 시 자동으로 묻지 않고 설정 버튼에 걸어 둔다.
 */
export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch (error) {
    // 구형 사파리는 콜백 형태만 지원해 Promise 가 없다.
    console.warn('[browserNotifications] 권한 요청 실패:', error);
    return Notification.permission;
  }
}

/**
 * 서비스 워커 등록. **권한을 받은 뒤에만** 부른다 — 알림을 켜지 않은 사용자의
 * 브라우저에까지 워커를 남길 이유가 없다.
 *
 * 등록 결과를 모듈 스코프에 기억해 두는 이유는, 알림이 연달아 오면 이 함수가
 * 여러 번 불리는데 그때마다 `register()` 를 다시 부르면 불필요한 왕복이 생기기 때문이다.
 * 실패는 캐시하지 않는다(일시적 실패가 영구화되면 안 된다).
 */
let serviceWorkerReady: Promise<ServiceWorkerRegistration> | null = null;

export function ensureNotificationServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  if (!serviceWorkerReady) {
    serviceWorkerReady = navigator.serviceWorker
      .register(SERVICE_WORKER_PATH, { scope: '/' })
      // register() 가 끝나도 워커가 아직 activated 가 아닐 수 있다. showNotification 은
      // active 등록이 있어야 하므로 ready 까지 기다린다.
      .then(() => navigator.serviceWorker.ready)
      .catch((error) => {
        serviceWorkerReady = null;
        throw error;
      });
  }

  return serviceWorkerReady;
}

export interface ShowBrowserNotificationOptions {
  title: string;
  body?: string;
  /**
   * 같은 tag 의 알림은 서로를 **대체**한다. 알림 id 를 넣어 탭을 여러 개 열어 둬도
   * 같은 알림이 여러 번 쌓이지 않게 한다(다중 탭 중복 제거가 사실상 공짜로 해결된다).
   */
  tag?: string;
  destination?: BrowserNotificationDestination | null;
  /** 생성자 경로에서만 쓰인다. 서비스 워커 경로의 클릭은 message 로 돌아온다. */
  onClick?: (destination: BrowserNotificationDestination | null) => void;
}

/**
 * 알림을 띄운다. 성공하면 어떤 경로를 썼는지 돌려준다(진단용).
 * 실패해도 **절대 던지지 않는다** — 알림을 못 띄운 것이 앱을 멈출 이유는 없다.
 */
export async function showBrowserNotification(
  options: ShowBrowserNotificationOptions,
): Promise<'service-worker' | 'constructor' | 'failed'> {
  if (getBrowserNotificationPermission() !== 'granted') return 'failed';

  const data = { destination: options.destination ?? null };
  const common: NotificationOptions = {
    body: options.body,
    tag: options.tag,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    data,
  };

  // 1순위: 서비스 워커. 안드로이드에서 유일하게 동작하는 경로다.
  const registration = ensureNotificationServiceWorker();
  if (registration) {
    try {
      const reg = await registration;
      await reg.showNotification(options.title, common);
      return 'service-worker';
    } catch (error) {
      console.warn('[browserNotifications] 서비스 워커 알림 실패, 생성자로 후퇴:', error);
    }
  }

  // 2순위: 생성자. 데스크톱 전용 폴백이라고 봐야 한다.
  try {
    const notification = new Notification(options.title, common);
    notification.onclick = () => {
      window.focus();
      notification.close();
      options.onClick?.(options.destination ?? null);
    };
    return 'constructor';
  } catch (error) {
    console.warn('[browserNotifications] 알림 표시 실패:', error);
    return 'failed';
  }
}

/**
 * 사용자 설정(켜짐/꺼짐). 권한이 있어도 이걸 끄면 알림을 띄우지 않는다.
 * **기본값은 켜짐** — 권한을 일부러 허용한 사람이 원하는 상태는 "받겠다"이기 때문이다.
 */
export function isBrowserNotificationEnabled(): boolean {
  return readStoredJson<boolean>(
    PREFERENCE_KEY,
    true,
    (value): value is boolean => typeof value === 'boolean',
  );
}

export function setBrowserNotificationEnabled(enabled: boolean): void {
  writeStoredJson(PREFERENCE_KEY, enabled);
}

/** 실제로 알림을 띄워야 하는 상태인가 = 지원 ∧ 권한 ∧ 사용자 설정. */
export function shouldShowBrowserNotifications(): boolean {
  return getBrowserNotificationPermission() === 'granted' && isBrowserNotificationEnabled();
}
