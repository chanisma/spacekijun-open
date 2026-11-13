// Google OAuth token management using Supabase provider token
import { supabase } from '@/integrations/supabase/client';
import { clearPopupToken, readPopupToken } from './googleIdentityPopup';

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** popup = 팝업 재인증으로 받은 토큰, login = 로그인 때 받은 토큰 */
  source?: 'popup' | 'login';
}

/**
 * 드라이브·캘린더에 쓸 구글 토큰.
 * 1순위 = 팝업 재인증으로 받은 토큰(지금 사용자의 것이고 만료 전일 때 — googleIdentityPopup.ts),
 * 2순위 = 로그인할 때 받은 토큰(Supabase session.provider_token).
 * 팝업 토큰이 앞서는 이유: 로그인 토큰은 한 시간 뒤 만료되는데 Supabase 가 갱신해 주지 않는다 —
 * 팝업 재인증은 정확히 그 상황에서 받은 «더 새것»이다.
 */
export async function getGoogleTokensFromSupabase(): Promise<GoogleAuthTokens | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const popupToken = readPopupToken(session?.user?.id);
    if (popupToken) return { accessToken: popupToken, source: 'popup' };

    if (!session?.provider_token) {
      console.warn('⚠️ No provider token available. Please log out and log in again.');
      return null;
    }

    return {
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token,
      source: 'login',
    };
  } catch (error) {
    console.error('❌ Error getting Google tokens from Supabase:', error);
    return null;
  }
}

/**
 * Verify token validity using lightweight tokeninfo endpoint
 */
async function verifyTokenWithGoogleAPI(token: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    return response.ok;
  } catch (error) {
    console.error('Token verification failed:', error);
    return false;
  }
}

/**
 * Get valid Google access token
 * 토큰이 없거나 만료되었으면 throw
 */
export async function getValidGoogleToken(): Promise<string> {
  const tokens = await getGoogleTokensFromSupabase();

  if (!tokens?.accessToken) {
    throw new Error('GOOGLE_TOKEN_MISSING');
  }

  const isValid = await verifyTokenWithGoogleAPI(tokens.accessToken);

  if (!isValid) {
    // 팝업 토큰이 구글 쪽에서 먼저 무효가 됐을 수 있다(권한 철회 등) — 버리고 로그인 토큰으로 한 번 더 본다
    if (tokens.source === 'popup') {
      clearPopupToken();
      const fallback = await getGoogleTokensFromSupabase();
      if (fallback?.source === 'login' && await verifyTokenWithGoogleAPI(fallback.accessToken)) {
        return fallback.accessToken;
      }
    }
    throw new Error('GOOGLE_TOKEN_EXPIRED');
  }

  return tokens.accessToken;
}

/**
 * Verify token has required scopes by testing Drive and Calendar API access
 */
export async function verifyGoogleTokenScopes(token: string): Promise<{
  hasDriveAccess: boolean;
  hasCalendarAccess: boolean;
  error?: string;
}> {
  const results = {
    hasDriveAccess: false,
    hasCalendarAccess: false,
    error: undefined as string | undefined
  };

  try {
    // Test Drive API access
    const driveResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    results.hasDriveAccess = driveResponse.ok;

    // Test Calendar API access
    const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    results.hasCalendarAccess = calendarResponse.ok;

    if (!results.hasDriveAccess || !results.hasCalendarAccess) {
      results.error = 'Token missing required scopes. Please log out and log in again.';
      console.warn('⚠️ Token 스코프 부족:', results);
    }
  } catch (error) {
    results.error = `Token verification failed: ${error}`;
    console.error('❌ Token 검증 실패:', error);
  }

  return results;
}
