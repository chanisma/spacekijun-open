// MCP 한글 양식 올리기 진입점 — 동작은 handler.js (Node 회귀 scripts/mcp-agent-test/docgen.mts 가 같은 파일을 부른다).
import JSZip from 'npm:jszip@3.10.1';
import { createUploadHandler } from './handler.js';

Deno.serve(createUploadHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
}, { JSZip }));
