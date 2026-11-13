// MCP 문서 쓰기 진입점 — 동작은 handler.js (Node 회귀 scripts/mcp-agent-test/docgen-fill.mts 가 같은 파일을 부른다).
import JSZip from 'npm:jszip@3.10.1';
import { createDocgenHandler } from './handler.js';

Deno.serve(createDocgenHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
}, { JSZip }));
