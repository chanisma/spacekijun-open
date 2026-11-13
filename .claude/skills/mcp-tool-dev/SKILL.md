---
name: mcp-tool-dev
description: >-
  SPACEKIJUN 에이전트(MCP) 서버의 도구를 새로 만들거나 고칠 때의 절차·체크리스트·검증. `public.mcp_*` RPC,
  `supabase/functions/mcp/handler.js` TOOLS, `src/lib/mcpTools.ts`(허용·기능 묶음), 엣지 묶음(`build-bundle.mts`),
  관리 화면 도구 설명(`build-tool-docs.mts`), 저장소에 닿는 보조 함수(mcp-docgen·mcp-sign), 회귀 `scripts/mcp-agent-test/`.
  "MCP 도구 추가", "에이전트 도구 만들기", "mcp_ RPC", "MCP 가 웹과 다르게", "에이전트가 쓴 설정 때문에 화면이 깨짐",
  웹 기능의 저장 모양을 바꿀 때(MCP 도 같은 칸에 쓴다) 사용한다. 도구를 **쓰는** 일은 `spacekijun-mcp`.
---

# MCP 도구 만들기·고치기

정본 설명 = `docs/features/mcp-agent.md` · CLAUDE.md «에이전트(MCP) 연결 시험판». 이 스킬은 **순서와 빠뜨리기 쉬운 자리**다.

## 세 겹 (깨지 말 것)

1. 도구 허용 — `mcp_private.require_tool('<허용>')` (판정 = `mcp_private.my_grants()` : 교사 기본 ∪ 사람별 추가 − 해제)
2. DB 입구 훅 — 에이전트 토큰(`client_id` 클레임)은 `/rpc/mcp_*` 만. **이름이 `mcp_` 가 아니면 에이전트에게만 실패**
3. RLS 그대로 — RPC 는 **SECURITY INVOKER**. DEFINER 금지(회귀가 잡는다)

저장소(Storage)는 에이전트 토큰이 막혀 있다 → 별도 엣지 함수가 **사용자 토큰으로 RPC 에 무엇을 읽을지 묻고**, 그 경로만
service_role 로 다룬다(`mcp-docgen`·`mcp-sign` 패턴). 요청이 경로를 고르게 하지 말 것 · 일반 로그인 토큰 거부(`jwtClientId`).

## 새 도구 체크리스트

1. **마이그레이션**(`supabase/migrations/<새 번호>_mcp_*.sql` — 번호 겹침 확인)
   - `create or replace function public.mcp_<이름>(…) … security invoker set search_path = public, pg_temp`
   - 첫 줄 `v_me uuid := mcp_private.require_tool('<허용>')`
   - 무엇이든 쓰면(`log_call` 포함) **VOLATILE** — PostgREST 가 STABLE 을 읽기 전용 트랜잭션으로 불러 INSERT 가 거부된다(드라이런은 못 잡는다)
   - `revoke all … from public, anon; grant execute … to authenticated;`
   - task 를 직접 UPDATE 하지 말고 기존 상태 RPC(`set_task_assignee_status` 등) 경유
   - 다시 정의할 땐 **가장 최근 정의에서** 옮겨 적는다(`20261024140000` 이후 — 옛 파일엔 없어진 허용 이름)
2. **handler.js TOOLS** 한 항목 — `name`·`grant`·`rpc`·`title`·`description`(에이전트가 받는 글 — 확인 규칙·못 하는 것까지)·
   `inputSchema`(`additionalProperties:false`)·`annotations`(바꾸는 RPC 에 `readOnlyHint:true` 금지 — 기록만 남기는 읽기는 회귀의
   `LOG_ONLY_READS`)·`args`(`checkUuid`·`checkEnum`·`checkText` — 입력 오류는 `ToolInputError`)·필요하면 `run`
3. **허용이 새로 생기면**: 두 CHECK(`mcp_tool_grant`·`mcp_tool_policy`) + 정책 시드 + TOOLS + `src/lib/mcpTools.ts`
   (`MCP_TOOL_GRANTS` + `MCP_FEATURES` — 기능마다 `menu` 주소, 관리 화면 순서 = 왼쪽 메뉴 순서). 기존 허용에 붙이면 이 단계 없음
4. `mcpTools.ts` 의 그 허용 `tools` 목록에 이름 추가
5. 생성물: `npx tsx scripts/mcp-docgen/build-tool-docs.mts`(관리 화면 도구 설명) ·
   웹 순수 함수를 엣지에서 쓰면 `npx tsx scripts/mcp-docgen/build-bundle.mts`
6. 회귀 `scripts/mcp-agent-test/run.mts` 의 `SAMPLE_ARGS`(견본 인자) · `run` 이 인자 이름을 바꾸면 `RUN_TOOLS`
7. 적용: 드라이런(`begin; … rollback;` → `npx supabase db query --linked -f <win 경로>`) → 적용 →
   `npx supabase migration repair --status applied <번호>` → `npx supabase functions deploy mcp --use-api`
   (**`db push` 금지**). 새 보조 엣지 함수는 `config.toml` 에 `verify_jwt = false` + 함수가 직접 확인
8. 문서: `docs/features/mcp-agent.md` · `CHANGELOG.md` (전역 규칙이 바뀌면 CLAUDE.md 한 줄)

## 웹과 같은 칸에 쓰는 도구 (조용히 틀리는 자리)

MCP 는 `task_action.config` 등 **웹이 읽는 칸**에 쓴다. 웹 parse 함수(`parseAudienceRule`·`parseCollectConfig`·
`parseNeisActionConfig`·`parseExternalActionConfig`)의 모양을 바꾸면 MCP 쓰기(`mcp_private.wk_*`·`handler.js`)도 같이.
- 고정 예시 `scripts/mcp-agent-test/web-contract.json` 에 입력 → 저장 모양을 적고
- `npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/contract.mts --db` — SQL 출력 = 고정 예시, **운영 작업 설정 전부**가
  웹 parse 를 거쳐도 그대로인지(웹이 고쳐 읽어야 하는 값도 실패로 센다)
- 2026-10-25 사고: `all_faculty` 의 `types` 누락 → 웹 `.includes` 에서 업무 화면 전체가 깨졌다

## 회귀 (전부 돌린 뒤 배포)

```
npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/run.mts        # 이름표·허용·INVOKER·VOLATILE·견본
npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/handler.mts    # MCP 프로토콜·인자 검사
npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/data.mts       # 데이터 카탈로그
npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/work-ops.mts   # 업무 진행 판정(ACTION_GUIDES)
npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/school-ops.mts # 시간표·스케줄 부가 기능
npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/contract.mts --db
npx tsx scripts/mcp-agent-test/sign-file.mts                               # mcp-sign 저장소 경계
```

라이브 확인: SQL 로 `request.jwt.claims`(sub·role·**client_id**)를 넣고 `set local role authenticated` 후 RPC 를 부른 뒤 `rollback`.
에이전트 세션의 도구 목록은 캐시된다 — 새 도구는 MCP 재연결 뒤에 보인다(«도구가 없다» ≠ 배포 실패).
