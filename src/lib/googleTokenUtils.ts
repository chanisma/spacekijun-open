/**
 * Google token management utilities
 */

const GOOGLE_TOKEN_KEYS = [
  'gdrive_access_token',
  'gdrive_refresh_token',
  'gdrive_token_expiry',
  'google_access_token',
  'google_token_expiry',
  // 구글 팝업 재인증으로 받은 드라이브 토큰(googleIdentityPopup.ts) — 로그아웃·계정 전환 때 함께 지운다
  'google_popup_token',
] as const;

/**
 * Clears all Google-related tokens from localStorage.
 * Used during sign out and account switching.
 */
export function clearGoogleTokens(): void {
  GOOGLE_TOKEN_KEYS.forEach(key => localStorage.removeItem(key));
}

/**
 * Checks if Google Drive tokens exist and are valid.
 */
export function hasValidGoogleDriveToken(): boolean {
  const token = localStorage.getItem('gdrive_access_token');
  const expiry = localStorage.getItem('gdrive_token_expiry');

  if (!token || !expiry) return false;

  const expiryTime = parseInt(expiry, 10);
  return Date.now() < expiryTime;
}
