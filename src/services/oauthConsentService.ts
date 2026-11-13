/**
 * OAuth 2.1 서버 동의 화면용 Auth 호출 (2026-10-18 — MCP 에이전트 연결).
 *
 * 설치된 supabase-js(2.53)에는 `auth.oauth.*` 메서드가 없다. 앱 전체의 supabase-js 를 올리는 대신
 * 같은 GoTrue 엔드포인트를 직접 부른다 — 경로·본문·헤더는 @supabase/auth-js 2.118 의
 * `_getAuthorizationDetails`·`_approveAuthorization`·`_denyAuthorization`·`_listOAuthGrants`·
 * `_revokeOAuthGrant` 와 같다. supabase-js 를 올리면 이 파일을 SDK 호출로 바꿔도 된다.
 *
 * 토큰은 지금 로그인 세션의 것을 쓴다(`getSession` — 저장소 읽기, 인증 잠금 안에서 네트워크를 타지 않는다).
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * 주소·공개 키는 이미 만들어진 클라이언트에서 읽는다 — `client.ts` 가 값을 하드코딩하고 있어
 * 운영 빌드에 .env 가 없어도 같다. (supabase-js 의 protected 필드지만 런타임에는 그대로 있다.)
 */
export const supabaseProject = supabase as unknown as { supabaseUrl: string; supabaseKey: string };
const AUTH_URL = `${String(supabaseProject.supabaseUrl).replace(/\/$/, '')}/auth/v1`;
const ANON_KEY = supabaseProject.supabaseKey;

export interface OAuthClientInfo {
  id: string;
  name: string;
  uri?: string;
  logo_uri?: string;
}

export interface OAuthAuthorizationDetails {
  authorization_id: string;
  redirect_uri: string;
  client: OAuthClientInfo;
  user: { id: string; email: string };
  scope: string;
}

/** 이미 동의한 요청이면 상세 대신 돌아갈 주소만 온다. */
export type AuthorizationLookup =
  | { kind: 'consent'; details: OAuthAuthorizationDetails }
  | { kind: 'redirect'; redirectUrl: string };

export interface OAuthGrant {
  client: OAuthClientInfo;
  scopes: string[];
  granted_at: string;
}

async function authFetch(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');
  const res = await fetch(`${AUTH_URL}${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Supabase-Api-Version': '2024-01-01',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { parsed = null; }
  if (!res.ok) {
    const message = parsed?.msg || parsed?.message || parsed?.error_description || parsed?.error || `요청이 실패했습니다 (${res.status}).`;
    throw new Error(String(message));
  }
  return parsed;
}

/** 응답 모양 판정 — 순수 함수(회귀가 부른다). */
export function classifyAuthorizationResponse(data: Record<string, unknown> | null): AuthorizationLookup {
  if (data && typeof data.authorization_id === 'string') return { kind: 'consent', details: data as unknown as OAuthAuthorizationDetails };
  if (data && typeof data.redirect_url === 'string') return { kind: 'redirect', redirectUrl: data.redirect_url };
  throw new Error('인가 요청을 읽을 수 없습니다. 에이전트에서 연결을 다시 시작해 주세요.');
}

export async function getAuthorizationDetails(authorizationId: string): Promise<AuthorizationLookup> {
  const data = await authFetch('GET', `/oauth/authorizations/${encodeURIComponent(authorizationId)}`);
  return classifyAuthorizationResponse(data);
}

/** 승인·거절 → 에이전트로 돌아갈 주소(승인 = code, 거절 = error 가 실려 있다). */
export async function decideAuthorization(authorizationId: string, action: 'approve' | 'deny'): Promise<string> {
  const data = await authFetch('POST', `/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, { action });
  if (typeof data?.redirect_url !== 'string') throw new Error('돌아갈 주소를 받지 못했습니다.');
  return data.redirect_url;
}

export async function listOAuthGrants(): Promise<OAuthGrant[]> {
  const data: unknown = await authFetch('GET', '/user/oauth/grants');
  return Array.isArray(data) ? (data as OAuthGrant[]) : [];
}

export async function revokeOAuthGrant(clientId: string): Promise<void> {
  await authFetch('DELETE', `/user/oauth/grants?client_id=${encodeURIComponent(clientId)}`);
}
