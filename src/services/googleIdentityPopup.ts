/**
 * 구글 팝업 재인증 — Google Identity Services(GIS) 토큰 클라이언트 (2026-10-01)
 *
 * 드라이브·캘린더 코드가 필요한 것은 **구글 액세스 토큰 하나**다. 예전 팝업(`popupReauth` 의 구현)은
 * 그것을 얻으려고 팝업 안에서 **Supabase 로그인 전체**를 다시 했다:
 *   ① 구글 로그인 페이지의 COOP 가 팝업↔원래 창 관계를 끊어 결과 전달이 죽고
 *   ② 팝업이 앱 전체를 띄워 두 창이 함께 쓰는 세션을 바꾸다 0.5초 만에 닫혀 **원래 창 로그인이 풀렸다**
 *   (2026-08-12 사고 — CHANGELOG). 그래서 한동안 «페이지 이동» 재인증만 썼다.
 *
 * 이 모듈은 **Supabase 세션을 건드리지 않는다.** 구글이 제공하는 팝업(GIS)으로 토큰만 받아 따로 둔다.
 * GIS 는 COOP 를 스스로 처리하므로 ①도 없다. 화면을 떠나지 않으니 고른 파일·입력도 남는다.
 *
 * 전제 두 가지(2026-10-01 실측):
 *  - 클라이언트 ID 가 Supabase 구글 로그인과 **같다**(`491214877392-…`). `drive.file` 은 «이 앱이 만든 파일만»
 *    이므로 다른 ID 를 쓰면 지금까지 만든 폴더가 안 보여 같은 이름 폴더가 새로 생긴다.
 *  - 그 클라이언트의 «승인된 JavaScript 원본»에 운영 도메인(`spacekijun.lovable.app`)이 **등록돼 있다**.
 *    localhost 는 등록돼 있지 않아 개발 서버에서는 팝업이 거부된다 → 호출부가 페이지 이동으로 넘어간다.
 */
import { supabase } from '@/integrations/supabase/client';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar';
/** 학교 Workspace — 다른 계정으로 고르지 않게 한다(본 로그인과 같은 값) */
const HOSTED_DOMAIN = 'myschool.hs.kr';
/** `google_` 접두 — 로그인 정보 지우기(clearStoredAuthState)·로그아웃(clearGoogleTokens)이 함께 지운다 */
export const POPUP_TOKEN_KEY = 'google_popup_token';
/** 만료 직전 토큰을 쓰다 업로드 도중 끊기지 않게 1분 여유 */
const EXPIRY_MARGIN_MS = 60_000;

interface StoredPopupToken {
  accessToken: string;
  expiresAt: number;
  /** Supabase 사용자 — 다른 계정으로 바뀌면 이 토큰을 쓰지 않는다 */
  userId: string;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GisOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    hd?: string;
    login_hint?: string;
    include_granted_scopes?: boolean;
    callback: (response: GisTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GisTokenClient;
}

/**
 * `window.google` 은 드라이브·캘린더 서비스가 이미 `any` 로 전역 선언해 두었다(Picker 등).
 * 같은 이름을 다른 타입으로 다시 선언하면 충돌하므로, 여기서는 읽는 자리에서만 필요한 모양으로 좁힌다.
 */
function gisOAuth2(): GisOAuth2 | undefined {
  return (window as unknown as { google?: { accounts?: { oauth2?: GisOAuth2 } } }).google?.accounts?.oauth2;
}

let gisLoading: Promise<void> | null = null;

/**
 * GIS 스크립트를 미리 받아 둔다. **[드라이브 연결] 버튼이 보일 때 부를 것** — 클릭한 뒤에야 받기 시작하면
 * 스크립트를 기다리는 사이 «사용자가 누른 직후»라는 조건이 사라져 브라우저가 팝업을 막을 수 있다.
 */
export function preloadGoogleIdentity(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (gisOAuth2()) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
      const script = existing ?? document.createElement('script');
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다.')), { once: true });
      if (!existing) {
        script.src = GIS_SRC;
        script.async = true;
        document.head.appendChild(script);
      } else if (gisOAuth2()) {
        resolve();
      }
    }).catch((error) => {
      gisLoading = null; // 다음 호출이 다시 시도하게
      throw error;
    });
  }
  return gisLoading;
}

function readStored(): StoredPopupToken | null {
  try {
    const raw = localStorage.getItem(POPUP_TOKEN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredPopupToken>;
    if (typeof value.accessToken !== 'string' || typeof value.expiresAt !== 'number' || typeof value.userId !== 'string') {
      localStorage.removeItem(POPUP_TOKEN_KEY);
      return null;
    }
    return value as StoredPopupToken;
  } catch {
    return null;
  }
}

/**
 * 팝업으로 받은 토큰 — 지금 로그인한 사람의 것이고 아직 유효할 때만. 아니면 null(그때는 로그인 토큰을 쓴다).
 */
export function readPopupToken(currentUserId: string | null | undefined): string | null {
  if (!currentUserId) return null;
  const stored = readStored();
  if (!stored) return null;
  if (stored.userId !== currentUserId || stored.expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
    try { localStorage.removeItem(POPUP_TOKEN_KEY); } catch { /* 지울 수 없으면 다음에 다시 걸러진다 */ }
    return null;
  }
  return stored.accessToken;
}

export function clearPopupToken(): void {
  try { localStorage.removeItem(POPUP_TOKEN_KEY); } catch { /* noop */ }
}

/**
 * 구글 팝업으로 드라이브 토큰을 받는다. 성공하면 true.
 * 실패(팝업 차단·창 닫음·거부·등록되지 않은 도메인)면 false — 호출부가 페이지 이동 로그인을 권한다.
 */
export async function requestGoogleTokenPopup(): Promise<boolean> {
  const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
  if (!clientId) {
    console.warn('구글 팝업 재인증: VITE_GOOGLE_DRIVE_CLIENT_ID 가 없습니다.');
    return false;
  }

  // 사용자 확인은 저장소 읽기로 — getUser() 는 네트워크를 타고 인증 잠금을 쥔다(CLAUDE.md)
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return false;

  try {
    await preloadGoogleIdentity();
  } catch (error) {
    console.warn('구글 팝업 재인증: 스크립트 로드 실패', error);
    return false;
  }
  const oauth2 = gisOAuth2();
  if (!oauth2) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      hd: HOSTED_DOMAIN,
      // 지금 로그인한 계정으로 바로 — 다른 계정을 고르면 토큰과 세션의 주인이 갈린다
      login_hint: user.email ?? undefined,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) {
          console.warn('구글 팝업 재인증 거부:', response.error, response.error_description);
          finish(false);
          return;
        }
        const seconds = Number(response.expires_in) || 3600;
        const stored: StoredPopupToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + seconds * 1000,
          userId: user.id,
        };
        try {
          localStorage.setItem(POPUP_TOKEN_KEY, JSON.stringify(stored));
        } catch (error) {
          console.warn('구글 팝업 토큰을 저장하지 못했습니다:', error);
          finish(false);
          return;
        }
        finish(true);
      },
      // popup_failed_to_open(차단) · popup_closed(사용자가 닫음) · unknown
      error_callback: (error) => {
        console.warn('구글 팝업 재인증 실패:', error?.type, error?.message);
        finish(false);
      },
    });

    // 이미 허용한 계정이면 동의 화면 없이 바로 닫힌다
    client.requestAccessToken({ prompt: '' });
  });
}
