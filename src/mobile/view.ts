/**
 * 가벼운 모바일 앱(/m)과 본 앱 중 무엇을 띄울지 — **앱 코드를 받기 전에** main.tsx 가 정한다(2026-10-29 요청).
 *
 * 본 앱은 첫 화면부터 큰 묶음(약 10MB)을 받는다. 휴대폰은 /m 에서 작은 묶음만 받아 오늘 시간표·메모·쪽지·알림·
 * 에이전트를 본다. 사람이 «전체 웹사이트로 보기»를 고르면 **그 탭에서만**(sessionStorage) 온전한 웹사이트(본 앱)를 띄운다 —
 * 탭을 닫거나 홈 화면 앱을 다시 열면 모바일로 돌아온다(2026-10-29 사용자 정정: «PC 화면»이 아니라 웹사이트 전체를 보는 기능).
 * 교실 기기 QR(승인·비밀번호)도 휴대폰으로 찍으니 늘 가벼운 쪽에서 연다.
 *
 * 여기서는 React·Supabase 를 들이지 않는다 — 이 파일이 두 앱 모두의 첫 묶음에 들어간다.
 */
export const VIEW_KEY = 'spacekijun-view';           // sessionStorage 'full' = 이 탭은 휴대폰이어도 본 앱
export const PENDING_REDIRECT_KEY = 'spacekijun-post-login-redirect';   // RequireAuth 와 같은 키

const MOBILE_ONLY = /^\/m(\/|$)/;
const QR_PAGES = /^\/classroom\/(link|type)\/[^/]+\/?$/;

export const isMobilePath = (path: string) => MOBILE_ONLY.test(path) || QR_PAGES.test(path);

export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const phoneUa = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(ua) && !/iPad|Tablet/i.test(ua);
  const narrow = typeof window !== 'undefined' && Math.min(window.screen?.width || 9999, window.innerWidth || 9999) < 768;
  return phoneUa && narrow;
}

function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}

export const prefersFull = () => read(() => sessionStorage, VIEW_KEY) === 'full';

export function setViewPreference(view: 'full' | 'mobile') {
  try {
    if (view === 'full') sessionStorage.setItem(VIEW_KEY, 'full');
    else sessionStorage.removeItem(VIEW_KEY);
    localStorage.removeItem(VIEW_KEY);         // 첫 판(기기에 기억)의 흔적
  } catch { /* 저장 못 하는 브라우저 — 이번만 */ }
}

/**
 * 어느 앱을 띄울지. 휴대폰이 첫 화면('/')으로 오면 주소를 /m 으로 바꾼다 — 로그인 직후(구글이 '/' 로 돌려보낸다)
 * 가던 곳이 모바일 쪽이면 그리로. 주소 뒤의 #access_token(로그인 결과)은 그대로 둔다.
 */
export function chooseEntry(): 'mobile' | 'full' {
  const { pathname, search, hash } = window.location;
  if (isMobilePath(pathname)) return 'mobile';
  if (pathname !== '/' ) return 'full';
  const pending = read(() => sessionStorage, PENDING_REDIRECT_KEY);
  if (pending && isMobilePath(pending.split(/[?#]/)[0])) {
    try { sessionStorage.removeItem(PENDING_REDIRECT_KEY); } catch { /* 지우지 못해도 이번에 옮긴다 */ }
    window.history.replaceState(window.history.state, '', pending + hash);
    return 'mobile';
  }
  if (isPhone() && !prefersFull()) {
    window.history.replaceState(window.history.state, '', '/m' + search + hash);
    return 'mobile';
  }
  return 'full';
}
