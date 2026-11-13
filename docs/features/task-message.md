# 할 일 작업 「메시지 보내기」 (`message.send`)

> 2026-09-24 신설. 할 일 매니저가 정해진 교직원에게 메시지를 보낸다.
> 받는 사람은 「입력 받기」와 **같은 대상 규칙**으로 고른다([collect-input.md](collect-input.md) §대상 규칙).
> **2026-10-06**: 조건 «이 할 일의 담당자»(`task_assignees`)도 고른다 — 서버 `send_task_message` 가 보낼 때 `expand_task_audience(rule, task_id)` 로 지금의 담당자 id 로 펼친다(`20261006100000`). 종전엔 그 조건을 `resolve_audience` 가 모르는 type 으로 **조용히 0명** 처리해, 그 조건만 있으면 «받을 사람이 없습니다»였다. 같은 날 화면 정리(자동 저장·다시 보내기 경고·받는 사람 이름 확인·AI 초안 되돌리기) = CLAUDE.md «작업 화면 UI 정리».

## 전달 경로 두 가지

| 경로 | 방식 | 이유 |
|---|---|---|
| **SPACEKIJUN 알림** (기본) | [알림 보내기] → 서버 `send_task_message` 가 `notification_events`(type `task_message`)에 넣는다. 누르면 그 할 일(`/my-tasks?task=`) | 명단을 서버가 푼다 — 클라이언트가 보낸 id 목록을 믿지 않는다. 보낸 사람 위조·`RETURNING` 42501 롤백(Gotchas)도 피한다 |
| **쿨메신저** | 자동 발송 **안 함**. 러너가 [본문 복사](제목을 첫 줄 `[제목]`)·[받는 사람 복사](이름, 가나다순·쉼표)와 절차 3단계를 안내하고 사람이 보낸다 | 2026-09-22 방향 전환 — `coolmsg_outbox` 발송 큐는 쓰지 않는다(사용자 요구: "사용자가 직접 전송하도록 안내") |

분장표에만 있는 이름(계정 미연결)은 알림을 못 받는다 — 러너와 확인 창이 "쿨메신저로 꼭 보내 주세요"라고 따로 말한다.

## 메시지 만들기 도움 (AI 초안)

"무엇을 알릴지" 한 줄 + 할 일의 맥락(업무·할 일 이름·설명·마감·받는 사람 요약)으로 `{title, body}` 초안을 만든다.
- 공용 `aiChat()` + `reasoningEffortFor('generation')`, 타임아웃 120초(게이트웨이 150초보다 먼저 포기).
- 맥락에 없는 날짜·숫자·장소를 지어내지 말라고 프롬프트에 적었다. 초안은 편집창에 들어갈 뿐 **바로 보내지 않는다**.
- 응답이 JSON 이 아니면 본문으로 받는다(초안을 버리지 않는다) — `parseMessageDraft`.

## 저장

- 초안 = `task_action.config.message`(`{title, body, audience}`) — 매니저 전원이 `update_message_config` 로 고친다
  (`task_action` UPDATE 가 작성자 전용이라 공동 매니저가 못 고치는 문제, 입력 받기와 같다). 본문 4,000자 상한(서버·화면 동일).
- 발송 기록 = `task_message_send`(누가·언제·무엇을·누구에게·미연결 누구). **여러 번 보낼 수 있다**. 읽기는 매니저만(`can_manage_task_action`), 쓰기는 RPC 전용.
- 알림은 **사람당 한 번** — 여러 조건에 걸린 사람(예: 수학 교사이면서 학적 담당)도 한 번만 받는다.

## 검증 (2026-09-24 드라이런)

빈 본문 거부 · 1학년 수학 + 분장 「학적·출결·방과후·수상」 → 3명(장재윤 중복 제거) 알림 3 · 기록 1 · 비매니저 교사 발송 거부·기록 0행.
회귀 `npx tsx --tsconfig tsconfig.app.json scripts/task-message-test/run.mts`(21) + `scripts/collect-input-test/run-browser.mjs` 05번(1280/390).

## 파일

`supabase/migrations/20260924120000_task_message.sql` · `src/lib/taskMessage.ts` · `src/features/task-workflow/services/taskMessageService.ts` ·
`src/features/task-workflow/components/message/MessageSendRunner.tsx`

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| (task-workflow) `message.send` | **할 일 작업 「메시지 보내기」** (2026-09-24). 받는 사람 = 입력 받기와 **같은 대상 규칙**(서버가 풀고 사람당 한 번). 기본 전달 = **SPACEKIJUN 알림**(`send_task_message`, type `task_message` → 그 할 일), **쿨메신저는 자동 발송하지 않고** 본문·받는 사람 복사 + 절차 안내(계정 미연결 이름은 쿨메신저로 꼭 보내라고 따로 말함). AI 초안(`aiChat`, 맥락에 없는 날짜·숫자 금지). 발송 기록 `task_message_send`(여러 번 발송 가능). 회귀 `scripts/task-message-test/run.mts` | `src/lib/taskMessage.ts`, `components/message/MessageSendRunner.tsx` · `docs/features/task-message.md` |
