# 에이전트(MCP) 연결 — 시험판 (2026-10-18)

허용된 교직원이 **자기 에이전트**(Claude 웹·데스크톱·Claude Code 등)를 SPACEKIJUN 에 MCP 로 연결해
일정을 읽고 개인일정을 넣는다. 시험판 도구는 둘이었다 — `list_schedules`(일정 조회) · `create_personal_schedule`(개인일정 추가).
2026-10-24 에 **허용 쌍 통합**(읽기/쓰기로 나뉜 허용을 기능마다 하나로 — 36 → 28, 아래 «허용 쌍 통합» 표가 옛 이름 → 지금 이름)과 **교사 기본 허용**(모든 교사가 기본으로 받는다 — 급식지도·자습 감독 배정만 사람별)과 **서류함·공지·결재·서명·코드 공유·나이스 안내**가(아래 «교사 기본 허용 …» 절), 2026-10-23 에 **시간표·스케줄 부가 기능**(메모·수업 교체·회의 시간·일정 설문·급식지도·자습 감독 — 아래 «시간표·스케줄 부가 기능» 절)이, 2026-10-19 에 **담임 반 명단·시간표**(`homeroom.read`)·**업무**(`task.read`·`task.write`)·**구매 신청**(`purchase.read`·`purchase.write`·`purchase.page`)·**일정 만들기·고치기**(`schedule.manage` — 연수·업무·출장·학사일정)가 더해졌다 — 아래 네 절.

## 왜 이 구조인가

검토한 대안 = [mcp-anywhere](https://github.com/locomotive-agency/mcp-anywhere)(MCP 서버를 Docker 로 띄워 한 주소로 모으는 게이트웨이).
**기각** — ①컨테이너에 주는 비밀값이 서버 단위 하나라 사용자 개인의 신원이 전달되지 않는다 → `service_role` 하나로
모두가 같은 슈퍼유저가 되어 RLS·`created_by` 가 사라진다 ②접근 제한이 이메일 도메인 하나뿐(`myschool.hs.kr` = 학생 포함)
③베타(v0.8)·Docker·Anthropic API 키 필요. spacekijun 도구는 어차피 직접 만들어야 했다.

채택 = **Supabase Auth 의 OAuth 2.1 서버**. 에이전트가 받는 토큰은 **그 사용자 본인의 JWT** 이고 `client_id` 클레임이
붙는다(일반 로그인 세션에는 없다). 그래서 기존 RLS·트리거·가드가 그대로 적용되고, `client_id` 로 «에이전트가 보낸 요청»을
DB 입구에서 가를 수 있다.

```
에이전트 ──POST /functions/v1/mcp──▶ 엣지 함수 mcp ──(사용자 토큰 그대로)──▶ PostgREST /rpc/mcp_* ──▶ RLS
   │  401 + WWW-Authenticate(resource_metadata)
   └─▶ /functions/v1/mcp/.well-known/oauth-protected-resource → 인가 서버 <project>/auth/v1
        → 사용자: SPACEKIJUN /oauth/consent 에서 로그인·[승인] → 에이전트가 토큰 받음
```

## 세 겹

| 층 | 무엇을 | 어디 |
|---|---|---|
| ① 도구 허용 | 누가 어떤 도구를 (읽기만/쓰기까지) | 표 `mcp_tool_grant`(사람 × 도구, 쓰기 = 관리자) · Admin «에이전트(MCP)» 탭 · 각 RPC 가 `mcp_private.require_tool()` 로 스스로 확인 |
| ② DB 입구 | 에이전트 토큰이 닿을 수 있는 곳 = `/rpc/mcp_*` 뿐 | `account_link_pre_request` 의 MCP 분기(hint `MCP_TOOLS_ONLY`) + Storage·Realtime RESTRICTIVE 정책 + 세션 발급 함수 2종의 거부 |
| ③ RLS | 그 도구 안에서 어느 행까지 | 기존 그대로(RPC 가 SECURITY INVOKER) |

**①만으로는 안 된다** — 토큰은 에이전트 쪽이 들고 있는 보통의 Supabase 토큰이라, MCP 서버를 거치지 않고 `/rest/v1/` 에
직접 보내면 웹에서 그 사람이 볼 수 있는 모든 표에 닿는다(프롬프트 주입·토큰 유출). ②가 그 구멍을 막는다.

**관리자 설정은 줄이는 방향으로만 작동한다** — 웹에서 못 하는 일은 켜도 못 한다(③).

## 구성 요소

| 파일 | 역할 |
|---|---|
| `supabase/migrations/20261018100000_mcp_agent_access.sql` | 허용 표 · `mcp_private.require_tool` · RPC 3종 · 훅 분기 · RESTRICTIVE 정책 2개 |
| `supabase/functions/mcp/handler.js` (+`index.ts`) | MCP 서버 — Streamable HTTP **상태 없음**(POST 하나 = JSON 하나, 세션 id·SSE 없음), `verify_jwt=false`(401 + `WWW-Authenticate` 를 함수가 내야 발견이 시작된다) |
| `supabase/functions/_shared/agentToken.js` | `client_id` 판정 단일 출처(mcp · desktop-session · classroom-link) |
| `src/pages/OAuthConsent.tsx` | `/oauth/consent` — 승인·거절, `authorization_id` 없이 열면 «연결된 에이전트» 목록·[연결 해제] |
| `src/services/oauthConsentService.ts` | GoTrue 동의 엔드포인트 직접 호출(설치된 supabase-js 2.53 에 `auth.oauth.*` 가 없다 — 경로는 auth-js 2.118 과 같다) |
| `src/components/admin/McpAgentManagement.tsx` | 관리자 탭 — 사람 × 도구 체크, 서버 주소·연결 방법, OAuth 서버 꺼짐 경고 |
| `src/lib/mcpTools.ts` | 도구 허용 카탈로그(화면용) |

RPC: `mcp_my_tools()` · `mcp_list_schedules(p_from, p_to)`(한국 날짜·양끝 포함·최대 62일·300건) ·
`mcp_create_personal_schedule(p_title, p_date, p_start_time?, p_end_time?, p_description?)` — 시각 없음 = 하루 종일
(00:00~23:59:59), 시작만 = 1시간(23시 이후는 그날 끝까지). 저장 모양은 웹 일정 추가와 같고 `meta.via = {channel:'mcp', client_id, at}` 로 경로를 남긴다.

## 일정 만들기·고치기 (2026-10-19) — `schedule.manage`

사용자 요청: «연수 일정 같은 것도 참석자를 선택해서», «다른 종류의 일정들도 다룰 수 있도록». 개인일정(`schedule.write`)과 따로 둔 허용이다 — 남에게 보이고 알림이 간다.

| 도구 | 하는 일 |
|---|---|
| `find_staff` | 재직 교직원 — 이름 일부·부서(이번 학년도)·태그(«1학년 담임»·«부장»·«2학년 3반»)로. 이름·교사/직원·부서·태그만 |
| `create_schedule` | `training` 연수 · `duty` 업무 · `event` 출장 · `schedule` 학사일정. 시각 비우면 하루 종일, `end_date` 로 여러 날(31일까지) |
| `update_schedule` | **내가 만든** 일정 — 보낸 것만(제목·날짜+시각 묶음·설명·참석자 명단 전체) |
| `delete_schedule` | **내가 만든** 일정 — 참석 서명이 있는 연수는 거부 |

- 저장 모양 = 웹 일정 추가 창과 같다: `meta.assignee = {"이름": {"name"}}`, 연수는 `{"name", "signature": 0}`(서명 동기화 트리거가 이 칸을 쓴다). **참석자는 이름 키**라(SELECT 정책·알림 트리거·`user_can_access_meeting` 이 이름으로 판정) 이름은 재직 교직원 **정확히 한 명**과 일치해야 한다 — «선생님»·«쌤» 꼬리만 떼고 추정하지 않는다(`mcp_private.sch_people`, 못 찾으면 전부 거부 + 이름을 말한다, hint `MCP_UNKNOWN_PERSON`). 2026-10-19 실측 재직 교직원 69명 동명이인 0.
- 보이는 범위(기존 SELECT 정책): 연수·업무 = 만든 사람 + 참석자, 출장 = 교직원 전체, 학사일정 = 모두. 그래서 연수·업무는 참석자 1명 이상을 요구한다.
- 알림 = 기존 AFTER INSERT 트리거 `create_meeting_notification` — **연수·업무만, 교사 참석자에게만**(직원은 안 받는다 — 웹과 같은 기존 동작). 결과의 `notified` 가 그 수. **고치기·지우기는 알림이 없다**(웹도 없다) — 결과 `note` 가 «새로 넣은 참석자 N명에게 알림이 가지 않았다»고 말한다.
- 출장의 «수업이 겹치는 동행자 알림»은 웹 클라이언트(`notifyAbsenceParticipants`)가 보내는 것이라 이 경로에는 없다 — `note` 가 웹 «수업 처리»로 안내한다.
- **고치기·지우기 = `created_by = 나` 만**(`sch_lock_mine`, `for update`). RLS(`user_can_access_meeting`)는 학사일정·출장을 누구나, 업무·연수를 참석자도 고치게 열어 두지만 웹은 `canModify`(만든 사람)로 막는다 — 웹과 같게 좁혔다. 서류제출은 다루지 않는다(첨부 파일 정리가 웹에 있다).
- 연수 참석자 고치기: 남는 사람의 칸(서명 표시)은 그대로, **이미 서명한 사람은 뺄 수 없다**(`training_signature` 가 이름으로 남는다).
- 모든 쓰기는 `mcp_call_log` + `meta.via`(만들기)·`meta.via_updated`(고치기).
- 드라이런 = `scripts/mcp-agent-test/schedule-dryrun.sql`(25건 — 참석자 시점 열람·알림 수(교사 2·직원 0)·서명 보호·남의 일정 거부).

## 담임 반 도구 (2026-10-19) — `homeroom.read`

사용자 결정: **학생은 번호로만**, 범위는 **명단과 시간표부터**.

| 도구 | RPC | 돌려주는 것 |
|---|---|---|
| `homeroom_roster` | `mcp_homeroom_roster()` | 지금 학기 내 반 재학생 번호 목록 |
| `homeroom_timetable` | `mcp_homeroom_timetable(p_date?, p_day?, p_number?)` | 반 전체 = 교시마다 `{과목, 선생님, count, numbers}`(전원이면 `whole_class`) · 번호를 주면 그 학생 하나 · 날짜를 주면 그날 학사일정 `calendar`(`no_class` = 공휴일·휴업일이고 우리 학년 대상, 토요휴업일 제외) |

- **다른 반을 막는 것은 «필터»가 아니라 «입력 모양»이다** — 도구가 학년·반·학생 id 를 받지 않는다. 반은 서버가 내 담임 태그에서 정하고(태그 쓰기 = 관리자), 학생은 «그 반의 N번»으로만 가리킨다. 에이전트가 반을 넘겨도 쓰일 자리가 없다(회귀 `handler.mts` 가 확인).
- 담임 태그가 없으면 `MCP_NO_HOMEROOM`, 둘 이상이면 `MCP_HOMEROOM_AMBIGUOUS`(2026-10-19 실측: 담임 27명, 겹침 0건). 태그를 떼면 다음 호출부터 막힌다(매번 읽는다).
- 이름·학적 코드·리소스 id 를 돌려주지 않는다(`student_timetable.student_name` 을 읽지 않는다 — 회귀가 정적으로 검사).
- 시간표 = `student_timetable`(지금 학기) — 요일 패턴이라 교체·보강·시험은 모른다. 응답의 `note` 가 그렇게 말한다.
- 호출마다 `mcp_call_log` 에 한 줄(누가·어느 반·몇 번·날짜). Admin «에이전트(MCP)» 탭 아래 «최근 호출 기록».
- ⚠️ 번호만이어도 **학생 정보가 외부 AI 로 나간다**(선택과목 조합은 소수 반에서 개인을 가린다). 켜기 전에 학교·교육청 기준과 처리방침을 확인할 것 — 관리자 탭 안내문이 그렇게 말한다.

## 업무 도구 (2026-10-19) — `task.read` · `task.write`

업무 시스템은 Work > Task > Action 이고 할 일의 완료 방식이 셋(`single` 마감 하나 · `rounds` 여러 회차 · `units` 과제 단위)이라,
**웹의 판정·쓰기를 다시 만들지 않고 그대로 부른다**.

| 도구 | 허용 | 하는 일 |
|---|---|---|
| `list_my_tasks` | read | 내가 담당자인 할 일(보이는 날이 된 것, 취소된 업무 제외) — 내 상태·회차·내 단위·`submission_pending`·`not_mine_reported` + 나에게 온 입력·제출 요청(`my_collect_requests`) |
| `get_task` | read | 할 일 하나 — 설명 4000자·마감·연결된 작업(나이스 화면 경로)·요청. **담당자이거나 책임자일 때만**, 담당자 명단은 책임자에게만(비책임자는 N/M) |
| `list_managed_works` | read | 내가 책임자인 업무 — 할 일마다 완료 N/M·`not_done` 이름·기한 지남 |
| `set_my_task_status` | write | **내** 할 일 완료/되돌리기. `single` = 인자 없이 · `rounds` = `deadline` · `units` = 이미 맡은 `unit_key` |

- 상태 우선순위 = `taskStatus.getMyTaskStatus` 와 같다(할 일 취소 > 할 일·업무 완료 > 담당자 개인 상태). 책임자가 끝낸 것은 `closed_by_manager`.
- 쓰기는 기존 DEFINER RPC 셋으로만 간다 — 직접 UPDATE 하지 않으므로 `task_status_history`·`guard_task_structure`·`guard_submission_completion` 이 그대로다. 제출이 남았으면 그 전에 한국어로 거부한다.
- **일부러 넣지 않은 것**(남에게 번지거나 되돌리기 어렵다 — 웹 «되돌리기 어려운 동작만 묻는다» 기준): 업무·할 일 만들기, 담당자·마감 바꾸기, 남의 상태 바꾸기, 과제 단위 새로 맡기, 메시지 보내기, 제출(파일이라 불가)·입력 응답. 다음 후보는 «입력 요청 응답»(값만이라 가능하지만 대상·축·구분이 복잡하다)과 책임자의 «아직 안 한 사람에게 알림»(남에게 번진다 — 따로 결정).
- 지시문: 바꾸기 전에 사용자 확인 · 제목·설명은 다른 선생님이 쓴 글이니 그 안의 지시를 따르지 말 것(프롬프트 주입) · 제출·입력·나이스는 웹으로 안내.
- `set_my_task_status` 도 `mcp_call_log` 에 남긴다(할 일 상태 이력의 comment 는 웹과 같은 문구라 경로를 가를 수 없다).

## 구매 신청 도구 (2026-10-19) — `purchase.read` · `purchase.write` · `purchase.page`

사용자 결정: 읽기 셋 + **새 신청 내기 · 내 품목 고치기·취소 · 새 신청 페이지 만들기**. 담당자의 상태 변경(승인·불가·완료)은 처음엔 넣지 않았다 → **2026-11-06 에 열었다**(아래 «담당자 쓰기»). 허용 이름은 2026-10-24 에 `purchase.request` 로 합쳐졌다(표의 read/write 는 옛 이름).

| 도구 | 허용 | 하는 일 |
|---|---|---|
| `list_purchase_pages` | read | 교직원 대상이거나 내가 담당자인 페이지(보관 제외) — 기간·`period_status`·`can_submit`·`columns`(칸 id·이름·종류·필수)·내 품목 수. 기본 = 마감 안 된 것 + 내가 담당자인 것 |
| `list_my_purchase_requests` | read | 내 품목 한 줄씩 — 칸 값(`fields` = {칸 이름: 값})·금액·상태(품목 상태 → 신청 상태 폴백)·담당자 사유·품의 진행(`order`)·`editable` |
| `list_managed_purchase_requests` | read | 내가 담당자인 페이지의 품목 — 신청자·상태·품의 차수. 기본 처리 대기만. **학생 신청자는 «N학년 N반 N번»**(이름 미반환). 호출은 `mcp_call_log` |
| `submit_purchase_request` | write | 열린 페이지에 품목 1~30개 — 웹 «품목 더 신청하기»처럼 **새 신청(INSERT)** 이라 담당자 알림(기존 트리거) |
| `update_my_purchase_item` | write | 내 품목 하나 — 보낸 칸만 바꾸고 **행 id 유지**(품목 상태·품의 연결이 이 id 에 묶인다) |
| `cancel_my_purchase_item` | write | 내 품목 하나 지우기 — 남은 품목이 없으면 신청 삭제(웹 `planRemoveRow`) |
| `create_purchase_page` | page | 새 페이지(대상·기간·칸) — 만든 사람이 담당자. 칸을 비우면 웹 기본 6칸, `kind` 가 웹 기본 칸 id(`default-*`)가 된다 |

- **⚠️ `purchase_requests` INSERT 정책은 «본인 resource» 만 본다** — 신청 기간·대상·보관은 지금까지 웹 화면만 막았다. 그래서 RPC 가 `mcp_private.pr_require_open` 으로 직접 확인한다(교직원 = `'teacher'` 대상, 웹 `myRoleKey` 와 같다). 같은 이유로 에이전트 토큰의 표 직접 쓰기는 훅이 막는다(`live.mts`).
- 칸 값 규칙은 웹과 같다: 칸 이름 또는 id 로 받고, 숫자 칸은 0 이상 숫자(`1,200` 허용), 링크 칸 `https://` 보정, 필수 칸 검사, 없는 칸 = `''`, **모르는 칸 이름은 거부**(조용히 버리면 값이 사라진다).
- 고치기·취소는 **처리 대기(제출됨·검토중) · 신청 기간 안 · 품의에 안 담긴** 내 품목만(웹보다 좁다 — 웹은 처리된 품목도 고친다). `for update` 로 신청 행을 잠가 JSONB read-modify-write 경합을 막는다.
- 신청 `meta.via = {channel:'mcp', client_id, at}` 로 경로를 남긴다(`meta` 의 `itemStatus` 외 키는 가드가 건드리지 않는다).
- 넣지 않은 것: 공문, 공동 작업자 지정(남을 담당자로 넣는다), 페이지 수정·보관(→ 2026-11-04 `update_purchase_page`). **상태 변경·품의 정리는 2026-11-06 에 열었다**(아래 «담당자 쓰기»).
- 드라이런 = `scripts/mcp-agent-test/purchase-dryrun.sql`(26건 — 앞에 `begin;` 을 붙여 돌린다, 끝의 예외로 전부 되돌림).

### 담당자 쓰기 — 상태 변경 + 품의 정리 (2026-11-06, 사용자 결정) — `purchase.request` 에 붙임

담당자가 승인·불가·품의 차수 처리를 웹 화면 조작으로 우회하던 것을 도구로 연다. 사용자 결정 둘: ①범위 = 상태 변경 + 품의 차수 전체(만들기·품목·연결·상태) ②허용 = **새 허용 없이 기존 `purchase.request`**(교사 기본 켜짐 — 페이지 담당자인 교사의 에이전트는 별도 설정 없이 쓸 수 있다. 막고 싶으면 관리 화면에서 그 사람의 `purchase.request` 를 해제하되, 신청 내기도 함께 막힌다). 두 CHECK·시드는 그대로. 마이그레이션 `20261106140000_mcp_purchase_manager_tools.sql`.

| 도구 | 하는 일 |
|---|---|
| `set_purchase_item_status` | 품목 단위 상태(제출됨·검토중·승인·완료·불가) + 사유. `row_ids` 비움 = 신청건 전체. **`check_only` 미리보기**(품목별 before/after·`in_order`) |
| `list_purchase_orders` | 차수 → 품의 품목(품명·규격·단가·수량·금액·구매처·예산 과목·사용자 열 값) → 묶인 신청 품목, + 어느 차수에도 안 담긴 신청 품목(불가 제외, 최대 100) |
| `create_purchase_order_batch` | 새 차수 — 제목 비움 = «N차 품의»(N = max(제목의 «N차», 차수 수)+1), 열은 직전 차수에서 이어받는다(웹 `useAddToBatch` 와 같다) |
| `update_purchase_order_batch` · `delete_purchase_order_batch` | 이름·메모 / **작성 중(draft)만** 지우기(웹보다 좁게) |
| `save_purchase_order_line` | 품의 품목 만들기(`batch_id`)·고치기(`line_id`, 보낸 칸만 · 글 칸 `""`, 단가·수량은 `clear`) + `link`/`unlink` 로 신청 품목 묶기·빼기 |
| `delete_purchase_order_lines` | 품의 품목 지우기(100개까지) — 묶였던 신청 품목은 «아직 안 담긴» 쪽으로 |
| `set_purchase_order_status` | 차수 상태. **`check_only` 가 바뀔 신청 품목 명단**을 준다 |

- **쓰기는 웹과 같은 길 하나씩** — 품목 상태 = `set_purchase_request_item_status`, 차수 상태 = `set_purchase_order_batch_status`(연결 품목 순방향 연동), 차수·품목·연결 = 표 직접 쓰기(RPC 는 INVOKER 라 RLS `manager_all` 이 담당자만 통과). **⚠️ 품목 상태를 `purchase_requests` 에 직접 UPDATE 하지 말 것** — 파생 규칙(`purchase_derive_request_status`)이 DB·`utils/itemStatus.ts` 두 벌이라 길이 둘이면 화면마다 답이 갈린다(회귀가 막는다).
- 담당자 판정 = `mcp_private.pr_require_manager`(= `is_purchase_page_manager` 한 곳). 담당자·신청자 id 를 인자로 받지 않는다.
- **같은 물품끼리 묶기(웹 `planAddToBatch`)는 SQL 로 옮기지 않았다**(로직 두 벌 방지) — 에이전트가 묶어 `save_purchase_order_line(link)` 로 넣고, **수량·단가도 자동으로 더하지 않으니** 신청 품목의 개수·가격(`fields`)을 보고 직접 넣는다. 사용자 열(`batches.columns`·`lines.extra`)은 웹에서 — 읽기에만 이름으로 보인다.
- **신청자에게 알림은 가지 않는다**(웹과 같다 — 알림은 새 신청 INSERT 트리거뿐). 서버 안내(`instructions`)가 «바꾸기 전에 항상 check_only 로 미리 보고 사용자에게 확인받는다 · 불가에는 사유»를 에이전트에게 말한다.
- 연결은 `(request_id,row_id)` 유일 — 이미 다른 품의 품목에 있으면 이쪽으로 옮겨 온다(결과 `moved_from_other_lines`). 같은 페이지의 지워지지 않은 행만(남의 페이지·고아 거부, 실패하면 그 호출 전체가 되돌려진다). 이미 품의 완료·구매 완료인 차수에 묶어도 품목 상태는 자동으로 안 바뀐다(결과 `note` 가 알린다). 차수를 작성 중으로 되돌려도 품목 상태는 안 돌아온다(웹과 같다).
- `list_purchase_orders` 는 호출 기록만 남기는 읽기(`LOG_ONLY_READS`)다. 학생 신청자는 «N학년 N반 N번».
- 드라이런 = `scripts/mcp-agent-test/purchase-manager-dryrun.sql`(39건 — 새 마이그레이션 파일만 앞에 붙여 돌린다, 끝의 예외로 전부 되돌림). 2026-11-06 운영 DB 에서 39/39 통과(롤백 드라이런), 롤백 후 흔적 0 확인. **⚠️ 실제 적용(마이그레이션 + `mcp` 배포)은 2026-11-09 에야 했다** — 그 전까지 운영에는 이 도구들이 없었다(`MIGRATION_EXECUTION_ORDER.md`).
- 되돌리기: RPC 8종(`mcp_set_purchase_item_status`·`mcp_list_purchase_orders`·`mcp_create/update/delete_purchase_order_batch`·`mcp_save_purchase_order_line`·`mcp_delete_purchase_order_lines`·`mcp_set_purchase_order_status`)과 `mcp_private.pr_require_manager`·`pr_short_text` 를 지운다. `mcp_list_managed_purchase_requests` 는 안내 문구(`note`)만 바꿔 다시 정의했다.

### 담당자 세부 수정 — 품목 칸 수정 · 수정 이력 · 신청 삭제 (2026-11-09, 사용자 결정) — `purchase.request` 에 붙임

웹 담당자 화면에 있고 MCP 에는 없던 세 가지를 더한다(허용은 그대로 `purchase.request` — 두 CHECK·시드 변경 없음). 마이그레이션 `20261109110000_mcp_purchase_manager_edit.sql`. 사용자가 고른 범위 = 칸 수정 + 이력·삭제. **넣지 않은 것**: 신청자의 처리된 품목 수정 허용(신청자 쪽은 지금처럼 «처리 대기 · 기간 안 · 품의 미포함» 만), 페이지의 칸·대상·공동 작업자 수정(웹에서 — 이미 들어온 신청과 어긋난다).

| 도구 | 하는 일 |
|---|---|
| `update_purchase_item_cells` | 담당자가 남의 신청 품목의 칸(물품명·개별 가격·개수·구매처 …)을 고친다. `edits=[{row_id, cells}]` 한 신청 안 50개까지를 **한 번의 read-modify-write**(웹의 일괄 물품명 통일과 같다) · 보낸 칸만 바뀌고 `""` = 지우기 · **`check_only`** 가 칸별 before/after 와 `in_order` 를 준다 |
| `list_purchase_request_history` | 신청 하나의 수정 이력 — 최근 변경부터 20건, 바뀐 품목마다 `cells`(칸 before/after) · `status`·`reason` 변경 · `added`/`removed`. 담당자 또는 신청자 본인(RLS) |
| `delete_purchase_request` | 신청을 통째로 지운다. **품의 품목에 묶인 품목이 하나라도 있으면 거부**(웹보다 좁게). **`check_only`** 가 지워질 품목과 `can_delete` 를 준다 |

- **칸 수정은 웹과 같은 길 하나** — `purchase_requests.items` 직접 UPDATE(웹 `useUpdatePurchaseRequestItemCell`). RLS `update_own_or_manager` 가 담당자를 통과시키고 `aa_guard_purchase_request_status` 는 status·`meta.itemStatus` 만 되돌리므로 items 는 통과한다. 칸 값 규칙은 신청자 쪽 도구와 같은 `mcp_private.pr_build_cells`(숫자 칸·링크 `https://` 보정·필수 칸·**모르는 칸 이름 거부**), 신청 행을 `for update` 로 잠근다. **상태·사유는 건드리지 않는다**(품목 상태는 여전히 `set_purchase_item_status` 한 길). 신청 기간·품목 상태와 상관없이 고칠 수 있다(웹과 같다).
- **품의 쪽 값은 자동으로 안 바뀐다** — 이미 품의 품목에 묶인 품목을 고치면 품의 품목의 이름·단가·수량은 그대로다. 미리보기가 `in_order` 로 알리고 `save_purchase_order_line` 으로 따로 고치게 한다.
- **이력은 «변경 전 모양»만 쌓인다**(`record_purchase_request_history` 트리거 — `items`·`status`·`meta` 변경 시 OLD 스냅샷, `snapshot_at` = 그 모양이 마지막으로 저장된 시각 = OLD `updated_at`). 그래서 도구는 현재 ↔ 직전 스냅샷, 스냅샷 ↔ 그 이전 스냅샷을 차례로 맞대어 차이를 만든다(`mcp_private.pr_history_diff`). **누가 바꿨는지는 기록되지 않는다.** 값이 하나도 없는 빈 줄이 생기고 사라진 것은 품목이 아니라 뺀다. ⚠️ `snapshot_at` 이 트리거의 `now()` 라 **한 트랜잭션 안의 변경은 순서가 같아진다** — 호출마다 트랜잭션이 다른 실사용에는 문제없고, 드라이런은 동작마다 이력을 한 시간씩 밀어 순서를 만든다.
- **신청 삭제는 이력도 함께 지운다**(`purchase_request_history.request_id` 가 `on delete cascade` — 운영 DB 로 확인). 품의 연결(`purchase_order_line_items`)도 cascade 라 **조용히 사라지지 않게 묶인 품목이 있으면 거부**한다 — 먼저 `save_purchase_order_line` 의 `unlink` 로 뺀다. 서버 안내가 «불가 처리로 충분하지 않은지 먼저 묻는다» 를 에이전트에게 말한다.
- 담당자 판정 = `mcp_private.pr_require_manager`(칸 수정·삭제), 이력은 RLS 만(담당자·신청자 본인). 호출은 모두 `mcp_call_log`(`list_purchase_request_history` 는 기록만 남기는 읽기 — 회귀 `LOG_ONLY_READS`). 신청자에게 알림은 가지 않는다.
- 드라이런 = `scripts/mcp-agent-test/purchase-manager-edit-dryrun.sql`(새 마이그레이션 파일만 앞에 붙여 돌린다, 끝의 예외로 전부 되돌림). 회귀 `run.mts` ②-3 에 «담당자 세부 수정» 불변식(INVOKER·VOLATILE·담당자 판정·`for update`·`pr_build_cells`·삭제 거부 조건).
- 되돌리기: RPC 3종(`mcp_update_purchase_item_cells`·`mcp_list_purchase_request_history`·`mcp_delete_purchase_request`)과 `mcp_private.pr_history_diff` 를 지운다.

## 문서 생성 방식 만들기 (2026-10-20) — `docgen.create`

에이전트에게 한글 양식(.hwpx)을 주면 문서 생성 «생성 방식»(웹 `/document-generation` 목록의 카드)을 만든다.
저장 모양은 웹(`DocGenCreateDialog` → `createDocGenAction` · `createSpecTemplate` · 기본 양식 고정)과 같다 —
양식 = `task_action_document_template` v1(경로 `<uid>/templates/<id>/template.hwpx`, `spec`), 생성 방식 = `task_action`
(`task_id` null · `document.spec_fill` · `config {origin:'docgen', defaultTemplate, visibility}`). 기본은 나만 보임.

| 도구 | 하는 일 |
|---|---|
| `start_template_upload` | 1회용 올리기 주소(15분·한 번) + curl 명령 |
| (셸) `curl -X PUT --data-binary @양식.hwpx <주소>` | 엣지 함수 `mcp-upload` 가 저장소에 넣고 섹션 XML 을 기록 |
| `read_template_upload` | 문서 지도(표 밖 문단 · 표 T번호·셀 주소·병합 · 누름틀 · 메모) + 자리 쓰는 법 |
| `create_document_generation` | 에이전트가 고른 자리로 스펙 조립 → **시험 채움** → 저장. `check_only:true` = 검사만 |

**사용자 결정 2026-10-20** — ①파일은 **1회용 올리기 주소**로(도구 인자로는 파일을 못 넘긴다 — 모델이 바이트를 글자로
옮겨 적어야 한다). 그래서 **셸이 있는 에이전트**(Claude Code 등)만 쓴다. ②채울 자리와 이름표는 **사용자의 에이전트가**
대화 맥락으로 고른다 — 서버 자동 탐지(`detectSpecDraft`)·«AI 라벨 보완»을 쓰지 않는다.

- **`mcp-upload` 만 service_role 을 쓴다** — curl 은 사용자 토큰이 없다. 쓰는 곳은 티켓이 정한 경로 하나뿐이고 사람·경로는
  DB(`docgen_upload_claim`)가 정한다. 티켓 원문은 저장하지 않는다(sha256). `mcp` 서버는 여전히 service_role 을 안 쓴다.
  올리기 함수 몫 RPC 4종(`docgen_upload_*`)은 service_role 전용이고 이름이 `mcp_` 가 아니라 에이전트 토큰은 훅에서도 막힌다.
- **검사 엔진 = 웹 엔진 그대로** — `src/features/document-generation/mcp/agentSpec.ts` 와 웹 문서 엔진을 esbuild 로 묶어
  `_shared/docgenAgentSpec.bundle.js` 에 둔다(`npx tsx scripts/mcp-docgen/build-bundle.mts`). ⚠️ 엔진(`document/spec/*`)이나
  `agentSpec.ts` 를 고치면 **다시 묶고 `mcp` 를 배포**할 것 — 안 하면 웹과 다른 규칙으로 자리를 검사한다(회귀가 묶음 = 원본을 본다).
- **시험 채움**: 칸 모양만 맞춘 견본 계획으로 `fillDocument` 를 실제로 돌려 못 찾은 자리(stale)·식 오류·겹친 편집을 거부한다.
  이게 없으면 잘못 짚은 자리가 오류 없이 저장되고 문서를 만들 때에야 «그 칸이 비었다»로 드러난다.

⚠️ 조용히 틀리는 자리 —
- **지도의 원문은 공백을 줄이지 않는다** — 에이전트가 앵커로 옮겨 적는다. `(     )학급` 을 `( )학급` 으로 보이면 엔진이 못 찾는다(실측).
- **표 번호 = 지도의 «문서 전체» T번호, 저장 = 섹션 + 섹션 안 순번** — `findTable` 은 `section` 이 있으면 그 섹션 안에서만 센다.
  전체 번호에 섹션을 붙여 저장하면 섹션 1 이후 표를 전부 못 찾는다(form2 에서 41자리 실측). 표 안에 든 표도 자기 T번호로 가리킨다.
- **지문(fingerprint)은 서버가 채운다** — 사람이 옮겨 적으면 한 글자만 달라도 다른 표로 재바인딩된다.
- 엣지 CPU 한도(2초) — 시험 채움은 form1 30ms·form2 25ms(220KB 양식 지도 13ms). 아주 큰 양식에서 넘으면 지도를 나눠 읽게 돼 있지만 채움은 나누지 않는다.

## 생성 방식으로 문서 만들기 (2026-10-20) — `docgen.fill`

위의 반대 방향 — 이미 있는 생성 방식(스펙)의 칸을 에이전트가 채워 **한글 파일**을 만들고 **DB 에도 올린다**.
저장 모양 = 웹 러너(`SpecFillActionRunner.execute` + `saveDocument`): 실행 기록(`start/finalize_task_action_run`,
산출물 `generated-hwpx`, 검수 대기) — 웹 «이력»에 선다 + 완성 문서(`task_action_document` v1, 값) — 웹 «완성 문서»에서 다시 연다.

| 도구 | 하는 일 |
|---|---|
| `list_document_generations` | 내 것 + 공개된 생성 방식(웹 목록과 같은 범위 — `task_action` SELECT RLS) |
| `get_document_generation` | 채울 칸(계획 스키마)과 계획 견본 |
| `create_document` | 값 검사 → 웹 엔진으로 채움·검증 → 실행 기록 + 완성 문서 + 한글 파일 + 15분 받기 주소. `check_only` = 검사만 |

**사용자 결정 2026-10-20** — ①양식 읽기·완성 파일 쓰기는 **전용 함수 `mcp-docgen` 만 service_role**(에이전트 토큰은 저장소가 막혀 있다).
읽을 양식은 `mcp_docgen_target`(사용자 토큰 — 그 사람이 볼 수 있는 생성 방식의 기본 양식, 보관됐으면 같은 계열 현재 판)이,
쓸 곳은 «확인된 사용자 id/runs/`mcp_docgen_run_start` 가 만든 실행 id/»가 정하고 `mcp_docgen_run_finish` 가 경로를 다시 확인한다.
DB 쓰기는 전부 사용자 토큰(RLS·감사 규칙 그대로). `mcp` 는 에이전트 토큰을 실어 `mcp-docgen` 을 부를 뿐이다.
②**서술을 포함한 모든 칸은 에이전트가 쓴다** — 서버는 AI 를 부르지 않는다(웹 러너에서 «계획 생성(LLM)»만 빠진 같은 길).

⚠️ 조용히 틀리는 자리 —
- **`__` 열(`row.__index1` 연번)은 칸으로 보이지 않게 한다** — 엔진이 스스로 채우는 자동 번호인데 스키마에는 열로 나온다.
  보이면 «행 안에 빈 칸»으로 막히거나 채운 값이 번호를 덮는다. 들어온 `__` 키도 버린다.
- **행 상한 초과를 막는다** — 엔진은 `maxRows` 를 넘는 행을 **조용히 잘라낸다**(웹 폼이 막는 것을 여기서도).
- **필수 서술이 비면 막는다** — 스키마상 서술은 «비우면 AI 가 쓴다»(optional)인데 이 경로에는 AI 가 없다.
- **사람 이름 칸은 명단에 대조**(`mcp_docgen_check_people` — 재직 교직원·재학생 정확히 한 명). 웹은 명단에서 고르므로 늘 정확하다.
- **`start_task_action_run` 은 가시성을 보지 않는다**(spec_fill 이면 교직원 누구나) — 래퍼가 먼저 `task_action` SELECT(RLS)로 확인한다.
  안 그러면 남의 **비공개** 생성 방식으로도 실행 기록이 생긴다.
- db 지식(`knowledge.source.type = 'db'`)은 이 경로에서 못 채운다(에이전트 토큰은 표에 못 닿는다 — 운영 스펙 0건, 2026-10-20). 쓰는 스펙이 생기면 결과에 경고가 뜬다.
- 완성 파일은 웹과 달리 rhwp 줄 배치 재계산(`normalizeHwpxLayout`, WASM)을 거치지 않는다 — 한글은 열 때 다시 계산하므로 문서는 정상이고,
  rhwp Studio 로 열면 «비표준» 안내가 뜰 수 있다. 웹 «완성 문서»로 다시 열면 값에서 재구성하므로 해당 없다.

## 데이터 카탈로그 (2026-10-20) — `data.school` · `data.staff` · `data.my` · `data.student`

사용자 지적: «문서를 쓸 때 말고도 데이터가 필요한 상황은 훨씬 다양하다». 상황마다 도구를 만들면 도구 목록과 규칙이 끝없이
늘어나므로(**사용자 결정**) 읽기는 **도구 둘 + DB 카탈로그**로 간다 — `list_data`(데이터셋·조건·칸·공통 규칙) · `read_data(dataset, filter, limit)`.
데이터셋을 늘리는 것은 마이그레이션이다(엣지 함수·도구 목록은 바뀌지 않는다). 쓰기는 지금처럼 목적별 전용 도구.

| 영역 | 데이터셋 |
|---|---|
| 학교 공통 `data.school` | `school_info`(학교명·학년도·학기 기간·교장·교감·교시 시간) · `school_calendar` · `meals`(엣지 — NEIS) · `extensions`(엣지 — 전화번호부 자료) · `notices` · `departments` |
| 교직원 `data.staff` | `staff`(부서·태그·담당 교과·업무분장 — 이메일·연락처 없음) · `duty_seats` · `work_map`(학교 업무 지도 — 아래) · `teacher_timetable`(+ 요일별 빈 교시) · `documents`(서류함 목록 — 내용·링크 없음) |
| 내 것 `data.my` | `my_profile`(+ 이번 학기 수업 `teaching` 과목·학년·반·주당 시수와 각 수업의 **이번 학기 정기시험 계획** `exams`(표 `school_exam_subject` — 나이스 정기시험과목관리를 관리자가 학기에 한 번 `school_exam_subject_sync` 로 올림, 빈 목록 = 정기시험 없음, 올리기 전이면 `exam_plan_synced=false`) — 2026-11-05 `20261105100000`·`20261105110000`, 쪽지·공문의 «출제 교사·N학년 담당» 대상 판정용. 지난 시험 기록 `exam_history` 는 2026-11-11 뺐다 — 아래 «문항정보표는 MCP 에 없다») · `my_timetable` · `my_requests`(내 차례 결재·서명) |
| 학생 `data.student` | **전교 재학생**: `student_roster`(학년·반·번호·이름) · `student_profile`(+ 올해 동아리 + 수강 과목) · `student_timetable` / **담임 반·내 수업 반만**: `homeroom_students` · `section_students` · `student_attendance`(자습실 출석) / **담임 반·학년 부장은 그 학년·관리자 전교**(2026-11-09): `admission_wishlist` · `course_selection` — **사용자 결정(2026-10-23 인터뷰): 내신·모의고사·봉사·창체·생기부·상담은 열지 않는다(보류)**, 호출 기록 |
| 학교 공통 — 입시·교육과정 (2026-11-09) | `admission_cutoffs` · `admission_results` · `admission_gyogwa` · `admission_jonghap` · `admission_schedule` · `admission_changes` · `admission_university` · `school_curriculum` · `achievement_standards` · `course_offerings` (아래) |

### 입시 자료·교육과정·수시 지원·과목 선택 (2026-11-09, 사용자 결정) — `20261109130000`

DB 검토(2026-11-09 — 표 369개 중 MCP 가 쓰는 것 85개)에서 «쓸모 있는데 MCP 에 없는 자료»를 고르고 사용자가 정한 것. 새 도구·허용 없이 카탈로그에 12개(17 → 29). 보류(사용자): 시험 감독 배정(`exam_schedule`) · 정기시험 문항정보표 · 모의고사 학교 통계 · 연수 이수 현황. 넣지 않음: 협업 보드 · 방과후 · 학생 기기.

**문항정보표는 MCP 에 없다 (2026-11-11, 사용자 결정)** — 정기시험 문항정보표(`school_exam_question` — 문항별 내용영역·난이도·배점·정답·성취기준)는 에이전트가 열람하지 않는다. 맥락 관리의 source `exam_question_info` 행을 지웠고(보관이 아니라 삭제 — 보관 보기·`include_archived` 로도 안 보이게), `my_profile` 의 `exam_history`·`sc_live` 의 `exam_question` 분기를 뺐다(`20261111233000`, 드라이런 `hide-exam-question-dryrun.sql`). ⚠️ `school_exam_question` 을 읽는 `mcp_*`·`mcp_private` 함수를 새로 만들지 말 것 · 맥락 관리에 이 자료를 다시 등록하지 말 것. 이번 학기 정기시험 **계획**(`school_exam_subject`, `teaching[].exams`)은 문항정보표가 아니라 그대로다. 웹 학교 시험 탭(evalearn)은 바꾸지 않았다.

| 데이터셋 | 원본 | 꼭 알 것 |
|---|---|---|
| `admission_cutoffs` | `admission_adiga_results`(16,129) | 2026 대학 발표 학과별 내신 50%·70% 컷 + 2024·2025 이력. `quality`(추정·뒤집힘·같음)를 붙인다. university·major 중 하나 필수 |
| `admission_results` | `univ_admissions`(134,956 — **2021~2025** 5개년, 문서의 «2025만»은 옛말) | 리로스쿨 배치표. **0 = 미공개를 null 로**. 정시는 `정시(가)` 등이라 `period=정시` 는 앞부분 일치 |
| `admission_gyogwa` · `admission_jonghap` | 교과 376 · 종합 197 | 수능 최저는 원문 그대로. 종합은 면접 기출 질문(블록 `questions` + 평가 요소 `factors[].questions` **두 자리** — `questions:false` 면 둘 다 뺀다, 드라이런이 한 자리만 빼던 것을 잡았다) |
| `admission_schedule` · `admission_changes` | 웹 RPC `get_admission_schedules` · `get_admission_changes` 를 **그대로 부른다** | 웹 비교표와 같은 대학 이름 맞춤(정확 일치 우선 — `고려대`에 세종캠이 섞이지 않는다). 변경 사항은 64개 대학뿐 → 0건이면 «자료 없음» 문구 |
| `admission_university` | `admission_university_info` | 대표 전화는 대학 번호(개인 아님) |
| `school_curriculum` · `achievement_standards` · `course_offerings` | 편제 673 · 성취기준 1,118 · 개설 과목 826 | 학교 맥락 목록의 «MCP 로는 아직 없음» 위치를 `read_data` 로 고쳤다 + `admission_data` source 한 줄 |
| `admission_wishlist` (학생) | `admission_wishlist` | **범위 = 웹과 같은 RLS**(`can_read_wishlist` — 관리자 · 담임 태그 · 학년 부장). 학생 = 재학생 resource(`meta.id` = student_code) — 학적 코드는 내보내지 않는다 |
| `course_selection` (학생) | `course_selection_*` | ⚠️ **`course_selection_submission`·`_item` 의 SELECT 정책이 «로그인 누구나»(학생 포함)** 라 RLS 로 범위가 안 좁혀진다 → 함수가 `mcp_private.sr_can_manage_student(학년, 반)` 으로 정한다. ⚠️ **회차 ↔ 지금 학생의 열쇠는 `admission_year`(입학 연도)** — `target_grade` = 조사할 때 학년, `academic_year` = 고른 과목을 듣는 학년도(보통 다음 해)라 둘로 지금 학년을 계산하면 틀린다(첫 판이 그래서 2학년 담임 반 19명 전원 «미제출» — 드라이런이 잡았다). 지금 학년 = 지금 학년도 − 입학 연도 + 1. 미제출 = 그 코호트 재학생 중 이 회차에 낸 것이 없는 학생 |

- 대학 이름 부분 일치는 `mcp_private.adm_norm`(공백·괄호 제거, 대학교→대) — 캠퍼스가 함께 나온다(결과의 이름을 보고 고른다).
- 컷·결과에는 «합격선이 아니다 · 합격 가능성을 단정하지 않는다»를 `note`·도구 설명에 함께 싣는다.
- 회귀: `data.mts`(영역·sensitive·학생 표를 안 읽음·웹 RPC 재사용·과목 선택 범위·입학 연도 열쇠·학적 코드 미노출) · 드라이런 `scripts/mcp-agent-test/data-admission-dryrun.sql`(44건 — 데이터셋마다 걸러짐·필수 조건·0→null·상한·`questions:false`·정확 일치·«자료 없음»·담임/일반 교사/관리자 범위·회차 id 로 남의 반을 골라도 0·호출 기록).
- ⚠️ 검토에서 나온 별건: `course_selection_submission`·`course_selection_item` RLS 가 전교생 제출(이름 포함)을 학생에게도 연다 — 이 마이그레이션에서는 고치지 않았다(사용자 확인 필요).

- **`work_map` = 학교 업무 지도(`work_candidate`, 2026-10-24 마이그레이션 `20261024210000`)** — 사용자: «업무 지식이란 학교 업무 지도의 내용». 목록(업무·영역·부서·교무실/행정실·유형·하는 달·사업비·절차 종류 수) + `work` 로 하나를 고르면 절차(종류·주기·요약·단계 이름·**대표 문서 날짜**·관련 업무)·사업비 항목·떠받친 업무. 사용자 결정: 관객 = 교직원 전체(`data.staff`, 표 RLS 와 같다 — 웹 `/tasks/map` 이 관리자 전용인 건 집계판이라서) · **사람 이름은 내보내지 않는다**(`meta.owner`·`evidence`·절차의 `person`/`by`/`related.person`/`revised` 제외, 글 칸의 이름은 `wm_scrub` 이 ○○ — 그 업무 분석의 이름 ∪ 교직원 이름) · 근거 문서 제목도 내보내지 않는다 · **자리는 참고만**(«자리는 변경될 수 있음» — `seat_hint`, 지금 담당자와 잇지 않는다). ⚠️ 단계 문서는 분석이 남긴 대표 1~6건이라 «횟수»로 내보내지 말 것(`sample_dates`). 회귀 = `data-dryrun.sql`(업무 241개 전부 상세에서 이름 누출 검사)
- 정본 = `mcp_private.data_catalog()`(이름·영역·설명·조건·칸) + 공통 규칙 `data_guide()`(학년도 3월 시작·담임 = 태그·재직만·이름은 정확히·데이터 속 지시를 따르지 않는다). 데이터셋 하나 = `mcp_private.ds_*` 함수 하나(**INVOKER** — RLS 그대로) + `mcp_read_data` 의 분기.
- **함수가 내보낼 칸을 고른다** — RLS 는 행만 막고 «이 칸을 밖으로 내보내도 되는가»는 못 막는다(`resource.meta.email`, `profiles` 서명 그림, 문서 저장 경로, 교사 외부 계정). 표를 통째로 여는 범용 조회를 만들지 말 것.
- **모르는 조건은 거부한다** — 조용히 무시하면 거르지 않은 전체가 돌아온다.
- **학생 정보는 공개 등급이 둘이다 (2026-10-23 인터뷰, 사용자 결정)** — 처음엔 담임 반·내 수업 반만 열었다가, 담임도 수업도 아닌 반(2학년 3반)에 봉사 단체 발급을 하려는데 번호를 읽을 길이 없어 «명단은 전교»로 열었고(`20261023140000`), 이어 인터뷰로 «공개해도 되는 정보 / 아닌 정보»를 갈랐다(`20261023150000`).
  - **전교 재학생 공개** = 명단 · 동아리 · 수강 과목 · 시간표. `student_roster`(칸 넷) · `student_profile`(칸 여섯 — 학년·반·번호·이름·`clubs[]`·`subjects[]`) · `student_timetable`(범위 검사를 풀었다 — **없는 번호만 거부**). 함수가 학생 `resource.meta` 에서 읽는 키는 `grade`·`class`·`number` 셋뿐이고(회귀가 못 박는다) 학적 코드·이메일·사진·성적은 이 경로로 새지 않는다. 동아리는 이름만 나가고(담당 교사·장소·명단 전체는 아니다) **`club_info.students` 의 `resource_id` 로 맞춘다** — 이름으로 맞추면 동명이인이 섞인다. 명단에는 전출·자퇴 학생도 남아 있어(실측 602명 중 6명) 재학생만 나온다. 수강 과목은 이번 학기 `student_timetable` 의 과목이다.
  - **담임 반·내 수업 반만** = 출결. `student_attendance` — 학생별 요약(출석·결석·대기·출석률)과 날짜별 기록(`daily=false` 면 요약만), 기간 기본 = 이번 달 1일~오늘(최대 93일). **판정은 다시 적지 않는다** — `seaton_private` 가 정본이라 `public.seaton_stats_students` 의 결과를 받아 «내 학생»만 남긴다(출석률 = 출석/(출석+결석), 23시 마감, NULL = 결석 — 회귀가 이 함수 안에 `seat_reservations`·`is_attended`·`>= 23` 이 없음을 검사한다). 그 RPC 가 교사·관리자 전용이라 **직원은 어차피 거부**된다. 학적 코드(`sid`)·학생 id·온도·확인한 교사 이름은 내보내지 않고, 기록이 없는 내 학생은 `no_record` 로 따로 준다(빈 줄이 «출석했다»로 읽히지 않게). ⚠️ **수업 반 표기(`1-5`)는 분반 번호일 수 있어 학생의 실제 학급과 다르다** — «내 학생인가»는 학급 표기가 아니라 학생 집합(`my_section_students`)으로 판정한다.
  - **열지 않는 것(보류)** = 내신 성적·등급 · 모의고사 · 봉사·창체 기록 · 생기부 · 상담. **직원**은 코드로 막지 않고 `data.student` 허용을 주지 않는 것으로 막는다(사용자 결정 — 허용이 실수로 가면 열린다는 뜻이므로 관리 화면에서 직원에게 이 영역을 주지 말 것).
  - 조건: `student_roster`·`student_profile` = `grade`·`class`·(`number`)·`query`·`offset` — 한 학년이 200명을 넘어 `limit` 상한에 걸리므로 `truncated`·`total`·`offset` 으로 이어 읽는다. 새 허용 영역을 만들지 않고 `data.student` 에 두어 `sensitive` + 호출 기록이 그대로 걸린다. 전교 명단이 에이전트로 나가는 것이므로 허용은 필요한 사람에게만 주고 `mcp_call_log` 로 누가·언제 읽었는지 본다.
- **카탈로그·읽기 RPC 는 마이그레이션마다 «그대로 + 바뀐 곳»으로 다시 정의된다** — 정본은 그 함수를 **가장 나중에** 정의한 파일이다(지금 `20261023150000`). 회귀 `data.mts` 도 그렇게 읽는다. 손으로 옮겨 적지 말고 이전 정의를 코드로 잘라 와 바뀐 자리마다 «정확히 한 번 맞는가»를 단언하는 방식으로 만든다(전사 오류 하나가 곧 보안 구멍). 드라이런(`data-dryrun.sql`)도 이 파일을 먼저 얹어야 한다 — `20261020150000`·`20261023140000` 을 다시 얹으면 옛 정의로 되돌아간다.
- 학생 시간표는 이제 **전교 재학생**이다. 교사 시간표 칸 ↔ 학생 시간표 칸(요일·교시·과목·담당)으로 «내 수업 학생»을 잇는 로직(`my_section_students`)은 출결 범위 판정에 계속 쓰인다. `student_timetable` 표 자체의 RLS 는 «로그인한 누구나»라 함수가 칸을 정한다.
- 엣지 데이터셋 = DB 에 없는 것: 내선(`src/data/extensionDirectory.ts`)·급식(NEIS, 키는 함수 비밀 `NEIS_API_KEY`). 로직은 `src/lib/mcpEdgeData.ts` → `_shared/mcpEdgeData.bundle.js`(같은 묶음 스크립트).
- 허용은 영역 단위 — `list_data`·`read_data` 는 영역이 **하나라도** 있으면 보이고, 데이터셋마다 DB 가 그 영역을 다시 확인한다(도구 grant 가 배열인 유일한 도구들 — `handler.js` `toolGrants`).

⚠️ 데이터셋을 더할 때: 카탈로그 한 줄 + `ds_*` 함수 + `mcp_read_data` 분기(엣지면 `handler.js` 의 `read_data.run`). 회귀 `data.mts` 가 카탈로그 ↔ 분기 ↔ 엣지를 양쪽으로 대조한다(어긋나도 오류 없이 «읽기 함수가 없습니다»가 된다).
⚠️ 교시 시간은 SQL `period_times()` 에도 있다 — `src/lib/timeUtils.ts` 를 바꾸면 함께(회귀가 대조).
⚠️ 학교명·주소·NEIS 코드는 SQL `ds_school_info` 에 적혀 있다(DB 에 학교 정보 표가 없다).

## 업무 만들기·흐름 (2026-10-20) — `work.manage` · `workflow.manage`

사용자 요청 «work, task, action 을 생성하고 흐름으로 연결도». **사용자 결정**: 작업은 «설정까지»(요청 보내기·발송은 웹에서 사람이 — **2026-10-24 부터는 «업무 진행하기»(`work.run`)가 미리보기·지문을 거쳐 보낸다**, 아래 절) ·
흐름은 자동 배치 + 연결 도구 · 고치기 + 지우기(진행 기록이 있으면 거부).

| 허용 | 도구 |
|---|---|
| `work.manage` | `get_work` · `create_work` · `update_work` · `delete_work` · `create_task` · `update_task` · `delete_task` · `add_action` · `update_action` · `remove_action` |
| `workflow.manage` | `list_workflows` · `get_workflow` · `place_work`(웹 «업무 올리기»와 같은 배치, 다시 불러도 빠진 것만) · `connect_nodes` · `disconnect_nodes` |

- 저장 모양 = 웹과 같다(`useCreateWorkJsonb` · `TaskEditDialog` · `bindTaskAction` · `WorkflowCanvas.handleAddWork/handleAddAction`). 전부 **INVOKER** — `guard_work_structure`·`guard_task_structure`·RLS 그대로.
- **할 일·작업은 그 업무의 책임자만**(`can_manage_work_structure` — 만든 사람·관리자 포함). ⚠️ `task_action` 은 웹에서도 서버 검사가 없다(화면이 버튼을 감출 뿐) — MCP 는 RPC 가 먼저 막는다.
- 절차 단계: `step` 을 주면 그 자리에 끼우고 뒤를 민 다음 **1부터 다시 매긴다**(`wk_renumber` — 같은 번호 둘이 없게). 마감 여러 개 = `meta.deadlines` + `due_date`(다음 예정, 한국 자정), 회차 기록은 새 목록에 남는 것만. 담당자 바꾸기 = 남는 사람의 완료 상태 유지, 과제 단위를 맡은 사람은 못 뺀다.
- 작업 종류 = 웹 레지스트리의 교직원용 바로가기 8 · `neis.screen` · `external.screen` · `document.spec_fill`(생성 방식의 기본 양식) · `collect.input` · `submit.*` · `message.send`(**관리자 전용·숨김·서명은 없다**). 입력·제출·메시지 설정은 웹과 같은 `update_collect_config`·`update_message_config` 로(요청 뒤 잠금·검사가 거기 있다). 대상 규칙은 이름(people·department·tag)을 id 로 바꿔 넣는다, 비우면 «이 할 일의 담당자».
- **지우기 = 진행 기록이 없을 때만**(`wk_task_progress`·`wk_action_progress`: 완료한 담당자·회차/단위 완료·제출물·산출물 값·실행·보낸 요청·보낸 메시지·완성 문서). 지우면 내 흐름의 그 노드도 치운다. 남은 진행이 있으면 웹에서 «취소».
- 흐름 = 내 흐름만 바꾼다(`owner_id`). 노드는 노드 id 또는 업무·할 일·작업 id 로 가리킨다.

⚠️ `mcp_private.wk_action_def` 는 `actionRegistry.ts` 의 제목·설명·실행 방식을 옮긴 것 — 회귀 `run.mts` ②-4 가 제목·«여러 개 가능»을 대조한다(어긋나면 웹과 다른 이름으로 연결된다).
⚠️ 흐름 배치 숫자(노드 256×148·256×196·48×48, 가로 336·세로 240)는 `workflowLayout.ts`·`WorkflowCanvas.tsx` 와 같아야 한다 — 드라이런이 자리를 확인한다.

## 발급번호 대장 — 가정통신문 · 봉사활동 (2026-10-22) — `issue.read` · `issue.gajeong` · `issue.volunteer`

사용자 요청 «봉사활동 기능과 가정통신문 기능을 다루는 MCP». 마이그레이션 `20261022100000_mcp_issue_tools.sql`.

| 허용 | 도구 |
|---|---|
| `issue.read` | `list_issues`(연도·종류·찾을 말·내 것만·취소 포함) · `get_issue`(양식·학생 명단·개인 봉사 묶음·동아리별 명단·활동) — 학생 이름이 들어 있어 **호출 기록** |
| `issue.gajeong` | `create_gajeong_issue` · `update_gajeong_issue`(보낸 칸만) · `cancel_gajeong_issue` |
| `issue.volunteer` | `list_clubs`(이번 학년도 — 명단은 안 준다) · `create_volunteer_personal` · `create_volunteer_group` · `create_volunteer_club` · `set_club_activities` · `cancel_volunteer_issues` |

- 저장 모양 = 웹 `IssueCreateDialog` 와 같다(학생 스냅샷 `{resource_id, code, grade, class, number, name, hours}`, 개인 = 학생마다 한 행 + `meta.batch_id`, 단체 = 대표 학년·반 규칙, 동아리 = `form_data.kind='club'` + `club_info` 명단·담당교사 스냅샷 + schedule 시드). **채번은 기존 `create_document_issue`**(DEFINER — teacher·admin 만, 직원은 웹에서도 불가라 먼저 한국어로 거부), 동아리 활동은 **기존 `update_club_activities`**(작성자·관리자·담당교사 판정). 고치기·취소는 INVOKER 로 `document_issue` UPDATE RLS(작성자·관리자). 경로 = `meta.via`·`via_updated`·`via_cancelled`.
- **학생은 서버가 재학생에서 찾는다**(`mcp_private.iss_students`) — `{grade,class,number,name?}` · `"2-5-17"` · `"20517"` · 이름만(정확히 한 명일 때). 2026-10-22 실측 재학생 동명이인 **41쌍**. 못 찾거나 여럿이면 전부 모아 거부하고 **아무 번호도 쓰지 않는다**(채번 카운터가 같은 트랜잭션이라 함께 되돌아간다 — 드라이런이 확인).
- **개인 봉사는 한 트랜잭션** — 웹은 학생마다 따로 불러 부분 실패를 허용하지만 여기서는 한 명이라도 실패하면 묶음 전체가 없다. 확인자 성명을 비우면 학생이 모두 같은 반일 때 그 반 담임(태그 정확히 한 명)으로 채운다(웹 `useHomeroomTeachers` 와 같다).
- 양식의 **모르는 칸은 거부**(조용히 버리면 적은 값이 사라진다), 영역·구분은 웹 선택지 그대로, 동아리 활동·schedule 은 9건까지(확인서 날짜 칸).
- 넣지 않은 것: 확인서 한글 파일(브라우저 jszip 생성기 — 웹 대장에서) · 개인·단체 내용 고치기(취소 뒤 다시 발급) · 단체 반별 명단 교체 · 동아리 출석 매트릭스.
- ⚠️ `SELECT … FOR UPDATE` 는 UPDATE 정책도 받는다 — 남의 발급을 바로 잠그면 «없음»으로 보여 «내 것이 아님»을 말할 수 없다. `iss_lock_mine` 은 읽고 판정한 뒤에 잠근다.
- 드라이런 = `scripts/mcp-agent-test/issue-dryrun.sql`(46건 — 허용 없음 · 번호 연속 · 고치기·취소·두 번 취소 · 목록 거르기 · 학생 찾기 오류 5종과 «실패 시 번호 안 씀» · 같은 반 담임 확인자 · 반 섞임 · 단체 대표 학년·반 · 동아리 스냅샷·활동·담당교사 아닌 교사 거부 · 관리자 아닌 남의 고치기·취소 거부 · 종류 섞인 취소는 전부 그대로 · 호출 기록 · anon). ⚠️ 시험 계정 권민결은 **관리자**라 «남의 것» 거부는 다른 교사 시점(`as_other`)으로만 보인다.

## 플래너 (2026-10-22) — `planner.read` · `planner.write`

사용자 요청 «이후 플래너 기능도 MCP로». 마이그레이션 `20261022110000_mcp_planner_tools.sql`. 웹 `/planner`·아카데미 별빛 플래너와 **같은 기록**(`academy_tasks`·`academy_user_goals`).

| 허용 | 도구 |
|---|---|
| `planner.read` | `list_planner`(기본 이번 주 월~일, 최대 62일) · `list_planner_goals`(장기 → 단기, 기본 이어가는 것) |
| `planner.write` | `save_plan`(새로 · 보낸 칸만 고치기 · date = 옮기기) · `set_plan_done` · `delete_plan` · `save_plan_reflection` · `save_planner_goal` · `set_planner_goal_status`(completed·active·archived·unarchived) |

- **쓰기는 전부 `academy_dormitory_write`**(save_task·complete·delete_task·save_feedback·save_goal·complete_goal·archive_goal) — 소유권·잠금·보상(«오늘 완료»·한 주 꾸준함·미리 세운 계획)이 거기 있다. 회귀가 플래너 RPC 의 직접 INSERT/UPDATE/DELETE 를 금지한다.
- ⚠️ **`plan_write` 는 payload 에 없는 칸을 «비움»으로 받는다** — 메모·시간이 지워지고, `related_goal_id` 가 없으면 목표가 바뀐 것으로 보고 **새 계획을 만든다**. `save_goal` 은 `is_completed` 가 없으면 완료가 풀린다. 그래서 MCP 가 지금 값을 먼저 읽어 채운다(드라이런 «rename keeps the rest»·«goal rename keeps completion»).
- 비우기는 빈 글자, 보내지 않음은 그대로 — 시각·메모·목표·설명·상위 목표 모두 같은 규칙(`pl_time`·핸들러 `keepOrText`).
- 플래너 RPC 는 role student·teacher·admin 만 받는다 — MCP 허용은 교직원 리소스뿐이라 **교사·관리자**만 쓰고, 직원은 먼저 거부한다.
- 넣지 않은 것: 목표 지우기(아카데미 제1장 진행이 묶여 있다 — 보관으로 충분), 포모도로 기록, 상점·꾸미기.
- 드라이런 = `scripts/mcp-agent-test/planner-dryrun.sql`(30건 — 장기·단기 목표 · 시간 반쪽·형식 오류 · 고쳐도 나머지 유지 · 비우기 · 완료 보상(코인 +5) · 돌아보기 · 옮기기 · 기본 주 · 62일 · 목표 상태 넷 · 다른 교사는 내 계획·목표에 못 닿음 · 지우기 · 호출 기록 · anon).

## 시간표·스케줄 부가 기능 (2026-10-23) — 메모 · 수업 교체 · 회의 시간 · 일정 설문 · 급식지도 · 자습 감독

사용자 요청 «timetable 의 부가 기능인 메모·교체 관련 기능» + «스케줄도 마찬가지로 회의 가능 시간 검색, 급식지도 명단, 자습 감독 배정, 일정 설문». 마이그레이션 `20261023180000_mcp_timetable_tools.sql`(메모·교체 + 아홉 허용의 CHECK) · `20261023190000_mcp_schedule_addon_tools.sql`(나머지 넷). 새 표 없음.

**사용자 결정 2026-10-23** — ①학생 메모의 학생 = **«학년-반-번호»로만**(이름은 받지도 돌려주지도 않는다 — 담임 반 도구와 같은 원칙. 설문 결과의 학생 응답자도 «N학년 N반 N번») ②수업 교체 = **전부**(목록·후보·신청·수락/거절·취소) ③급식지도·자습 감독 = **초안 + 확인 뒤 일정 만들기** ④일정 설문·회의 시간 = **전부**.

| 허용 | 도구 |
|---|---|
| `timetable.memo` | `list_timetable_memos` · `save_timetable_memo`(교시 메모, 빈 글자 = 지우기) · `list_lesson_students`(그 수업 학생 = 학년-반-번호) · `save_student_memo` |
| `swap.read` | `list_class_swaps` · `find_swap_candidates`(교체·대체 후보 — 웹 판정 그대로) |
| `swap.write` | `request_class_swap` · `request_substitute`(사유 필수) · `respond_class_swap` · `cancel_class_swap` |
| `schedule.meeting` | `find_meeting_times`(주간 시간표에서 함께 비는 칸 — 이름·부서·태그) |
| `survey.respond` | `list_schedule_surveys`(공유) · `respond_schedule_survey` |
| `survey.manage` | `list_schedule_surveys`(공유) · `create_schedule_survey`(대상자 알림) · `get_schedule_survey_result` · `set_schedule_survey_status` · `create_schedule_from_survey`(meta.survey_id) |
| `mealduty.plan` | `draft_meal_duty`(초안만) · `create_meal_duty_schedules` |
| `supervision.plan` | `draft_supervision`(초안만) · `create_supervision_schedules` — 그 학년 학년부장·담임 태그(관리자 = 전 학년, 0 = 전 학년 아침은 하나라도) |
| `supervision.mine` | `list_my_supervisions` · `request/respond/cancel_supervision_swap`(기존 RPC) · `set/delete_supervision_unavailability` |

**판정은 웹 순수 함수 그대로 — 묶음 `_shared/mcpSchoolOps.bundle.js`** (원본 `src/lib/mcpSchoolOps.ts` → `timetableSwapUtils`·`swapBurden`·`mealDuty`·`selfStudySupervision`·`schoolDay`·`surveyAggregate`). DB 는 입력만 모은다(`mcp_swap_sources`·`mcp_meal_duty_sources`·`mcp_supervision_sources`·`mcp_schedule_survey_source`, 사용자 토큰 RLS 그대로) — 초안·후보·집계를 SQL 로 다시 쓰면 웹과 에이전트가 조용히 다른 답을 낸다. ⚠️ 그 모듈을 고치면 `npx tsx scripts/mcp-docgen/build-bundle.mts` 로 다시 묶고 `mcp` 를 배포할 것.

**대신 «만들기·신청» RPC 는 초안을 믿지 않는다** — 에이전트 토큰은 `/rpc/mcp_*` 를 직접 부를 수 있다.
- 교체 신청: 동아리 금지 · 학교관리자 제외 · 선생님 시간 겹침(웹 `findSwappableClasses` 와 같은 식) · 수강생 겹침(`get_swap_roster_fit`) · 지난 날짜 · 같은 칸 대기 중 중복을 서버가 다시 본다. ⚠️ `class_swap` INSERT 정책은 «로그인만» 보므로 웹도 이 판정을 화면에서만 했다.
- 급식지도: 앞날짜·평일·1~4명·재직 교직원 정확히 한 명씩 · 그날 급식지도가 이미 있으면 거부(이력 RPC — duty RLS 때문에 `meeting` 을 직접 읽지 않는다) · **한 트랜잭션**(하나라도 틀리면 아무것도 안 만든다).
- 자습 감독: 학년 권한 · 감독 명단(학년부 소속 ∪ 담임·학년부장 태그) · 이미 있는 칸(저녁+아침 겹침 포함) · 0학년은 아침만. 시각·열람실 안내는 엣지 함수가 초안을 **다시 계산**해 붙인다(`supervisionCreatePayload` — 에이전트가 시각을 지어내지 않게, 초안에 없는 칸이면 RPC 를 부르지 않는다).

**알림은 상태 변경과 같은 트랜잭션에서** — 웹은 교체 알림을 브라우저가 상태를 바꾼 뒤 따로 보낸다(`NotificationService`). MCP 는 RPC 안에서 넣어, 승인만 하고 알리지 않는 길이 없다. 문구는 웹과 같다(회귀가 다섯 문장을 대조). 급식지도·감독·설문 결과 일정은 기존 INSERT 트리거가 교사 담당자에게 알린다. 남에게 가는 알림 INSERT 에 RETURNING 을 쓰지 않는다.

⚠️ 조용히 틀리는 자리 —
- **호출 기록(`log_call`)을 남기는 RPC 는 VOLATILE 이어야 한다** — PostgREST 는 STABLE·IMMUTABLE 함수를 **읽기 전용 트랜잭션**으로 부른다. 처음에 학생 메모 목록·수업 학생·설문 결과를 STABLE 로 두었더니 운영에서 `cannot execute INSERT in a read-only transaction` 이었다(메모 목록은 학생 메모가 있을 때만 기록해 빈 결과로는 통과했다). **SQL 로 직접 부르는 드라이런은 PostgREST 를 거치지 않아 이 부류를 못 잡는다** — `20261024100000` 으로 고쳤고 회귀 `run.mts` 가 «log_call 이 있으면 VOLATILE» 을 검사한다(쓰기 허용 안의 기록만 남기는 읽기는 `LOG_ONLY_READS` 목록으로 readOnlyHint 를 허락).
- **`SELECT … FOR UPDATE` 는 UPDATE 정책을 본다** — 받는 사람의 `class_swap` UPDATE 정책은 `pending` 만 열어 두어, 바로 잠그면 이미 처리된 요청이 «없음»으로 보였다(드라이런에서 잡음). 먼저 SELECT 정책으로 읽어 상태를 말하고, 그다음 잠근다(`respond`·`cancel`).
- **상대 분반(`section`) 행은 RLS 상 그 수업 교사만 읽는다** — 섹션 id 는 DEFINER `get_teacher_timetables_for_swap` 에서 받는다(웹 `useSwapCandidates` 와 같다). 직접 읽으면 오류 없이 빈 결과다.
- **학생 메모의 `subject` = `teacher_timetable.subject_name`**(섹션 이름에서 « 학년-반»을 뗀 것) · `year` = 학사력 학년도 — 웹 `SectionStudentsDialog` 와 같아야 같은 메모가 한 줄이다(유니크 키).
- 회의 시간은 웹(`resource.meta.section`)과 달리 **`teacher_timetable`(지금 학기)** 을 본다 — 정본 쪽으로(뜻은 같다).
- `list_schedule_surveys` 는 두 허용이 함께 쓰는 도구라 `require_any_tool` 이다 — 그 함수의 기본 문구(«데이터 읽기 허용»)를 설문용으로 바꿔 다시 던진다. `data.mts` 의 «데이터 영역 도구 = 둘» 검사는 데이터 영역을 가진 도구로 좁혔다.

검증 — 드라이런 `timetable-dryrun.sql` **34건**(메모 저장·고치기·지우기 · 학생 = 1-8-1 · 이름으로 적기 거부 · 그 수업 학생 아님 거부 · 실제 시간표에서 고른 상대와 교체 신청 → 상대 수락 → 내 취소 · 알림 셋(받는 사람·문구) · 중복·지난 날짜·두 번 답하기·두 번 취소 거부 · 대체 사유 필수 · meta 병합 + via · anon) + `schedule-addon-dryrun.sql` **44건**(회의 시간 35칸 · 태그 묶음 · 설문 만들기(교직원 + 학생) → 대상자 알림 3 → 응답(빠진 후보 = 안 됨) → 결과 입력(학생 = 1학년 8반 1번) → 결과로 업무 일정(기본 참석자 = 그날 가능한 교직원) → 마감 · 급식지도 입력·만들기(웹 모양·이력에 보임)·같은 날 거부·한 트랜잭션 · 감독 입력(3학년·전 학년 + 수능 행)·만들기(웹 모양 — 이력 RPC 가 찾는다)·이미 있음·명단 밖·0학년 저녁 거부 · 담임 = 그 학년만 · 태그 없는 교사 거부 · 감독 교체 신청·취소 · 못 하는 날 적기·지우기 · anon) — 둘 다 끝의 예외로 롤백. 회귀 `npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/school-ops.mts`(67 — 묶음 최신 · **에이전트 답 = 웹 함수 직접 호출**(교체 후보·급식지도·감독 — 함정이 든 합성 자료) · 학생 이름 비노출 · 엣지 배선 · SQL 재확인·알림 문구 정적 검사). 규칙 하나를 일부러 바꾸면 «묶음 최신»과 «웹과 같다»가 함께 깨지는 것을 확인했다.

**운영 시험 (2026-10-24, 실제 에이전트 토큰 · 권민결)** — 읽기 전부: 수업 학생 25명(칸 = `student` 하나뿐) · 교체 후보(월1 인공지능 기초 1-8 → 교체 가능 8 · 수강생 불가 4 · 시간 불가 15, 대체 빈 교사 30) · 주말 거부 · 회의 시간(태그 묶음, 모두 빔 = 월4·목6) · 설문 목록 · 11월 급식지도 초안(명단 54 · 수능일 쉼 · 11/2 전원 연수 표시) · 3학년·전 학년 아침 감독 초안(수능일 = 3학년 제외 시작) · 내 감독. 쓰기는 **내 것만**(교시 메모·학생 메모·못 하는 날 — 적고 읽고 지움, 남은 행 0 · 호출 기록 4줄) + 남의 학생 메모 거부. 남에게 알림이 가는 쓰기(교체·대체·설문·급식지도·감독 만들기·감독 교체)는 운영에서 부르지 않았다 — 같은 DB 의 롤백 드라이런 둘이 본다.

## 교사 기본 허용 · 서류함 · 공지 · 결재·서명 · 코드 공유 · 나이스 안내 (2026-10-24)

**교사 기본 허용** (사용자 결정 — «모든 교사가 기본으로 모든 권한, 자습 감독 배정·급식지도 명단 같은 것만 제외»). 도구마다 서버가 그 교사의 웹 권한으로 이미 좁혀 두었기 때문이다.

| 표 | 뜻 | 쓰기 |
|---|---|---|
| `mcp_tool_policy(tool, teacher_default)` | 도구마다 «계정이 연결된 모든 교사에게 켜짐» — 시드는 `mealduty.plan`·`supervision.plan` 만 끔 | 관리자(UPDATE) |
| `mcp_tool_grant` (그대로) | 사람별 **추가** — 기본에서 빠진 것을 그 사람에게 켠다. 직원(staff)은 이것만 | 관리자 |
| `mcp_tool_block(resource_id, tool)` | 사람별 **해제** — 교사 기본을 그 사람만 끈다. 추가 줄이 있으면 추가가 이긴다 | 관리자 |

판정 한 곳 = `mcp_private.my_grants()`(추가 ∪ (교사 기본 − 해제), 교사 리소스만 기본) — `require_tool` · `require_any_tool` · `mcp_my_tools` 가 모두 이것을 읽는다. 관리 화면에서 한 칸을 바꿀 때 무엇을 넣고 빼는지는 `planToggle()`(`src/lib/mcpTools.ts`) 한 곳이 정한다(끌 때 추가 줄도 함께 지운다 — 남으면 해제가 못 이긴다). 동의 화면(`/oauth/consent`)은 `mcp_my_tools` 가 비지 않으면 승인할 수 있으므로 **이제 모든 교사가 연결할 수 있다**.

**새 허용 5종** — 기능마다 허용 하나(읽기·쓰기를 나누지 않는다 — 아래 «중복 점검»):

| 허용 | 도구 | 하지 않는 것(웹으로) |
|---|---|---|
| `document.library` 서류함 | `list_documents`(id·드라이브/주소 문서는 링크) · `list_document_folders` · `create_document_folder` · `update_document`(내 문서 제목·폴더·분류·설명·키워드) | 폴더 이름 바꾸기 (파일 올리기·받기·지우기는 2026-11-04 아래 절) |
| `notice.board` 공지사항 | `list_notices`(게시 예정·중·끝) · `get_notice` · `create_notice`(대상 비우면 전체 교직원) · `update_notice`(targets: 안 보냄 = 그대로 · [] = 전체로) · `delete_notice` | 첨부(공개 버킷), 첨부 있는 공지 지우기. 공지 알림은 웹에도 없다 |
| `sign.request` 결재·전자서명 | `list_sign_requests`(내 차례 먼저 · 결재선 · 서명 획은 안 냄) · `reject_sign_request`(사유 필수) · `cancel_sign_request`(내가 올린 것) | **승인·서명**(에이전트가 서명 획을 지어내게 된다 · 문서를 볼 수 없다), 요청 만들기(저장소), 지우기 |
| `code.share` 코드 공유 | `list_code_projects`(내 것만) · `get_code_project`(id 로 하나 — 학교 공개·링크·내 것, 남의 학생 주인은 «학생») · `create_code_project`(기본 «나만») · `update_code_project` · `delete_code_project` | 실행, 학교 공개 목록 훑기(학생 이름 + 작품) (이진 파일·가져가기는 2026-11-04 아래 절) |
| `neis.guide` 나이스 안내 | `search_neis_guide`(메뉴목록 점수 검색 + 안내 본문 검색) · `get_neis_guide`(경로·탭·선행/후행·절차·주의·묻고 답하기) | 나이스 조작 |

- 쓰기 RPC 는 웹 화면이 지키던 검사를 서버에서 다시 한다 — 공지 부서 = `department.category='school'` 목록 · 대상 이름 = 재직 교직원 정확히 한 명(`sch_people`) · 코드 경로 = 웹 무시 목록(`mcp_private.code_path_ok` — 점으로 시작하는 폴더(`.claude` 만 허용)·`node_modules`·잠금 파일·`..`) · 300개 · 텍스트 1MB · 전체 20MB.
- **엣지가 웹 함수를 그대로 쓴다** — `_shared/mcpLibraryOps.bundle.js`(원본 `src/lib/mcpLibraryOps.ts`): 나이스 검색 = `searchNeisScreens` + /neis-guide 의 낱말 검색, 안내 자료 = `neis-kb/guides` 215개(묶을 때 `NEIS_GUIDES_RAW` 로 실린다 — esbuild 에 glob 이 없어서), 코드 파일 정리 = `normalizeProjectPath`·`isIgnoredProjectPath`·`detectProjectKind`·`detectEntryPath`. ⚠️ `neis-kb/guides`·`neisScreens.generated`·`codeShare.ts` 를 고치면 다시 묶고 배포.
- 나이스 안내는 DB 에 자료가 없다 — `mcp_neis_guide_access()` 는 허용만 확인한다(STABLE · 인자 없음).

**중복 점검 → 정리** — 데이터 카탈로그의 `notices`·`documents`·`my_requests` 는 위 도구들과 겹쳤고 id 가 없어 짚을 수 없었다 → 카탈로그에서 빼고(`20261024120000`), 닿지 않게 된 `mcp_read_data` 분기와 `ds_*` 함수 셋을 지웠다(`20261024130000`). 카탈로그 19 → 16. 나머지 겹침은 **사용자 확인 전이라 그대로 두었다** — 담임 반 도구(`homeroom_roster`·`homeroom_timetable` — 이름 없음)와 학생 데이터(`homeroom_students`·`student_timetable` — 이름 있음)는 같은 자료를 다른 공개 등급으로 준다 · `find_staff` ≈ `read_data staff` · 읽기/쓰기로 나뉜 허용 쌍(`task.*`·`planner.*`·`purchase.*`·`swap.*`·`issue.*`·`survey.*`·`schedule.*`)은 교사 기본이 생겨 나눌 이유가 줄었다 → 같은 날 통합(아래 «허용 쌍 통합»).

**관리 화면** — Admin «에이전트(MCP)» 를 탭 넷으로: 연결 안내 · **도구 설명**(기능 묶음 `MCP_FEATURES` 별로 허용 → 도구 → 인자, 글은 에이전트가 받는 설명 그대로 = `src/lib/mcpToolDocs.generated.ts`, 만들기 `npx tsx scripts/mcp-docgen/build-tool-docs.mts`) · 권한 배정(교사 기본 스위치 + 사람별 조정 — 상태 넷: 기본 · 따로 켬 · 이 사람만 끔 · 꺼짐) · 호출 기록(최근 100, 거르기).

⚠️ 조용히 틀리는 자리 —
- **허용을 새로 만들면 다섯 곳** — 두 CHECK(`mcp_tool_grant`·`mcp_tool_policy`, 같은 파일) + 교사 기본 시드 줄 + handler TOOLS + `mcpTools.ts`(허용 + `MCP_FEATURES` 묶음). 회귀 `run.mts` 가 다섯을 대조한다. 정책 줄이 없으면 FK 때문에 해제도 못 한다.
- **«허용 없음»을 시험하려면 행을 지우는 것으로는 안 된다** — 교사는 기본으로 받는다. 옛 드라이런 9개는 트랜잭션 안에서 그 도구의 `teacher_default` 를 끄도록 고쳤다(`data-dryrun.sql` 은 해제 줄).
- 결재 반려는 웹과 같이 **알림이 없다**(결재 알림 트리거가 없다) — 도구가 «요청한 사람에게 따로 알린다»고 답한다. 전자서명 반려는 트리거가 요청자에게 알린다.
- `text[] || '리터럴'` 은 배열 덧붙이기로 읽힌다 — 바뀐 칸 목록은 `'title'::text` 로 쓴다(드라이런에서 잡음).
- 윈도에서 파이썬으로 파일을 쓰면 CRLF 가 된다 — `run.mts` 의 함수 본문 정규식(`\nstable\n`)이 빗나가 readOnly 검사가 거짓 실패한다. `newline=''` 로 쓸 것.

검증 — 드라이런 `library-dryrun.sql` **67건**(교사 기본 34개 · 급식지도 기본 아님 · 교사는 정책·해제 못 바꿈 · 관리자 해제/추가/기본 끄기 · 다른 교사 영향 없음 · 직원 0 · 카탈로그 셋 빠짐 · 서류함 목록·링크·폴더 접두·폴더 만들기(두 번)·나쁜 경로·남의 문서 거부·관리자 고치기·옮기기 · 공지 부서·기간·대상 검사 → 쓰기 → 대상 한 명으로 제한 → 대상은 보고 이름은 못 봄 · 남은 고치기·지우기 거부 · 대상 밖은 못 봄 · 전체 공개로 되돌리기 · 지우기 · 첨부 있는 공지 거부 · 결재 둘 올림 → 요청자 반려 거부 → 결재자 내 차례 · 사유 필수 · 반려 · 결재선 밖 거부 · 취소 · 끝난 것 숨김/보임 · 코드 경로 셋 거부·종류 검사 · 만들기(.claude 허용) · 파일 더하기 · 내용 전부/고른 것 · 비우기 거부 · 비공개 숨김 → 링크로 열림 · 남은 목록에 없음·고치기·지우기 거부 · 학생 주인 = «학생» · 지우기 · anon · 호출 기록) — 롤백. 옛 드라이런 10개도 다시 돌려 모두 통과(합 414건). 운영(실제 에이전트 토큰): 새 도구 19개가 목록에 보임 · 나이스 검색·안내 · 서류함 목록(드라이브 링크)·폴더 · 공지 목록 · 결재·서명 목록 · 내 코드 목록 · `read_data notices` 거부 · 코드 프로젝트 비공개로 만들기(.env 빠짐 알림, 종류 html) → 파일 더하기(static 으로 다시 계산) → 지우기. 남에게 보이는 쓰기(공지·폴더 만들기·반려·취소)는 운영에서 부르지 않았다.

되돌리기 — 교사 기본만 끄려면 `update mcp_tool_policy set teacher_default = false`(사람별 추가 줄은 남아 있다). 도구째 거두려면 handler 에서 `LIBRARY_TOOLS` 를 빼고 배포 — RPC 는 남아도 에이전트에게 안 보인다.

## 허용 쌍 통합 (2026-10-24) — 36 → 28

사용자 결정(«읽기/쓰기 허용 쌍 통합 진행»). 교사 기본 허용이 생겨 «읽기만 주고 쓰기는 안 주는» 배정을 쓸 일이 없어졌다 → **기능마다 허용 하나**. 아래 옛 절의 허용 이름은 그때의 기록이다 — 지금 이름은 이 표.

| 지금 | 옛 허용 | 도구 |
|---|---|---|
| `schedule.mine` 일정 조회·개인일정 | `schedule.read` · `schedule.write` | `list_schedules` · `create_personal_schedule` |
| `task.mine` 내 업무 | `task.read` · `task.write` | `list_my_tasks` · `get_task` · `list_managed_works` · `set_my_task_status` |
| `planner.mine` 플래너 | `planner.read` · `planner.write` | 플래너 8개 |
| `purchase.request` 구매 신청 | `purchase.read` · `purchase.write` | 페이지·내 신청·담당 페이지 신청 · 신청·고치기·취소 (페이지 만들기 `purchase.page` 는 그대로) |
| `swap.class` 수업 교체 | `swap.read` · `swap.write` | 교체 목록·후보 · 신청·대체·응답·취소 |
| `issue.register` 발급 대장 | `issue.read` · `issue.gajeong` · `issue.volunteer` | 발급 대장 11개 |
| `schedule.survey` 일정 설문 | `survey.respond` · `survey.manage` | 설문 6개(목록이 두 허용 중 하나를 보던 `require_any_tool` 이 `require_tool` 하나로) |

**나눠 둔 것** — 남에게 번지거나 배정하는 쓰기: `schedule.manage`(참석자 알림) · `purchase.page` · `mealduty.plan` · `supervision.plan`(교사 기본 아님) · `work.manage`/`workflow.manage` · `docgen.*` · 데이터 영역 넷(`data.*` — 영역마다 공개 등급이 다르다).

- 마이그레이션 `20261024140000` — 두 CHECK 를 28개로, 옛 줄을 옮긴 뒤 지운다(추가 = 하나라도 있으면 · 해제 = 하나라도 끈 것이 있으면 · 교사 기본 = 모두 켜져 있을 때만 — 넓히지 않는 쪽). 옛 이름으로 `require_tool` 을 부르던 RPC 43개는 **가장 최근 정의를 이름만 바꿔** 다시 만들었다(본문 그대로 — 원본 파일을 기계적으로 옮겨 적었다).
- ⚠️ 함수를 다시 정의하는 마이그레이션이 생겨 회귀 `run.mts` 의 RPC 본문 검사가 **가장 나중 정의**를 읽게 고쳤다(전에는 첫 정의 — 나중에 고친 함수를 못 봤다). 옛 이름은 옛 마이그레이션 파일에 남아 있으니, RPC 를 다시 정의할 땐 이 파일(또는 그 뒤)의 정의에서 옮겨 올 것 — 옛 파일에서 옮기면 없는 허용을 확인해 **모두에게 거부된다**.
- 기록을 남기는 읽기 셋(`list_managed_purchase_requests`·`list_issues`·`get_issue`)은 쓰기 허용 안으로 들어와 `LOG_ONLY_READS` 에 올렸다(readOnly 판정).
- 검증 — 드라이런 11개 414건 통과(허용 줄 이름·개수만 고침) · 운영: `list_schedules`·`list_planner_goals`·`list_my_tasks`·`list_issues` 가 새 허용으로 동작. 엣지 `mcp` 0.6.0.

## 업무 진행하기 · 업무 실행 기록 (2026-10-24) — `work.run`

사용자 요청 «작성한 업무 흐름을 에이전트로 자동화(최소한 반자동화)» · 정의 «**자동화 = 담당자의 지시 아래 에이전트가 자동으로 수행**»(타이머·무인 실행은 바람직하지 않다) · «플레이북은 담당자의 의무가 아니다 — AI 가 분석할 데이터를 모으는 설계가 더 중요». **사용자 결정 2026-10-24**: ①`work.run` = 교사 기본 켬 ②실행 기록에 사람 id 는 남기되 분석·조회는 역할로만 ③아래 일곱 가지 전부. 2026-09-27 «AI 는 사람이 시킬 때만» 결정과 같은 줄기 — 시작은 늘 지시다.

| 도구 | 하는 일 |
|---|---|
| `get_work_progress` | 흐름 순서(절차 단계 → 일회성)로 할 일·작업의 사실 + 작업마다 `automation`(auto·confirm·person)·`next` + `next_steps` + 지난번·작년 인사이트 |
| `send_request` · `remind_pending` · `send_message` | 웹과 같은 함수(`start_collect_request`·`remind_collect_pending`·`send_task_message`)로 보낸다. `check_only:true` = 받는 사람·내용·**지문** → 사용자 확인 → 지문을 넣어 실행 |
| `get_action_results` | 입력 = 응답 표(칸 이름 = 값, 숫자 합·평균, 고르기 개수) · 제출 = 누가 무엇을 · 안 낸 사람 · 메시지 = 보낸 기록. 공개 범위는 웹 `get_collect_board` 그대로 |
| `review_work` | 기록에서 **코드로** 계산한 지표(걸린 날·늦은 날·마감 연장·응답률·절반/90%까지 걸린 날·다시 알림 뒤 48시간 응답·설정 수정·에이전트 미리보기/실행·사람이 한 단계 비율) + 작년 같은 업무와 나란히 |
| `save_work_insight` · `decide_work_insight` | 에이전트가 찾은 «다음에 더 나은 방법»과 그것을 따랐는지(applied·dismissed) — 무엇이 실제로 쓰이는지 쌓인다 |
| `get_work_guide` | 업무 기능 지식 — overview · run · patterns · human_only · 작업 종류마다(무엇·누구에게 알림·완료와의 관계·자동화 수준·쓸 도구) |
| `delete_workflow` (`workflow.manage`) | 내 흐름 지우기(노드·연결만 — 업무는 남는다, 웹과 같다) |

**미리보기 → 실행 = 지문(fingerprint)** — 문서 생성의 `check_only` 관례를 따르되, 서버가 받는 사람·설정에서 md5 를 **그 자리에서 다시 계산**해 실행 때 받은 지문과 대조한다. 표가 없다(만료·정리 없음). 미리본 뒤 담당자가 바뀌거나(대상 «이 할 일의 담당자») 칸·본문이 바뀌면 거부되고, 다시 미리보고 다시 확인받는다. 서버는 «사람이 확인했는가»를 알 수 없지만 «보여 준 것 = 나가는 것»은 강제할 수 있다. 미리보기·실행은 `agent.preview`·`agent.sent` 로 남는다(지시 한 줄 `instruction` 포함 — «무엇을 원했는가»).

**실행 기록 `work_event`** — 이미 있는 기록(상태 이력 · 요청 열림·닫힘 · 응답·제출 시각 · 발송 · 다시 알림 알림)은 그 표에서 읽고, **없던 것만** 쌓는다: 할 일의 마감·담당자·순서·보이는 날·제목 변경, 작업 연결·떼기·보관·설정 변경(트리거 — 웹·MCP 모두, `via`), 에이전트 미리보기·실행·인사이트(RPC). 플레이북을 사람이 쓰게 하지 않은 이유: 의무가 아니면 비고, 기록은 저절로 쌓인다. 스키마 = `docs/database/core.md`.

**작년 → 올해** — 웹 «지난 업무 가져오기»가 `work.meta.rolledOverFrom.workId` 를 남긴다. 그 업무의 책임자는 작년 업무의 기록·인사이트를 읽고(`can_view_work_events`), 진행 상황에 «지난번 인사이트»가 뜨고, 돌아보기가 같은 할 일(`task.meta.rolledOverFrom.taskId`, 없으면 제목)끼리 나란히 놓는다. 결정은 올해 업무에 남는다.

**판정·지식은 `src/lib/mcpWorkOps.ts` 한 곳** → 엣지 묶음 `_shared/mcpWorkOps.bundle.js`. DB 는 사실만 준다(`mcp_work_progress`·`mcp_action_results`·`mcp_work_review`), 자동화 수준·다음 할 일·결과 표·지표는 묶음이 계산한다 — SQL 과 TS 두 벌로 쓰지 않는다.

⚠️ 조용히 틀리는 자리 —
- **작업 종류가 생기면 `ACTION_GUIDES` 에** — 안 적으면 접두어 묶음(«바로가기(웹 화면)»·person)으로 떨어져 에이전트가 할 수 있는 일을 사람에게 미룬다. 회귀 `work-ops.mts` 가 레지스트리의 모든 종류·MCP 로 연결하는 종류의 제 안내·안내가 가리키는 도구의 존재를 본다.
- **«안 낸 사람»은 `remind_collect_pending` 과 같은 식이어야 한다**(`mcp_private.wr_pending` — 그 함수의 대상 고르기를 옮겨 적었다). 웹 함수를 고치면 함께 고칠 것 — 드라이런이 «미리보기 인원 = 실제로 알린 수»를 대조한다.
- **돌아보기 사실(`wr_review_facts`)에 사람 이름·id 를 싣지 말 것** — 담당자 변경은 개수로 바꿔 내보낸다(저장된 줄에는 이름이 있다 — 감사용). 회귀가 정적으로 본다.
- 작업 설정 변경은 10분 안의 같은 사람·같은 경로 변경을 한 줄로 합친다(1초 자동 저장이 기록을 도배하지 않게) — 지표는 `times` 를 더해 센다.
- 트리거는 SECURITY DEFINER 다(쓰기 정책이 없는 표에 쓴다) — 안에서 `auth.uid()`·`auth.jwt()` 는 요청자 것 그대로다. 업무째 지울 때(할 일 CASCADE) 트리거는 지워진 업무에 기록을 쓰지 않는다(`we_insert` 가 업무를 다시 확인).
- **만든 트랜잭션 안의 설정 넣기는 «설정 변경»이 아니다** — `add_action` 은 작업을 넣고 같은 트랜잭션에서 `update_collect_config` 로 설정을 채운다. 이걸 세면 만든 작업마다 수정 1회로 잡힌다(운영 시험에서 발견, `20261024160000` — `old.created_at <> now()`). 드라이런은 전체가 한 트랜잭션이라 만든 시각을 앞당겨 시험한다.
- 운영 시험(2026-10-24, 실제 에이전트 토큰 · 받는 사람 = 본인만): 진행 상황 → 요청 미리보기 → 틀린 지문 거부 → 보내기(알림 1) → 메시지·다시 알림 미리보기 → 결과 → 돌아보기(트리거 기록 11줄) → 인사이트 → 기능 안내 — 모두 정상, 시험 자료는 지웠다. 같은 시험에서 `add_action` 의 안내가 옛 «설정만 — 웹에서»를 말하던 것도 고쳤다.
- 에이전트 토큰이 아닌 웹 세션도 `mcp_*` RPC 를 부를 수 있으면 `via=web` 으로 남는다(판정은 `client_id` 클레임) — 기록의 경로는 «어디서 바꿨나»이지 «어떤 도구로»가 아니다.

검증 — 드라이런 `work-run-dryrun.sql` **44건**(허용 없음 거부 · 교사 기본 · 트리거 기록(mcp·manager) · 마감 변경 · 설정 변경 합치기 · 진행 상황 순서·사실 · 지문 없이 거부 · 미리보기 · 담당자 추가 뒤 옛 지문 거부 · 보내기 · 두 번 거부 · 담당자 변경 기록 · 미리보기·실행 기록 · 응답(웹 RPC) · 다시 알림 대상 = 웹 함수가 알린 수 · 결과 보드 · 메시지 미리보기·발송·기록 · 나이스는 요청 아님 · 돌아보기 사실(이름 없음) · 인사이트 검사·저장 · 진행 상황의 인사이트 · 웹 세션 = via web · 남의 업무 거부·기록 못 봄 · 작년 업무를 가져온 책임자가 기록·인사이트를 봄 · 올해 업무에 결정 · 흐름 지우기(남은 거부) · 업무째 지우기(남는 기록 없음) · 호출 기록 · anon) — 롤백. 옛 드라이런 work 40 · docgen-fill 20 · planner 30 · library 67(교사 기본 수 +1) · data 57 · schedule-addon 44 통과. 회귀 `npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/work-ops.mts`(묶음 최신 · 레지스트리 전 종류 안내 · 다음 할 일 · 결과 정리 · 지표 산술 · 엣지 배선 · 서버 안내) + `run.mts`(지문 대조 순서·트리거·쓰기 정책 없음·이름 없음 정적 검사).

## 업무 수행 지식 · 여러 해 계보 (2026-10-24) — `work_knowledge`

사용자 요청 «에이전트가 참고할 수 있는 업무 수행의 지식이 데이터베이스에도 저장» · «업무가 다음 해에 복제된 경우에도 과거의 지식을 참고». 위 절의 인사이트는 `work_event` 에 있었고 **한 해 전까지만** 읽혔다 — 3년째 업무는 재작년 지식을 못 봤다.

- **표 `work_knowledge`** — 업무(선택: 할 일 · 작업 종류)에 붙는 수행 지식. 종류 = `procedure`(절차) · `tip`(요령) · `caution`(주의) · `reference`(참고) · `insight`(돌아보기 인사이트 — `save_work_insight` 가 이제 여기에 쓴다). **지우지 않는다** — 고치기와 «더는 안 맞음» 보관(이유 필수)만. 작성자·역할·경로(web·mcp)는 트리거 `work_knowledge_stamp` 가 정한다(위조 불가), 업무·할 일·종류는 바꿀 수 없다(새로 남기고 옛것을 보관).
- **계보** — 웹 «지난 업무 가져오기»가 남기는 `work.meta.rolledOverFrom.workId`·`task.meta.rolledOverFrom.taskId` 를 **여러 해 거슬러** 따라간다(`mcp_private.work_lineage`·`task_lineage`, 순환·깊이 20 상한). 지식은 복사하지 않는다 — 올해 업무가 계보 전체를 읽는다. 옛 할 일의 지식은 계보가 이어진 올해 할 일(`task_now`)에 붙는다(이름이 바뀌어도).
- **읽기** = 그 업무의 책임자 ∨ 그 업무를 이어받은 **모든 후손** 업무의 책임자(`can_view_work_events` — `work_event` 도 같은 판정으로 넓혔다). 쓰기 = 그 업무의 책임자(INSERT 정책), 고치기·보관 = 읽을 수 있는 사람(이어받은 책임자가 옛 지식을 보관할 수 있다).
- 도구(`work.run`) = `list_work_knowledge`(계보 전체 · 가까운 해 먼저 · 할 일·종류 거르기 · 보관 포함 선택) · `save_work_knowledge` · `update_work_knowledge`. `get_work_progress` 의 `insights` → **`knowledge`**(계보 전체, 40개), `decide_work_insight` 는 계보 안의 어떤 지식에도(결정은 지금 업무의 `work_event`).
- 마이그레이션 `20261024170000`. 운영의 옛 `insight.saved` 는 0건이라 옮기지 않았다(`work_event` CHECK 에는 값이 남아 있다).

**작업(action) 단위 지식 (같은 날, `20261024190000`)** — 사용자 결정: «action 은 같은 종류라도 할 일마다 다른 설정으로 쓰인다 → action 지식은 work - task - action 에 연결되어야 한다(task 는 work 에 자연히 이어지므로 따로 필요 없다)».
- `work_knowledge.action_id` — 그 작업에 붙은 지식. 할 일은 트리거가 작업에서 채우고(다른 할 일을 적으면 거부), 작업·할 일·종류는 바꿀 수 없다. `action_type`(종류 전반의 지식)은 남겨 두었다.
- **작업의 계보 = `task_action.rolled_over_from`**(원본 작업 id, FK 없음) — 웹 «지난 업무 가져오기»(`workRolloverService`)가 작업을 옮길 때 적는다. 계보 함수 `mcp_private.action_lineage`. 지난 해 작업의 지식은 올해 같은 작업(`action_now`, 이름이 바뀌어도)에 붙고, **같은 종류의 다른 작업에는 붙지 않는다**.
- **가져오기 고침** — 종전엔 작업을 (할 일, 종류)당 하나로 접어, 한 할 일에 나이스 작업이 둘이면 다음 해엔 하나만 남았다(운영에 그런 할 일 4곳). 이제 여러 개 둘 수 있는 종류는 새 `instance_key`(uuid)로 하나씩 옮기고, 하나뿐인 종류만 접는다(유니크 키에 만든 사람이 들어 있어 원본은 사람마다 따로였어도 옮기면 겹친다). 운영에 가져온 작업은 0건이라 채울 옛 자료는 없었다.
- 에이전트: `list_work_knowledge`·`save_work_knowledge` 에 `action_id`(매개변수 추가라 DROP + CREATE), `get_work_progress` 가 작업마다·할 일마다 붙은 지식(`knowledge`)을 보여 준다. 웹: «붙일 곳»이 업무 전체 · 할 일 · **그 할 일의 작업**.

⚠️ 조용히 틀리는 자리 —
- **작업을 옮기는 새 길(흐름 복사 등)은 `rolled_over_from` 을 적지 않는다** — 지식이 이어지는 길은 «참고해서 시작 › 작년 같은 일 이어가기»(옛 «지난 업무 가져오기»)뿐이다. 같은 창의 «비슷한 일 참고»는 일부러 null 이다(2026-11-12). 그 길을 만들면 원본 작업 id 를 함께 적을 것.

**돌아보기 권하기 · 지식 후보 (같은 날, `20261024200000`)** — 에이전트가 «언제 돌아볼지·무엇을 남길지»를 기억에 맡기지 않고 진행 상황에서 신호로 받는다. 신호일 뿐이다 — 에이전트가 담당자에게 권하고 담당자가 정한다(저절로 저장·따로 도는 실행 없음, 사용자 결정).
- `mcp_work_progress` 가 재료를 함께 준다: `history`(= `wr_review_facts`, 돌아보기와 같은 사실 — 이름 없음) · `previous_history`(가져온 업무면 작년) · `reflection`(이 업무에 남긴 지식 수·마지막 시각). **판정은 `mcpWorkOps.ts` 의 `reviewDue`·`knowledgeCandidates` 한 곳**이고, 재료는 응답에서 지운다.
- `review_due` = 할 일이 모두 끝났고(모두 취소면 아님) 마지막 완료 뒤로 이 업무에 남긴 지식이 없다 → `next_steps` 끝에 `review_work`(confirm).
- `knowledge_candidates` = 기록상 막혔던 할 일·작업과 이유 — 할 일: 늦게 끝남·마감 연장·담당자 구성 2번↑·단계 순서 2번↑ / 작업: 다시 알림 2번↑·마감 때 응답률 90% 미만·90%까지 7일↑·설정 수정 2번↑. `again` = 지난해 같은 할 일(작업은 같은 할 일의 같은 종류)도 그랬다(앞에 정렬). **올해 이미 지식을 남긴 할 일·작업은 뺀다**(지난해 지식은 치지 않는다). 최대 8개, 사람 단위로 세지 않는다.
- ⚠️ 문턱 숫자를 바꾸면 `work-ops.mts` ⑤-1 이 함께 바뀐다. 재료 칸을 SQL 에서 빼면 오류 없이 신호만 사라진다(드라이런 `progress reflection inputs`).
- **«비슷한 일 참고»(옛 «다른 업무에서 복사», 2026-11-12 통합)는 계보를 남기지 않는다** — 지식이 이어지는 길은 «지난 업무 가져오기»뿐이다. 손으로 새로 만든 업무는 지난 해 지식을 못 본다(이어 주려면 `rolledOverFrom` 이 있어야 한다).
- **웹 = 업무 상세의 «업무 지식» 칸**(같은 날 — `WorkKnowledgeSection`, 판정·문구 `src/lib/workKnowledge.ts`). 읽기 = RPC `get_work_knowledge`(`20261024180000` — 에이전트 도구와 같은 `mcp_private.wk_knowledge`, **`mcp_*` 가 아니라 에이전트 허용에 묶이지 않는다**), 쓰기·고치기·보관 = 표에 바로(정책·트리거가 권한·작성자를 지킨다). 책임자가 아니면 칸을 그리지 않는다(서버 `can_view`). **고치기는 이 업무의 지식만**, 지난 해 지식은 보관만(이어받은 책임자가 옛 기록을 고쳐 쓰지 않게). 웹에서 고르는 종류는 넷(인사이트는 돌아보기에서). 회귀 `npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs scripts/work-knowledge-web-test/run.mts`(SSR — 로그인이 OAuth 라 브라우저로 닿지 못한다).
- `work_lineage` 는 지워진 중간 업무에서 끊긴다(그 위 조상 지식은 안 보인다). 업무를 지우면 그 업무의 지식도 CASCADE 로 지워진다.

검증 — 드라이런 `work-knowledge-dryrun.sql` **28건**(종류 넷 저장 · 인사이트는 전용 도구 · 빈 제목 거부 · 서버가 작성 정보 · 인사이트 = 첫 줄 제목 · 이어받기 전엔 못 읽음 · 3년째가 계보 셋을 읽음 · 2년 전 할 일 지식 → 이름이 바뀐 올해 할 일 · 가까운 해 먼저 · 할 일·종류 거르기 · 진행 상황 · 보관 이유 필수 · 이어받은 책임자가 옛 지식 보관 · 보관 숨김/보기 · 2년 전 인사이트 결정 · 옛 업무에 직접 쓰기 거부 · 종류 못 바꿈 · 작성자 위조 무시 · 남의 할 일 거부 · 계보 밖 교사 0 · 순환 종료 · 2년 전 기록 읽기 · anon) + `work-run-dryrun.sql` 45건(인사이트 위치 갱신) — 롤백. 운영(이 세션의 에이전트 연결): 인사이트 저장 → 진행 상황 `knowledge` → 업무 지우기(지식 CASCADE, 남은 것 0).

## 공문 판단함 (2026-10-30) — `official.doc` (관리자 전용)

- 도구 `list_official_docs`(판단 대기·처리 필요·결정됨) · `get_official_doc`(본문·판정 이력·결정 이력·맞는 규칙) · `decide_official_doc`(결정 + 선택 규칙, `via='mcp'`).
- **교사 기본 꺼짐** — 시드가 관리자에게만 사람별 허용을 넣는다. 표 RLS 도 관리자만이라 허용을 넓혀도 빈 결과(두 겹).
- 할 일·업무는 이 도구가 만들지 않는다 — `create_task`·`create_work` 로 먼저 만들고 id 를 넘긴다(웹 결정 창과 같은 모양의 결정 행).
- 상세·데스크 카드·규칙 적중 = `docs/features/official-doc-triage.md`. 마이그레이션 `20261030190000`.

### 에듀파인 공문 읽기 (2026-11-12) — `official.read` (교사 기본 켜짐, 읽기만)

| 도구 | RPC | 하는 일 |
|---|---|---|
| `search_official_docs` | `mcp_search_official_docs(query, sender, approver, from, to, mine, limit)` | 최신 접수순, 본문 없이 + 최신 판정 요약·마지막 결정. `query` = 띄어 쓴 낱말 모두 포함(제목·발신·본문·붙임·시행번호), `from/to` = 접수일(KST, 양끝 포함), `mine` = 결재권자 = 나. `total` 과 잘림 안내 |
| `read_official_doc` | `mcp_read_official_doc(doc_no)` | 본문 · `info`(발신 기관·시행/접수 번호·수신·수신자·경유·관련·붙임 목록·발송 안내·공개·문의 — 결재선·주소·표어는 뺀다) · `triage`(최신 판정 하나) · `decisions` · `parents`(원 공문, 받지 않은 것은 번호·제목만) · `follow_ups`(이 공문을 원 공문으로 가리키는 공문) · `similar`(이전에 받은 비슷한 공문 + 그때 담당·결정, 지난 학년도 표시) |

- **사용자 결정 = 교직원 누구나 모든 접수 공문.** 그러나 넓힘은 **이 두 RPC 안에서만**이다 — 정책 `official_doc mcp faculty read` 는 «트랜잭션 한정 설정 `mcp.read_official_docs = on` · `is_staff_teacher_or_admin`» 일 때만 통과하고, 설정은 두 RPC 가 켰다 끈다(`mcp.read_notifications` 와 같은 방식). 웹·데스크는 그대로(관리자 · 결재권자 = 나) — 정책을 그냥 넓히면 모든 교사 데스크에 판단함 카드가 뜬다. 판정·결정 표의 읽기 정책은 «그 공문이 보이면»이라 함께 열린다. ⚠️ 다른 RPC 에서 이 설정을 켜지 말 것.
- 쓰기 없음(결정은 `official.doc` 의 `decide_official_doc` — 관리자). 호출은 `log_call` → VOLATILE. 2026-10 수집 시작 전 공문은 없다(대장 3년치는 서버 PC 파일 — `similar` 로만 보인다). 붙임 파일 자체는 없다(목록만).
- 드라이런(운영, 롤백): 교사 에이전트 전체 424 · 내 공문 49 · RPC 밖 직접 읽기 49(웹 범위 그대로) · 낱말+발신+기간 27 · 원/후속/비슷한 공문 · 호출 기록 7. 마이그레이션 `20261112130000`.

## 내 알림 (2026-11-04) — `notification.mine`

- 도구 `list_notifications` — 웹 «알림»(`/notifications`)과 같은 내 알림. `filter` unread(기본)·all · `days` 1~60(기본 14) · `include_casual` · `limit` ≤100. 결과 = `unread`·`total`·`hidden_casual` + 알림마다 `kind`(한국어 종류)·`type`·`title`·`message`(2000자)·`sender`(meta 의 보낸 사람 키들)·`priority`·`is_read`·`at`(KST). **교사 기본 켜짐**, 읽기 허용(`writes:false`).
- **읽기만** — 읽음 표시·답장·삭제를 하지 않는다(웹 배지가 그대로). 호출은 `log_call` 로 기록(쪽지에 학생 이름이 들 수 있다) → **VOLATILE**.
- 놀이 알림(`tama_%`·`academy_%`·`coin_grant`·`world_news_pick`)은 기본 숨김 — 운영에서 쿨메신저 다음으로 많아 업무 알림을 덮는다.
- ⚠️ **RESTRICTIVE `mcp_agent_no_realtime`** 이 에이전트 토큰의 SELECT 를 막는다(Realtime 구독 차단). 이 도구만 통과시키려고 정책을 «client_id 없음 **또는** `current_setting('mcp.read_notifications', true) = 'on'`» 으로 바꾸고, RPC 가 `set_config(…, true)`(트랜잭션 한정)로 켰다가 끈다. PostgREST·Realtime 클라이언트는 임의 GUC 를 넣을 수 없어 이 설정을 켜는 길은 이 함수뿐이다. 행 범위는 기존 PERMISSIVE `owns_notification_resource` 그대로(INVOKER). ⚠️ 이 정책을 다시 정의할 때 이 분기를 지우면 도구가 오류 없이 빈 목록을 준다 · 다른 RPC 에서 이 설정을 켜지 말 것.
- 마이그레이션 `20261104100000`.

## 학교 맥락 목록 (2026-11-06) — `knowledge.context`

**왜**: 근거(«이 과목에 정기시험이 있나», «이 업무 담당·절차는», «성취기준은 어디»)를 대려면 학교 지식이 **어디에 어떤 구조로** 있는지 알아야 한다. 지식은 이미 흩어져 있다 — 문서 생성 맥락 라이브러리(성취기준), 업무 수행 지식(`work_knowledge`), 데스크 업무 요약(서류함), 정기시험 계획, 업무분장, 업무 지도, 교육과정 편제, 나이스 안내 …. `school_context` 는 그것들의 **카탈로그**이고, 목록에 없던 학교 지식(규칙·관행·절차)을 **note** 로 새로 적는 곳이다. 개별 자료 열람용이 아니다.

| 도구 | RPC | 하는 일 |
|---|---|---|
| `list_contexts` | `mcp_list_contexts(query, area, include_archived)` | 영역별 개수 + 맥락 목록(key·제목·영역·종류·요약·where·live) |
| `get_context` | `mcp_get_context(key)` | 구조·들어 있는 것·locations [{type, ref, how}]·갱신·개인정보 수준·live·(note) body |
| `save_context` | `mcp_save_context(…, check_only)` | 새 note / 내 note 고치기(보낸 칸만). source 는 관리자. 기본 check_only |
| `archive_context` | `mcp_archive_context(key, reason)` | 보관(지우지 않음). 내 note·관리자 |

- **source ↔ note**: source 는 자료가 다른 자리에 있고 이 줄은 위치·구조만(관리자가 관리, `live` 로 규모를 센다). note 는 이 줄이 곧 지식(body 8000자).
- **locations.type**: dataset(read_data) · mcp_tool · table · web · docgen_context · document_folder · work_knowledge · neis · file(그 PC 에만) · person · external.
- **지금 규모**: `mcp_private.sc_live(live)` 가 시스템이 정한 자료만 센다(INVOKER — 보는 사람 RLS 대로, 예: 업무 지식은 내가 책임자인 것만). 웹은 `school_context_live(key)`.
- **개인정보**: 트리거가 주민번호·휴대전화·이메일 꼴을 거절. 이름+성적 같은 것은 도구 설명·웹 안내와 사람 확인으로 막는다. `sensitivity` 는 *가리키는 자료*의 수준(student = 학생 개인정보 — 필요한 만큼만, 학년-반-번호).
- **웹**: 메뉴 **맥락 관리** `/contexts`(`src/features/school-context/` — `ContextsPage.tsx` · «학교 맥락» `SchoolContextPanel.tsx` · «문서 맥락» = `ContextLibraryDialog inline`). 문서 생성의 «맥락 관리» 단추는 `/contexts?tab=library` 로 보낸다. 문서 생성의 «이번 생성에 사용» 고르기는 아직 문서 맥락(docgen_context)만.
- **데스크**: 쿨메신저 쪽지 분석(Haiku)이 읽기 도구로 `list_contexts`·`get_context` 를 쓴다(NEIS_helper `resident_tasks.READ_TOOLS`).
- 회귀: `run.mts`(이름표·INVOKER·견본) · 드라이런 `school-context-dryrun.sql`(30건 — 목록·규모·note 쓰기·남의 것/ source 거절·전화 꼴 거절·보관·관리자 source).

### 문서 맥락 (2026-11-09, 사용자 결정) — 같은 허용 `knowledge.context` · `20261109140000`

맥락 관리 화면(`/contexts`)의 두 탭 중 «문서 맥락»(`docgen_context` — 문서 생성에 붙이는 배경 글, 운영 118건 = 과목별 성취기준)에 MCP 가 없었다. 새 허용 없이 학교 맥락과 같은 `knowledge.context` 에 도구 5개.

| 도구 | 하는 일 |
|---|---|
| `list_doc_contexts` | 내 것 + 남의 공개분(RLS) — 분류별 개수·앞부분 160자·연결된 생성 방식. query·category(`(분류 없음)`)·mine·**action_id(그 생성 방식에 연결된 것만)** |
| `get_doc_context` | 본문 전부(2만 자) + 연결된 생성 방식 |
| `save_doc_context` | 새로 쓰기(title·body) / 내 것 고치기(보낸 칸만, category `""` = 지우기) · `check_only` 가 before/after 와 **공개 범위**(나만 / 교직원 / 교직원 + 학생 — 분류 «성취기준»은 학생 탐구 설계가 읽는다)를 준다 |
| `delete_doc_context` | 내 것 지우기(연결도 cascade) · `check_only` |
| `link_doc_context` | 내 맥락 ↔ 생성 방식 연결·해제 — 웹 문서 생성이 미리 골라 둔다 |

- **규칙은 웹(`contextService.ts`)·표 RLS·트리거 그대로** — 쓴 사람만 고치기·지우기 · `hidden` = 나만 · 연결된 맥락은 숨길 수 없다(트리거 `docgen_context_hide_requires_unlinked` — RPC 가 먼저 친절한 문구로 거절) · 숨긴 맥락은 연결할 수 없다(연결 = 공개) · 연결은 내 맥락 × 내가 만든 생성 방식(관리자는 모두), 풀기는 맥락 쓴 사람·생성 방식 만든 사람·관리자.
- **생성 방식은 다른 문서 도구처럼 `action_id`** — 연결 표의 `template_id` 는 `task_action.config.defaultTemplate.id` 에서 서버가 찾는다(`mcp_private.dc_template_of`). 운영 연결 0건(2026-11-09 — 웹 기능은 있으나 아직 안 쓰였다).
- MCP 에서만: 쓰기 전에 주민번호·휴대전화·이메일 꼴을 거절(`mcp_private.dc_no_personal` — 학교 맥락과 같은 규칙, 웹 저장은 그대로).
- 학교 맥락 목록의 `docgen_context_library`·`achievement_standards` 위치에 도구를 적었다(종전 «MCP 로는 아직 없음»).
- ⚠️ 성취기준은 두 벌이다 — 문서 맥락의 과목별 묶음(118) · 표 `subject_achievement_standards`(1,118 — `read_data achievement_standards`). 한쪽만 고치면 어긋난다(정본 미정 — 사용자 확인 필요).
- 회귀: `run.mts` · 드라이런 `scripts/mcp-agent-test/doc-context-dryrun.sql`(28건 — 목록·거르기·읽기·만들기 미리보기/저장·전화 꼴 거절·숨기기·남에게 안 보임·남의 것 고치기/지우기 거절·숨긴 것 연결 거절·연결/다시 연결/생성 방식으로 거르기·연결된 것 숨기기 거절·남의 연결 풀기 거절·지우기·허용 끄기·호출 기록).

## 입시 정보 (2026-11-09) — `ipsi.hub`

웹 «입시 정보»(`/ipsi`, `docs/features/ipsi-hub.md`)를 에이전트에게 연다. 새 허용 `ipsi.hub`(교사 기본 켜짐), 마이그레이션 `20261109120000_mcp_ipsi_hub.sql`.

| 도구 | 하는 일 | 누가 |
|---|---|---|
| `search_ipsi` | 피드 최신순·검색 — **웹과 같은 `get_ipsi_hub_feed`**(제목·요약·출처·포인트·기사 본문·자막, 띄어쓰기 무시 AND 8낱말). 30건씩 `next_offset` · `match_field`/`match_snippet` | 교사·관리자 |
| `get_ipsi_item` | 기사(출처·포인트·본문) / 영상(설명·포인트·핵심 개념·시간대 메모·자막) — 본문·자막 12000자씩 `next_text_offset` | 〃 |
| `list_ipsi_analyses` · `get_ipsi_analysis` | 웹 «분석 이력»과 같은 표(`educational_news_compound_analysis`) — 근거 자료 목록·지워진 자료 수 | 〃(RLS — 교직원은 전부) |
| `save_ipsi_analysis` | 에이전트가 쓴 복합 분석을 이력에 남긴다 — 웹 `saveCompoundAnalysis` 와 같은 칸, `model = 'mcp-agent'` · `raw_response = {via:'mcp'}`. 근거 id 가 실제로 있어야(40건까지) | 〃 · `check_only` |
| `add_ipsi_video` · `update_ipsi_video` · `delete_ipsi_video` | 웹 «동영상 추가·수정·삭제»와 같은 표·RLS + 요약·설명·포인트(`meta`) · 고치기·지우기 = 올린 사람·관리자 | 〃 · `check_only` |
| `add_ipsi_news` | 기사 **직접 추가**(웹에는 없다 — 사용자 결정). 출처는 주소로 서버가 정한다 | 교사·관리자(기존 RLS) · `check_only` |
| `update_ipsi_news` · `delete_ipsi_news` | 기사 고치기(주소·출처 제외)·지우기 | **관리자만**(기존 RLS) · `check_only` |

- **직원은 막는다** — 웹 `/ipsi` 가 라우트에서 직원을 막으므로(`STAFF_BLOCKED_PREFIXES`) RPC 도 `mcp_private.ipsi_teacher()`(= `is_teacher_or_admin`)로 거부한다. 사람별 허용(`mcp_tool_grant`)으로 직원에게 줘도 열리지 않는다(드라이런으로 확인).
- **기사 출처 `manual`(«직접 추가»)** — 사용자 결정으로 `educational_news_source_check` 를 넓혔다(표 구조 변경). 판정 `mcp_private.ipsi_news_source(url)`: `jinhak.com`(하위 도메인 포함) → `jinhak` · `uway.com` → `uway` · 그 밖 → `manual`. ⚠️ **`riroschool` 은 리로스쿨 사이트가 아니라 수집기가 리로스쿨 enews 로 모은 60여 언론사 기사 묶음**이라 주소로 판정할 수 없다 — 에이전트가 고를 수 없게 했다. 표에 «넣은 사람» 칸이 없어 `meta.added_by`(uid)·`added_via='mcp'` 에 적는다.
- **⚠️ 출처 이름은 네 벌이다** — DB CHECK · `mcp_private.ipsi_source_label` · `get_ipsi_hub_feed` 의 검색용 이름(«직접 추가»로도 찾게 같은 마이그레이션에서 다시 정의, 인자 그대로 CREATE OR REPLACE) · 웹 `src/features/ipsi-hub/utils/newsSources.ts`. 종전 웹은 카드·목록·AI 분석 선택/검토·프롬프트가 출처 표를 따로 들고 `SOURCE_META[source].label` 로 읽어 **모르는 값이 오면 피드 전체가 깨졌다** — 한 곳으로 모으고 모르는 값은 회색 배지로 그리게 고쳤다. 그래서 **웹 배포가 마이그레이션보다 먼저**여야 한다(옛 웹에 `manual` 기사가 보이면 깨진다).
- **영상 주소는 웹 플레이어가 읽는 모양으로 바꿔 넣는다** — 웹 `extractYouTubeId` 는 `watch?v=`·`youtu.be`·`embed` 만 읽는다. `shorts`·`live` 주소를 그대로 넣으면 재생이 안 된다 → `https://www.youtube.com/watch?v=<id>` 로 저장하고 `video_id` 칸도 채운다(중복 판정 = `video_id` 또는 주소에 id). 다른 영상으로 주소를 바꾸면 자막·채널·길이를 비운다.
- **⚠️ `SELECT … FOR UPDATE` 는 UPDATE 정책을 통과한 행만 본다** — 교사가 남의 영상을 고치려 하면 «없는 영상»으로 잘못 거절됐다(드라이런에서 발견). 잠그기 전에 일반 SELECT 로 있는지·권한을 먼저 보고 거절 문구를 정한 뒤 잠근다.
- **학생도 피드를 본다**(두 표 SELECT = true) — 에이전트가 넣는 기사·영상 요약은 학생에게 보인다. 도구 설명·서버 안내가 «확인한 내용만 · 수치를 지어내지 않는다 · 합격 가능성 단정 금지»를 말한다. 분석 이력은 교직원 전부가 본다 — 학생이 만든 분석의 작성자는 «학생»으로만.
- 서버는 AI 를 부르지 않는다 — 복합 분석은 에이전트가 자료를 읽고 직접 쓴다(웹의 luna 분석과 같은 칸에 남길 뿐).
- 학교 맥락 목록에 자료 위치 `ipsi_hub`(source) 한 줄을 등록했다.
- 회귀: `run.mts`(이름표·INVOKER·견본) · 드라이런 `scripts/mcp-agent-test/ipsi-hub-dryrun.sql`(46건 — 검색·나눠 읽기·분석 저장·근거 id 검사·영상 추가/주소 정규화/중복/고치기/남의 영상 거절/지우기·기사 출처 판정/본문 검색/«직접 추가» 검색/중복(끝 / 포함)·교사 고치기 거절·관리자 고치기·지우기·직원 거절·허용 끄기·호출 기록·출처 CHECK). 웹 = `ipsi-hub-search-test`(36) · `ipsi-ai-analysis-test`(84).
- 되돌리기: 마이그레이션 머리 주석.

## 켜는 법 (대시보드 — 코드로는 못 한다)

1. Authentication → **OAuth Server** → 켜기
2. **Authorization Path** = `/oauth/consent` (Site URL + 이 경로가 동의 화면 주소)
3. **Allow dynamic OAuth apps**(동적 클라이언트 등록) 켜기 — Claude 등 MCP 클라이언트가 스스로 등록한다.
   등록이 열려도 ①허용된 사람만 [승인]이 보이고 ②토큰은 `mcp_*` 밖으로 못 나가므로 피해 범위가 묶인다
4. Admin «에이전트(MCP)» 탭에서 사람과 도구를 켠다
5. 사용자: Claude → 설정 → 커넥터 → 사용자 지정 커넥터에 `https://your-project-ref.supabase.co/functions/v1/mcp`,
   Claude Code: `claude mcp add --transport http spacekijun <주소>`

## ⚠️ 조용히 틀리는 자리

- **도구 이름표가 세 곳**(SQL CHECK · `handler.js` TOOLS · `mcpTools.ts`) — 어긋나면 «켰는데 저장 거부» 또는 «켰는데 도구가 안 보임». 회귀가 대조한다
- **새 MCP 도구 = 새 `public.mcp_*` RPC** — 이름이 `mcp_` 로 시작하지 않으면 훅이 막는다(에이전트에게만 실패해 개발 중엔 안 보인다). RPC 는 `security invoker` + `require_tool('<grant>')` + `revoke … from public, anon`
- **세션을 새로 만들어 주는 엣지 함수를 추가하면 `isAgentAuthorization` 으로 거부할 것** — 안 그러면 에이전트 토큰 → 일반 세션으로 ②를 우회한다(`desktop-session`·`classroom-link` 가 그 자리였다)
- **`openid` 범위를 내놓지 말 것** — 이 프로젝트는 대칭 키(HS256) 서명이라(JWKS 비어 있음) ID 토큰을 못 만든다. 비대칭 서명 키로 옮기기 전까지 `scopes_supported = email profile`
- **`meeting` INSERT 정책은 `true`** — `created_by` 를 막는 것이 없으므로 RPC 가 스스로 `require_tool` 이 돌려준 내 리소스 id 를 넣는다(인자로 받지 않는다)
- 일반 로그인 토큰은 MCP 서버가 받지 않는다(401) — 입구는 OAuth 동의를 거친 에이전트뿐
- **웹과 MCP 는 같은 칸에 쓴다 — 저장 모양 계약 (2026-10-25)**. 웹이 읽는 모양(대상 규칙·입력 받기·나이스·외부 화면 설정)을 바꾸고 MCP 쓰기를 안 고치면 **오류 없이** 갈라진다. 실제로 난 두 건:
  ① `{type:"all_faculty"}` 가 `types` 없이 저장 → 웹 요약 `c.types.includes` 에서 업무 화면이 «Cannot read properties of undefined (reading 'includes')» 로 깨졌다(서버 해석은 교사뿐으로 동작해 SQL 드라이런은 통과)
  ② 나이스 화면이 `key` 없이 `{name, path}` 로 저장 → 웹 `parseNeisActionConfig` 가 조용히 버려 «화면 없음»
  고침 = MCP 는 웹 모양으로만 쓴다(`wk_audience` 가 조건마다 웹 타입으로 다시 짓고, 나이스는 `search_neis_guide` 의 key → 웹 `toNeisScreenRef`(`mcpLibraryOps.neisScreenRefs`)) + 웹 `parseAudienceRule` 은 빠진 칸을 서버 해석과 같은 값으로 메운다(두 겹).
  **지키는 법** = 회귀 `npx tsx --tsconfig tsconfig.app.json scripts/mcp-agent-test/contract.mts --db` — 고정 예시 `web-contract.json`(에이전트 입력 → 저장값)이 웹 parse 를 거쳐도 같은지, SQL 실제 출력이 그 저장값인지, **운영의 모든 작업 설정**을 웹이 예외·버림 없이 웹 모양 그대로 읽는지. 웹 읽기 함수(`audienceRule`·`collectInput`·`neisScreens`·`externalScreens`) 머리에 이 계약을 적어 두었다. 새로 MCP 가 쓰는 칸이 생기면 이 검사에 그 종류를 더할 것

## 남은 위험 (시험판에서 받아들인 것)

- 에이전트 토큰으로 **다른 엣지 함수**(AI 프록시 등)는 그 사용자 권한 안에서 부를 수 있다 — 자료가 새진 않지만 비용이 든다
- 에이전트 토큰으로 `auth/v1/user` 의 자기 계정 정보 변경 요청이 가능할 수 있다(Supabase 쪽 동작 미확인)
- 동적 등록이 열려 있어 아무 클라이언트나 **등록**은 할 수 있다(승인은 허용된 사람만)

## 검증

- 드라이런(실제 DB, 전부 롤백) 28건: 훅(에이전트 → `meeting`·`profiles`·`mcpx_evil` 거부 / `mcp_my_tools` 통과 / 일반 세션 통과) ·
  허용 전후 · 생성 3종(23:30 → 23:59, 하루 종일, 1시간) · 입력 오류 4종 · Storage 4,243 → 0, 알림 187 → 0 · 직원 자가 허용·학생 허용 거부
- 운영: 메타데이터 200 · 토큰 없음 401 + 헤더 · `desktop-session` 에 에이전트 토큰 403 · 비로그인 요청 영향 없음
- 회귀 `npx tsx scripts/mcp-agent-test/run.mts`(47 — 세 곳 정합·훅·배선) + `handler.mts`(32 — 가짜 Auth·PostgREST 로 서버 동작)
- **끝에서 끝 (2026-10-18)**: Claude Code 가 동적 등록(`Claude Code (spacekijun)`, public·PKCE) → 동의 → 개인일정 생성(`meta.via.client_id` 가 그 클라이언트) → 조회 → 웹에서 삭제까지 확인
- **담임·업무 도구 (2026-10-19)**: 드라이런(실제 DB, 롤백) 담임 17건(1학년 1반 24명 = 명단 24 · 학생 이름 노출 0 · 담임 아님·허용 없음·anon 거부 · 기록 6줄) + 업무 21건(임시 업무에 single·rounds·units·안 보이는 할 일 → 담당자·책임자·무관한 교사 세 시점, 방식별 RPC·거부 문구·명단 노출 범위). 회귀 `run.mts` 107 · `handler.mts` 46 · `live.mts` 30(새 RPC 넷 = 훅 통과, `task`·`student_timetable`·`mcp_call_log`·`set_task_assignee_status`·`my_collect_requests` 직접 호출 = 차단)
- **문서 생성 방식 (2026-10-20)**: 회귀 `npx tsx scripts/mcp-agent-test/docgen.mts`(실제 양식 form1·form2 + 그 검증된 스펙을 «에이전트의 답»으로 — 지도·조립·시험 채움·잘못 짚은 자리 10종 거부·올리기 함수·MCP 도구 배선) · 드라이런 `docgen-dryrun.sql`(실제 DB, 롤백) 25건 — 허용 없음·.hwp 거부·에이전트는 올리기 몫 RPC·표에 못 닿음·티켓 한 번·틀린/만료 티켓·남(허용 있음)은 내 올리기를 못 읽고 못 만듦·저장 모양·비공개는 남에게 안 보임·anon 거부. 운영: 가짜 티켓 410(=service_role RPC 동작) · 토큰 없음 401. ⚠️ 실제 파일을 운영 저장소에 올리는 끝에서 끝은 아직 사람 손 확인 대기
- **생성 방식으로 문서 만들기 (2026-10-20)**: 회귀 `npx tsx scripts/mcp-agent-test/docgen-fill.mts`(form1 양식 + 검증된 스펙으로 칸 읽기·값 검사 6종·채움·다시 묶은 파일 확인·제약 실패 · 엣지 함수: 토큰 3종·읽는 경로·실행 → 파일 → 마무리 순서·저장 경로·완성 문서 페이로드·명단 대조·저장 실패 시 failed 로 닫음 · MCP 도구) · 드라이런 `docgen-fill-dryrun.sql` 20건(허용·목록·양식 찾기·명단 대조·실행 시작·폴더 밖 산출물 거부·남은 내 실행을 못 닫음·남에게 비공개 생성 방식은 안 보이고 실행도 안 됨·공개는 보임·완성 문서 행 = 웹 모양·두 번 마무리 거부·anon). 운영: 토큰 없음 401. ⚠️ 실제 양식을 받아 채우는 끝에서 끝은 사람 손 확인 대기
- **데이터 카탈로그 (2026-10-20)**: 회귀 `npx tsx scripts/mcp-agent-test/data.mts`(카탈로그 ↔ 분기 ↔ 엣지 · 교시 시간 = 앱 · 금지 칸 이름 · 내선 검색 · NEIS 식단 정리 · 도구 노출) · 드라이런 `data-dryrun.sql` 32건(허용 없음 · 학생 영역 미허용 · 모르는 데이터셋·조건·필수 조건·날짜 형식 · 16개 데이터셋 각각 · 이메일 없음 · 남의 수업 학생 시간표 거부 · 학생 호출 기록 · anon). 운영 도구 호출기 = `npx tsx scripts/mcp-agent-test/call.mts <도구> <인자>`(Claude Code 의 에이전트 토큰으로 운영 MCP 를 직접 — `/mcp` 재연결 없이 끝에서 끝)
- **업무 만들기·흐름 (2026-10-20)**: 드라이런 `work-dryrun.sql` 40건(만들기·단계 끼우기와 다시 매기기·일회성(마감 여러 개·담당자·보이는 날)·담당자 바꿔도 완료 유지·단계 옮기기 · 작업 6종 연결·중복·관리자 종류 거부·입력 설정 고치기·잘못된 대상 · 흐름 배치(웹 규칙 자리)·다시 올려도 그대로·잇기·빼기 · 남(허용 있음)은 책임자 아님으로 막힘·남의 흐름 못 바꿈 · 진행 기록 있으면 지우기 거부·없으면 노드까지 정리·anon) + `run.mts` ②-4(작업 종류 = 레지스트리)
- **운영 차단 점검** `npx tsx scripts/mcp-agent-test/live.mts`(**실제 에이전트 토큰**으로 표·쓰기·다른 RPC·GraphQL·contest·Storage·세션 발급 함수가 막히는지). 토큰 = `MCP_AGENT_TOKEN` 또는 Claude Code 자격 증명. ⚠️ «거부»만으로는 증거가 아니다 — 인자가 틀린 RPC 는 404 로 훅에 닿지도 않고, 비공개 파일은 차단돼도 `Object not found` 다. 그래서 실재 RPC 로 `MCP_TOOLS_ONLY` hint 를 확인하고, Storage 는 같은 계정 일반 세션과 대조했다(`predictions` 7개 ↔ 에이전트 0개)

## 되돌리기

대시보드에서 OAuth Server 끄기(발급 중단 — 기존 토큰은 만료까지 `mcp_*` 만). 완전히 걷어내려면 훅을 이전 정의로,
`drop policy mcp_agent_no_storage on storage.objects; drop policy mcp_agent_no_realtime on public.notification_events;`,
RPC 3종·`mcp_private`·`mcp_tool_grant` 삭제. 담임·업무 도구만 끄려면 관리자 탭에서 그 허용을 거두면 된다(다음 호출부터 거부) —
걷어내려면 RPC 6종·`mcp_call_log` 를 지우고 CHECK 를 `schedule.*` 둘로 되돌린다. 구매 신청 도구는 RPC 7종(`mcp_*purchase*`)과 `mcp_private.pr_*` 를 지우고 CHECK 에서 `purchase.*` 셋을 뺀다. 일정 관리는 RPC 4종(`mcp_find_staff`·`mcp_*_schedule`)과 `mcp_private.sch_*` 를 지우고 CHECK 에서 `schedule.manage` 를 뺀다. 문서 생성 방식은 함수 `mcp-upload` 삭제 + RPC 7종(`mcp_docgen_*`·`docgen_upload_*`)·`mcp_private.dg_*`·`mcp_private.docgen_upload` 를 지우고 CHECK 에서 `docgen.create` 를 뺀다(만들어진 양식·생성 방식은 웹 것과 같으므로 남는다). 발급번호 대장 도구는 RPC 11종(`mcp_*issue*`·`mcp_list_clubs`·`mcp_create_volunteer_*`·`mcp_set_club_activities`)과 `mcp_private.iss_*` 를 지우고 CHECK 에서 `issue.*` 셋을, 플래너 도구는 RPC 8종(`mcp_*plan*`)과 `mcp_private.pl_*` 를 지우고 `planner.*` 둘을 뺀다(만든 발급·계획은 웹 것과 같아 남는다). 문서 쓰기는 함수 `mcp-docgen` 삭제 + RPC 5종(`mcp_docgen_list`·`_target`·`_check_people`·`_run_start`·`_run_finish`)을 지우고 CHECK 에서 `docgen.fill` 을 뺀다(남은 실행 기록·완성 문서는 웹 것과 같다). 시간표·스케줄 부가 기능은 RPC 27종(`20261023180000`·`20261023190000` 의 `public.mcp_*`)과 그 파일의 `mcp_private.*` 를 지우고 CHECK 에서 아홉 허용(`timetable.memo`·`swap.*`·`schedule.meeting`·`survey.*`·`mealduty.plan`·`supervision.*`)을 뺀다(만든 메모·교체·설문·일정은 웹 것과 같아 남는다).

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 에이전트(MCP) 연결 시험판 (2026-10-18)

허용된 교직원이 자기 에이전트(Claude 등)를 MCP 로 연결해 일정을 읽고 개인일정을 넣는다. 인증 = **Supabase OAuth 2.1 서버** — 에이전트가 받는 토큰은 **사용자 본인의 JWT** 이고 `client_id` 클레임이 붙는다(일반 세션에는 없다). 서버 = 엣지 함수 `mcp`(상태 없는 Streamable HTTP, `verify_jwt=false`, service_role 안 씀) · 동의 화면 `/oauth/consent`(연결 해제도 여기) · 허용 = Admin «에이전트(MCP)» 탭(표 `mcp_tool_grant` 사람 × 도구). **세 겹**: ①도구 허용(각 RPC 가 확인) ②DB 입구 — `account_link_pre_request` 가 에이전트 토큰을 `/rpc/mcp_*` 만 통과(hint `MCP_TOOLS_ONLY`) + Storage·Realtime RESTRICTIVE + 세션 발급 함수 거부 ③RLS 그대로. ⚠️ **새 MCP 도구 = 새 `public.mcp_*` INVOKER RPC + `require_tool`** — 이름이 `mcp_` 가 아니면 훅이 막는다(에이전트에게만 실패). 도구 이름표는 SQL CHECK · `functions/mcp/handler.js` TOOLS · `src/lib/mcpTools.ts` 세 벌. ⚠️ **세션을 새로 만들어 주는 엣지 함수를 추가하면 `_shared/agentToken.js` 의 `isAgentAuthorization` 으로 거부할 것**(에이전트 토큰 → 일반 세션 = ② 우회). ⚠️ `openid` 범위 금지(HS256 프로젝트 — ID 토큰 불가). 켜기 = 대시보드 OAuth Server + Authorization Path `/oauth/consent` + 동적 등록(코드로 못 한다). 회귀 `npx tsx scripts/mcp-agent-test/run.mts` + `handler.mts` + 운영 차단 점검 `live.mts`(실제 에이전트 토큰 — 훅·Storage·함수를 고치면 다시 돌릴 것). **2026-10-19 담임·업무 도구**: `homeroom.read` = 담임 태그 반의 재학생 **번호만**·시간표(반을 인자로 받지 않는다 — 담임 태그에서 유도, 이름 미반환, 호출은 `mcp_call_log`) · `task.read`/`task.write` = 담당자·책임자인 것만 읽고 **내** 상태만 바꾼다(방식별 기존 RPC `set_task_assignee/deadline/unit_status` 를 부른다 — ⚠️ MCP 에서 task 를 직접 UPDATE 하지 말 것, 제출 가드·이력이 거기 있다). 업무 만들기·담당자 변경·남의 상태·메시지·제출은 일부러 넣지 않았다. **일정 관리**(같은 날) = `schedule.manage`(`find_staff` · 연수·업무·출장·학사일정 만들기 · 내가 만든 일정 고치기·지우기 — 참석자는 `meta.assignee` 이름 키라 재직 교직원 정확히 한 명만, 알림은 기존 INSERT 트리거). **구매 신청 도구**(같은 날) = `purchase.read`(페이지·내 품목·담당 페이지 신청 — 학생 신청자는 학반 번호만) · `purchase.write`(새 신청 · 처리 대기인 내 품목 고치기·취소) · `purchase.page`(새 신청 페이지) — ⚠️ `purchase_requests` INSERT 정책은 기간·대상을 안 보므로 RPC 가 `pr_require_open` 으로 확인한다, 상태 변경은 웹에서. **문서 생성 방식 만들기**(2026-10-20) = `docgen.create` — 에이전트가 한글 양식(.hwpx)을 **1회용 올리기 주소**(curl → 엣지 `mcp-upload`, 셸 있는 에이전트만)로 올리고, 문서 지도를 읽어 **채울 자리·이름표를 에이전트가 직접 고른다**(서버 자동 탐지 안 씀 — 사용자 결정), 저장 전에 웹 엔진으로 시험 채움. ⚠️ `mcp-upload` 만 service_role(티켓이 정한 경로 하나) · 검사 엔진은 `_shared/docgenAgentSpec.bundle.js`(원본 `features/document-generation/mcp/agentSpec.ts` + 웹 문서 엔진) — **문서 엔진을 고치면 `npx tsx scripts/mcp-docgen/build-bundle.mts` 로 다시 묶고 `mcp`·`mcp-docgen` 배포**. 반대 방향 = `docgen.fill`(같은 날) — 이미 있는 생성 방식의 칸을 **에이전트가 전부 써서**(서버 AI 없음) 한글 파일 + 실행 기록·완성 문서(웹과 같은 모양)로 저장, 양식 읽기·파일 쓰기만 엣지 `mcp-docgen` 이 service_role(경로는 사용자 토큰 RPC 가 정한다). **데이터 카탈로그**(같은 날, 사용자 결정) = 읽기는 도구 둘(`list_data`·`read_data`) + DB 카탈로그 `mcp_private.data_catalog()`, 허용은 영역 넷(`data.school`·`data.staff`·`data.my`·`data.student` — 학생은 **공개 등급 둘 (2026-10-23 인터뷰, 사용자 결정)** — **전교 재학생 공개** = `student_roster`(학반 번호·이름) · `student_profile`(+ 올해 동아리 + 이번 학기 수강 과목) · `student_timetable`, **담임 반·내 수업 반만** = `student_attendance`(자습실 출석 — 요약 + 날짜별, 판정은 `seaton_private` 를 `seaton_stats_students` 로 받아 쓴다), 내신·모의고사·봉사·창체는 열지 않는다(보류), 직원은 허용을 주지 않는 것으로 막는다, 호출 기록 · 정본 마이그레이션은 카탈로그를 다시 정의한 가장 나중 파일(`20261023150000`) — 회귀가 그 파일을 읽는다). ⚠️ 새 데이터 = 카탈로그 한 줄 + `mcp_private.ds_*`(INVOKER, **내보낼 칸을 골라 둔다** — 표 통째 조회 금지) + `mcp_read_data` 분기, 회귀 `scripts/mcp-agent-test/data.mts`. **업무 만들기·흐름**(같은 날) = `work.manage`(업무·할 일·작업 만들기·고치기·지우기 — 할 일·작업은 그 업무의 책임자만, 진행 기록이 있으면 지우지 않음, 입력·제출·메시지는 설정만) · `workflow.manage`(웹과 같은 자동 배치·연결). ⚠️ 작업 종류 표 `mcp_private.wk_action_def` 는 `actionRegistry.ts` 와 짝(회귀가 대조). ⚠️ `mcp_tool_grant` CHECK 는 마이그레이션마다 지우고 다시 만든다 — 최신 정의가 정본(회귀가 마지막 정의를 읽는다). **발급번호 대장·플래너**(2026-10-22) = `issue.read`·`issue.gajeong`·`issue.volunteer`(채번은 기존 `create_document_issue`, 학생은 학년·반·번호로 서버가 찾고 한 명이라도 못 찾으면 번호를 안 쓴다, 확인서 파일은 웹) · `planner.read`·`planner.write`(⚠️ `plan_write`·`save_goal` 은 없는 칸을 비움으로 받으므로 지금 값을 먼저 읽어 채운다). 상세 = `docs/features/mcp-agent.md`.


## 2026-10-25 — 전자서명 자세히 보기 · 문서 받기 · 관리 화면 순서 · 스킬

- 도구 `get_sign_request`(RPC `mcp_get_sign_request`, STABLE) — 한 건의 결재선/서명자(서명자마다 칸 수·서명 여부), 문서 이름·형식·쪽수,
  원본·완성본이 남아 있는지(7일 정리·Drive 이동), `web_url`.
- 도구 `get_sign_file` — 15분 받기 주소. **엣지 `mcp-sign`** 이 에이전트 토큰으로 `mcp_sign_file_target`(VOLATILE, 호출 기록)을 불러
  받을 경로(원본·완성본, 첫 세그먼트 = 요청 id 를 RPC 가 확인)를 받고, 그 경로만 service_role 로 서명한다(mcp-docgen 과 같은 규약 —
  에이전트 토큰은 저장소가 막혀 있다). 회귀 `scripts/mcp-agent-test/sign-file.mts`(일반 토큰 거부 · 다른 요청 폴더 거부 · RPC 오류 문구).
- 허용은 기존 `sign.request` 그대로(두 CHECK·정책 시드 불변). 요청 만들기(파일 + 서명자 + 문서 위 서명 칸)는 칸을 문서 위에 그려야 해 웹에 남겼다.
- (2026-11-12) 도구 `get_sign_links`(RPC `mcp_get_sign_links`, VOLATILE·호출 기록, `20261112140000`) — 서명자별 **로그인 없는 서명 링크**
  `<앱>/sign/<토큰>`(웹 «서명 QR»과 같은 링크, 토큰은 요청을 만들 때 `issue_signature_sign_tokens` 가 30일짜리로 이미 만든다).
  범위 판정은 웹 RPC `get_signature_sign_links`(요청자·관리자 = 전원, 서명자 = 자기 것)에 맡기고, **웹보다 좁혀 쓸 수 있는 토큰만** 내준다
  (요청 pending · 그 서명자 pending · 미만료 — 끝난 사람의 죽은 토큰도 대화에 남기지 않는다). QR 그림은 서버가 만들지 않는다 —
  에이전트가 셸에서 `npx -y qrcode` 로 만들고, **외부 QR 생성 서비스에 주소를 넘기지 않게** 설명에 적었다(링크 = 신원).
- 관리 화면(도구 설명·권한 배정)의 기능 순서 = **보는 사람의 왼쪽 메뉴 순서**(`MCP_FEATURES[].menu` + `orderFeaturesByMenu`). 메뉴가 없는 기능(학교 데이터)은 맨 뒤.
- 스킬: `.claude/skills/spacekijun-mcp`(도구로 업무 처리 — 확인 규칙·레시피) · `.claude/skills/mcp-tool-dev`(도구 만들기 체크리스트·회귀).

## 2026-10-25 — 관리 화면 «연결한 사람»

- 사용자 요청 «MCP 권한 인증 받은 사용자 리스트도 확인». Admin ▸ 에이전트(MCP) 다섯째 탭(`McpConnectionsTab`) — 동의 화면에서 허용한 사람,
  에이전트(이름별 등록 수), 켜진 허용 수(«권한 배정»과 같은 자료), 처음 허용, 마지막 사용(세션 갱신·기록된 호출 중 늦은 것), 기록된 호출(30일).
- 원본 = RPC `admin_mcp_connections()`(관리자 전용 DEFINER, `20261025150000`) — `auth.oauth_consents` 한 줄 = 사람 × 에이전트 등록.
  ⚠️ **Claude Code 는 다시 연결할 때마다 새 클라이언트로 등록**된다(운영 실측 — 한 사람에게 같은 이름 4줄). 화면은 사람으로 묶는다(`src/lib/mcpConnections.ts`).
- 이름이 `mcp_` 가 아니라 에이전트 토큰은 이 목록을 못 본다(의도). 토큰·리디렉트 주소·IP·user agent 는 내보내지 않는다.
- 호출 수는 `mcp_call_log` 기준이라 «학생 정보를 읽거나 무언가를 바꾼 호출»만이다 — 전체 사용량이 아니다.
- 연결 해제는 각자 `/oauth/consent` 에서(관리자 강제 해제는 만들지 않았다). 회귀 `scripts/mcp-agent-test/connections.mts`(`--db` = 운영 함수 권한·칸).
- (같은 날) `get_sign_request` 에 `document.due_at`(서명 마감, 진행 중만) — 전자서명 마감일 도입(`20261025160000`, `docs/features/e-signature.md`).

## 2026-10-25 — 문서 생성 결과로 전자서명 요청 만들기 `create_sign_request`

- 사용자 요청 «문서 생성의 부서별 협의록을 작성하고 그 문서로 전자서명 · 서명란까지 맥락적으로 맞는 위치에». 허용 = 기존 `sign.request`.
- RPC `mcp_create_sign_request(run_id, title, signers, message, due_at, page_count, check_only)`(INVOKER·VOLATILE, `20261025170000`):
  원본 = 내 실행(`task_action_run.created_by = 나`)의 `task_action_artifact` 'generated-hwpx'(내 실행 폴더·`.hwpx` 만) · 서명자 = 재직
  교직원 이름 정확히 한 명 · 서명란 = `page-box`(웹 `isValidPlacement` 와 같은 규칙, `page_count` 를 주면 쪽 범위) / `hwpx-cell`(label) ·
  마감 = 1시간 뒤 ~ 60일. 저장 = 웹과 같은 `create_signature_request` → `set_signature_source_path(<id>/source.hwpx)` → `set_signature_due`.
- 파일 복사 = 엣지 **`mcp-sign` op `create`** — 사용자 토큰으로 RPC 를 부르고, 돌려준 `copy_from`(`<나>/runs/<run_id>/` 로 시작)·`copy_to`
  (`<요청 id>/source.hwpx`)의 모양을 다시 본 뒤 service_role 로 task-work-documents → signatures 복사. **복사 실패면 요청을 취소**(원본 없는 껍데기 금지).
  회귀 `sign-file.mts`(경로 경계·취소·미리보기 무접촉).
- ⚠️ **서버는 HWPX 를 그릴 수 없다** — «맥락에 맞는 서명란 위치»는 에이전트가 문서를 렌더해 보고 정한다(스킬 `/spacekijun-mcp` 레시피,
  개발용 보기 `fixture.html?view=doc`). 시험: 부서별 협의록의 «참석대상» 칸 이름 옆 `{page:0, x:0.375, y:0.25, w:0.13, h:0.042}`.
- (같은 날) **알림 없이 요청** — `notify:false` → `signature_request.meta.notify = false`, `notify_signature_turn` 이 그 요청의 서명자 차례 알림을
  보내지 않는다(만들 때·순서가 넘어갈 때 모두, `20261025180000`). 웹 요청 화면에는 없다. 옛 도구 목록을 든 에이전트는 모르는 칸을 글자로
  보내므로 `"true"`·`"false"` 도 받는다.
- (같은 날) **서명란 위치는 실례를 따른다** — 사용자 지적: 에이전트가 임의로 고른 «이름 옆 빈칸의 큰 상자»는 «별로». 운영의 웹 협의록 요청
  (과학과, 7인)은 **각 이름의 아래쪽 절반에 이름 폭(≈0.057×0.022)의 상자를 이름마다** 둔다 — 2인 시험 요청을 이 관례로 다시 만들었다.
- (같은 날) `set_training_sign_link_expiry`(schedule.manage) — 내가 만든 연수의 로그인 없는 서명 링크 기한 바꾸기(`20261025200000`).
- (같은 날) `get_training_sign_links`(schedule.manage, `20261025210000`) — 링크 주소 보기. 처음엔 «링크 = 신원이라 내보내지 않는다»로 정했으나 **사용자 요청으로** 연다 — 범위는 웹과 같다(만든 사람·관리자 = 전원, 참석자 = 자기 것), 볼 때마다 호출 기록. `create_schedule` 연수 안내 문구도 링크를 말한다(`20261025220000` — 운영 정의에서 문구만 바꿈).

## 2026-11-04 — 구매 신청 페이지 고치기 · 학생 쪽지 답장 (`20261104110000`)

- `update_purchase_page`(허용 `purchase.page`) — 내가 담당자(`is_purchase_page_manager`)인 페이지의 제목·안내문·신청 기간·보관. 보낸 칸만 바뀐다. `check_only` 가 before/after(`period_status`)를 준다 — 기간을 바꾸면 신청이 바로 열리거나 닫히니 먼저 보여 준다. **대상·칸 구성·공동 작업자는 웹에서**(이미 들어온 신청의 칸과 어긋난다 — 회귀가 `target_roles`·`columns` 쓰기를 막는다).
- `reply_desk_message`(새 허용 `desk.message`, **교사 기본 켜짐** — 사용자 결정) — 학생이 보낸 쪽지(`desk_message`, `meta.sender_role='student'`)에 답장. **받는 학생은 원래 쪽지에서 서버가 정한다**(인자로 받지 않음). 보내기는 웹·데스크와 같은 `send_desk_message_v2` — 대화 허락·한도·원래 쪽지 «답장함»이 그 한 곳. 교사가 답하면 대화가 열린다(허락과 같다). `check_only` 기본 true, 글만(사진 없음), 호출 기록. 원래 쪽지를 읽으려고 `list_notifications` 와 같은 트랜잭션 설정을 켠다.
  - 원래 쪽지의 `meta.sender_resource_id` 는 받는 교사가 고칠 수 있는 칸이지만, 교사는 원래 어느 학생에게나 쪽지를 보낼 수 있어 새로 열리는 권한은 없다.
- `list_notifications` — 알림마다 `can_reply`(학생이 보낸 쪽지) 추가.

## 2026-11-04 — 고치기·지우기 빈틈 메우기 (`20261104120000`)

«만들 수는 있는데 고치거나 지울 수 없는» 자리를 점검해 웹이 이미 같은 사람에게 허용하는 일만 같은 칸·같은 판정으로 열었다. 허용은 새로 만들지 않았다.

| 허용 | 새 도구 | 판정·주의 |
|---|---|---|
| `schedule.survey` | `update_schedule_survey` · `delete_schedule_survey` | 작성자·관리자(`can_manage_schedule_survey`). 대상자는 staff·students 를 주면 **통째로** 바뀐다, 새 대상자 알림 없음(웹과 같다), `check_only` 가 늘고 준 대상자·응답 수. 지우면 응답도 사라진다 |
| `issue.register` | `update_volunteer_issue` · `set_volunteer_class_roster` | 고치기 = 작성자·관리자(`iss_lock_mine`), 반별 명단 = 웹 `update_volunteer_class_roster`(그 반 담임도). ⚠️ 웹 단체 봉사는 **양식이 비어 있거나 칸이 ""** 이고 **시간은 학생마다** 적는다 — 빈 값은 «없음»으로 보고, 인정시간 기본값(1)을 새로 적지 않으며 hours 를 줬을 때만 학생 시간을 바꾼다(드라이런에서 443명 시간이 1로 덮일 뻔했다) |
| `sign.request` | `set_sign_request_due` | 웹 `set_signature_due` 그대로(요청자·관리자·진행 중·최대 기간) |
| `work.manage` | `archive_action` · `set_task_status` | 보관 = 진행 기록이 있을 때만(없으면 remove_action), 입력 받기 요청은 트리거가 마감. 할 일 전체 상태 = 책임자(`wk_task`) → 기존 `update_task_status`(이력), task 직접 UPDATE 아님 |
| `workflow.manage` | `update_workflow` · `remove_workflow_node` | 내 흐름(`wf_editable`), 노드만 빼고 업무·할 일·작업은 그대로 |
| `docgen.create` | `update_document_generation` · `delete_document_generation` | 만든 사람(`dg_my_method`). 공개는 웹처럼 `'public'`·`'private'` 을 적는다. 지우기는 **실행 기록이 없을 때만**(결과 파일은 저장소 — 에이전트 토큰이 못 지운다) |
| `docgen.fill` | `list_generated_documents` · `finalize_document` · `delete_generated_document` | 내 문서·최신 판. 지우기는 확정 판이 하나라도 있으면 **하나도 안 지우고** 거부(웹은 반쯤 지우고 멈춘다) |

- `update_schedule`·`delete_schedule` 의 허용이 `['schedule.manage', 'schedule.mine', 'mealduty.plan', 'supervision.plan']`(`require_any_tool`) — 일정 관리가 없으면 `mcp_private.sch_require_kind_grant` 가 종류를 본다: 개인일정 = `schedule.mine`, `meta.supervision` 있는 업무 일정 = `supervision.plan`, 제목 «급식지도 - » 업무 일정 = `mealduty.plan`.
- 일부러 웹에 남긴 것: 생성 방식의 채울 자리 고치기(스펙 검증에 양식 렌더가 필요), 완성 문서의 새 판(create_document 로 새로), 실행 기록 있는 생성 방식 지우기, 동아리 봉사 출석·제외 학생, 업무 흐름 메모 노드.

## 2026-11-04 — 서류함 파일 올리기·받기·지우기 · 코드 공유 이진 파일·가져가기 (`20261104130000`)

허용은 그대로(`document.library`·`code.share`, 교사 기본). 저장소는 에이전트 토큰이 막혀 있어 **보조 엣지 `mcp-files`**(`verify_jwt=false`, 에이전트 토큰만)가 사용자 토큰으로 RPC 에 무엇을 다룰지 묻고 그 경로만 service_role 로 다룬다(`mcp-sign` 규약). 회귀 `scripts/mcp-agent-test/files.mts`(가짜 fetch — 남의 폴더·다른 프로젝트 경로 서명·삭제·복사 거부, 실패한 가져가기 정리).

| 허용 | 새 도구 | 판정·주의 |
|---|---|---|
| `document.library` | `start_document_upload` → (셸 curl PUT) → `finish_document_upload` · `add_document_link` · `get_document_file` · `delete_document` | 올리기 = 교직원, 경로 `library/<나>/<시각>_<uuid>.<확장자>`(웹 `uploadDocument` 와 같은 경로·meta, `meta.uploaded_via='mcp'`). 링크 = **구글 드라이브 주소만**(웹 «링크 붙여넣기»). 받기 = 볼 수 있는 문서(교직원 library · 옛 «내 폴더»), 드라이브·링크는 link 만. 지우기 = 내 문서(관리자 모두), 업무·이벤트 연결·다른 기능이 올린 문서 거부, **드라이브 원본은 지우지 않는다**(웹도 구글 로그인 없으면 행만) |
| `code.share` | `start_code_file_upload` → curl → `finish_code_file_upload` · `get_code_files` · `fork_code_project` (+ `delete_code_project`·`update_code_project` 가 이진 파일도) | 올리기 = 내 프로젝트, `<id>/<path>`, 한 번에 20개 · 5MB · 300개·20MB. 받기 = 볼 수 있는 프로젝트(링크 공개 포함). 가져가기 = 웹 `forkCodeProject`(텍스트 행 복사 · 이진은 버킷 안 copy → `finish_code_file_upload` 로 등록 · 실패하면 새 프로젝트를 지운다) |

- **올리기 = Storage 서명된 올리기 주소**(경로 하나에 묶인 토큰, 2시간 — 따로 티켓 표가 없다). curl 은 `Content-Type` 을 확장자로 정해 싣는다(빠지면 `x-www-form-urlencoded` 로 저장된다). **«다 올렸다»는 `finish_*` RPC 가 `storage.objects` 를 읽어 확인**한다 — 크기·종류는 저장소 기록이고 에이전트가 말한 값이 아니다.
- ⚠️ RESTRICTIVE `mcp_agent_no_storage` 는 에이전트 토큰의 `storage.objects` 를 전부 막는다 → 알림과 같은 방식으로 **USING(읽기)에만** «트랜잭션 설정 `mcp.read_storage = on`» 분기를 더했다(WITH CHECK = 쓰기는 그대로 차단). 켜는 곳은 RPC 여섯(`mcp_document_upload_begin`·`mcp_finish_document_upload`·`mcp_code_file_upload_begin`·`mcp_finish_code_file_upload`·`mcp_code_orphan_objects`·`mcp_delete_code_project`)뿐이고 읽은 뒤 끈다. 버킷 SELECT 정책은 그대로 적용된다. ⚠️ `perform set_config` 도 `FOUND` 를 바꾼다 — `select into` 뒤 판정을 먼저.
- 지우기 순서 = **행 먼저(RLS 판정) → 저장소**. 저장소 정리가 실패해도 행은 이미 없다 — 남은 객체(행 없이 하루 넘은 것)는 다음 `start_*_upload` 때 엣지가 치운다(`orphans`). 이진 파일을 빼거나 텍스트로 덮으면 RPC 가 `removed_objects` 를 주고 도구가 `mcp-files` `code_cleanup`(→ `mcp_code_orphan_objects`, 행이 안 가리키는 것만)을 부른다.
- 검증 — 운영 드라이런(롤백, 실제 교사 토큰 모양): 올리기 시작·나쁜 이름·안 올라옴·남의 폴더·등록(meta 웹과 같음)·두 번 등록 거부·목록·받기 대상·남의 드라이브 문서 link·남의 문서 지우기 거부·드라이브 아닌 링크 거부·링크 등록(meta)·지우기(드라이브 안내)·내 문서 지우기(객체 경로) · 하루 넘은 올리다 만 파일 · 코드 올리기 시작(중복 경로 하나로)·`.env` 거부·남의 프로젝트 거부·안 올라옴·5MB 초과 거부·등록·목록에 binary·받기 대상·내 것/학교 샘플 가져가기·이진 빼기 → removed_objects·정리 목록·남의 프로젝트 정리 거부·프로젝트 지우기(객체 목록) · **RPC 밖에서 에이전트 토큰의 storage.objects = 0행**.

## 2026-11-05 — 자습실(seaton 열람실) 관리 `studyroom.manage` (`20261105120000`)

새 허용 `studyroom.manage` — **교사 기본 켜짐**(사용자 결정, 웹 seaton 도 모든 교사가 열람실 설정·출석을 바꾼다). 판정은 seaton RLS 와 같이 교사·관리자(`mcp_private.sr_require_teacher` — 직원은 RLS 가 0행으로 조용히 막기 전에 문장으로 거절). 학생 표시 = **학년-반-번호 + 이름**(웹 출석 화면과 같다 — 사용자 결정, 이름이 같으면 번호로 구분).

| 도구 | 하는 일 · 웹과 같은 자리 |
|---|---|
| `list_study_rooms` | 열람실·설정(운영 기간 = `fixed_start/end_date`, 운영 요일, 교시, 신청 기간 = `booking_windows` + 상태 접수 중/예정/끝, 중복 신청, 규칙) + 주간 신청 설정(`reservation_settings`) |
| `update_study_room` | 보낸 칸만, `check_only` 기본 true(before/after + 경고: 새 운영 기간·요일 밖에 남는 오늘 이후 신청 수 — 지우지 않는다). 저장 모양 = `RoomEditor`(요일 → `is_saturday/sunday_open`, 첫 신청 기간 → `booking_start/end_date` 레거시 칸). 교시는 **있는 id 의 이름·시각만** |
| `set_booking_windows` | 여러 열람실 신청 기간을 통째로(`BulkBookingWindowsModal` 과 같은 저장). 주간 신청 열람실 거부 |
| `get_study_room_attendance` | 날짜(+열람실·교시) — 자리·학생·교시·상태(출석·인정출석·보완·미확인)·처리 시각·처리 교사. 열람실 없이 = 열람실별 수. 호출 기록(VOLATILE) |
| `set_study_room_attendance` | attended·excused·supplement(순공 열람실만)·clear — 웹 `checkAttendance` 류와 같은 네 칸(`is_attended`·`attendance_status`·`attended_at`·`checked_by`). 대상 = 자리·학년-반-번호·미확인 전부, `check_only` 기본 true(+ not_found). **오늘 이후 날짜 거부** |
| `get_study_room_stats` | 통계 계약 `seaton_stats_summary` 그대로(400일까지) |

- 출석 코인은 트리거 `wallet_seaton_attendance` 가 `attendance_status` 를 보고 지급·회수한다(에이전트 경로에서도 — 드라이런에서 지급 10·취소 −10 확인). ⚠️ 도구 설명에 **금액을 적지 않는다**(코인 경제 설정 값 — 처음 초안의 «+5» 는 이미 틀려 있었다).
- **학년 고치기**(2026-11-05 `20261105130000`, 사용자 요청) — `update_study_room` 의 `grades`(+ 레거시 `grade` = 첫 학년). 열람실 학년을 읽는 곳은 학생 «자리 신청» 목록 · 자습 감독 초안(`gradeSlotConfig`) · 통계 표시뿐이라(«내 예약»·출석·코인은 room_id) 다른 학년의 남은 신청은 그대로 운영된다 — 미리보기가 그 수·마지막 날을 경고, 이름을 바꾸면 «내 예약»에 바로 보인다는 경고도.
- 웹에 남긴 것: 좌석 배치도·신청 방식·교시 더하기/빼기·교시 신청 방식·순공 표시·열람실 만들기/지우기, 예약 만들기/옮기기/지우기, 주간 신청 설정.
- `booking_windows` 의 시각은 시간대 없는 `YYYY-MM-DDTHH:MI`(웹 datetime-local — 한국 시각)로 적는다. 레거시 `booking_start/end_date` 는 같은 글자를 timestamptz 로(웹이 PostgREST 로 넣는 것과 같다).
- 검증 — 운영 드라이런(롤백, 교사 토큰 모양): 허용 기본 · 목록 11 · 고치기 미리보기(운영 기간 줄임 경고 10건 · 교시 시각 · 신청 기간) · 없는 교시·뒤집힌 기간·요일 7 거부 · 요일 빼기 경고 · 저장(행 칸 확인) · 일괄 미리보기·저장 · 날짜별 수 · 열람실 상세 13 · 미래·순공 아닌 보완·대상 없음 거부 · 자리/학생 미리보기(not_found) · 인정출석→취소→출석 저장 · 코인 지급/회수 · 통계 · 직원 거부.

### 자습실 역할 권한 · 자습 추가·옮기기·지우기 (2026-11-05 `20261105150000`, 사용자 결정)

허용 `studyroom.manage` 는 그대로 교사 기본이고 **역할은 RPC 가 태그로 판정**한다(관리자는 모두):

| 무엇 | 누가 | 도구 |
|---|---|---|
| 열람실 목록·날짜별 출석 보기·출석 처리·통계 | 모든 교사(자습 감독이 출석을 처리) | `list_study_rooms` · `get_study_room_attendance` · `set_study_room_attendance` · `get_study_room_stats` |
| 열람실 설정(신청·운영 기간·학년·이름·교시 시각·규칙) | **«N학년 부장» 누구나, 모든 열람실** | `update_study_room` · `set_booking_windows`(`mcp_private.sr_require_head`) |
| 학생 자습 추가·옮기기·지우기·되살리기 | **그 학생의 학년 부장 · 담임(«N학년 N반»)** | `add_study_room_reservations` · `move_study_room_reservations` · `delete_study_room_reservations` · `list_study_room_trash` · `restore_study_room_reservations`(`mcp_private.sr_can_manage_student`) |

- 추가 = 웹 `adminCreateReservations` 판정(운영 요일 × 교시, 종일 0 ↔ 교시 겹침, 학생 겹침은 중복 허용 열람실끼리 따로 = `applyPoolFilter`, 겹치는 칸은 건너뜀). 자리 = 배치도 섹션 안 · `emptySeats`·`unavailableSeats` 아님. 학생은 학년-반-번호 → seaton 로그인 이력(profiles)이 있어야 한다. 지난 날짜·120일 넘게는 거부.
- 옮기기 = **기존 행에서 자리·열람실만 고친다**(웹 `adminChangeSeat` 는 지우고 다시 만든다 — 출석·코인 영수증이 끊긴다). 오늘 이후만, 새 자리의 다른 학생·다른 열람실 교시 불일치·학생 중복은 거부.
- 지우기 = 출석 처리 행은 빼고(`kept_attended` — 먼저 clear 로 코인 회수), 지우기 전에 표 `study_room_reservation_trash` 에 행 전체. 되살리기 = 같은 id 로(자리·학생 칸이 비었을 때만, 아니면 까닭과 함께 건너뜀).
- 검증 — 운영 드라이런(롤백): 담임 = 자기 반 추가(10칸 미리보기 → 1교시만 5건)·다른 반 거부·로그인 안 한 학생 거부·쓸 수 없는 자리(C3) 거부·지난 날짜 거부·다시 추가 시 학생 중복 5칸 건너뜀·옮기기·지우기(보관함 5)·보관함·되살리기(5)·다시 되살리기 «이미 되살림»·설정 둘 거부·출석 보기 됨 / 2학년 부장 = 설정(학년) 미리보기·신청 기간·다른 반 추가·1학년 학생 거부·출석 처리된 신청 지우기 «kept_attended 2» / 태그 없는 교사 = 설정·추가 거부, 보관함 0, 목록 됨.

## 2026-11-10 — 예산 관리 `budget.manage` (`20261110120000`)

웹 «업무 관리 › 예산»과 같은 표·RLS(INVOKER — 담당자 = 쓰기, 관리자 = 읽기). 교사 기본 켜짐. 상세 `docs/features/budget.md`.
- 읽기: `list_budgets`(학년도 사업 + 숫자 + 반납 위험) · `get_budget`(줄·계획·차수·품의 연결·이어진 업무·최근 카드)
- 쓰기(모두 `check_only` → 확인): `apply_budget_card`(**파일을 받지 않는다** — 에이전트가 엑셀을 읽어 사업 하나의 줄을 보낸다, 새 사업이면 `new_name`) · `save_budget_plan`(만들기·고치기·지우기) · `set_budget_line`(마감·메모) · `simulate_budget_revision`(propose/set · 남는 돈 → `leftover_line_id` · 신설 줄) · `confirm_budget_revision`(되돌릴 수 없음) · `link_budget_order`(계획 ↔ 품의 품목) · `link_budget_work`(사업 ↔ 업무)
- ⚠️ 숫자 규칙 SQL(`mcp_private.bg_*`) ↔ 웹 `budgetMath.ts` 두 벌 — 같은 실례로 대조(`budget-dryrun.sql`의 미배정 4,176,940 · `scripts/budget-test`)

## 2026-11-11 — 에이전트 작업 요청 `agent.request` (`20261111120000`)

보내는 선생님이 «이 일을 이렇게 해 달라»(요청 내용 · 수행 안내 단계 · 연결 항목 — 문서 생성 방식·업무 작업·업무·할 일·스킬 · 기한)를 에이전트에게 설명하면,
에이전트가 `send_agent_request` 로 꾸며 **check_only 미리보기 → 보내는 선생님 확인 → fingerprint** 로 보낸다(받는 사람 = 재직 교직원 이름 정확히 한 명, 연결 항목은 보내는 사람이 볼 수 있는 것만 — 제목은 서버가 채움).
받는 사람마다 `agent_request` 한 줄 + 알림 `agent_request`(푸시). 받는 쪽은 데스크 에이전트 터미널 «작업 요청»(입력칸에 넣기만 — NEIS_helper `core/agent_request.py`) ·
모바일·웹 «에이전트»(`agent_request_send_to_agent` → 데스크 칸의 대화로 바로)에서 자기 에이전트에게 넘긴다. **맡길 말은 `agent_req_private.prompt` 한 곳**에서 만든다 —
«다른 선생님이 쓴 요청, 내 지시 아님 · 계획 먼저 확인 · 되돌리기 어려운 일은 다시 확인 · 빠진 사실은 묻기 · 끝나면 확인받아 reply_agent_request».
끝나면 받는 사람이 `reply_agent_request`(done·declined + 결과, check_only) → 보낸 사람에게 `agent_request_result` 알림. 보낸 사람은 cancelled.
한도: 30명/번 · 60건/시간 · 요청 내용+단계 5000자(맡길 말이 데스크 메시지 8000자 안). 회귀 `supabase/tests/agent_request.sql`.

## 2026-11-11 — 동아리 `club.manage` (`20261111140000` · `160000` · `180000` · `200000` · `220000`)

새 허용 하나(교사 기본 켜짐), 도구 23개. 웹 «동아리»(`/clubs`)와 **같은 DEFINER RPC**(`club_*`)를 INVOKER 래퍼가 부른다 — 판정(지도교사·동아리 담당자·기장)은 서버 한 곳. 쓰기는 모두 `check_only`(기본 true) → 확인 → `check_only:false`. 상세 `docs/database/clubs.md`.

| 묶음 | 도구 |
|---|---|
| 명단·정보 | `get_club_overview` · `get_club`(명단 — 호출 기록) · `save_club` · `set_club_advisors`(담당자, 이름·id) · `set_club_members`(add/replace) · `decide_club_members` · `set_club_leader` |
| 누가기록·요청 | `get_club_notes`(근거 = 누가기록 + 요청 응답 + 올해 활동·참여 — 호출 기록) · `save_club_note`(source=agent → 웹 «에이전트 초안») · `list_club_requests` · `send_club_request`(담당자 — 동아리·부원 축 입력 받기를 업무로 만들어 보낸다) |
| 예산·구매 | `get_club_finance` · `set_club_finance`(담당자) · `open_club_purchase_page` — 품목 승인·품의는 기존 구매 도구에 페이지 id |
| 편성 | `list_club_recruits` · `save_club_recruit` · `get_club_applications`(호출 기록) · `judge_club_applications` · `finalize_club_applications` · `decide_club_proposal` · `roll_over_clubs` |
| 옛 기록 | `list_club_host_candidates` · `link_club_host` — 이름이 비슷해도 자동으로 잇지 않는다 |

- ⚠️ **누가기록 문장은 MCP 로만**(사용자 결정 — 웹엔 생성 버튼이 없다). 도구 설명이 «근거에 없는 사실·평가어를 지어내지 말 것»을 못 박는다.
- 학생 지원·개설 신청은 웹 학생 화면에서만(에이전트 연결은 교직원용).
- 회귀 `run.mts` 의 `readOnlyHint` 검사 1건 실패는 **이 작업 전부터** 있던 것(`list_documents`·`list_budgets` 등 10개 — STABLE 인데 annotation 이 다르다), 동아리 도구는 통과.
