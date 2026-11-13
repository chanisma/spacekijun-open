/**
 * Google 팝업 재인증 — 화면을 떠나지 않고 드라이브·캘린더 토큰만 새로 받는다.
 *
 * 2026-10-01: 구현을 Google Identity Services 토큰 팝업으로 바꿨다(`googleIdentityPopup.ts`).
 * 예전 구현은 팝업에서 Supabase 로그인을 다시 해 원래 창의 로그인까지 풀었다(2026-08-12 사고).
 * 이름과 반환값(성공 여부)은 그대로라 호출부(전역 재인증 모달·전자서명)는 바뀌지 않는다.
 */
import { requestGoogleTokenPopup } from './googleIdentityPopup';

/**
 * @returns 성공 시 true, 실패(차단·닫음·거부) 시 false — 실패하면 호출부가 페이지 이동 로그인을 권한다.
 */
export async function popupReauth(): Promise<boolean> {
  try {
    return await requestGoogleTokenPopup();
  } catch (error) {
    console.warn('팝업 재인증 예외:', error);
    return false;
  }
}
