# AI 기록 (관리자) — `ai_call_log`

2026-10-15 사용자 요청: «ADMIN 에 탐구설계를 비롯한 인공지능이 활용되는 기능들에서 발생하는 오류를 포함한 로그들을 기능별로 확인».

관리자 화면 → 사이드바 **AI 기록**(`?tab=ai-logs` 로 바로 열림). 이 문서가 스키마 노트를 겸한다.

## 왜 새로 만들었나

- 엣지 함수 콘솔 로그는 24시간 뒤 사라지고 관리 화면에서 볼 수 없다. 2026-10-15 학생 대화 «빈 답» 장애도 콘솔에서 찾았다.
- 기존 `ai_error_log`(2026-09-12)는 **실패만**, 그것도 **브라우저가 알아챈 실패만** 담는다(운영 7건 — 전부 탐구 설계 화면 4곳).
  성공이 없으면 «오류율»·«평소 응답 시간»을 말할 수 없고, 화면이 없는 기능(아카데미 NPC·크론 분류)의 실패는 아예 남지 않는다.
- 그래서 **엣지 함수가 공급자(OpenAI·Upstage)를 부를 때마다** 한 줄씩 남긴다. `ai_error_log` 는 그대로 두고 화면이 함께 읽는다(«화면 오류»).

## 무엇이 남나

| level | 언제 | 예 |
|---|---|---|
| `call` | 공급자 호출 한 번(성공 포함) | 탐구 설계 대화 1턴, 작업 큐의 설계 단계 하나 |
| `request` | 요청 전체가 실패(공급자에 닿기 전후) | 권한·DB 조회 실패, «Empty conversation reply», 핸들러가 5xx 로 돌려준 실패 |
| `client` (화면 표시만) | 브라우저가 알아챈 실패 = `ai_error_log` | 응답 해석 실패 |

`outcome` = `success` · `error`(HTTP 실패·시간 초과·연결 실패) · `empty`(200 인데 본문 없음 — 대개 추론이 예산을 다 씀) · `truncated`(본문은 있지만 `finish_reason=length` / Responses API `incomplete`).
`empty` 를 `truncated` 보다 먼저 본다 — 둘 다면 «아무것도 못 받았다»가 처방을 정한다.

**본문(프롬프트·응답)은 담지 않는다** — 학생 기록이 로그로 샌다(`ai_error_log` 와 같은 원칙). 공급자 오류 메시지도 500자로 자른다.
담는 것: 시각 · 함수 · 기능 · 동작 · 화면 주소 · 공급자 · 모델(응답이 밝힌 실제 모델) · HTTP 상태 · 걸린 시간(본문까지 받은 시각) · 종료 사유 · 입력/출력/추론 토큰 · 사용자 id · 학생 학적 코드.

## 기능 이름은 어떻게 정해지나

우선순위 = **꼬리표의 `feature` → 화면 주소의 첫 마디 → 함수의 기본값**(`resolveAiFeature`).

- 범용 `chatCompletion`(openai-proxy·solar-proxy)은 여러 기능이 같이 써서 서버가 요청만 보고는 기능을 모른다.
  그래서 브라우저가 `aiLog: { appPath, label, feature? }` 꼬리표를 싣는다(`src/services/aiLogTag.ts`). `aiChat()` 이 자동으로 싣고(`label` = `errorPrefix`),
  `functions.invoke` 를 직접 부르는 6곳도 싣는다. **새 호출부는 `aiChat` 을 쓰거나 `aiLog: aiLogTag('동작 이름')` 을 실을 것** — 안 실으면 «미분류»로 남는다(오류는 없다).
- 서버는 꼬리표를 `params` 에서 **떼어 낸다**(`const { action, aiLog, ...params }`) — 탐구 설계 분석은 `...params` 를 단계 입력으로 넘기므로 남겨 두면 프롬프트에 섞인다.
- 꼬리표는 클라이언트 값이라 모양을 거른다(기능 키 `[a-z0-9-]`, 주소는 `/` 로 시작, 질의 문자열 제거). **권한 판정에 쓰지 않는다**(기록 분류용).
- 함수 기본값: 탐구 설계 액션 → `inquiry-design`(아카데미 체험이면 `academy`) · 아카데미 함수들 → `academy` · `interview-prep` · `inquiry-comprehensive` → `inquiry-design` · 작업 큐 → 작업의 `surface` · `world-news-fields` → `world-today`.
- 화면의 기능 이름 = `aiLogCatalog.featureLabel` — 직접 정한 몇 개 → 메뉴 목록(`MANAGED_MENU_BY_KEY`) → 키 그대로.

## 쓰는 쪽 — `supabase/functions/_shared/aiCallLog.ts`

- `aiLogFetch(ctx)` — `fetch` 대신 쓴다. 공급자 주소만 기록하고 나머지는 통과. 응답은 그대로 돌려주고 **복제본**을 읽어 판정한다.
- `logAiRequestFailure(ctx, error)` — 핸들러 바깥 catch. `withAiFailureLog(ctx, response)` — 던지지 않고 5xx 로 돌려준 실패(4xx 는 안 남긴다 — 로그인 만료·형식 오류·일일 한도는 AI 장애가 아니다).
- 쓰기 = 서비스 롤로 PostgREST 에 바로 INSERT, `EdgeRuntime.waitUntil` 로 응답 뒤에 마친다. **절대 던지지 않는다** — 기록하려다 원래 요청이 실패하면 안 된다.
- 판정은 Deno 를 쓰지 않는 `aiCallLogCore.ts` 에 있어 Node 회귀가 그대로 부른다.
- 이미 `aiFetch: typeof fetch = fetch` 를 받던 핸들러(아카데미 4종·면접 준비·`generateStage`)는 그 자리에 넘겼고, 종합 분석은 `providers`·`embedding-service`·`hygiene-verifier`·`recommend`·`analyze-directions` 에 `request` 인자를 이었다.
- **기록하지 않는 곳**: `generate-embedding`·`academy-sky-embed`(부르는 화면이 없다 — 회귀의 허용 목록).

## 표·RPC (마이그레이션 `20261015150000_ai_call_log.sql`)

- `ai_call_log` — RLS 켜고 **정책 없음** + `anon`·`authenticated` 권한 회수. 쓰기 = 서비스 롤, 읽기 = 관리자 RPC 둘.
  교사에게도 열지 않는다(`ai_error_log` 는 교사 읽기였다) — 누가 어느 학생으로 무엇을 돌렸는지가 담긴다.
- `admin_ai_log_summary(p_since)` — 기능별: 호출 · 성공 · 실패/빈/잘림 · 요청 실패 · 화면 오류 · 사람 수 · 성공 호출의 응답 시간 p50/p90 · 토큰 · 마지막 문제.
- `admin_ai_log_feed(p_feature, p_since, p_problems_only, p_limit ≤ 500, p_before)` — 두 표를 합친 최신순 목록, 사용자 이름·역할 붙임. `p_before` = 이어 받기 커서.
- 두 RPC 모두 `auth.uid() is null or not is_admin()` 이면 42501(익명 NULL 구멍 — CLAUDE.md Gotchas).
- 보관 90일 — pg_cron `ai-log-purge`(매일 04:40 KST)가 `purge_ai_call_log(90)` + `purge_ai_error_log(90)`.

## 화면 — `src/components/admin/AiLogManagement.tsx`

기간(24시간·7일·30일·90일) → 요약 넷(호출 · 문제 호출 · 요청 실패 · 화면 오류) → 기능별 표(행을 누르면 아래 목록이 그 기능으로) → 기록 목록(기본 **문제만** — 성공까지 보면 실패가 묻힌다, 줄을 누르면 함수·화면·모델·HTTP·종료 사유·학생). 규칙은 `aiLogCatalog.ts`.
호출 0건인 기능의 오류율은 «0%»가 아니라 «—»(셀 것이 없다).

## 회귀

- `npx tsx --tsconfig tsconfig.app.json scripts/ai-log-test/run.mts` — 판정·기능 이름·화면 규칙 + **배선**(공급자로 가는 맨 `fetch` 가 남아 있지 않은지, 꼬리표를 떼는지, 표에 본문 칸·사용자 정책이 없는지, RPC 관리자 가드).
  ⚠️ 새 엣지 함수가 공급자를 부르면 이 검사가 잡는다 — `aiLogFetch` 를 거치게 할 것(허용 목록에 넣지 말고).
- `node scripts/ai-log-test/run-browser.mjs` — 하네스(`/scripts/ai-log-test/harness.html`, 모의 RPC)로 1280·390 스크린샷 + 거르기·넘침.

## 배포 순서

순서는 상관없다. 마이그레이션 없이 함수가 먼저 나가면 INSERT 가 404 로 실패하고 콘솔 경고만 남는다(요청은 정상). 함수 없이 화면이 먼저 나가면 `ai_error_log` 만 보인다.
⚠️ CLI 로 배포할 함수 중 `supabase/config.toml` 에 선언이 없는 것은 운영 `verify_jwt` 를 먼저 확인할 것(선언이 없으면 true 로 되돌아간다).
