// MCP 서류함·코드 공유 파일 진입점 — 동작은 handler.js (Node 회귀 scripts/mcp-agent-test/files.mts 가 같은 파일을 부른다).
import { createFilesHandler } from './handler.js';

Deno.serve(createFilesHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
}));
