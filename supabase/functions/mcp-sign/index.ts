// MCP 전자서명 문서 받기 진입점 — 동작은 handler.js (Node 회귀 scripts/mcp-agent-test/sign-file.mts 가 같은 파일을 부른다).
import { createSignFileHandler } from './handler.js';

Deno.serve(createSignFileHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
}));
