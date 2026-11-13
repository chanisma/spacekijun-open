// spacekijun MCP 서버 진입점 — 동작은 handler.js (Node 회귀 scripts/mcp-agent-test/handler.mts 가 같은 파일을 부른다).
import { createHandler } from './handler.js';

Deno.serve(createHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  // 공개 주소가 SUPABASE_URL 과 다를 때만(사용자 도메인 등). 비우면 <SUPABASE_URL>/functions/v1/mcp
  publicUrl: Deno.env.get('MCP_PUBLIC_URL') ?? undefined,
  // 생성 방식 링크의 앞부분(비우면 https://spacekijun.lovable.app)
  appUrl: Deno.env.get('APP_URL') ?? undefined,
  // 급식 데이터셋(read_data meals) — NEIS 공개 API 키. 함수 비밀로만(코드에 적지 않는다)
  neisKey: Deno.env.get('NEIS_API_KEY') ?? undefined,
}));
