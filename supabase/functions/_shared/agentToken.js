// MCP 에이전트 토큰 판정 (2026-10-18). Supabase OAuth 2.1 서버가 발급한 토큰에만 `client_id` 클레임이 있다.
//
// 서명은 보지 않는다 — 진위는 호출부가 auth/v1/user 로 먼저 확인한다. 여기는 «에이전트 토큰인가»만 가른다.
//
// 쓰는 곳:
//   mcp            — 에이전트 토큰만 받는다(일반 세션 토큰 거부)
//   desktop-session·classroom-link — 에이전트 토큰으로는 **새 세션을 만들지 않는다**. 만들어 주면
//                    DB 입구(account_link_pre_request: 에이전트 토큰은 /rpc/mcp_* 만)를 일반 세션으로 우회한다.

/** JWT 의 client_id. JWT 모양이 아니거나 클레임이 없으면 null. */
export function jwtClientId(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const claims = JSON.parse(atob(b64)); // 깨진 JWT 는 호출부가 판단하도록 던진다
  return typeof claims.client_id === 'string' && claims.client_id !== '' ? claims.client_id : null;
}

/**
 * 세션 발급 경로의 거부 판정. `Bearer <jwt>` 를 받는다.
 * JWT 세 조각 모양인데 가운데를 못 읽으면 **에이전트로 본다**(닫는 쪽) — GoTrue 가 발급한 토큰이 그렇게
 * 깨질 일은 없고, 이 판정은 열 이유가 없다. JWT 모양이 아니면 false(그런 토큰은 auth/v1/user 가 거절한다).
 */
export function isAgentAuthorization(authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '');
  if (token.split('.').length !== 3) return false;
  try {
    return jwtClientId(token) !== null;
  } catch {
    return true;
  }
}
