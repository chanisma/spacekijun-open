/**
 * Web Push 구독 — 단일 출처 (2026-10-07, 다마고찌 Phase 4 «꺼져 있어도 부른다»).
 *
 * 2026-09-09 의 «탭이 살아 있는 동안만»(realtime → 서비스 워커 표시)은 그대로 두고, 그 위에 **탭을 닫아도**
 * 오는 경로를 더한다: 브라우저가 준 구독(엔드포인트 + 키)을 서버(`push_subscriptions`)에 맡기면,
 * 알림 행이 생길 때 DB 트리거 → 엣지 함수 `push-send` 가 Web Push 로 보낸다. 서비스 워커(`public/sw.js`)의
 * `push` 핸들러가 받아 그린다.
 *
 * ## 두 경로가 같은 알림을 두 번 울리지 않는 이유
 * 둘 다 tag = `notification-<알림 id>` 로 그린다. 같은 tag 는 서로를 **소리 없이 대체**한다(renotify 기본 false).
 * 앱을 보고 있으면 워커가 그리지 않는다 — 앱 안 토스트가 이미 말했다.
 *
 * ## 무엇을 서버가 정하는가
 * 누구에게 · 하루 몇 건(8건, 펫 부름 3건) · 조용한 시간(22:00~07:00 한국)은 전부 서버(`push_targets`)다.
 * 아래 상수는 **화면 문구용 사본**이다 — 바꾸려면 마이그레이션 `20261007130000_web_push.sql` 과 함께.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ensureNotificationServiceWorker, getBrowserNotificationPermission } from '@/lib/browserNotifications';

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  push_subscribe: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent: string | null }; Returns: { ok: boolean; count: number } };
  push_unsubscribe: { Args: { p_endpoint: string }; Returns: { ok: boolean; removed: number } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

/** VAPID 공개키(비밀키는 엣지 함수 시크릿 `VAPID_KEYS` 에만 있다). 바꾸면 기존 구독이 전부 무효가 된다. */
export const VAPID_PUBLIC_KEY = 'BGx6vwsshRpvf7dPswavs1m3Ucn2jWzNhe7xslFeacgWObmtLqp3nLNFratnWPj35o56_dILs3p8cQGBS_h7vuo';

export const PUSH_DAILY_LIMIT = 8;
export const PUSH_PET_CALL_DAILY_LIMIT = 3;
export const PUSH_QUIET_HOURS = { from: 22, to: 7 } as const;

/** 서비스 워커의 «앱으로 돌아가기» — 열린 탭이 없을 때 이 주소로 새 창을 연다(`public/sw.js` 와 짝). */
export const PUSH_OPEN_PARAM = 'push_open';

export interface WebPushSupport {
  supported: boolean;
  /** 안 될 때 무엇을 하면 되는지 */
  message: string | null;
  /** iOS 인데 홈 화면 앱이 아니다 — 설치 안내를 보여 줄 자리 */
  needsIosInstall: boolean;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function getWebPushSupport(): WebPushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, message: '브라우저 환경이 아닙니다.', needsIosInstall: false };
  }
  // iOS 는 홈 화면에 설치한 앱(16.4+) 안에서만 PushManager 가 있다 — «지원 안 함»이 아니라 «설치하면 된다»
  if (isIosDevice() && !isStandaloneApp()) {
    return {
      supported: false,
      needsIosInstall: true,
      message: 'iPhone·iPad 는 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.',
    };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, needsIosInstall: false, message: '이 브라우저는 닫혀 있을 때의 알림을 지원하지 않아요. 크롬·엣지·사파리 최신 버전을 써 주세요.' };
  }
  return { supported: true, message: null, needsIosInstall: false };
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 구독의 공개키가 지금 키와 같은가 — 키를 바꾼 뒤의 낡은 구독은 서버가 보내도 거부된다 */
function sameServerKey(sub: PushSubscription): boolean {
  const key = sub.options?.applicationServerKey;
  if (!key) return true; // 옛 브라우저는 알려 주지 않는다 — 믿는다
  const a = new Uint8Array(key);
  const b = keyBytes(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const ready = ensureNotificationServiceWorker();
  return ready ? ready : null;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!getWebPushSupport().supported) return null;
  try {
    const reg = await registration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function sendToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('브라우저가 알림 구독 정보를 주지 않았어요.');
  const { error } = await db.rpc('push_subscribe', {
    p_endpoint: json.endpoint, p_p256dh: p256dh, p_auth: auth, p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

/**
 * 구독하고 서버에 맡긴다. **권한이 이미 granted 일 때만** — 권한 요청(사용자 제스처)은 호출부가 먼저 한다.
 * 실패하면 던진다(화면이 이유를 말해야 한다).
 */
export async function subscribeWebPush(): Promise<PushSubscription> {
  const support = getWebPushSupport();
  if (!support.supported) throw new Error(support.message ?? '알림을 받을 수 없어요.');
  if (getBrowserNotificationPermission() !== 'granted') throw new Error('알림 권한이 필요해요.');
  const reg = await registration();
  if (!reg) throw new Error('서비스 워커를 준비하지 못했어요.');
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameServerKey(sub)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  }
  await sendToServer(sub);
  return sub;
}

/** 이 기기의 구독을 끊는다(브라우저 + 서버). 실패해도 던지지 않는다. */
export async function unsubscribeWebPush(): Promise<void> {
  const sub = await getCurrentPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await db.rpc('push_unsubscribe', { p_endpoint: endpoint });
}

/**
 * 로그아웃 직전 — 서버에서만 지운다(이 기기로 다른 사람이 로그인하면 sync 가 그 사람 앞으로 다시 맡긴다).
 * 공용 기기에서 로그아웃한 사람의 알림 제목이 계속 뜨지 않게 하는 것이 목적이다. 로그아웃을 1.5초 넘게 막지 않는다.
 */
export async function forgetWebPushOnSignOut(): Promise<void> {
  const work = (async () => {
    const sub = await getCurrentPushSubscription();
    if (sub) await db.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
  })().catch(() => undefined);
  await Promise.race([work, new Promise((r) => setTimeout(r, 1500))]);
}

/**
 * 앱을 열 때마다 — 브라우저 알림을 켜 둔 사람(권한 granted + 앱 설정 켜짐)은 구독을 서버와 맞춘다.
 * ①Phase 4 전에 켠 사람도 저절로 «닫혀 있어도» 받는다(켤 때 바란 것이 «앱을 안 보고 있을 때 알려 달라»였다)
 * ②로그아웃으로 서버에서 지워진 구독을 지금 로그인한 사람 앞으로 다시 맡긴다 ③브라우저가 구독을 갈아 끼운 경우.
 */
export async function syncWebPush(enabled: boolean): Promise<'subscribed' | 'skipped' | 'failed'> {
  if (!enabled || !getWebPushSupport().supported || getBrowserNotificationPermission() !== 'granted') return 'skipped';
  try {
    await subscribeWebPush();
    return 'subscribed';
  } catch (error) {
    console.warn('[webPush] 구독 동기화 실패:', error);
    return 'failed';
  }
}

/** 서비스 워커 push 페이로드(엣지 함수 push-send 와 짝) */
export interface PushPayload {
  v: 1;
  id: string;
  type: string;
  title: string;
  body: string;
  tag: string;
}
