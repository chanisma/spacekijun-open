# 할 일 작업 「입력 받기」 (`collect.input`) · 대상 규칙

> 2026-09-23 신설. 할 일에 붙는 작업으로, **정해진 대상에게서 값을 입력받아 표로 모은다.**
> 예) 1학년 수학 교사 전원 × 담당 과목 × [1차 정기시험, 2차 정기시험] × [점검 완료(예/아니오), 비고]
>
> 메타데이터 쪽(교과 분류·부서 학년도·업무분장)은 [duty-assignment.md](duty-assignment.md).
>
> **2026-10-01 — 표를 「제출 받기」와 나눠 쓴다**([submit-action.md](submit-action.md)): `collect_request.kind` 로 입력/제출을 가르고,
> 요청 RPC 는 종류로 넓혔다(입력 가지의 동작은 그대로). 새 대상 조건 **«이 할 일의 담당자»**(`task_assignees`)는 입력 받기에서도 고를 수 있다 —
> 미리보기·보내기·명단 다시 계산이 모두 그 할 일로 푼다. 내 할 일 구획·홈 카드·메뉴 배지는 「입력 요청」 → **「요청」**(입력·제출 합산, 줄마다 종류 표시).

## 한 줄 · 한 칸

| 개념 | 정의 | 어디서 오나 |
|---|---|---|
| **대상** | 규칙으로 고른 사람 | `resolve_audience` (서버) |
| **줄** | 대상 × 메타데이터 축 | 축 = `person`(사람마다) · `subject`(담당 학년×과목마다) · `class`(담당 학급마다) · `club`(지도 동아리마다) · `club_member`(지도 동아리 부원마다 — 2026-11-11, `docs/database/clubs.md` §4) |
| **구분** | 한 줄을 나누는 직접 입력 목록 | `config.dimensions` — 0개면 구분 없음 |
| **칸** | 줄 × 구분 | 입력 항목(`config.fields`)을 채운다 |

"입력 값을 메타데이터로도, 직접 입력한 구분으로도 나눈다"(사용자 요구)를 **두 축의 곱**으로 푼 것이다 —
과목은 메타데이터 축, 1차·2차는 직접 입력 축. 둘을 한 목록에 섞으면(예: 메타데이터 구분 "담당 학급")
줄마다 열 구성이 달라져 표가 성립하지 않는다(설계 검토에서 기각).

**공동 담당**(같은 학년·과목을 여럿이 가르침) — `answerMode` 로 요청마다 고른다(사용자 결정: 둘 다).
- `each` 교사마다 각자 한 줄
- `shared` 과목당 한 번 — 담당 중 누구든 채우면 완료, **누가 입력했는지 남는다**

**입력 방식**(`mode`) — 보는 형태는 어느 쪽이든 표다(사용자 결정).
- `private` 개별 입력: 응답자는 자기 줄만 본다. 정해진 사람에게서 필수로 받을 때.
- `shared` 공개 표: 대상자 모두가 전체 표를 보며 자기 줄만 고친다. 서로 보며 맞춰야 할 때.

## 대상 규칙

`{ include: Criterion[], exclude: Criterion[] }` — 저장되고, 명단은 서버가 푼다.

| type | 뜻 | 출처 |
|---|---|---|
| `teaching` | 학년·교과(군)·**교과 묶음**(어문학과·예체능)·과목 수업 교사 — 교과(군)과 묶음은 OR | `teacher_timetable`(현 학기) + `subject_group_of`·`subject_cluster_of` |
| `homeroom` | 담임 | **태그 `N학년 N반`**(사용자 결정: 태그가 공식) — 앵커 정규식으로 고정 |
| `grade_head` | 학년 부장 | 태그 `N학년 부장` |
| `department` | 부서원 | 그 학년도 `department_member` ∪ 그 부서 **분장 자리의 현 담당자** |
| `seat` | 분장 자리 | `duty_seat`(**이름**으로 가리킨다 — 해마다 복사되는 자리의 id 는 학년도마다 다르다) |
| `position` | 부장 전원 · 교장·교감 | 분장 자리 `kind` |
| `tag` | 임의 태그 | `resource_tag_assignments` |
| `club` | 동아리 담당 교사(빈 목록 = 전원) — 2026-09-24 | `club_info`(그 학년도, **이름**으로 가리킨다) |
| `all_faculty` / `people` | 교사·직원 전원 / 직접 지정 | `resource` |

의미(서버 `resolve_audience` 가 정본):
- include 는 합집합. exclude 의 **수업 조건은 그 수업 단위만**, 사람 조건은 사람 전체를 뺀다
  ("1학년 전원, 정보 제외"가 정보 교사의 다른 수업까지 지우면 안 된다).
- 과목·학급 축에서 담임·분장처럼 **수업이 아닌 조건으로 들어온 사람은 그 학기 자기 수업 전부로 펼친다.**
  수업이 없으면(교장·교감) 줄이 생기지 않으므로 미리보기가 **"수업 없음"** 으로 따로 알린다.
- 분장표에만 있는 이름(`resource` 미연결)은 **"미연결"** 로 드러낸다 — 알림·응답 불가.
- 사람마다 **포함 이유**(`reasons`)를 돌려준다. 만든 사람이 명단을 믿고 보내려면 "왜 이 사람인가"가 보여야 한다.

## 매니저이면서 대상자 (2026-09-24)

요청을 만든 사람이 대상에도 들면 러너에 **「내 입력」 탭**이 생기고, 현황 탭 위에 "나도 대상자입니다 — 내 줄 N/M" 바로가기가 뜬다.
⚠️ 서버 `get_collect_board` 는 매니저에게 **전원의 줄**을 준다(현황 표용). 개별 입력 방식에서는 응답 화면이 **클라이언트에서 내 줄만** 거른다 —
안 그러면 매니저 겸 대상자는 입력 화면에서 남의 줄까지 보게 된다(`CollectRespondPanel`).

할 일 상세 모달의 **연결된 작업** 목록에서도 대상자면 바로 [입력하기]가 열린다(`affordanceForUse` 의 `collectTarget`).

## 저장 — 왜 `task_action_run` 이 아닌가

`task_action_run` 의 SELECT 가 **교직원 전체**라 비공개 응답이 샌다(값 제출이 RUN 을 기록하지 않는 것과 같은 이유).
응답자마다 작업을 소유시키는 fan-out 도 검토했지만 매니저 표·마감·재알림이 N개 작업에 흩어진다.

| 표 | 역할 |
|---|---|
| `task_action.config.collect` | **설계**(대상 규칙·축·구분·항목·방식). 매니저 전원이 `update_collect_config` 로 고친다 — `task_action` UPDATE 가 작성자 전용이라 공동 매니저가 못 고치던 문제 |
| `collect_request` | **실행 상태** — 열림/마감, 기준 학기, 잠긴 축·응답 방식·공개 방식. 업무 흐름 복사·연간 가져오기가 config 를 통째로 복제하므로 상태를 config 에 두면 따라간다 |
| `collect_target` | 보내는 순간 확정한 **명단 스냅샷**. 빠진 대상은 `removed_at` |
| `collect_response` | 칸(단위×구분) 하나당 1행. `owner_key` = each 면 응답자 id, shared 면 `''` — 유일 키를 한 벌로 두는 칸 |

쓰기는 전부 DEFINER RPC(`start_collect_request` · `submit_collect_response` · `sync_collect_targets` ·
`set_collect_request_status` · `remind_collect_pending` · `update_collect_config`), 읽기는 `get_collect_board` 한 번
(가시성 판정을 서버 한 곳에 두고 1000행 상한도 피한다) + 응답자 목록 `my_collect_requests`.

## 수명

1. 할 일 편집 창 [작업] → **입력 받기** 추가 → 저장 → [열기]
2. 설정 + 대상 미리보기(인원·줄·수업 없음·미연결) → **요청 보내기** — 명단 고정, 대상자에게 알림 `collect_input_requested`
3. 응답자: 알림 → `/my-tasks?collect=<작업 id>` / 내 할 일 **「요청」 구획** / **홈 「나의 업무」 카드의 「요청」 줄**(2026-09-27) → 응답 창.
   **2026-10-05 — 요청은 한 자리에만**: 제출 요청이고 그 할 일이 목록에 행으로 있으면 **행**이 맡는다(«파일 제출 남음» + [제출하기]) — 구획·계획표·홈 줄에서는 뺀다. 입력 요청과 행이 없는 제출 요청(담당이 아닌데 대상)만 구획에. 판정 단일 출처 = `collectInput.placeInboxRequests`, 그래서 구획은 페이지가 아니라 `MyTaskInbox` 가 그린다. 구획 머리 숫자 = 남은 줄 수, 다 낸 요청은 «다 낸 요청 N건»으로 접는다(마감 전이면 고치러 다시 들어갈 수 있다). 할 일이 비었는데 요청이 남으면 «모두 마쳤습니다» 대신 «할 일은 모두 마쳤습니다 · 위 「요청」에 남은 것이 N건». 메뉴 배지는 그대로 전부 센다. 회귀 `scripts/inbox-request-placement-test/run.mts`(16)
   - 응답자는 할 일 담당자가 아니라서 홈 카드의 할 일 목록(`assigned_tasks`)에는 없다. 종전엔 알림을 놓치면 홈에서 요청을 볼 길이 없었다.
     카드는 **남은 요청만**(`pendingCollectRequests` — 다 채운 것·칸 0개 제외, 마감 가까운 순) 최대 3줄 + «내 할 일에서 N건 더», 누르면 제자리에서 응답 창.
   - ⚠️ **대상자를 담당자로 끼워 넣어 보이게 하지 말 것** — 완료 버튼까지 생겨 한 명이 누르면 할 일이 끝나고 요청이 닫힌다(`close_collect_on_task_end`).
     담당과 입력 대상은 따로 두고 **보이는 자리만** 늘린다.
   - **메뉴 「내 할 일」 숫자 배지**(사이드바 펼침=이름 오른쪽 · 접힘=아이콘 모서리 · 모바일 하단 5칸 · 모바일 메뉴 시트) = 남은 요청 수.
     판정 = `lib/navBadges`(**경로 → 숫자** 지도 — 메뉴 정의에 숫자를 싣지 않는다: 배치 층마다 옮겨 실어야 한다), 조회 = `useNavBadges`(교직원만).
     새 요청 알림(`collect_input_requested`)이 realtime 으로 오면 `useBrowserNotifications` 가 입력 요청 조회를 새로 해 **앱을 켜 둔 채여도** 배지가 는다.
   - **내 할 일 계획표** — 마감이 있는 요청은 그 날짜 칸에 인디고 「입력 요청」 칩으로, 없는 요청은 «마감일 미정»에. «이번 주 마감 N건»·미정 건수에 함께 센다.
   - ⚠️ **요청 마감은 두 모양으로 온다** — 작업 설정 `dueDate`('2026-03-31')가 없으면 **할 일 마감(timestamptz)의 `::text`**('2026-09-30 00:00:00+00').
     그대로 쓰면 «09/30 00:00:00+00 까지»로 그려지고 계획표 날짜 칸에는 **영원히 안 들어간다**(오류 없음). 반드시 `collectDueDay`/`collectDueLabel` 을 거칠 것
     (할 일 쪽 `normalizeDeadlines` 와 같은 «앞 10자리» 규칙). 내 할 일 「입력 요청」 구획이 2026-09-23 부터 이 상태였다.
4. 매니저: 현황 표 · 미완료 명단 · [다시 알림] · [명단 다시 계산](+N/−M 확인 후 반영) · [마감] · 엑셀
5. **할 일이 완료·취소되면 요청이 닫힌다**(트리거 — `taskStatus.ts` "task 종료 우선"과 같은 규칙).
   작업을 빼면 삭제 대신 **보관**되고 요청도 닫힌다(삭제는 트리거가 거부 — 응답이 cascade 로 사라진다).

**보낸 뒤 잠기는 것**(화면·서버 이중): 줄 단위·응답 방식·공개 방식·구분, 기존 항목의 삭제·형식 변경.
공개 방식을 잠그는 이유 — 비공개로 받은 답이 사후에 공개되면 안 된다. 항목 추가·이름 변경·대상 규칙 변경은 된다.

## 조용히 틀리는 자리

1. **수업 조건으로만 들어와 단위가 전부 제외된 사람**이 "수업 없음" 줄로 남았다(2026-09-23 드라이런에서 잡힘 —
   "1학년 전원, 수학 제외"가 27이 아니라 28). "수업 없음"은 수업이 아닌 조건으로 들어온 사람에게만 뜻이 있다
   (`via_other or resource_id is null`).
2. **0단위 대상은 자동 완료처럼 보인다** — 칸이 없으면 "전부 채움"이 공허하게 참. 그래서 스냅샷에 넣지 않고 미리보기가 따로 알리며,
   진척 모수에서도 미연결·명단 밖 줄을 뺀다.
3. **`teacher_timetable.teacher_resource_id` 가 비면** 그 교사가 조용히 빠진다 → 이름 폴백(교사 우선, 공백 무시).
4. **같은 칸의 두 항목을 연달아 바꾸면** 두 번째 저장이 첫 번째를 모른 채 덮어쓴다 → 응답 패널이 칸마다 마지막 보낸 값을 기억해 병합
   (서버 값이 새로 오면 비워 공개 표에서 남의 입력을 덮지 않는다).
5. **남에게 보내는 알림 insert 에 RETURNING 금지**(42501) — 여기서는 DEFINER 함수 안에서 넣어 해당 없다.
6. **체크박스로 "점검 여부"를 받으면 "아니오"를 기록할 수 없다** — 빈 칸과 구분이 안 된다. `yesno` 형식을 둔 이유.
7. **휴대폰에서 입력칸이 든 표**는 이름이 한 글자씩 꺾이고 예/아니오가 쪼개진다(390px 스크린샷에서 확인) → 응답자 화면은 640px 미만에서 줄마다 카드.

## 검증 (2026-09-23)

SQL 드라이런(`begin … rollback`, JWT claim 으로 관리자·교사·비대상 교사·직원·익명 흉내):

| 확인 | 결과 |
|---|---|
| 1학년 × 수학, 과목 축 | 1학년 공통수학2 × 3명(공동 담당 각자) |
| 교장·교감을 과목 축으로 | 둘 다 "수업 없음" |
| 1학년 전원 − 수학 | 30 → 27 (수정 후) |
| 정보화부 부서원 | 1 (부서원 0 + 분장 정보화부장) |
| 분장 자리 + 직위 + 담임 − 담임 | 교감·교장·장재윤(학적 담당, 교사로 매칭)·권민결 |
| 요청 보내기 | 3줄·3명·알림 3 |
| 대상 교사 응답 | 저장·완료 판정, 잘못된 값("maybe") 거부, 남의 줄 거부 |
| 비대상 교사 | 표 조회 거부 · 표 직접 SELECT 0행 · 설정 변경 거부 |
| 보낸 뒤 공개 방식 변경 | 거부 |
| 작업 삭제 | 거부("빼면 보관됩니다") |
| 할 일 완료 | 요청 `closed:task_completed` |
| 익명 `resolve_audience` | permission denied |

회귀:
- `npx tsx scripts/collect-input-test/run.mts` (59건 — 규칙 요약·설정 검증·셀 판정·표 모델 each/shared·내보내기·업무분장 기간·교과 목록 SQL↔TS·정적 배선)
- `node scripts/collect-input-test/run-browser.mjs` (실제 컴포넌트 × RPC 스텁, 1280/390 — 매니저 설정·현황, 응답 개별·공개 표). `PLAYWRIGHT_MODULE` 필요.
- `npx tsx --tsconfig tsconfig.app.json scripts/collect-input-test/render.mts` (11건 — 홈 카드의 입력 요청 줄 SSR)
- `node scripts/collect-input-test/run-nav-planner-shots.mjs` (메뉴 배지 — 사이드바 펼침·접힘 1280, 모바일 하단·시트 390 / 계획표 390·1280 — timestamptz 모양 마감이 날짜 칸에 들어가는지). 개발 서버 필요.
- `node scripts/collect-input-test/run-dashboard-shots.mjs` (실제 「나의 업무」 카드 390/1280 — 요청이 할 일보다 위, 요청만 있을 때 빈 상태·빈 타임라인 없음, **마감일이 잘리지 않음**(맥락 줄 끝에 붙였다가 휴대폰에서 사라진 것을 여기서 잡았다)). 개발 서버·`PIPELINE_TEST_URL` 필요.

## 파일

- 서버: `supabase/migrations/20260923160000_collect_input.sql`
- 판정·모델: `src/lib/audienceRule.ts` · `src/lib/collectInput.ts`
- 화면: `src/components/audience/*` · `src/features/task-workflow/components/collect/*`
- 연결: `actionRegistry.ts`(category `collect`) · `TaskActionPanel.tsx`(러너 분기) · `utils/actionPanelMode.ts` · `pages/MyTasks.tsx` · `notificationNavigation.ts`

## 하지 않은 것

- **기존 담당자 선택기(`SearchableMultiSelect`)에 규칙 조건 넣기** — 할 일 담당자·일정 설문 대상도 같은 규칙을 쓰면 좋지만 이번 범위가 아니다. `resolve_audience` 는 그대로 재사용할 수 있다.
- **학생 대상** — 규칙의 `people`/`all_faculty` 가 교직원만 받는다(내 할 일이 교직원 화면).
- **정기시험 회차를 데이터에서 가져오기** — `school_exam_question.exam_name` 은 시험이 **끝난 뒤** NEIS 에서 들여온 값이라 사전 점검 대상 선정에 못 쓴다. 구분은 직접 입력(프리셋 「1차·2차 정기시험」).

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| (task-workflow) `collect.input` | **할 일 작업 「입력 받기」** (2026-09-23). 정해진 대상에게서 값을 받아 **표**로 모은다. 한 줄 = **메타데이터 축**(사람 / 담당 학년×과목 / 담당 학급) × **직접 입력 구분**(예: 1차·2차 정기시험) — 둘을 한 목록에 섞지 않는다(열 구성이 줄마다 달라진다). 대상 = **규칙**(`resolve_audience`, 저장됨) → 보내는 순간 **명단 스냅샷**, [명단 다시 계산]은 +N/−M 확인 후 반영. 공동 담당은 교사마다/과목당 한 번 선택, 입력 방식은 개별 입력(비공개)/공개 표. **`task_action_run` 을 쓰지 않는다**(SELECT 가 교직원 전체라 비공개 응답이 샌다) → `collect_request/target/response` + RPC 전용 쓰기, 실행 상태는 config 가 아니라 `collect_request`(복사·연간 가져오기가 config 를 복제). 설정은 매니저 전원이 `update_collect_config` 로(작성자 전용 UPDATE 우회), 보낸 뒤 축·구분·공개 방식 잠금, 할 일 완료·취소 시 자동 마감, 요청이 있는 작업은 삭제 대신 보관. 응답자 진입점 = 알림 → `/my-tasks?collect=` + 내 할 일 **「입력 요청」 구획** + **홈 「나의 업무」 카드의 「입력 요청」 줄** + **메뉴 「내 할 일」 숫자 배지** + **내 할 일 계획표**(2026-09-27 — 응답자는 담당자가 아니라 담당 목록에서 출발하는 화면에 없다. ⚠️ 보이게 하려고 담당자로 넣지 말 것: 완료 버튼이 생겨 한 명이 누르면 요청이 닫힌다). ⚠️ 요청 마감은 날짜 또는 **timestamptz 문자열**로 오므로 `collectDueDay`/`collectDueLabel` 을 거칠 것(안 거치면 계획표 날짜 칸에 영원히 안 들어간다). 회귀 `npx tsx scripts/collect-input-test/run.mts`(112) + `render.mts` + `run-browser.mjs` + `run-dashboard-shots.mjs` + `run-nav-planner-shots.mjs` | `src/lib/audienceRule.ts`, `src/lib/collectInput.ts`, `components/collect/*` · `docs/features/collect-input.md` |
