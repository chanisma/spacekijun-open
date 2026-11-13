# 스페이스기전 모바일 (/m) — 2026-10-29

휴대폰에서 본 앱(약 10MB 묶음) 대신 **작은 모바일 앱**을 띄운다. 교직원 전용. 사용자 결정(2026-10-29):
가벼운 모바일이 기본, 고르면 온전한 웹사이트(본 앱)도 볼 수 있게 · 교실 기기 QR 두 가지를 빠르게 · 쪽지·알림·휴대폰 푸시 ·
내 PC 의 에이전트 터미널에 일 보내고 결과 받기.

## 어느 앱을 띄우나 — `src/main.tsx` → `src/mobile/view.ts` `chooseEntry()`

| 주소 | 휴대폰 | PC |
|---|---|---|
| `/m`, `/m/*` | 모바일 | 모바일 |
| `/classroom/link/:code` · `/classroom/type/:code` (교실 기기 QR) | 모바일 | 모바일 |
| `/` | `/m` 으로 바꿔 모바일 (단, «전체 웹사이트로 보기»를 고른 탭은 본 앱) | 본 앱 |
| 그 밖 | 본 앱 | 본 앱 |

- 판정은 앱 코드를 받기 **전에** 한다. `main.tsx` 는 `./mobile/mobileMain` 또는 `./fullMain` 하나만 동적으로 불러온다 →
  휴대폰 첫 로드 JS ≈ 467KB (본 앱 ≈ 10.2MB, 2026-10-29 빌드 측정 — `timeUtils-*.js` 공유 묶음 449KB 가 대부분).
- «전체 웹사이트로 보기» = `sessionStorage['spacekijun-view'] = 'full'`(**그 탭만** — 탭을 닫거나 홈 화면 앱을 다시 열면 모바일. 2026-10-29 사용자 정정: «PC 화면»이 아니라 웹사이트 전체를 보는 기능). 본 앱 휴대폰 메뉴(시트) 아래 **모바일 화면** 으로 되돌린다.
- 로그인: `signInWithGoogle(지금 주소)` + `sessionStorage['spacekijun-post-login-redirect']`(RequireAuth 와 같은 키). 구글이 `/` 로
  돌려보내도 `chooseEntry` 가 그 키가 모바일 주소면 그리로 옮긴다(`#access_token` 은 그대로).
- 모바일에 없는 주소로 가는 링크는 `LeaveToFull` 이 주소를 다시 불러 본 앱을 띄운다.

## 문지기 — `MobileGate` (본 앱 RequireAuth + ProtectedRoute(FACULTY_ROLES) 와 같은 순서)

로그인 → 개인정보 동의(`PrivacyConsentGate` 그대로) → 명단 연결(`accountLinkStatus === 'unlinked'` 이면 전체 웹사이트 안내) →
교직원(`FACULTY_ROLES`, 학생은 전체 웹사이트 안내). 서버(RLS·RPC)도 같은 것을 막는다.

## 탭

| 탭 | 파일 | 데이터 |
|---|---|---|
| 오늘 | `pages/TodayPage.tsx` | `teacher_timetable_effective`(운영 시간표 반영) — 한 주를 받고 요일을 고른다 |
| 메모 | `pages/MemoPage.tsx` · `data/memos.ts` | 데스크 스티커 메모와 **같은** 개인 보드(`collab_boards.meta.kind='desk_sticky'` + `collab_notes`). 규칙(색 7개·첫 줄 제목) = NEIS_helper `app/core/sticky.py` — 한쪽을 바꾸면 다른 쪽도 |
| 쪽지 | `pages/MessagesPage.tsx` · `data/deskMessages.ts` | 데스크 쪽지(교사↔학생): 받은 것 `notification_events` type `desk_message`, 보낸 것 `desk_message_sent`, 보내기 `send_desk_message_v2`(답장 = 마지막 받은 쪽지에 reply_to, 사진 4장·1.5MB — 휴대폰에서 1600px JPEG 로 줄인다), 사진 `desk_message_image`(7일), 주소록 `desk_message_directory`. 학생이 처음 보낼 때 허락받기(2026-10-31): 교사 화면에 허락·거절·대화 종료, 상태 `desk_message_sessions`, 막는 곳은 서버 `send_desk_message_v2`(`20261031130000_desk_message_session.sql`). 서버 SQL 정본 = NEIS_helper `deploy/supabase/2026101[9]…_desk_message*.sql` |
| 알림 | `pages/AlertsPage.tsx` | `notification_events` 중 쪽지·쿨메신저 뺀 것, 누르면 읽음 · 모두 읽음 |
| 에이전트 | `pages/AgentsPage.tsx` · `data/agents.ts` | 아래 |
| 설정(머리 ☰) | `pages/MorePage.tsx` | 휴대폰 알림 켜기/끄기(`subscribeWebPush` — iOS 는 홈 화면 앱에서만), 전체 웹사이트로 보기, 로그아웃 |

- 아래 탭 숫자 = 안 읽은 쪽지·알림(`MobileShell` `useUnreadCounts`, 30초).
- 휴대폰 알림을 누르면 sw.js 가 `/?push_open=<id>` 를 연다 → 휴대폰은 `/m?push_open=` → 쪽지면 쪽지 탭, 아니면 알림 탭.
  열린 탭이 있으면 sw 의 postMessage(`spacekijun:notification-click`)로 같은 판정.

## 내 PC 의 에이전트 (2026-10-29)

마이그레이션 `20261029130000_desk_agent_phone.sql`(시험 `supabase/tests/desk_agent_phone.sql`) — 20261027120000 의 표·함수 위에:

- `desk_agent_phone_overview()` → `{me, pcs:[{device,label,online(30초),seen_at,agents}], messages:[휴대폰에서 보낸 것 40건 + status·note·replies]}`
- `desk_agent_phone_send(p_phone, p_to_device, p_to_agent, p_body)` — **받는 사람 = 나 자신**만(남의 PC 로는 길이 없다). 보낸 쪽 칸 =
  `sender_device 'phone:<32hex>'`·`sender_label '휴대폰'`·`sender_agent 'phone'` (데스크의 `desk_agent_send` 는 32자 hex 기기만 받으므로 이 함수로만 생긴다).
- `desk_agent_beat` 다시 정의 — inbox 에 `from_phone`(보낸 이 = 받는 이 본인 ∧ 휴대폰) · 휴대폰 앞으로 온 답은 10분 만료에서 뺀다.
- 결과 = 기존 `desk_agent_reply` 그대로(답은 원래 보낸 기기 = 휴대폰으로).
- 데스크 쪽(NEIS_helper `app/core/agent_peer.py`): 에이전트 터미널 머리의 **휴대폰** 스위치(기본 끔, 2026-10-30 «다른 PC» 와 따로 — `20261030100000_desk_agent_cross.sql`: 휴대폰만 켠 PC 는 `cross_pc=false` 로 남의 목록·보내기에서 빠진다)를 켜 두면
  `from_phone` 메시지를 **묻지 않고** 에이전트에게 넣는다(권한 묻지 않기로 연 에이전트에도 — 보낸 이가 사용자 본인).
  휴대폰 id 는 브라우저마다 `localStorage['spacekijun-phone-device']`.

### 예약 업무 결과 (2026-11-07)

마이그레이션 `20261107090000_desk_agent_cron.sql`(시험 `supabase/tests/desk_agent_cron.sql`) — 데스크 에이전트 터미널 오른쪽 «예약»
(NEIS_helper `app/core/agent_cron.py`)이 정한 시각에 돌린 일의 결과를 휴대폰 «에이전트» 탭에 올린다. 표 구조는 그대로.

- `desk_agent_cron_post(p_device, p_label, p_agent, p_title, p_prompt, p_result, p_status, p_late)` — 나 자신에게만. 두 줄:
  머리(`sender_device 'cron:<PC>'`·`sender_agent 'cron'`·`sender_label` = 예약 이름, body = 시킨 일, note = `<상태>[ late]`) +
  답(그 PC 의 에이전트 → `'phone:cron'`, reply_to = 머리). 둘 다 `delivered` 라 데스크 inbox 에 다시 들어가지 않는다. 시간당 120건 한도를 함께 센다.
- `desk_agent_phone_overview` 가 `phone:` 에 더해 `cron:` 묶음도 돌려준다 — 칸 `kind`('phone'|'cron')·`title`·`result_status`·`late`.
  PC 이름은 beat 가 없어도(휴대폰 스위치를 안 켠 PC) 답 줄의 `sender_label` 에서.
- 화면: «⏰ 예약 · 이름» 카드(상태·늦게 실행 뱃지, 시킨 일은 두 줄, 결과는 파란 칸) + **이어서 시키기**(그 PC 가 연결돼 있고 그 에이전트가
  목록에 있을 때만 — 기존 `desk_agent_phone_send` 로 새 메시지). 푸시는 데스크가 따로 `notification_events` type `desk_agent`(meta.kind `cron`)로 보낸다.

## 교실 기기 QR

`ClassroomLinkPage`·`ClassroomTypePage` 의 본문을 `ClassroomLinkBody`·`ClassroomTypeBody` 로 떼었다(본문 파일에 `Layout` 을 들이지 않는다 —
들이면 모바일 묶음에 본 앱 틀이 딸려 온다). 본 앱은 `Layout` 안에, 모바일은 틀 없이 같은 본문을 띄운다. 회귀 `scripts/classroom-link-test/run.mts` 가 본문 파일을 읽는다.
