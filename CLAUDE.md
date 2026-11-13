# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Rules
- **DO NOT CHANGE** existing UI/database structure without permission
- **UPDATE** CLAUDE.md when important changes are made
- **BE PATIENT** when erasing existing code - verify dependencies first
- **CONFIRM** database changes work correctly and update the relevant `docs/database/<domain>.md` (+ DATABASE_TABLES.md index if tables added/removed)
- **RECORD** minor updates simply in a separate changelog
- **MAINTAIN** function names when core functionality remains the same
- **CONFIRM** changes that don't exactly match requests before applying
- **USE** Supabase MCP for all database-related work

## Development Commands

```bash
npm run dev       # Development server
npm run build     # Production build
npm run build:dev # Development mode build
npm run lint      # Lint code
npm run preview   # Preview production build
```

## Architecture Overview

### Core System
TMS (Teacher's Management System) for Korean schools with:
- Timetables & schedules
- Task management
- Messaging
- Document management
- Attendance tracking (attendance is not used)

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Radix UI + Tailwind CSS + shadcn/ui
- **State**: TanStack Query
- **Backend**: Supabase (PostgreSQL + RLS)
- **Auth**: Google OAuth
- **APIs**: NEIS API (Korean school data)

## Database Architecture

### Core Tables
1. **User Management** — `profiles`(role 4종 student/teacher/staff/admin) · `resource`(교사·학생·교실·기기·그룹) · `user_resource`(교직원 ↔ resource 연결 — **학생은 쓰지 않는다**: 학생은 이메일 prefix ↔ `resource.meta->>'id'`)
2. **Task Management** (JSONB) — `event`(업무) · `task`(할 일, 담당자 = `task.meta.assignees`) · `task_status_history`
3. **School Management** — `section` · `meeting`(kinds: schedule·event·duty·training·document_submission·personal, 담당자 = `meta.assignee` `{"이름": {"name": "이름", "signature": 0}}`)
4. **Document Management** — `documents`(Google Drive 연동)

**`resource.meta`(type: teacher)**:
- `section` = 시간표 import 가 만드는 수업 배정 **객체** `{"과목명 학년-반": {"time": ["22","35"]}}`
- **교사 외부 계정은 meta 가 아니라 표 `resource_accounts`**(2026-10-13 — `resource` 는 학생도 읽는다). meta 에 `accounts` 를 다시 쓰면 트리거 `resource_reject_meta_accounts` 가 거부. 읽기·쓰기 = `services/resourceAccountsService.ts`, 해석은 반드시 `parseAccounts()`(`src/utils/teacherAccounts.ts` — 종류별 계정은 **배열**이고 레거시 객체와 공존, SQL 은 `jsonb_typeof` 분기)
- **개인 전화번호 저장 금지** — `profiles.phone` 삭제, `meta.phone`/`hp` 는 CHECK `resource_meta_no_personal_phone` 가 거부(meta 쓰기 전 `withoutPersonalPhone()`)
- 계정 병합 시맨틱 2종·엑셀 헤더 매칭·회귀 = `docs/database/core.md` 끝 «CLAUDE.md 에서 옮긴 원문»

### Database Functions (RPC)
스키마·RPC 정본은 `docs/database/*.md`(전체 목록 = `docs/database/core.md` 끝). 새 코드가 꼭 알아야 할 것만:
- **업무 상태 쓰기는 RPC 로만** — `set_task_assignee_status`(본인·매니저, task.status 재계산·이력) · `set_task_deadline_status`(회차) · `set_task_unit_status`(과제 단위). ⚠️ `update_assignee_status_meta` 는 task.status 를 재계산하지 않는다(담당자 1명 완료가 전체 완료로 번진 사고) — 새 코드에서 쓰지 말 것
- 대상 규칙 해석 단일 출처 = `resolve_audience` · `resolve_faculty_rule` · `resolve_student_audience`(학생 = 교사·관리자 전용)
- duty 일정의 이력은 전용 RPC(`get_meal_duty_history`·`get_self_study_supervision_history`) — duty 행 RLS 때문에 `meeting` 을 직접 읽으면 조용히 틀린다
- 그 밖: `get_my_tasks_jsonb()` · `send_notification_reply` · `get_admin_dashboard_stats()` · 자습실 통계 `seaton_stats_*` · 에이전트 도구 `mcp_*`(아래)

### seaton 공유 DB 계약 (2026-10-09)
seaton(`D:\seaton`, 자습실 좌석 앱)은 **같은 DB 를 쓰는 별도 앱**이고 공유 SQL(통계·지갑·좌석 RPC)은 **이 저장소가 소유**한다.
- **지갑은 하나 = `academy_user_stats.coins`**, 코인 이동은 전부 `wallet_private.apply` → `wallet_ledger`(`docs/features/unified-wallet.md`)
- ⚠️ **보상·가격 숫자를 함수 본문에 적지 말 것** — `coin_economy_setting` 시드에 키를 더하고 `economy_private.num(키)` 로 읽는다(회귀 `scripts/coin-economy-test/run.mts`, `docs/features/coin-economy.md`)
- 출석 통계 판정은 SQL `seaton_private` 한 곳(`docs/features/study-room-stats.md`)
- 교사 에이전트(MCP `studyroom.manage`)도 `study_rooms`·출석 칸에 웹과 같은 모양으로 쓴다 — ⚠️ seaton 이 저장 모양을 바꾸면 `mcp_*_study_room*` 도 같이
- `seat_reservations` SELECT = 학생 본인 · 교사·관리자뿐 — 남의 점유는 좌석 RPC 로(`docs/database/seaton-contract.md`)

### 아카데미 공모전판 = contest 스키마 (2026-10-15)
공모전 앱(`C:\Users\you\orca\projects\academy`)은 같은 DB 의 `contest` 스키마를 쓴다. ⚠️ **`account_link_pre_request` 를 다시 정의할 때 contest 분기를 지우지 말 것.** 운영 아카데미 함수를 고쳐도 공모전판은 따라오지 않는다(복제본). 상세 = `docs/features/academy-contest.md`

### 에이전트(MCP) 연결 시험판 (2026-10-18)
허용된 교직원의 에이전트가 **사용자 본인의 JWT**(`client_id` 클레임)로 엣지 함수 `mcp` 를 거쳐 `mcp_*` RPC 만 부른다. 세 겹 = ①도구 허용(`mcp_tool_grant` + `require_tool`) ②DB 입구 훅(에이전트 토큰은 `/rpc/mcp_*` 만) ③RLS 그대로.
- ⚠️ **새 도구 = 새 `public.mcp_*` INVOKER RPC + `require_tool`** — 이름이 `mcp_` 가 아니면 훅이 막는다(에이전트에게만 실패). 도구 이름표는 SQL CHECK · `functions/mcp/handler.js` TOOLS · `src/lib/mcpTools.ts` 세 벌, CHECK 는 최신 마이그레이션 정의가 정본
- ⚠️ 세션을 새로 만드는 엣지 함수는 `_shared/agentToken.js` 의 `isAgentAuthorization` 으로 거부 · `openid` 범위 금지
- ⚠️ **구매 신청 담당자 쓰기(2026-11-06 — 승인·불가·완료 + 품의 차수)도 같다** — 품목·차수 상태는 웹 RPC(`set_purchase_request_item_status`·`set_purchase_order_batch_status`)로만, **상태·사유 목적의** `purchase_requests` 직접 UPDATE 금지(파생 규칙이 DB ↔ `utils/itemStatus.ts` 두 벌). 허용은 기존 `purchase.request`(교사 기본 켜짐 — 담당자 판정은 `is_purchase_page_manager`). 상세 `docs/features/mcp-agent.md` «담당자 쓰기». **2026-11-09 세부 수정** — 담당자의 품목 **칸**(`items`) 수정·신청 삭제·수정 이력(`update_purchase_item_cells`·`delete_purchase_request`·`list_purchase_request_history`)은 웹 담당자 화면과 같은 표 직접 쓰기 길이다(상태·`meta.itemStatus` 는 안 건드린다 · 품의에 묶인 품목이 있으면 삭제 거부 · 이력은 «변경 전 모양»뿐이라 누가 바꿨는지 없다), «담당자 세부 수정»
- **에이전트 작업 요청(2026-11-11 `agent.request`, 운영 적용)** — 표 `agent_request` + 알림 `agent_request`/`agent_request_result`. 맡길 말은 `agent_req_private.prompt` **한 곳**(MCP·데스크·모바일·웹 «에이전트» `/agents` 공용) — 모바일·웹 넘기기는 `agent_request_send_to_agent` → `desk_agent_phone_send`. 채팅방·요청 화면은 `src/mobile/components/AgentChat.tsx`·`AgentRequests.tsx` 를 모바일·웹이 같이 쓴다. 상세 `docs/features/mcp-agent.md` «2026-11-11»
- ⚠️ MCP 에서 task 를 직접 UPDATE 하지 말 것(기존 상태 RPC 경유) · 새 데이터 = 카탈로그 한 줄 + `mcp_private.ds_*`(내보낼 칸을 골라 둔다) + `mcp_read_data` 분기
- ⚠️ **MCP 는 웹과 같은 칸(`task_action.config` 등)에 쓴다 — 웹이 읽는 모양을 바꾸면 MCP 쓰기(`mcp_private.wk_*`·`handler.js`)도 같이** (2026-10-25 — 대상 `all_faculty` 의 `types` 누락으로 업무 화면이 깨졌다). 회귀 `contract.mts --db`(고정 예시 `web-contract.json` + 운영 작업 설정 전부를 웹 parse 로)
- ⚠️ **웹 순수 함수를 엣지에서 그대로 쓰는 도구가 있다** (2026-10-23 시간표·스케줄 부가 기능 — 교체 후보·급식지도·자습 감독 초안·설문 집계) — `timetableSwapUtils`·`swapBurden`·`mealDuty`·`selfStudySupervision`·`schoolDay`·`surveyAggregate`(+ 2026-10-24 `neisScreens`·`neisScreenModel`·`codeShare`·`neis-kb/guides`) 를 고치면 `npx tsx scripts/mcp-docgen/build-bundle.mts` 로 다시 묶고 `mcp` 배포(안 하면 웹과 에이전트가 오류 없이 다른 답). 학생 메모·설문 학생 = 학년-반-번호만
- ⚠️ **호출 기록(`log_call`) 등 무엇이든 쓰는 `mcp_*` RPC 는 VOLATILE** — PostgREST 가 STABLE 함수를 읽기 전용 트랜잭션으로 불러 INSERT 가 거부된다. SQL 드라이런은 PostgREST 를 안 거쳐 못 잡는다(2026-10-24 운영에서 발견, 회귀 `run.mts` 가 검사)
- **허용 = 교사 기본(`mcp_tool_policy`) ∪ 사람별 추가(`mcp_tool_grant`) − 사람별 해제(`mcp_tool_block`)** (2026-10-24 — 모든 교사가 기본으로 받고 급식지도·자습 감독 배정만 사람별, 직원은 추가만 · 읽기/쓰기 쌍은 기능마다 하나로 합쳤다 28개). ⚠️ RPC 를 다시 정의할 땐 `20261024140000` 이후 정의에서 옮길 것(옛 파일엔 없어진 허용 이름). 판정은 `mcp_private.my_grants()` 한 곳 — ⚠️ 새 허용 = 두 CHECK + 정책 시드 + TOOLS + `mcpTools.ts`(+ `MCP_FEATURES`), 관리 화면 도구 설명은 `build-tool-docs.mts` 로 생성. «허용 없음» 시험은 행 삭제가 아니라 기본 끄기·해제
- **업무 진행하기 `work.run` (2026-10-24)** — 자동화 = **담당자의 지시로** 에이전트가 이어서 진행(무인 실행 없음, 사용자 정의). 알림이 가는 실행(요청·다시 알림·메시지)은 `check_only` 미리보기가 준 **지문**이 있어야 하고 미리본 뒤 바뀌면 거부. 표 `work_event` = 업무 실행 기록(할 일·작업 변경은 **트리거** — 웹·MCP 모두 · 에이전트 실행·인사이트는 RPC · 분석은 역할로만, 작년 업무를 가져온 책임자도 읽는다). 지식·판정(자동화 수준·다음 할 일·지표) 단일 출처 = `src/lib/mcpWorkOps.ts`(엣지 묶음) — ⚠️ 작업 종류가 생기면 거기 `ACTION_GUIDES` 에 적을 것(회귀 `work-ops.mts`). 업무 수행 지식 = 표 `work_knowledge`(지우지 않고 보관) — «참고해서 시작 › 작년 같은 일 이어가기» 계보(`rolledOverFrom`)를 **여러 해** 따라 읽힌다(`mcp_private.work_lineage`). ⚠️ 계보 키 `rolledOverFrom`(업무·할 일)·`task_action.rolled_over_from`(작업)의 모양을 바꾸면 지식이 다음 해로 안 이어진다 — 작업을 옮기는 새 길을 만들면 원본 작업 id 를 적을 것. 진행 상황의 `review_due`·`knowledge_candidates` 는 권하는 신호일 뿐(판정 `reviewDue`·`knowledgeCandidates`)
- **학교 맥락 목록 `knowledge.context` (2026-11-06)** — 표 `school_context` = 학교 지식이 어디에 어떤 구조로 있는지(source, 관리자)와 새로 적은 맥락(note, 교직원 누구나). 개별 자료가 아니라 위치·구조·규모(`school_context_live`). 새 지식 저장소를 만들면 source 한 줄을 등록할 것. ⚠️ **정기시험 문항정보표(`school_exam_question`)는 맥락 관리·MCP 에 두지 않는다**(2026-11-11 사용자 결정 — 등록·`mcp_*` 읽기 금지). 웹 = 메뉴 «맥락 관리» `/contexts`(학교 맥락 · 문서 맥락 — 문서 생성에서 기능으로 뺐다). `docs/features/mcp-agent.md`
- 저장소(Storage)가 필요한 도구는 보조 엣지(`mcp-docgen`·`mcp-sign`·`mcp-files` — 서명 문서·서류함 파일·코드 이진 파일)가 **사용자 토큰으로 RPC 에 경로를 묻고** 그 경로만 service_role 로 다룬다(에이전트 토큰은 저장소가 막혀 있다). RPC 가 `storage.objects` 를 읽어야 하면 트랜잭션 설정 `mcp.read_storage`(읽기만, 2026-11-04)
- 회귀 `scripts/mcp-agent-test/`(`run`·`handler`·`data`·`school-ops`·`work-ops`·`contract`·`sign-file`·`connections` + 운영 `live`). 누가 연결했는가 = 관리 화면 «연결한 사람»(RPC `admin_mcp_connections` — Claude Code 는 다시 연결할 때마다 새 클라이언트라 사람으로 묶는다). 도구별 상세 = `docs/features/mcp-agent.md`. 스킬 = **`/spacekijun-mcp`**(도구 쓰기) · **`/mcp-tool-dev`**(도구 만들기·고치기)

### 공문 판단함 (2026-10-30, 관리자 전용 1단계)
`/tasks/docs` — 서버 PC 가 에듀파인 접수 공문을 모아 로컬 haiku 로 1차 판정해 엣지 `official-doc-ingest`(실행기 키 = 자동화 업무와 같은 `automation_runner`)로 올린다. 표 `official_doc`·`_triage`·`_decision`·`doc_rule` 은 RLS 가 **관리자만**(넓힐 땐 정책만) — **예외(2026-11-08)**: 결재권자 이름 = 내 이름인 공문은 담당 교직원도 읽고(판정·결정 포함) 자기 공문에 결정을 남긴다(`official_doc_is_mine`, 「오늘」 제안 카드). `doc_rule` 은 그대로 관리자만. **에이전트 읽기(2026-11-12 `official.read`)** 는 교직원이 모든 공문을 읽지만 MCP RPC 두 개 안에서만(트랜잭션 설정 `mcp.read_official_docs` 정책 — 다른 RPC 에서 켜지 말 것). 판정은 초안 — 업무 생성·배정은 사람 결정 뒤에만. 상세 `docs/features/official-doc-triage.md`, 설계 `docs/plans/2026-10-30-official-doc-triage.md`

### 교실 기기 QR 세팅 (2026-10-13)
교실 PC(NEIS_helper `app/classroom.py`) QR → 교사 휴대폰 `/classroom/link/:code` 승인, 엣지 `classroom-link`. **🚨 `classroom_link.handoff`·`classroom_profile_key` 에 교사 구글 토큰·세션이 든다 — 이 표에 정책을 만들거나 `classroom_link_*` RPC 를 authenticated 에 열지 말 것.** 상세 `docs/features/classroom-link.md`

### 모바일 앱 /m (2026-10-29)
휴대폰은 `/` → `/m` 의 **작은 모바일 앱**(`src/mobile`, 첫 로드 ≈ 467KB)을 받는다 — `src/main.tsx` 가 앱 코드를 받기 전에 `mobile/view.ts` `chooseEntry()` 로 본 앱(`fullMain.tsx`)과 갈라 하나만 불러온다. 교실 기기 QR(`/classroom/link|type/:code`)도 모바일 쪽. «전체 웹사이트로 보기» = `sessionStorage['spacekijun-view']='full'`(그 탭만). ⚠️ 모바일 묶음에 본 앱 틀(`Layout` 등)을 들이지 말 것 — QR 본문은 `ClassroomLinkBody`·`ClassroomTypeBody`. ⚠️ 스티커 메모·쪽지 규칙은 NEIS_helper 데스크(`core/sticky.py`·`core/desk_message.py`)와 짝. 휴대폰 → 내 PC 에이전트 = RPC `desk_agent_phone_*`. 상세 `docs/features/mobile.md`

### 자동화 업무 = 정기 쿨메신저 발송 (2026-10-23)
`/automations` — Admin «자동화 업무»(`automation_grant`)가 허용한 교직원이 «언제·누구에게·무엇을» 정하면 학교 서버 PC 가 쿨메신저 **기전봇**으로 보낸다. **실행기(서버 PC 폴러)가 아직 없어 메뉴 기본값 = 관리자만** — 폴러를 붙인 뒤 «메뉴 관리»에서 연다. 승인은 설정 때 한 번(고치면 트리거가 해제), 회차는 pg_cron `automation-tick` 매분이 쉬는 날·상한·받는 사람(주인 신원으로 `resolve_faculty_rule`)·본문 변수를 판정해 스냅샷으로 만들고, 서버 PC 는 엣지 `automation-runner`(실행기 키, service_role 미보관)로 claim/report 만. ⚠️ cron·본문 변수·쉬는 날 판정이 SQL ↔ TS 두 벌(회귀 `scripts/automation-test/run.mts` + `sql-parity.mts`) · `unknown` 회차는 재발송 금지. 상세·실행기 계약 = `docs/features/automations.md`, `docs/plans/2026-10-23-automation-scheduler.md` §6

## Key Implementation Patterns

### Resource ID Resolution
```javascript
// Load user's resource ID
const { data: userProfile } = await supabase
  .from('profiles')
  .select('name')
  .eq('id', user.id)
  .single();

const { data: resource } = await supabase
  .from('resource')
  .select('id')
  .eq('name', userProfile.name)
  .single();
```

### 최초 로그인 · 계정 연결 · 역할 (상세 = `docs/features/auth-and-roles.md`)
- **온보딩 게이트는 «첫 로그인»이 아니라 현재 상태**(`profiles.name`·`user_resource` 연결)를 매 로그인 판정한다. `profiles.is_first_login` 은 죽은 컬럼 — 여기로 게이팅하지 말 것
- **명단에 연결되지 않은 계정은 기능을 못 쓴다** — 판정 = DB `account_link_status(uid)`, 차단 = PostgREST pre-request 훅 `account_link_pre_request` + `is_teacher_or_admin` 류. ⚠️ **연결 절차에 새 요청을 넣으면 훅 허용 목록에도** 넣을 것(미연결 계정만 조용히 실패) · 훅의 contest·MCP 분기를 지우지 말 것 · 훅 EXECUTE 를 anon 에서 빼지 말 것
- 이름으로 resource 찾기 = `findLinkableResourceByName()`(`src/lib/resourceLink.ts`) 단일 출처 — teacher+staff, `maybeSingle()` 금지(teacher 우선). 이름 조회는 RPC `find_self_linkable_resource`
- **역할 4종** `student | teacher | staff | admin`. 서버 판정 함수를 골라 쓸 것 — `is_staff_teacher_or_admin`(직원 허용 영역: 문서·행정·업무) / `is_teacher_or_admin`(학생 정보·교무 — **넓히지 말 것**). 클라이언트 짝 = `src/lib/roles.ts` `FACULTY_ROLES`/`TEACHER_ROLES` — **한쪽만 바꾸면 빈 화면이거나 API 만 열린다**
- `profiles.role` 은 트리거 `protect_profile_role()` 이 지킨다 — 클라이언트가 role 을 주장할 수 없다는 불변식을 깨지 말 것
- 정책을 대량으로 넓힐 땐 손으로 옮겨 적지 말고 `pg_policies` 에서 읽어 치환하는 패턴(`staff_role_scoped_access`) 재사용
- RLS 비대칭: `user_resource` INSERT 는 본인 가능, `resource` INSERT/UPDATE 는 admin 전용(연결된 자기 resource UPDATE 만 예외)

### Task Management (상세 = `docs/features/task-management.md`)
어휘 = **업무(Work) > 할 일(Task) > 작업(Action)**(`docs/features/task-hierarchy.md`). 화면 이름은 «책임자»(코드·데이터는 `manager`), 회귀 `scripts/task-naming-test`.
- **Hook**: `useTasksJsonb.ts`(권장) · `useTasks.ts`(레거시)
- 담당자 = `task.meta.assignees`, 매니저 = `event.meta.managers`(+ 레거시 `event.manager_id`). 담당자·매니저 **변경은 트리거가 지킨다**(`guard_task_structure`·`guard_work_structure`) — 담당자 본인이 바꿀 일은 DEFINER RPC 로
- **상태 표시 판정 단일 출처 = `src/lib/taskStatus.ts`**(task 종료 > 담당자 개인 상태 > task.status). 화면마다 복붙하지 말 것
- **화면은 둘** — 수행 = **업무노트 `/work`**(2026-11-12 옛 «내 할 일»을 품었다 — `/my-tasks` 는 `?task=`·`?collect=` 를 실어 넘겨주기만, `MY_TASKS_PATH`. 할 일 행·상세 창은 같은 부품 `MyTaskInbox`·`TaskDetailDialog` — **작업이 걸린 할 일**의 완료·제출 진입점) + 업무 작업실(작업 없는 할 일의 체크, 아래) · 관리·조망 = `/tasks/*`(페이지·범위·구 주소 = `src/lib/taskTabs.ts`). ⚠️ **관리 화면에 완료 체크박스를 되살리지 말 것** — 수행 진입점이 둘이면 «제출 없이 완료» 우회로를 두 곳에서 지켜야 한다(2026-09-04 사고, 회귀 `task-split-test`). 링크는 새 주소(`/tasks/mine?task=`·`?work=`·`?pipeline=`)로
- 비매니저에게 **담당자 명단을 노출하지 않는다**(`TaskAssigneeSummary`, 전체 업무 범위는 인원 수만)
- **과제 단위**(`meta.units`·`unitProgress`, `src/lib/taskUnits.ts`) · **다중 마감**(아래 절) · **보이는 날**(`meta.visibleFrom` ↔ DB `task_visible_to_assignees` — 같은 규칙 두 벌)
- **제출 받기 = 작업 세 개**(`submit.*`, 완료 가드 = task 트리거 `guard_submission_completion`). 옛 `task.meta.submission` 은 은퇴 — **되살리지 말 것**
- ⚠️ **할 일 `meta` 에 새 키를 만들면 `src/lib/workRollover.ts` 의 `TASK_META_ROLLOVER_POLICY` 에 분류를 적을 것**(안 적으면 연간 가져오기가 작년 진척을 옮기거나 설정을 버린다)
- 확인창은 «되돌릴 수 없거나 남에게 번지는 것»만, 흔한 동작은 토스트 [되돌리기]
- **업무 온톨로지 재설계 진행 중 (2026-11-08)** — 「업무노트」`/work`(옛 이름 「오늘」, 2026-11-12 — **옛 «내 할 일»과 합친 수행 + 대시보드**: 서명·결재(내 차례) · 「요청」 · 내 업무(**업무 안에 내 할 일**, 담당만 맡은 일은 작게 — `MyTaskInbox layout="byWork"`) / 오른쪽 = 한 줄 요약 · 오늘 일정 · 공문 제안(한 줄씩, 펼침) · 계획표. 시기를 축으로 보는 것은 업무 관리 › 타임라인 한 곳) · 「한 장 보기」`/work/o/:type/:id`(머리·단계·타임라인·연결·작년 지식). 메뉴 = 모든 교직원(옛 «내 할 일» 자리, 「한 장 보기」도). **2026-11-12 방향 전환(사용자 철학): 흐름보다 «한 업무를 해내는» 화면이 먼저, 범위 = 업무 관리 전체** — 「한 장 보기」는 책임자·담당자에게 **작업실**(평평한 할 일 · 체크 · 서랍 `work_note`, 설계 `docs/plans/2026-11-12-work-room.md`). ⚠️ 작업실 체크는 **작업·회차·과제 단위가 없는 할 일만**(`roomCheckBlock`, 쓰기 `set_task_assignee_status` 한 곳) — 작업이 걸린 할 일의 완료·제출은 업무노트의 할 일 행·상세 창(옛 «내 할 일» 부품 그대로) — 완료 버튼을 새로 만들지 말고 그 부품을 쓸 것. 연결 표 `ontology_link`(P1) — ⚠️ 판정 `can_view_object` 는 **INVOKER**(객체 표 RLS 를 그대로 따른다, DEFINER 면 전부 «보인다») · 객체 종류·관계 목록은 SQL CHECK ↔ `objectRef.ts`·`explicitLinks.ts` 두 벌. 판정 = `src/features/work-ontology/model/*`, 설계 `docs/plans/2026-11-08-work-ontology-redesign.md`, 상세 `docs/features/work-ontology.md`
- **업무를 «원본에서» 만드는 길은 하나 = «참고해서 시작»** (2026-11-12, `WorkFromReferenceDialog` + `planWorkRollover` 의 `mode`) — 작년 같은 일 이어가기(날짜 이동 · 계보 `rolledOverFrom` · 작업 `rolled_over_from` → 지식이 따라온다) / 비슷한 일 참고(날짜 없음 · 출처 `referencedFrom`/`copiedFrom` · 작업 계보 **null** — 남의 지식이 «작년»으로 섞이지 않게). 파일은 복사하지 않고 원본에 «관련» 연결. 옛 «기존 업무에서 복사»·«지난 업무 가져오기» 창은 없앴다 — 복사 길을 새로 만들지 말 것. 상세 `docs/features/work-rollover.md` 머리말
- 업무 지도(`/tasks/map`, 관리자 전용 — `src/lib/workPivot.ts`) · 업무 후보(`workCandidates.ts`) · 타임라인(`workTimeline.ts`) · 진행 모달(`workPipeline.ts`) · 작업 화면 가드(`runnerUnsaved.tsx`) 등의 조용히 틀리는 자리는 상세 문서

### Role-based UI (학생/교사/관리자 분기)
- JSX 인라인 `{isStudent && X}` 대신 **`<RoleGate>`**(`src/components/auth/RoleGate.tsx`): `role="student"` · `not="student"` · `role={['teacher','admin']}` · `fallback`. 큰 묶음은 `StudentHome`/`TeacherHome` 처럼 추출
- 라우트 차단 = **`ProtectedRoute`**(fail-closed). 전역 = **`RequireAuth`** 가 `<Routes>` 전체를 감싼다 — 세션 없이 열 페이지만 `PUBLIC_PATH_PREFIXES` 에 등록(기본값은 보호). 개인정보 동의 게이트도 여기(`docs/privacy-policy-and-consent.md`)
- `role="student"` 는 `isStudentView`(관리자 학생 미리보기 포함) — `profile.role === 'student'` 직접 비교 금지. `role="teacher"` 는 **staff 를 포함하지 않는다**(직원까지면 `role={['teacher','staff']}`)
- **`isAdmin` 은 미리보기를 반영한다**(미리보기 중 false). 원본이 필요하면 `isRealAdmin` — **미리보기 컨트롤 자신에게만**. 역할 기준값 = `effectiveRole`. RLS 는 실제 JWT 기준이라 미리보기는 화면·라우트까지만 재현한다
- 데이터 페칭 분기는 RoleGate 가 아니라 훅(`usePermissions.ts` 등)에서. 잔여 로드맵 `.omc/plans/role-branching-migration.md`
- 상세(미리보기 3종·라우트 가드 이력·`/evalog` 학생 탭) = `docs/features/auth-and-roles.md`

## UI 큰 틀 규약 (새 화면을 만들기 전에 읽을 것)

화면마다 폭·여백·모달·색을 새로 발명하면 같은 앱이 여러 앱처럼 보인다. 아래는
**이미 정해진 답**이라 새로 고민하지 않는다. 각 항목의 단일 출처를 함께 적었다.

### 1. 페이지 뼈대 — `Layout` + `PageContainer`
- 패딩은 `Layout` 의 `<main>` 이 준다 — 페이지에 `p-6` 등을 또 얹지 말 것(이중 패딩). 폭은 **`PageContainer`**(`full` 기본 = 넓을수록 좋은 표·목록 / `narrow` = 폼·설정·검색) — 페이지에 `max-w-*` 직접 금지
- 화면을 통째로 쓰는 앱형 화면은 **`<Layout fullWidth>`**(구형의 음수 마진 방식을 따라 하지 말 것)
- **머리글에 기능명·아이콘을 쓰지 않는다** — 그 화면의 필터·액션만 담는다(예외: evalog 처럼 UI 구조가 다른 앱형 화면). 회귀 `scripts/page-header-rule-test/run.mts`
- 상세 = `docs/features/ui-conventions.md`

### 2. 모달 — 공용 부품과 휴대폰 동작 (상세 = `docs/features/modal-system.md`)
- 클래스 복붙 대신 `components/tasks/dialogDesign.tsx` 의 `DIALOG_HEADER_CLASS`·`DIALOG_FOOTER_CLASS`·`FOOTER_BUTTON_CLASS`·`SectionLabel`·`TitleIconChip`. 3단(헤더·본문·푸터), 동작 버튼은 푸터 ghost, 주행동만 solid, 파괴적 동작은 rose
- 긴 파일명 행 = **`min-w-0` + `truncate` + `title`** 3종 세트(`DialogContent` 는 grid 라 직계 자식만 `min-w-0`)
- **모달 안에 모달 → 먼저 `docs/nested-modal-pitfalls.md`**. Radix 사본이 갈라지면 사이트 전체가 클릭 불가가 되는데 빌드는 통과한다 — 회귀 `scripts/modal-layer-test/run.mts`, 관리하지 않을 lockfile 은 두지 말 것. 규약: 바깥을 닫지 않고 겹쳐 띄운다 · `AlertDialogAction` 비동기는 `e.preventDefault()` 먼저 · 중첩 `Dialog` 는 body 포털, Popover/Select 는 `usePortalContainer`(규칙이 반대다)
- **휴대폰 표시는 `DialogContent` 가 className 에서 유도**(`ui/dialog-layout.ts`, 배치는 CSS `ui/modal.css`) — 화면마다 분기하지 말 것, 틀릴 때만 `mobile=` 지정. 새 검색 선택기는 `Popover` 대신 `ui/responsive-picker.tsx`
- 휴대폰: 누르는 것 44px, 입력 16px(미만이면 iOS 확대). `DialogContent` 에 inline padding 금지. 회귀 `scripts/mobile-modal-test/`(정적 + 실제 스크린샷)
- **휴대폰 뒤로가기 = 맨 위 모달 닫기**(자동, `ui/modal-back.tsx`·`lib/modalBackHistory.ts`). Radix 를 직접 쓰면 `useModalBackClose` · 모달 닫기에서 `navigate(-1)` 금지 · `ModalBackRouterSync` 는 하나만. 회귀 `scripts/modal-back-test/`

### 3. 색

- **주 액션 버튼은 파랑**(`bg-blue-600 hover:bg-blue-700`) — 앱 전역 규약
- **상태는 텍스트가 아니라 색으로 읽힌다**: 에메랄드=완료 · 블루=진행 중 ·
  슬레이트=예정/대기 · 로즈=취소 · 인디고=제출
- **의미를 가진 색을 장식으로 재사용하지 말 것.** 색이 의미를 잃는 순간 카드 스캔이
  불가능해진다(창체 영역 색 = `utils/activityLabels.ts`의 `getAreaTone` 단일 출처,
  분야 색 = 이름 해시 결정론 배정)
- 데이터 색은 표면 대비 **3:1 이상**, 글자는 **4.5:1 이상**을 직접 검증한다.
  Tailwind 램프를 벗어나 hex를 쓸 때는 특히(인라인 스타일은 검사기가 안 잡아 준다)

### 3-1. 토스트 — `import { toast } from '@/lib/toast'` 하나뿐 (2026-09-12)
- `sonner` 직접 import 금지(`ui/sonner.tsx`·`lib/toast.ts` 만). 구 `toast({ title, description, variant })` 도 어댑터로 동작하지만 새 코드는 `toast.success('…')`. 문구 정리 단일 출처 `src/lib/toastMessage.ts`
- ⚠️ 토스트 색을 CSS 파일에 적지 말 것 — sonner 런타임 CSS 의 특이도에 져서 조용히 무시된다. 팔레트는 `src/lib/toastPalette.ts` 인라인 style
- **화면이 이미 말하고 있으면 토스트를 더하지 않는다**(CRUD 성공 등). 남길 것 = 건수·부분 실패·되돌리기 어려운 행위·비동기 결과·다른 화면의 부수효과
- 회귀 `scripts/toast-system-test/run.mts`, 상세 = `docs/features/ui-conventions.md`

### 4. 공용 부품을 먼저 찾을 것

| 필요 | 부품 |
|---|---|
| 사람 선택(교사·학생) | `SearchableMultiSelect` (`filterByTeacher`/`filterByStudent`, 스프레드시트 붙여넣기 내장) |
| 이름 목록 표시 | `ui/name-list-overlay.tsx`의 `NamePreview` — **오버레이는 Popover(탭으로 열기). Tooltip·HoverCard 둘 다 금지** — 아래 §4-1 |
| 카드 | `ImprovedCard` + `CardHeader` |
| 카드 그리드·필터·접기 | tasks의 `EventCard` 패턴(펼침 상태 localStorage 보존) |
| 헤더(검색·필터·액션) | 입시 정보 `IpsiHubHeader`의 글래스 카드(`bg-white/70 backdrop-blur-md`) |
| 차트 | `dataviz` 원칙 + `lib/chartAnimation.ts`의 `drawLineProps` **스프레드 필수**(빠뜨리면 선이 다 그려질 때까지 점이 안 보인다) |
| LLM 호출 | 공용 `aiChat()` — `functions.invoke`를 직접 부르지 말 것 |
| 기능 사용법 안내 | `WalkthroughDialog`(왼쪽 시연 + 오른쪽 설명) — 아래 5절, 스킬 `/feature-guide-dialog` |

### 5. 기능 안내 모달 — 왼쪽 시연 · 오른쪽 설명 (2026-09-04)
- `WalkthroughDialog` + 스킬 **`/feature-guide-dialog`**(절차·수칙). 진입점 = 헤더 액션 묶음 **맨 왼쪽** `HelpCircle` «사용 방법» — 그 왼쪽에 버튼을 두지 않는다
- 포인터 좌표를 손으로 적지 말 것(`Rect` 상수 → `boxOf`·`centerOf` 공동 참조) · 목업 라벨은 실제 코드 문구에서 채집 · 글은 시연을 되풀이하지 않고 «왜·오해·모르면 손해»만 · 연결선은 데이터라 대비 3:1↑와 화살촉
- 탭·세그먼트가 «다른 기능»이면 안내를 따로 만든다. 상세·적용 현황 = `docs/features/ui-conventions.md`

### 6. 모바일

- 모바일 하단 바는 메뉴 순서와 따로 정한다(`navMobileLayout.ts` 기본값 + 관리자 «모바일 하단 메뉴») — 시트 순서를 비틀어 하단 칸을 맞추지 말 것
- 표·다이어그램·코드는 **자기 컨테이너에 `overflow-x-auto`** — 본문이 가로로 밀리면 안 된다
- 학생이 쓰는 입력(성찰 등)은 **휴대폰이 정상 경로**다. 모달보다 전체화면 시트 + 초안 자동 저장
- **모달·드롭다운의 휴대폰 동작은 위 §2-1 이 이미 정해 놨다** — 화면마다 다시 분기하지 말 것. 뒤로가기로 모달 닫기도 §2-2 가 자동이다
- 입력류의 휴대폰 글자는 **16px 아래로 내리지 말 것**(iOS 확대), 누르는 것은 **44px**

---

## Component Architecture

### Layout (`src/components/layout/`) — 상세 = `docs/features/navigation.md`
- `Layout.tsx`(사이드바+모바일 내비) · `Header.tsx` · `Sidebar.tsx` · `MobileNavigation.tsx`
- **네비게이션 3층** = 정적 형태 `src/config/navigation.ts` → 조립 `useNavSections`(+ `src/lib/navAssembly.ts`) → 렌더러 2종. 새 메뉴는 정적 형태에, 조건부 노출만 조립 층에
- **모바일 전체 메뉴(시트) = 데스크톱 사이드바와 같은 순서, 하단 바 = 따로 고른 href 목록** (2026-10-25 — 종전 `flatItems.slice(0, 5)` 는 앞 범례에 메뉴를 끼우면 5번째가 조용히 밀려 시트 순서를 비틀었다). 판정 `src/lib/navMobileLayout.ts`(`pickMobileBottomItems`·`DEFAULT_MOBILE_BOTTOM_HREFS`), 저장 `menu_layout.<kind>.mobileBottom`(Admin ▸ 메뉴 관리), 회귀 `scripts/nav-mobile-bottom-test`
- **메뉴 활성화·배치는 관리자 설정**(`system_settings.menu_visibility`·`menu_layout`, 카탈로그 `src/config/menuRegistry.ts`, 판정 `src/lib/menuVisibility.ts`·`navLayout.ts`). ⚠️ **새 메뉴는 카탈로그에도 넣을 것**(회귀 `scripts/menu-visibility-test`·`menu-layout-test`). 게이트는 메뉴(`pruneNavSections`)와 라우트(`MenuRouteGate`) 둘 다 · 서랍 id 를 바꾸지 말 것
- 메뉴 숫자 배지 = 경로 → 숫자 지도(`src/lib/navBadges.ts`) · 외부 메뉴 배치 = `resource.meta.placement`(새 필드는 `useIframeMenus.buildMenuMeta` 에)

### Feature Components

#### Tasks (`src/components/tasks/`)
`IntegratedTaskView` · `TaskEditDialog` · `TaskEventDetailDialog` · `TaskAssigneeSummary` · `EventList`/`EventCard` · `MultiAssigneeStatus` · `VisibleFromChip` · 제출 받기 부품(`SubmissionTemplatePicker`·`PhysicalFormFilesField`) — 상세 = `docs/features/task-management.md`

#### Admin (`src/components/admin/`) — 상세 = `docs/features/admin.md`
- 탭은 목적별 묶음(접기)이다(`layout/AdminSidebar.tsx` 의 `groups`, 2026-10-25) — 새 탭 = `AdminTab` · `Admin.tsx` case · 묶음 셋(회귀들이 `value: "탭"` 문자열로 찾는다)
- `AdminDashboardOverview` — 자료 건수는 매일 세어 둔 스냅샷(`admin_dashboard_snapshot`), 새 표는 `admin_dashboard_count_datasets` 에. ⚠️ 아카데미 참여자를 레거시 표로 세지 말 것(`docs/features/admin-dashboard.md`)
- `UserManagement`(역할 표시 단일 출처 `admin/userRoles.ts`) · `MenuManagement` · `AiLogManagement`(⚠️ 새 엣지 함수는 공급자 호출에 `aiLogFetch(ctx)`, `docs/features/ai-call-log.md`) · `CoinEconomyAdmin` · `NotificationManagement` · `SystemSettings`(학사력 전용) · `StudentManagement`(졸업 일괄 처리 — **복구 키 CSV 를 다시 읽어 확인한 뒤에만 익명화**, `src/lib/graduationMapping.ts`)

#### Schedule (`src/components/schedule/`) — 상세 = `docs/features/schedule.md`
- 진입 `ScheduleCalendar.tsx`, 순수 로직 `lib/scheduleUtils.ts`. duty 라벨 = '업무', 서류제출 일정 신규 생성 중단
- [부가 기능]: 일정 설문(`docs/features/schedule-survey.md`) · 결강 처리(`src/lib/absenceLessons.ts`) · 일정 AI 도우미(`src/lib/scheduleDraft.ts`) · 급식지도(`src/lib/mealDuty.ts`) · 자습 감독(`src/lib/selfStudySupervision.ts`) · 명단 출력 · 담임 반 생일(⚠️ 가상 일정 — 상세 창·구글 캘린더 내보내기로 새지 않게 `isBirthdayEvent`). 메뉴에서 모달은 `useDropdownDialog` 로
- ⚠️ duty 일정의 과거 이력은 `meeting` 직접 조회 금지(RLS) — 전용 RPC
- 연수 참석자별 **로그인 없는 서명 링크**(2026-10-25 이후 만든 연수 — `training_sign_link`·`training_sign_token`, anon 은 토큰 함수 둘뿐). 알림은 «내 서명 QR»로. 링크(토큰)는 웹 «서명 링크»·MCP `get_training_sign_links`(만든 사람 = 전원, 참석자 = 자기 것, 호출 기록)로만 — 다른 로그·화면에 새로 내보내지 말 것(링크 = 신원). `docs/database/core.md` §5b
- 공지 열람 대상 = `department_notice.target_resource_ids`(NULL = 전체, 학생은 이 표를 못 읽는다)

#### 전자서명 (`src/features/e-signature/`, 2026-09-03) — 상세 = `docs/features/e-signature.md`
`<SignatureButton subjectType subjectId />` 하나로 붙는 공용 기능, 결재를 흡수. 같은 `order_index` = 동시 서명 그룹. 좌표는 페이지 대비 0~1 정규화(PDF y 뒤집기 주의). 쓰기는 RPC 전용, 비공개 `signatures` 버킷. 진행 중 문서는 **요청자가 정한 서명 마감**(`signature_request.due_at`, 기본 7일·최대 60일, 2026-10-25)에 만료·정리, 완료 문서는 완료 후 7일 — 숫자는 SQL ↔ `e-signature/types.ts` 두 벌. 회귀 `scripts/signature-core-test`·`hwpx-page-stamp-test`

#### 결재 (`src/features/approval/`) — 상세 = `docs/features/approval.md`
`<ApprovalButton subjectType subjectId title payload />`(허용 타입 `registry.tsx`), 쓰기는 `act_on_approval_step` RPC 전용, 판정은 DEFINER `can_view_approval_request`

#### Timetable (`src/components/timetable/`) — 상세 = `docs/features/timetable-swap.md`
- 교체 후보 0건이면 `section` 표부터 의심(`ensureSectionRows`) · 교체를 막는 건 동아리활동뿐(`isSwappableLesson`) · 후보 정렬 `lib/swapBurden.ts`
- ⚠️ **학년-반 표기로 학급을 추정하지 말 것** — 학생이 관계되면 `student_timetable` 명단으로 판정(`get_swap_roster_fit`)
- **쉬는 날 판정 = `src/lib/schoolDay.ts` 단일 출처**(공휴일·휴업·시험·학년별 휴업 `meta.no_class_grades`). 회귀 `scripts/school-day-test`

#### Documents / 서류함 — 상세 = `docs/features/documents.md`
교사/admin 전용, 데이터 계층 `src/features/documents/`, 비공개 `documents` 버킷(상대경로 + `meta.directory_path`), 문서 추가 단일 진입점 `AddDocumentDialog`

#### 생기부 분석 — 역량분석 · 활동 타임라인 (`src/features/evalog/`) — 상세 = `docs/features/evalog.md`
- ⚠️ KG ↔ 분절 연결 키는 **저장된 `entity_id`** — `act:<기록id>#<위치>` 로 계산하지 말 것(`utils/kgLayers.ts`) · KG 관계는 `layer==='local'` 만 · 시기 축은 학년(학기는 5% 만 있다) · `inquiry_activity` 는 교사 전용이라 화면에서 읽지 않는다
- 유사도 분석은 같은 학년만(`utils/similarityCohort.ts`) — ⚠️ `student_no` 는 입학연도가 아니라 현재 학반번. 회귀 `scripts/evalog-competency-test`·`evalog-similarity-cohort-test`

#### 협업 보드 (`src/components/collab/`) — 상세 = `docs/features/collab-board.md`
- 사람 = `resource.id`, 신원 해석 = `collab_actor_resource_ids()`(학생은 `user_resource` 가 없다), 판정은 DEFINER 함수(`can_view/can_write_collab_board`)만
- 클라이언트 접근 판정 `src/lib/collabBoardAccess.ts` · 노트 색은 값이 두 모양이라 `normalizeNoteColor()` 필수 · 카테고리 `src/lib/collabCategories.ts`
- 회귀 `scripts/collab-student-access-test`·`collab-category-color-test`

#### Calls / 전화번호부 — 상세 = `docs/features/calls-directory.md`
정적 데이터(`src/data/extensionDirectory.ts`, DB 없음) — **개인 휴대전화를 넣지 말 것**, 원본과 의도적으로 다른 2건을 되돌리지 말 것. 검색 정규화 `src/lib/callsDirectory.ts`, 회귀 `scripts/calls-directory-test`

#### 알림 (`src/components/notifications/`) — 상세 = `docs/features/browser-notifications.md`
- 브라우저 알림 = realtime + 서비스 워커(`public/sw.js` — ⚠️ `fetch` 핸들러 금지, 안드로이드는 `showNotification` 만). 브리지 `BrowserNotificationBridge` 는 `App.tsx` 에 **하나만**. 탭이 닫혀도 = Web Push(`src/lib/webPush.ts`·엣지 `push-send`, `docs/features/tamagotchi.md` «Phase 4»)
- 클릭 목적지는 `notificationNavigation.ts` 재사용(`sw.js` ↔ lib 메시지 문자열 짝) · [답장] = `send_notification_reply` RPC 전용, 받는 사람은 정확히 한 명 일치할 때만 확정(`src/lib/notificationReply.ts`)

#### 학교 지필평가 (evalearn '학교 시험' 탭) — 상세 = `docs/features/school-exam.md`
교사·admin 전용. 학생 매칭 = (학년,반,번호) — 이름 매칭 금지, 조회 키에 `grade` 필수

### Pages (`src/pages/`)
- **Index.tsx**: Dashboard with today's schedule and notifications
- **TaskManagement.tsx**: Task management with tabs
- **Schedule.tsx**: Calendar and event scheduling
- **Timetable.tsx**: Class timetable management
- **Documents.tsx**: Document storage
- **Admin.tsx**: Administration panel

## Feature Modules (`src/features/`)

Feature 모듈은 자체 `components/`, `services/`, `hooks/`, `utils/` 하위 구조를 가집니다. **모듈별 상세 설계·동작 노트는 `docs/features/<모듈>.md`, 스키마는 `docs/database/*.md`.**

| 모듈 | 역할 | 핵심 파일 · 상세 문서 |
|------|------|----------|
| `evalog` | 학생 기록 관리(세특·모의고사 마킹·성적 import) + 역량분석·활동 타임라인 | `adminService.ts`, `utils/activityLedger.ts` · `docs/features/evalog.md` |
| `course-analyze` | 교과 분석(JSON + DB 이중 성적 소스) · 과목 선택 확인표 출력 | `databaseGradeService.ts` · `docs/features/course-analyze.md` |
| `student-dashboard` | 학생 종합 대시보드 | `StudentDashboardPage.tsx` · `docs/features/student-dashboard.md` |
| `evalearn` | 모의고사 분석(취약점·집단·문항·학급 명단) + 학교 지필평가 + AI 성적예측 | `utils/mockGrading.ts` · `docs/features/evalearn.md`, `grade-prediction.md`, 스킬 `/grade-prediction-analysis` |
| `class-assignment` | 반 배정 관리 | |
| `exam-schedule` | 시험 시간표 자동 생성 + 감독 배정 | `algorithm/solver.ts` · `docs/features/exam-schedule.md` |
| `timetable-generator` | 새 학기 수업 시간표 자동 생성 | `algorithm/solver.ts` · `docs/features/timetable-generator.md` |
| `admission-wishlist` | 수시 지원 관리(교과·종합) | `AdmissionWishlistPage.tsx` · `docs/features/admission-wishlist.md` |
| `inquiry-design` | 탐구 설계(학생 KG + LLM, 서버 작업 큐). ⚠️ 엣지 id 형식 단일 출처 `utils/inquiryGraph.ts` | `inquiryDesignService.ts` · `docs/features/inquiry-design.md`, `kg-extraction-v8.md` |
| `interview-prep` | 면접 준비(학생, 교사·관리자는 테스트 학생으로 체험). 무엇을 물을지는 코드가 고른다 | `_shared/interviewPrep.ts` · `docs/features/interview-prep.md` |
| `isekai3d-question` | 이세계 3D 질문(학생 독 게임 연동, 하루 1개). 열람 판정 `isekai3d_can_view` 한 곳 | `_shared/isekai3dQuestion.ts` · `docs/features/isekai3d-question.md` |
| `issue-register` | 발급번호 대장 + HWPX 확인서 | `hwpx/*FormFill.ts` · `docs/features/issue-register.md` |
| `purchase-requests` | 구매 신청(품목 단위 승인 · 품의 정리 · 공문 AI) | `utils/purchaseOrder.ts`·`managerSteps.ts` · `docs/features/purchase-requests.md` |
| `budget` | 예산 관리(업무 관리 › 예산, 2026-11-10) — 사업관리카드·계획·추경·품의/업무 연결 + MCP `budget.manage`. ⚠️ 숫자 규칙 TS `model/budgetMath.ts` ↔ SQL `mcp_private.bg_*` 두 벌 · 품의 차수 표에 계획 상태 트리거 | `model/budgetMath.ts`·`parseBudgetCard.ts` · `docs/features/budget.md` |
| `clubs` | 동아리 관리(`/clubs`, 2026-11-11) — 명단·기장·지도교사·누가기록·요청·예산/구매·편성·옛 기록 + MCP `club.manage`. ⚠️ 명단 정본 = `club_member`, **`club_info`·`activity_host_member` 는 트리거 파생**(직접 고치지 말 것) · 이름이 바뀐 해의 옛 이름 행(3학년)을 합치지 말 것 · 「입력 받기」 축 목록 SQL 네 곳 ↔ `AUDIENCE_AXES` · 누가기록 AI 생성은 MCP 로만 | `model/clubDisplay.ts` · `docs/features/clubs.md`, `docs/database/clubs.md` |
| `notice-board` | 부서 공지사항 | `NoticeBoardPage.tsx` · `docs/features/notice-board.md` |
| `ipsi-hub` | 입시 정보 피드·검색·AI 분석(luna) + MCP `ipsi.hub`(2026-11-09). ⚠️ 기사 출처 값은 DB CHECK · SQL 이름 2곳 · `utils/newsSources.ts` 네 벌 — 웹 표를 거치지 않고 출처를 읽지 말 것 | `utils/analysisJson.ts` · `docs/features/ipsi-hub.md` |
| `task-workflow` | 업무 흐름 캔버스(작업 노드) · WORK 실행 계층 · HWPX 스펙 문서 | `WorkflowCanvas.tsx`, `workRegistry.ts` · `docs/features/task-workflow.md` |
| (task-workflow) `neis.screen` | 할 일에 나이스 화면 연결(자동 조작 안 함, 카탈로그는 동적 import) | `src/lib/neisScreens.ts` · `docs/features/neis-actions.md` |
| (task-workflow) NEIS 화면 지식 | 화면 구조 수집본 · 안내 · 설명서 · `/neis-guide`. ⚠️ 세 층을 섞지 말 것, 스크린샷·값 저장 금지 | `neisScreenModel.ts` · `neis-kb/README.md`, `docs/features/neis-screen-knowledge.md` |
| (task-workflow) `collect.input` | 입력 받기(대상 규칙 → 명단 스냅샷). ⚠️ `task_action_run` 을 쓰지 않는다(비공개 응답 누출) | `src/lib/collectInput.ts` · `docs/features/collect-input.md` |
| (task-workflow) `submit.*` | 제출 받기 작업 3종(파일·양식·실물) | `src/lib/submitAction.ts` · `docs/features/submit-action.md` |
| (task-workflow) `message.send` | 메시지 보내기(알림, 쿨메신저는 복사만) | `src/lib/taskMessage.ts` · `docs/features/task-message.md` |
| 교사 메타데이터 | 교과 분류 · 부서 학년도 · 업무분장(`duty_seat`) · 동아리 | `src/lib/dutySeats.ts` · `docs/features/duty-assignment.md` |
| `document-generation` | HWPX 스펙 문서 생성(luna) | `docGenService.ts` · `docs/features/document-generation.md` |
| `code-share` | 코드 공유·실행. ⚠️ sandbox 에 `allow-same-origin` 금지 · 상세는 RPC `get_code_project` 로만 | `src/lib/codeShare.ts` · `docs/features/code-share.md` |
| `desktop-app` | PC 앱 내려받기(서명 확인). ⚠️ `canonicalJson`·공개 키는 NEIS_helper 와 짝 | `src/lib/desktopApps.ts` · `docs/features/desktop-app-download.md` |
| `academy` | 별빛 아카데미(학생 게임형 UI). ⚠️ `academy_private` 를 부르는 INVOKER 함수를 service_role 이 부르면 스키마 USAGE 필요 | `game/AcademyGame.tsx` · `docs/features/academy.md` 외 `academy-*.md` |
| `tamagotchi` | 다마고찌. ⚠️ three.js 는 `three/deviceScene.ts` 하나만 import · 물건·확률·지급 규칙은 SQL ↔ TS 두 벌 · 라우트·RPC·화면 역할 세 곳 짝 · 새 종(2026-10-26 — 상태 JSON `species`, 없음 = 별 가족)은 해금 판정이 서버 `species_unlocked` 한 곳, 종 목록은 SQL CHECK ↔ `model/species.ts` 두 벌 · 통신은 다마고찌 첫 realtime(`tama_link`) | `model/petModel.ts` · `docs/features/tamagotchi.md` |
| `star-tower` | 별까지 쌓기(집중 타이머 게임). ⚠️ 값은 SQL ↔ `model/catalog.ts` 두 벌 · 글자 크기는 `--st-fs` | `scene/TowerScene.ts` · `docs/features/star-tower.md` |
| (isekai3d 주식 앱) | 실제 주식 시세(한국 200·미국 100·실물) — 투자는 isekai3d 게임 휴대폰 «주식 앱»에서 게임 돈으로(2026-10-26 `/invest` 코인판에서 옮김, 코인·순위 없음). 여기는 시세 받기(엣지 `invest-quotes`)와 읽기 RPC `isekai3d_stock_*` 만. ⚠️ 한국은 날짜마다 시장 전체 한 번(종목마다 부르지 말 것) · 체결 = «주문 뒤 처음 마감한 종가»(마감 시각 지난 것만) 서버 한 곳 · 공공데이터 V2 는 작업 이름도 `_V2` | `supabase/functions/invest-quotes` · `docs/features/invest-game.md` |
| `isekai` | 이세계 사회인 «내 기록»(`/isekai` — 사원증·근무 기록부·드라마·면담 노트) + 업적(코인). 게임은 독 학생판, 여기는 RPC `isekai3d_my_record`·`isekai3d_achievements` 로 읽기만. ⚠️ 업적 진행도에 게임 knowledge(클라이언트 값) 금지, 세이브 state 로 세는 업적은 보상 ≤15 · 목표는 SQL ↔ `model/achievements.ts` 두 벌 · ⚠️ 근무 카드 `answer_choice` 는 게임이 섞은 순서 — `card_choice_stored` 로 되돌려 읽을 것 | `IsekaiPage.tsx` · `docs/features/isekai.md` |
| `coin-guide` | 코인 얻는 법(`/coins`) — 세계별 보상·쓰는 곳 안내, 숫자는 코인 경제 설정. ⚠️ 새 earn 키 = `COVERED_EARN_KEYS` 에도(회귀가 대조) | `model/coinGuide.ts` · `docs/features/coin-guide.md` |
| `study-room-stats` | 자습실 통계(판정은 서버 `seaton_private`, 화면은 그리기만) | `StudyRoomStatsPage.tsx` · `docs/features/study-room-stats.md` |
| `world-today` | 요즘 세상(관심 분야 맞춤 — 분야 목록 TS·SQL·엣지 세 벌) | `utils/fields.ts` · `docs/features/world-today.md` |
| `creative-activities` | 창체 기록 + GraphRAG(방법론 = 스킬 `/inquiry-graphrag`). 새 `inquiry_*` 표는 사용자 확인 전까지 만들지 않는다 | `activityService.ts` · `docs/features/creative-activities.md`, `creative-activities-graphrag.md` |

### 주요 패턴 (상세 = `docs/features/shared-patterns.md`)
- **Student code 키 통합**: `student_basic_info.id` = `resource.meta->>'id'` = `profiles.email` prefix
- **학생 딥링크 `?student=학생코드`** — 새 학생 열람 화면은 `useStudentDeepLink` 패턴
- **개인정보 3종** — 개인 전화번호 무저장 · 졸업생 익명화(`process_graduated_student_cohort`) · 방침 동의 게이트(`docs/privacy-policy-and-consent.md`, `docs/database/graduate-privacy.md`)
- **사람 선택 = `SearchableMultiSelect`**(그룹 구성원 표시 · 스프레드시트 붙여넣기 · 조건으로 고르기). 이름 오버레이는 **Popover**(`ui/name-list-overlay.tsx`) — Tooltip(터치에서 안 열림)·HoverCard(탭을 죽임) 금지. 조건 규칙 = `src/lib/studentAudienceRule.ts`·`facultyAudienceRule.ts`(⚠️ `canonicalRule` 을 바꾸면 저장된 열쇠와 어긋난다)
- 대시보드 라이브 클록 = `useCurrentTime()` + `getPeriodTimeStatus()`
- **홈 꾸미기 (2026-10-25)** — 교사·학생 홈은 카드 정의 목록(`TeacherDashboardV2`·`StudentHome`의 `widgets`)을 `CustomizableDashboard` 가 그 사람의 배치(표 `dashboard_layout`, 본인 행만)대로 그린다. 판정 `src/lib/dashboardLayout.ts`(새 카드는 기본 자리에 끼워진다), 회귀 `scripts/dashboard-layout-test`. ⚠️ 홈에 카드를 더할 땐 **그 목록에 한 줄**(그리드에 직접 넣지 말 것 — 꾸미기에서 안 보인다) · 보여 줄 게 없으면 카드가 null(칸이 `empty:hidden` 으로 사라진다) · 플래너 카드 = `features/planner/PlannerHomeCard`(플래너와 같은 쿼리 키)
- Auth 트리거 = `on_auth_user_created` → `handle_existing_user_profile()`

## External Integrations

### Google Drive — 상세 = `docs/features/google-drive.md`
- 서비스 `src/services/googleDriveServiceNew.ts` · 통합 `googleDriveIntegrationService.ts`, 기본 = 사용자 "Spacekijun" 폴더(공유는 `VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID`)
- 팝업 재인증은 **구글 토큰만** 받는다(Supabase 세션 불변, `googleIdentityPopup.ts`) — 클라이언트 ID 가 Supabase 구글 로그인과 같아야 한다. 미리 확인은 `hasValidToken()`

### NEIS API
**Purpose**: Import Korean school academic calendar

**Implementation**:
- Service: `src/services/neisApiService.ts`
- Endpoint: `https://open.neis.go.kr/hub/SchoolSchedule`
- School: Jeonju Gijeon Girls' High School (9999999)

**Features**:
- Year-based import
- Smart duplicate handling (updates changed dates)
- Stores in `meeting` table with `kind: 'schedule'`

### Google Calendar Export
**Features**:
- Date range selection
- Event type filtering (7 types)
- Permission-based filtering
- Standard .ics format

## Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_DRIVE_CLIENT_ID=your_client_id
VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID=your_folder_id (optional)
VITE_RHWP_STUDIO_URL=/rhwp-studio/index.html (optional - rhwp Studio 주소, same-origin http(s)만 허용)
```

## Migration Notes

### Task System
- **Current**: Migrating to JSONB-based assignee storage
- **Use**: `useTasksJsonb.ts` hooks for new development
- **Avoid**: Legacy `useTasks.ts` hooks

### Meeting Assignees
- **Deprecated**: `meeting_allocation` table removed
- **Current**: Use `meeting.meta.assignee` JSONB field
- **Structure**: `{"name": {"name": "이름", "signature": 0}}`

### Profiles grade/class_number
- **Removed**: `profiles.grade`, `profiles.class_number` 컬럼 삭제됨
- **담임교사 판단 = 태그 `N학년 N반`** (2026-09-23 정정 — `resource.meta.grade/class_number` 는 라이브 **0건**이고 일부 코드의 폴백으로만 남아 있다. 태그가 공식이라는 것은 사용자 결정)
- **학생 grade/class**: `student_basic_info.grade`, `student_basic_info.class_num` 사용

### 학생 사진 (2026-10-02)
- **`resource.meta.picture` 는 비어 있다** — 636행이 전부 리로스쿨 CDN 주소였고 더는 열리지 않아 일괄 삭제했다(사용자 결정). 리로스쿨 CSV 가져오기(`csvStudentParser`)도 사진 열을 **읽지 않는다** — 되살리면 죽은 주소가 다시 들어온다. 사진을 읽는 화면들은 값이 없을 때를 이미 처리한다(아바타 = 이니셜). 학생 사진을 다시 쓰려면 외부 CDN 주소가 아니라 비공개 버킷 + 서명 URL 로 설계할 것(`student_dashboard_view.picture`·`get_section_students` 가 `meta->>'picture'` 를 그대로 노출한다).

### Personal Phone (2026-07-23)
- **Removed**: `profiles.phone` 컬럼 삭제, `resource.meta`의 `phone`/`hp` 키 일괄 제거
- **재저장 금지**: `resource_meta_no_personal_phone` CHECK 제약이 `meta.phone`/`meta.hp`를 거부 — meta 병합 쓰기 전 `withoutPersonalPhone()` 적용
- `student_dashboard_view.phone`은 호환용으로 항상 NULL

### 운영 시간표: 학기 단위 (2026-07-28) — 상세 = `docs/database/timetable.md`
- 정본 = `teacher_timetable`/`student_timetable`(학년도·학기 키). 어느 학기를 볼지는 `src/hooks/useTimetableTerm.ts`(학사력 → 최신 학기 폴백)
- 섹션명 파생 = `teacherSectionName()`(`src/lib/timetableSource.ts`) · 학년·반 숫자는 `class_label` 파싱 금지(`section.meta` 조인)
- RPC 에 파라미터를 더할 땐 DROP + CREATE(오버로드 모호성)
- ⚠️ 시간표 업로드는 «지우고 다시 넣기» — 중간 실패를 성공으로 세지 말 것 · 비현행 학기 업로드는 `resource.meta` 를 갱신하지 않는다 · 메모 `year` 는 학년도
- **운영 시간표 = 기간 한정 임시 시간표 (2026-10-26)** — 시험·수능 대비·특수 교육과정 기간에 대상 학년의 정규 수업을 **운영 화면에서만** 덮는다(`timetable_override`·`_slot`, 정규 `teacher_timetable` 은 그대로 기록). ⚠️ «그날 실제로 들어가는 수업»이 필요한 새 코드는 `teacher_timetable` 직접 조회가 아니라 RPC `teacher_timetable_effective`(웹 `services/timetableOverrideService.ts`) — 반대로 학기를 대표하는 분석·생성기·수업 그룹은 정규를 읽을 것. 교체 후보·`tt_my_lesson`·급식지도는 아직 정규만(후속). 상세 = `docs/database/timetable.md` «운영 시간표»

### Task Assignees
- **Current**: 담당자·상태는 `task.meta.assignees` JSONB 배열에 저장 (구 `assignees_jsonb` 컬럼 표기는 폐기)
- **Managers**: `event.meta.managers` 배열이 정본, `event.manager_id`는 레거시 호환 유지

### Task 다중 마감 일정 (2026-07-26) — 상세 = `docs/features/task-management.md`
`task.meta.deadlines`(2회 이상일 때만) + `due_date` = 다음 회차 사본(칸에서 날짜만 고치지 말 것). 판정은 `src/lib/taskDeadlines.ts` 경유, 회차 이름 `formatRoundLabel`, 남은 회차만 = `pendingDeadlinesForAssignee`/`pendingDeadlinesForEvent`(완료 회차를 전개하지 말 것). 회차 완료 = `set_task_deadline_status`. 회귀 `scripts/task-deadlines-test`

## Development Patterns

### LLM 호출 (상세·실측 = `docs/features/ai-chat.md`)
- **`supabase.functions.invoke('openai-proxy'/'solar-proxy')` 를 직접 쓰지 말고 `aiChat()`**(`src/services/aiChat.ts`). 기본 = Solar `solar-pro4`, OpenAI 는 `provider: 'openai'`
- **모델 ID 는 클라이언트와 엣지 함수 양쪽에 있다** — 바꿀 땐 `aiChat.ts`·`solar-proxy`·`openai-proxy`·`inquiry-comprehensive/providers.ts` + 모델을 직접 적는 호출부를 함께. `SOLAR_MODELS.pro3`·구 provider 값은 이력 해석용으로 지우지 말 것
- **추론 강도는 값을 적지 말고 과제 성격을 선언** — `reasoningEffortFor('extraction'|'generation', …)`, 표에는 측정된 조합만(없으면 미전송). ⚠️ 추출·재작성에 추론을 켜 두면 수십 배 느려지고 엣지 게이트웨이(~150초)를 넘는다. 품질이 떨어지면 추론을 되켜지 말고 **도메인 지식을 프롬프트에 적을 것**
- ⚠️ 모델을 바꾸면 `reasoningEffort` 와 호출부 타임아웃을 **실사용 길이로 다시 잴 것** — 라이브 하네스 `scripts/ai-chat-live-test/run.mts`·`compare-effort.mts`(오프라인 회귀는 이 부류를 못 잡는다)
- ⚠️ `maxCompletionTokens` 는 solar 경로에서 조용히 무시된다. 구조화 JSON 은 `aiChatDetailed()`(`finishReason === 'length'` = 잘림), 파싱은 `ipsi-hub/utils/analysisJson.ts` 패턴(복구 + 원문을 실은 오류)
- 오류 판정은 `isAiChatRetryableError`·`isAiChatTimeoutError` — 정규식 금지(504 메시지에 숫자가 없다). 엣지 오류는 `throwEdgeFunctionError()`. `aiChat({ timeoutMs })` 로 게이트웨이보다 먼저 포기하고 더 작은 요청으로 바꿀 것
- ⚠️ «프롬프트에 실렸다» ≠ «모델이 쓴다» — 실은 데이터를 지시문에서 호명하고, 분기 신호는 파라미터로
- API 키는 엣지 함수 시크릿 전용(`VITE_` 금지) · 임베딩은 OpenAI 고정 · Gemini 경로는 없다(2026-10-01 제거)
- ⚠️ solar-proxy 를 CLI 로 배포하면 `supabase/config.toml` 의 `verify_jwt = false` 선언을 확인할 것

### 모달 안 긴 파일명 넘침 (2026-08-14) — 상세 = `docs/features/modal-system.md`
원인은 조상의 `min-width:auto`. 공용 Content 가 `[&>*]:min-w-0` 로 직계만 막으므로 그 아래 flex/grid 를 새로 만들면 `min-w-0` 을 다시 줄 것. 제목엔 `truncate`(+`title`), 본문 속 파일명엔 `break-all`. `overflow-x-hidden` 은 은폐일 뿐

### 차트 등장 애니메이션 (recharts `<Line>`) — 상세 = `docs/features/chart-animation.md`
새 `<Line>` 에는 **`{...drawLineProps}`** 필수(`src/lib/chartAnimation.ts` — 없으면 선이 다 그려질 때까지 점이 안 보인다). 점선은 `fadeLineProps`, 차트가 많으면 `staticLineProps`. 회귀 `scripts/chart-animation-test`

### State Management
- **화면의 [새로고침] 버튼 = `usePageRefresh(쿼리 키 접두어 목록)` (2026-10-11)**: 시간표·스케줄 버튼이 «동작하지 않는» 것처럼 보였던 원인 둘 — ①화면을 이루는 쿼리 중 **일부만** 다시 불렀다(시간표 = 수업만, 메모·교체 요청 배지·쉬는 날은 그대로) ②회전이 `isLoading`(첫 로드에만 참)에 묶여 다시 불러오는 동안 아무 표시가 없었다. 훅은 접두어 아래 **활성** 쿼리를 `refetchQueries` 로 전부 다시 부르고(staleTime 무관) 끝날 때까지 `refreshing` 을 준다(최소 0.5초 회전, 실패 시 토스트). ⚠ 화면에 새 쿼리를 붙이면 그 화면의 접두어 목록에도 넣을 것 — 빠뜨려도 오류 없이 그 부분만 안 바뀐다. 회귀 = `npx tsx scripts/page-refresh-test/run.mts`
- **Server State**: TanStack Query with caching
- **Global State**: React Context (auth, user profile)
- **Local State**: useState/useReducer

### Error Handling (상세 = `docs/features/app-resilience.md`)
- 사용자 피드백 = 토스트 · 전역 렌더 오류 = `AppErrorBoundary`(경계 둘: `root`·`routes`)
- **부팅 경로에서 `localStorage` 직접 읽기 금지** → `src/lib/safeLocalStorage.ts`(깨진 값은 스스로 지운다)
- **인증 대기를 `null`(백색 화면)로 두지 말 것** — `RequireAuth` 는 6초 뒤 `AuthStuckScreen`. 로딩·실패·차단은 서로 다른 화면(`ProtectedRoute`), `loadProfile` 은 await 뒤 `setLoading(false)`
- ⚠️ **`onAuthStateChange` 콜백 안에서 supabase 호출을 `await` 하지 말 것**(인증 잠금 순환 대기 → 영구 백색 화면). 무거운 작업은 `runOutsideAuthLock`(매크로태스크). 회귀 `scripts/auth-lock-test`(진짜 배타 잠금 폴리필)
- ⚠️ **인증 잠금은 출처 단위** — 얼어붙은 휴대폰 배경 탭이 잠금을 쥔다. `src/lib/authLock.ts`(유한 대기 3초 + steal, `acquireTimeout 0` 은 즉시 실패) · `AUTH_LOCK_MAX_WAIT_MS` < `AUTH_STUCK_MS`. 사용자 id 만 필요하면 `getUser()`(네트워크·잠금) 대신 `useAuth().user`

### File Organization
```
src/
├── components/
│   ├── tasks/       # Task management
│   ├── admin/       # Admin interfaces
│   ├── schedule/    # Calendar & events
│   ├── timetable/   # Class schedules
│   ├── documents/   # Document management
│   ├── layout/      # Layout components
│   └── ui/          # Shadcn components
├── features/        # Feature modules (자체 components/services/hooks/utils 포함)
│   ├── evalog/      # 학생 기록 관리 (세특, 모의고사 마킹, 성적 등)
│   ├── course-analyze/  # 교과 분석 (성적 기반 학생 배정 추천)
│   ├── student-dashboard/  # 학생 종합 대시보드
│   ├── evalearn/    # AI 모의고사 분석
│   └── class-assignment/  # 반 배정 관리
├── pages/           # React Router pages
├── hooks/           # TanStack Query hooks (공통)
├── contexts/        # React Context (auth, user profile)
├── config/          # App configuration
├── types/           # TypeScript interfaces
├── services/        # API services (공통)
├── integrations/    # External API integrations
├── utils/           # Utility functions
└── lib/             # Core libraries
```

## Gotchas / 주의사항

한 줄 요약이다 — 경위·실측·재현은 **`docs/gotchas.md`**(전문).

**배포·마이그레이션**
- ⚠️ 배포 파일 이름은 ASCII — Lovable 호스팅은 한글 이름 청크를 404 로 준다. `vite.config.ts` 의 `sanitizeFileName` 을 지우지 말 것, `public/` 에 한글 파일 금지(회귀 `scripts/build-asset-names-test`)
- ⚠️ **`supabase db push` 금지**(로컬 전용 마이그레이션 153건) — 한 건 적용 절차 = `MIGRATION_EXECUTION_ORDER.md` 머리글(드라이런 → 적용 → `migration repair`)
- ⚠️ 새 마이그레이션 번호가 겹치지 않는지 먼저 확인(겹쳐도 오류 없이 하나만 이력에 남는다)

**Supabase · RLS**
- `storage.objects` 직접 DELETE 는 막혀 있다 — Storage API(엣지 함수)로
- SQL 3값 논리: 로그인 필수 함수는 맨 앞 `if auth.uid() is null then raise`, 비교는 `coalesce(a = b, false)`
- 새 함수 EXECUTE 는 `anon`·`PUBLIC` 양쪽을 본다 — 인자 없는 신원 함수는 null 가드 + anon 허용, uuid 를 받는 판정 함수는 회수
- `INSERT ... RETURNING` 에는 SELECT 정책도 적용된다 — 남에게 보내는 알림 insert 에 `.select()` 금지, 행 id 로 표를 되읽는 판정 함수에는 새 행 컬럼으로 판정되는 분기를 함께
- RLS 정책 안에서 자기 표(서로 참조하는 표)를 직접 조인하지 말 것(42P17) — DEFINER 함수로
- 두 기능이 한 표를 나눠 쓰면 «어느 기능의 행인가» 필터를 **쓰기 RPC 까지** 전수로
- task·work 의 담당자·매니저는 트리거가 지킨다 — 트리거 함수를 DEFINER 로 바꾸지 말 것
- 학생 알림 수신은 `owns_notification_resource()` 경유(학생은 `user_resource` 가 없다) · `related_meeting_id` 는 meeting FK
- `task_work_*` 감사 표는 직접 쓰기 금지(RPC 경유) · `seat_reservations` SQL 테스트 claims 에 `email` 필수
- `system_settings` 는 운영 설정 전용(자동화 상태 금지) · `DialogContent` 에 overflow 를 주면 안쪽 팝오버가 잘린다

**데이터**
- **재학생 명단 = `resource`(type='student', `status='active'`)** — `student_basic_info` 는 졸업생까지 든 생기부 저장소
- 무제한 select 는 1000행에서 조용히 잘린다 — 학기 목록은 `fetchDistinctTerms()`, 대량은 count + `range()` 페이징
- 관리 화면 기본 학기 = 학사력(`useAcademicTerm` + `mergeTermOptions`)
- `section` 은 학기 키가 없고 자동 생성되지 않는다(`meta.grade/class` 는 JSON 숫자) · 편성·시간표 데이터는 `resource.status` 를 보지 않는다
- `student_identity_map.current_class` 는 **현재 반**(과거 반 = `get_student_year_context()`) · 1~2학년 5등급 / 3학년 9등급 / 모의 9등급 · 자습실 출석률은 미래 예약 제외 · `student_career_submissions` 는 제출분만
- 방과후 학년도는 유도(`afterschoolTerms.ts`), 학기는 유도 불가 · `mock_problems` 정답은 `answer IS NOT NULL`
- 모의고사·성적예측 = `docs/features/evalearn.md`·`grade-prediction.md` + 스킬 `/grade-prediction-analysis`(결손은 빈칸으로 온다 · 한 통계로 우열을 말하지 말 것 · 산출물은 `public/` 금지)
- course-selection 수요조사 import 6종 함정·재동기화(`resync-round.mts` — 지웠다 다시 넣지 말 것)·md5 검증 = `docs/gotchas.md`
- 레거시: `meeting_allocation` 삭제(→ `meeting.meta.assignee`) · `profiles.grade/class_number` 삭제(담임 = 태그 `N학년 N반`) · 실제 Auth 트리거 함수 = `handle_existing_user_profile()`
- `resource.meta` 에 `phone`/`hp` 금지 · 졸업 처리는 일괄 메뉴 전용(익명화 비가역, 이름은 `YYYY입학NNN`)

## 온톨로지 분석 시스템 (`.claude/skills/`)

학교 데이터를 분석하는 Claude Code 스킬 시스템. 4-Layer 아키텍처로 구성됩니다.

### L0: 파운데이션 (school-ontology)
| 스킬 | 용도 |
|------|------|
| `/school-ontology` | 공통 지식 기반 (등급 체계, RPC 인벤토리, 데이터 제약사항, 교육과정 메타) |

### L1-A: Student Layer (학생 중심 분석)
| 스킬 | 용도 |
|------|------|
| `/student-profile {code}` | 개인 학생 종합 프로파일 (11개 도메인 교차 분석) |
| `/student-early-warning {학년}` | 위기 학생 자동 탐지 (CRITICAL/WARNING/WATCH) |
| `/cohort-report {학년}` | 학년별 코호트 종합 분석 |
| `/class-dashboard {학년} {반}` | 반 담임 종합 대시보드 |
| `/subject-analysis {학년} {교과군}` | 교과군별 성적 심층 분석 |

### L1-B: Education Layer (교육 시스템 중심 분석)
| 스킬 | 용도 |
|------|------|
| `/curriculum-analysis {입학연도}` | 교육과정 편성 분석, 연도 비교, 학점 배분 |
| `/exam-analysis {학년} {연도} {월}` | 모의고사 문항 분석, 영역별 학교 vs 전국 |
| `/subject-ontology {교과군}` | 과목 구조·성취기준 온톨로지 |
| `/teaching-analytics` | 수업시수, 교사 배정, 시간표 효율성 |
| `/curriculum-import` | 교육과정 HWPX → 성취기준 DB 저장 |

### L1-C: Admission Layer (입시 분석)
| 스킬 | 용도 |
|------|------|
| `/univ-admission-analysis {학년} {석차} {계열}` | 학생 성적 기반 대학 전형 매칭 (교과/종합/정시) |
| `/admission-favorability {학생코드}` | 교과/종합/수능 전형 간 유불리 정량 판단 |
| `/school-admission-report {학년}` | 학년 코호트 전형유형별 경쟁력 분포 분석 |
| `/admission-trend {계열}` | 계열별 3~5개년 경쟁률/컷 추이 + 선형 외삽 전망 |

### L1-D: Knowledge Graph Layer (지식그래프)
| 스킬 | 용도 |
|------|------|
| `/text-knowledge-graph extract {code}` | 세특 텍스트 → 엔티티/관계 추출 (JSON) |
| `/knowledge-graph student {code}` | 온톨로지 데이터 → Cytoscape.js 시각화 |
| `/cohort-knowledge-graph` | 다수 학생 KG 크로스 분석 |
| `/kg-save` | KG JSON → student_kg_versions DB 저장 |
| `/student-graphify {이름\|코드}` | 학생 개인 graphify 지식그래프 (교과 연결·심화 추적·Gap 분석·탐구 설계) |

### 교육 데이터 인프라
- **테이블**: `school_curriculum` (교육과정 운영, 한 학기 한 과목 = 한 행. `academic_year/grade/semester/subject` 키. `admission_year`는 generated column. xlsx `학교교육과정 편제 보고서`가 source of truth), `school_curriculum_archive` (마이그레이션 전 백업, credits_by_semester JSONB 형식), `subject_achievement_standards` (교과 성취기준), `univ_admissions` (대학 전형 — 리로스쿨), `mock_problems`, `student_detailed_activities`, `student_kg_versions`/`student_kg_entities`/`student_kg_relations`
- **MV**: `mock_school_stats` (학교 문항 통계, mock_marking 자동 집계) — `refresh_mock_school_stats()` 갱신
- **MV**: `student_identity_map` (학생 키 통합), `student_academic_flat` (성적 평탄화), `student_cross_domain_stats` (배치 성능 최적화), `student_mock_flat`, `temperature_rankings_mv`
- **RPC**: `get_curriculum_overview()`, `get_curriculum_comparison()`, `get_semester_credit_distribution()`, `get_mock_item_analysis()`, `get_mock_category_stats()`, `refresh_student_cross_domain_stats()`, `refresh_student_mock_flat()`, `convert_grade_scale()`
- 분석 전 `refresh_student_identity_map()`, `refresh_student_academic_flat()` 실행 필요
- 시각화 템플릿: `.claude/skills/*/templates/*.html` (고정 UI, 데이터만 치환)

### 학생 KG 추출 v8 — 전 학년 적용 중 (2026-09-12) — 상세 = `docs/features/kg-extraction-v8.md`
`scripts/kg-extract-v8/` · Solar Pro 4 · 엔진 `solar-pro4-seg-v8`. 입력 = 창체 GraphRAG 분절, 활동 노드는 코드 문턱으로 먼저 확정. ⚠️ 전 코호트 재추출은 조각 러너(`SINCE=… bash scripts/kg-extract-v8/run-chunks.sh`) — `--force` 는 재개를 끈다 · 완료 판정은 최신 버전만. 2학기 생기부가 적재되면 1학년 재추출 필요. 옛 9-stage 파이프라인 재설계 연구 기록 = 같은 문서 + `reports/research-open2/README.md`

## How to Add (개발 패턴 가이드)

### 새 페이지 추가
1. `src/pages/NewPage.tsx` 생성
2. `src/App.tsx`에 라우트 추가: `<Route path="/new-page" element={<NewPage />} />`
3. `src/components/layout/Sidebar.tsx`에 네비게이션 항목 추가
4. `src/components/layout/MobileNavigation.tsx`에도 동일 항목 추가

### 새 Feature 모듈 추가
```
src/features/my-feature/
├── components/     # Feature 전용 컴포넌트
├── services/       # API/데이터 서비스
├── hooks/          # TanStack Query hooks
├── utils/          # 유틸리티
└── types.ts        # Feature 전용 타입
```

### 새 DB 테이블/RPC 추가
1. Supabase MCP로 migration SQL 작성
2. 해당 도메인의 `docs/database/<domain>.md` 업데이트 (테이블·뷰 추가/삭제 시 `DATABASE_TABLES.md` 인덱스 도메인 맵 표도 갱신)
3. RLS 정책 설정 (teacher/student/admin 역할별)
4. 필요 시 `src/integrations/supabase/types.ts` 타입 갱신

### 새 분석 스킬 추가
1. `.claude/skills/my-skill/SKILL.md` 생성 (frontmatter: name, description)
2. `/school-ontology` 스킬의 공통 지식(등급 체계, MV 갱신)을 반드시 참조
3. 시각화가 필요하면 `.claude/skills/my-skill/templates/` 디렉토리에 HTML 템플릿 생성
4. 템플릿은 `__GRAPH_DATA__` 등 플레이스홀더만 치환하는 방식 사용

---

**문서 지도**: 결론·전역 규칙은 이 파일, 기능별 상세는 `docs/features/<모듈>.md`, 스키마는 `docs/database/*.md`(색인 `DATABASE_TABLES.md`), 전역 함정 전문은 `docs/gotchas.md`, 개발 경위는 각 기능 폴더의 `PROMPTS.md`(색인 = 루트 `PROMPTS.md`).

**이 파일에 무엇을 남기는가** — «**이 줄을 모르고 다른 기능을 고치면 사고가 나는가**». 그렇다면 남기고(전역 규칙·계약·역할/RLS 판정·공용 부품), 한 기능 안에서만 참인 설계·측정·기각 기록은 그 기능 문서로 보낸다. 새 기능도 이 파일에는 **한두 줄 요약 + 포인터**만 적는다(긴 문단을 더하면 다시 비대해진다). 규약 전문과 정리 이력(2026-09-12 · 2026-10-23) = `docs/claude-md-guide.md`.
