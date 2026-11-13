# 업무 온톨로지 — 「오늘」·「한 장 보기」 (2026-11-08~)

**한 줄**: 출처가 다른 «내가 할 것»(할 일·요청·서명·결재·공문)을 한 줄 모양으로 모으는 「오늘」과,
업무 하나를 머리·단계·타임라인·연결·작년 지식으로 보여 주는 「한 장 보기」. 업무 관리 재설계의 첫 단계다.

- 설계·결정·단계 = [`docs/plans/2026-11-08-work-ontology-redesign.md`](../plans/2026-11-08-work-ontology-redesign.md) (시안 = 같은 폴더 `…-mockup.html`)
- 코드 = `src/features/work-ontology/`
- 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/work-ontology-test/run.mts` (순수 판정 · 진입점 · 배선)
  + 실제 화면 `PLAYWRIGHT_MODULE=<playwright/index.mjs> node scripts/work-ontology-test/run-screenshots.mjs` (개발 서버 8080, 390·1280, 쓰기 차단)

## W0 — 업무 작업실 (2026-11-12) · 방향 전환

> 설계 = [`docs/plans/2026-11-12-work-room.md`](../plans/2026-11-12-work-room.md). 사용자 철학: **흐름에 연연하지 말고 한 업무를 해내는 기능부터 — 쌓이면 흐름이 된다.** 범위는 새 화면만이 아니라 업무 관리 전체(사용자 정정).

| 자리 | 내용 |
|---|---|
| 「한 장 보기」 → **작업실** | 책임자·담당자에게는 수행 화면: 머리(D-day · 목표 한 줄 · 목표일 · 진행 막대) · **할 일**(평평한 목록, 날짜로만 묶음: 오늘까지·이번 주·나중에·날짜 없음·끝남) · **서랍**(링크·메모 `work_note`) · 기록(= 옛 타임라인) · 연결. 그 밖의 사람에게는 P0 읽기 화면 그대로 |
| 할 일 추가 | 한 줄 + 끝의 날짜 말(`오늘·내일·모레·금·11/13·11월 13일·D-1·당일`) — `parseQuickAdd`. 담당 = 나, 일회성. 책임자는 줄을 눌러 고치기(같은 문법) · ✕ 지우기(토스트 [되돌리기]) |
| 체크 = 완료 | **작업이 없는 할 일만**(`roomCheckBlock`). 작업(제출·입력 등)·회차·과제 단위는 «내 할 일에서» 링크. 쓰기 = `set_task_assignee_status` 한 곳(`workRoomService`) · 작업 수를 못 읽었으면 체크를 감춘다(fail-closed) |
| 시작 | 「오늘」 «내 업무» 칸 [새 업무] → 무슨 일 · 언제까지(선택) · 목표 한 줄(선택) → 작업실. 책임자 = 나, 할 일 없이. 만들기는 `createWorkFromCandidate`(한 벌) |
| 「오늘」 «내 업무» (2026-11-12 최종) | 옛 «내 할 일»과 합쳤다 — 내 업무 = `MyTaskInbox layout="byWork"`: 내가 책임자인 업무 머리(이름 → 작업실 · 진척 · D-day) 아래 내가 담당인 할 일(완료·회차·과제 단위·제출 그대로), 내 할 일이 없는 책임 업무는 접은 한 줄, 담당만 맡은 업무는 작은 머리·작은 행. 한때 만든 가로 타임라인(`workLanes`·`WorkTimeline`)은 업무 관리 › 타임라인(`WorkGanttChart`·`lib/workTimeline.ts`)과 겹쳐 지웠다 — 머리글 [타임라인] 링크 |
| 업무노트 틀 (2026-11-12 최종) | 머리글 = 옛 «내 할 일» 머리글(할 일·완료·전체 · 사용 방법 · 계획표) + 새로고침 · 타임라인 · 새 업무. 왼쪽 = 서명·결재(내 차례) → 「요청」 → 내 업무. 오른쪽 = 한 줄 요약(지금 · 이번 주 · 기한 지남 · 공문 · 몰리는 날, 누르면 그 자리로) · 오늘 일정 · 공문 제안(오늘 일정처럼 한 줄 — 누르면 «왜 나에게»·요약·작은 버튼) · 할 일 계획표. 휴대폰 = 할 일 먼저(DOM 순서) |
| 고르기 → 작업실 → 창 (2026-11-12) | 업무노트 첫 화면의 할 일 줄은 **버튼 없는 가는 줄**(`MyTaskInbox taskHref` → `InboxLinkRow`) — 누르면 그 업무의 작업실로 가서 할 일을 짚는다. 작업실에서 할 일을 누르면 **할 일 상세 창**(완료·제출, 옛 «내 할 일»과 같은 `TaskDetailDialog`) — 책임자·그 할 일의 담당자만(명단이 보이는 창), 이름·마감 빠른 고치기는 연필 버튼. 기록의 공문 줄·연결의 공문 = **공문 상세 창**(`OfficialDocDetailDialog` — 접수·판정·결정·본문, 읽기만, RLS = 관리자·결재권자 본인). 연결 줄은 이름·설명 두 줄 말줄임(긴 공문이 칸을 뚫던 것) |
| 작업실 [자세히 고치기]·기록 (2026-11-12) | 업무 관리 화면으로 넘기지 않고 **그 자리에서** 기존 창(업무 상세 → 수정). 기록 한 줄을 누르면: 할 일 줄 = 책임자는 할 일 상세 창(→ 수정), 그 밖에는 목록에서 그 할 일을 짚는다(담당자 명단 비노출) · 작년에서 이어짐 = 그 업무 한 장 · 업무 전체 줄 = 책임자에게 업무 상세. 갈 곳이 없으면(지운 할 일 등) 누를 수 없다 |
| work.meta 새 키 | `targetDate`(drop) · `goal`(keep) · `startedIn`(drop) — `WORK_META_ROLLOVER_POLICY` 에 분류 |

⚠️ **완료 진입점 계약이 바뀌었다**(2026-11-12 사용자 결정 «업무 관리 전체를 수행 중심으로»): 종전 «완료·제출의 유일한 진입점 = 내 할 일» → «**작업이 걸린 할 일**의 완료·제출 = 내 할 일, 작업 없는 할 일은 작업실 체크도». 둘 다 같은 RPC 이고 제출 가드는 DB 트리거. 회귀가 «작업실 화면은 RPC 를 직접 부르지 않음 · 서비스는 `set_task_assignee_status` 만 · 체크는 `roomCheckBlock === null` 일 때만»을 본다.

## 지금 상태 — P0 시험판 (2026-11-08)

| 자리 | 내용 |
|---|---|
| 메뉴 | «업무노트»(2026-11-12 이름 변경, 옛 «오늘 (시험판)») `/work` — [오늘] 섹션, 업무 관리 서랍 다음. **기본 = 관리자만**(메뉴 카탈로그 `defaultVisibleToUsers: false`) |
| 「오늘」 `/work` | 지금(기한 지남·오늘 · 내 차례인 서명·결재) / 이번 주(6일 뒤까지) / 나중에. 위에 요약(지금·이번 주·기한 지남·마감 몰리는 날)과 오늘 일정 |
| 「한 장 보기」 `/work/o/work/:id[?task=]` | 머리(상태·진척·다음 마감) · 할 일·단계(단계 줄 + 할 일) · 타임라인 · 작년에는(업무 지식) · 연결(근거 공문 · 흐름 앞뒤 업무 · 계보) |
| 쓰기 | **없다**. 할 일·요청 버튼 = «내 할 일» 딥링크(`?task=`·`?collect=`) · 서명·결재 = 홈 카드와 같은 기존 창 · 업무 고치기·단계별 진행 = 업무 목록 딥링크(책임자만) |
| DB | 바꾸지 않았다 |

## P1 — 연결 표 (2026-11-08)

| 자리 | 내용 |
|---|---|
| DB | 표 `ontology_link` + `can_view_object`(INVOKER) + RPC `link_objects`·`unlink_objects` — `docs/database/core.md` «업무 온톨로지 연결». 시험 `supabase/tests/ontology_link.sql` |
| 「한 장 보기」 연결 칸 | 옛 연결(공문 출처·흐름 선·계보) + 표의 연결을 한 벌로(`model/explicitLinks.mergeLinkGroups` — 같은 상대는 옛 것이 이긴다). [연결 추가] = 일정(오늘에서 가까운 순, 앞뒤 120일)·업무(관련 / 이 업무의 앞 / 다음). 줄의 ✕ = 끊기(만든 사람·관리자) + 토스트 [되돌리기] |
| 일정 상세 | «이어진 업무 · 할 일» 칸(`components/LinkedObjectsSection`) — **연결이 있을 때만** 생긴다. 가상 일정(생일·할 일 마감)은 uuid 가 아니라 묻지 않는다. **「오늘」 메뉴가 보이는 사람에게만**(`isPathHidden('/work')` — 시험판 동안 관리자만, 메뉴를 열면 함께 열린다) |
| 하지 않은 것 | MCP 도구(`link.objects`) — 세 벌 이름표·엣지 배포가 따라붙어 P2 와 함께. 공문·서명·문서 쪽 칸 — 공문은 P2(교사 공개)와 함께 |

## P2 — 공문 제안 (2026-11-08)

| 자리 | 내용 |
|---|---|
| DB | 공문 «담당 본인» 읽기·결정 정책(`20261108110000`) — `docs/features/official-doc-triage.md` 머리말 |
| 「오늘」 «제안» 묶음 | 결재권자가 나 · 결정 없음 · 처리 필요(최근 60일) 공문. 지금/이번 주/나중에 와 **섞지 않는다**(아직 내 일이 아니다). 카드 = 발신·접수일 · 기한 · «왜 나에게» 한 줄 + AI 요약 · 버튼 셋 |
| [내 일로] (2026-11-12 세 갈래) | **새 업무로**(이름 초안 = AI 후보 이름 → 머리표 뗀 제목, 목표일 = 공문 마감 → `create_work` + `workTargetDate`, 곧장 작업실) · **참고해서 새 업무로**(«참고해서 시작» 창, 공문 제목·후보 이름으로 원본 정렬 → 만든 업무에 공문 할 일 + 결정 `saveDecision(..., { createdWorkId, addDocTaskToCreated })`) · 기존 업무에 할 일로(아래 — [고르기]를 눌러야 목록이 펼쳐진다, 접힌 줄에는 «가까운 업무» 한 개만). 판정 `docWorkName`·`docHints`·`docDeadline`·`newWorkDraft` |
| [내 일로] 기존 업무 | 고르기 창 — 내가 책임자인 진행 중 업무를 공문과 가까운 순(`rankWorksForDoc`, 글자 2-gram · AI 후보 이름 1.5배), 문턱 0.35 넘는 것을 «가까운 업무», 아니면 개인 묶음 «○○○ 공문 처리»를 먼저 권한다(없으면 새로 — 책임자 = 나) |
| [다른 사람에게] | 교직원 고르기 + 이유 → 결정 `reassign`(업무·할 일은 만들지 않고 알림도 없다) |
| [참고만] | 결정 `info` — 결정은 지우지 않는 기록이라 되돌리기가 없다(토스트가 말한다) |
| 저장 | 판단함과 같은 `saveDecision` — 할 일(담당 = 나, `meta.fromOfficialDoc`) → 결정 → 실패하면 만든 것 지우기. 규칙은 만들지 않는다 |
| 하지 않은 것 | 학사일정·작년 계보 제안(«작년처럼 만들기») — 2026-11-12 «참고해서 시작»이 사람이 고르는 길을 맡았다(자동 제안은 아직) · MCP `link.objects` |

## 판정 — 화면은 그리기만

| 파일 | 하는 일 |
|---|---|
| `model/todayFeed.ts` | 출처 → 줄(`TodayItem`) · 묶음(`bucketOf`) · 정렬 · 요약. **새 판정을 만들지 않는다** — 할 일 상태 `taskStatus` · 끝난 업무 `isFromClosedWork` · 담당자 아님 `withoutReportedNotMine` · 회차 `taskDeadlines` · 요청 배치 `collectInput.placeInboxRequests` · 공문 처리 필요 `officialDocInbox.needsAction` |
| `model/workObject.ts` | 타임라인(`buildWorkTimeline`) · 연결(`buildWorkLinks`) · 단계(`workStages` = `workPipeline.buildStages`) · 요약 |
| `model/explicitLinks.ts` | 연결 표 줄 → 연결 칸(방향 배지 «앞/다음» · 묶음 · 끊기 가능 여부) · 옛 연결과 합치기 · 객체 주소(`hrefOfObject`) |
| `services/ontologyLinkService.ts` | 연결 읽기 · 상대 이름(종류마다 한 번) · 잇기/끊기 RPC · 후보 찾기 |
| `model/docSuggestion.ts` | 공문 제안 — 업무 순위 · 개인 묶음 · 초안 넷(link_work·create_work·reassign·info, 판단함의 `validateDraft` 통과) · «왜 나에게» |
| `model/objectRef.ts` | 객체 종류 · 한 장 보기 주소(`objectHref`) — P0 는 «업무»만 그린다(`VIEWABLE_OBJECT_TYPES`) |
| `hooks/useTodayFeed.ts` | 기존 훅을 모은다(같은 쿼리 키 — 다른 화면과 캐시 공유) |
| `hooks/useWorkObject.ts` | `get_work_detail` · `work_event` · `task_status_history` · 업무 흐름 선 · `get_work_knowledge` 를 읽기만 |

## ⚠️ 조용히 틀리는 자리

- **완료 진입점은 하나** — 「오늘」에 완료 버튼을 만들지 말 것(2026-09-04 사고). P3 에서 «내 할 일»의 역할을 **한 번에** 넘겨받는다. 회귀가 두 화면 파일에서 상태 쓰기 RPC 를 찾는다.
- **사람은 역할로만** — `work_event` 의 사람 id 칸, 상태 이력의 바꾼 사람 칸을 select 하지 않는다(회귀가 훅 파일을 읽어 검사).
- **담당자 명단은 책임자·관리자에게만** — `get_work_detail` 은 DEFINER 라 누구에게나 명단을 준다. 화면이 `isWorkManager` 로 가린다(그 밖에는 «담당 N명»).
- **업무 흐름 선은 `flow`·`related`·`depends_on`·`handoff` 만** — `contains`·`action` 은 표 구조를 다시 그린 것이라 읽으면 같은 관계가 두 곳에 생긴다.
- **상태 이력은 줄여서** — 담당자가 많거나 회차가 있는 할 일은 할 일 상태가 매주 «완료 ↔ 진행 중»을 오간다(운영 실측: 담당 53명). `collapseStatusHistory` = 하루 하나 · 같은 상태 반복 제거 · 회차 할 일은 마지막 하나.
- (2026-11-12) 업무노트는 `list_official_docs(..., p_mine := true)` — 서버가 «결재권자 = 나 · 결정 없음»만 준다(관리자도 전부를 받지 않는다).
- **공문은 관리자만** — `list_official_docs` 는 지금 관리자 RLS. 「오늘」은 `isAdmin` 일 때만 부르고 결재권자 이름 = 내 이름 · 결정 없음 · 처리 필요만 싣는다. 교사에게 여는 것은 P2(정책 추가).
- **새로고침** — `usePageRefresh` 접두어에 이 화면의 쿼리를 모두 넣었다(`my-tasks-jsonb`·`today-meetings`·`work-today`·`signature-requests`·`approvals`·`collect-input`). 쿼리를 더하면 여기도.
- **휴대폰** — 누르는 곳 44px(행 제목 링크 포함), 맥락 띠는 글자만(같은 곳으로 가는 링크를 둘 두지 않는다), 긴 담당자 명단은 다음 줄로.

- **연결 종류·관계 목록은 두 벌** — SQL CHECK(`from_type in (…)`·`kind in (…)`) ↔ `objectRef.OBJECT_TYPES`·`explicitLinks.LINK_KINDS`. 회귀가 마이그레이션 파일을 읽어 대조한다.
- **`can_view_object` 는 INVOKER 여야 한다** — DEFINER 면 소유자 권한으로 읽어 모든 객체가 «보인다». 회귀가 검사한다.

## 화면 캡처 하네스의 한계

서비스 키로 대신 읽으므로 `auth.uid()` 로 호출자를 확인하는 RPC(`list_official_docs`·`get_work_knowledge`)는 403 이다 —
캡처에서는 공문 줄·업무 지식 칸이 비어 보인다(실제 관리자에게는 채워진다). 모양 확인용.
`WO_FAKE_DOC=1` 이면 공문 목록 RPC 에 지어낸 공문 하나(결재권자 = 캡처 계정)를 돌려줘 제안 카드·[내 일로] 고르기 창(실제 내 업무 목록)을 본다 — 고르지 않고 닫는다.
`WO_FAKE_LINK=1` 이면 연결 표 읽기에 지어낸 한 줄(업무 → 실제 학사일정)을 돌려줘 연결 칸·[연결 추가] 창을 본다 — 운영 DB 에 쓰지 않는다.
서비스 키라 [연결 추가]의 일정 후보에 **남의 개인 일정**도 보인다(실제로는 RLS 가 본인 것만) — 캡처 PNG 는 `.tmp`(git 무시)에 두고 확인 뒤 지운다.
