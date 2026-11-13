import { isAgentAuthorization } from '../_shared/agentToken.js';

// Native desktop only. Mint a separate session for the authenticated caller;
// never accept a user ID/email or forward a refresh token from the caller.
export function createHandler(env, fetcher = fetch) {
  const reply = (status, value) => new Response(JSON.stringify(value), {
    status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
  });
  return async (request) => {
    if (request.method !== 'POST') return reply(405, {error: 'method_not_allowed'});
    // No CORS: web pages use their existing login, this endpoint is for native HTTPS calls.
    if (request.headers.has('Origin')) return reply(403, {error: 'native_client_required'});
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, {error: 'authentication_required'});
    // MCP agent tokens (OAuth client_id claim) are limited to mcp_* RPCs at the DB gate; minting a
    // normal session from one would bypass that gate. (2026-10-18)
    if (isAgentAuthorization(authorization)) return reply(403, {error: 'agent_token_not_allowed'});
    let body;
    try { body = await request.json(); } catch { return reply(400, {error: 'invalid_request'}); }
    if (!body || !['space', 'seaton'].includes(body.site) || Object.keys(body).some(k => k !== 'site')) {
      return reply(400, {error: 'invalid_site'});
    }
    const base = env.url.replace(/\/$/, '') + '/auth/v1/';
    const call = (path, key, bearer, payload) => fetcher(base + path, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {apikey: key, Authorization: bearer, 'Content-Type': 'application/json'},
      ...(payload === undefined ? {} : {body: JSON.stringify(payload)}),
      signal: AbortSignal.timeout(10000),
    });
    try {
      // Server verification, not client-supplied claims/user_metadata.
      const verified = await call('user', env.anonKey, authorization);
      if (!verified.ok) return reply(401, {error: 'authentication_required'});
      const user = await verified.json();
      if (!user.id || !user.email || !user.email_confirmed_at || user.is_anonymous) {
        return reply(403, {error: 'verified_account_required'});
      }
      // Do not downgrade MFA by creating an email-only session.
      if ((user.factors || []).some(f => f.status === 'verified')) {
        return reply(403, {error: 'use_website_mfa_login'});
      }
      const generated = await call('admin/generate_link', env.serviceKey, 'Bearer ' + env.serviceKey,
        {type: 'magiclink', email: user.email});
      if (!generated.ok) return reply(502, {error: 'session_creation_failed'});
      const link = await generated.json();
      if (!link.hashed_token || link.id !== user.id) return reply(502, {error: 'identity_mismatch'});
      // generate_link sends no email. Consume the one-time token on the server;
      // the desktop receives only the new, independent web session.
      const verifiedLink = await call('verify', env.anonKey, 'Bearer ' + env.anonKey,
        {type: 'magiclink', token_hash: link.hashed_token});
      if (!verifiedLink.ok) return reply(502, {error: 'session_creation_failed'});
      const session = await verifiedLink.json();
      if (session.user?.id !== user.id || !session.access_token || !session.refresh_token) {
        return reply(502, {error: 'identity_mismatch'});
      }
      return reply(200, {session});
    } catch {
      // Never include provider responses, tokens or email addresses in errors/logs.
      return reply(502, {error: 'session_creation_failed'});
    }
  };
}
