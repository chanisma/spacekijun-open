# schedule-survey — 일정 설문

> 2026-09-17 신설. 스키마는 `docs/database/core.md` §12.

선택한 사용자에게 **"어떤 날에 무슨 일을 하면 좋을지"** 를 물어 수합하고, 모인 답으로 스케줄 일정을 만든다.
진입점 = 스케줄 페이지 헤더의 `[일정 설문]` 버튼(미응답 건수 배지) · 공지 본문 링크 `[[survey:uuid|라벨]]` · 알림 클릭.
딥링크는 전부 `/schedule?survey=<id>` 한 경로다.

## 화면 4개

| 화면 | 파일 | 누가 |
|---|---|---|
| 목록(허브) | `ScheduleSurveyHubDialog` | 전원 — «나에게 온 설문»(미응답 위로)과 «내가 만든 설문» 두 묶음 |
| 만들기·수정 | `ScheduleSurveyCreateDialog` | 교사·직원·admin |
| 응답 | `ScheduleSurveyRespondDialog` | 대상자(학생 포함) |
| 결과 + 일정 만들기 | `ScheduleSurveyResultDialog` | 주최자·admin |

오케스트레이션은 `ScheduleSurveyHost` 하나가 맡고, `Schedule.tsx` 는 그것만 마운트한다.

**디자인은 '새 일정 만들기' 와 같은 어휘를 쓴다** — `scheduleComposeDialogClass` / `ScheduleComposeHeader` /
`schedule-compose-scroll·section·footer`. 같은 메뉴 안에서 모달마다 폭·여백·푸터가 달라지면 다른 앱처럼 보인다.

## 설문 방식 — 후보 날짜 + 자유 제안 (2026-09-17 사용자 결정)

주최자가 **달력에서 후보 날짜를 여러 개** 고르고, 응답자는 후보마다 `[가능 체크] + [그날 할 일]` 한 줄을 채운다.
`allow_custom_dates` 를 켜면 응답자가 달력에서 **다른 날짜도 제안**할 수 있다.

- **후보 날짜는 응답이 하나도 없어도 결과 표에 남는다** — "아무도 안 된다"는 것 자체가 결과다.
- 응답 저장 시 **후보 날짜는 불가 표시까지 전부 보내고**, 내가 제안한 날짜는 가능 표시를 떼면 제안 철회로 보고 뺀다.
- 후보도 없고 자유 제안도 끄면 아무도 응답할 수 없다 → DB CHECK(`schedule_survey_answerable`) + 화면 경고 2중.
- **마감일(`due_date`)은 차단하지 않는다.** 서버가 강제하지 않는 값으로 화면만 막으면 "왜 안 되는지" 알 수 없는
  상태가 된다. 실제 차단은 주최자가 누르는 `status='closed'` 뿐이고, 마감일은 D-day 칩으로만 보여 준다.

## 결과 → 일정

결과 표는 **가능 인원 많은 순이 기본**이다(날짜순이 아니다 — 이 화면의 목적이 "어느 날로 정할까"라서).
보는 사람은 달력처럼 시간순을 기대하므로 **머리글이 정렬 기준을 말하고** 토글을 둔다. 동점이면 날짜 오름차순.

`[이 날짜로 일정 만들기]` 를 누르면 그 날짜·제목·담당자가 채워진 채 **일정 추가 모달**이 열린다.
- 제목 기본값 = 그날 **가장 많이 제안된 할 일**(없으면 설문 제목)
- 담당자 기본값 = **대상자 전원**, 토글로 «그날 가능한 사람»으로 바꿀 수 있다
- 유형 기본값 = **업무(duty)**. 학사일정(`schedule`)은 `createEvent` 가 담당자를 JSONB로 정규화하지 않아
  이름 명단이 남지 않는다 — 담당자가 있는 일정에는 맞지 않는다.
- 만들어진 일정에는 `meeting.meta.survey_id` 로 출처가 남는다

**일정 추가 모달은 결과 모달 안에 중첩하지 않는다** — 전체 폼이라 중첩하면 스크롤 두 겹에 푸터가 두 개가 된다.
호스트가 형제로 띄웠다가 닫히면 결과 모달을 되돌린다(옛 값 제출의 `SpecSubmissionComposerDialog` 와 같은 방식 — 그 파일은 2026-10-05 옛 제출과 함께 삭제됐다).

## 도달 경로 — 공지와 알림은 대상이 다르다

| | 교사·직원 | 학생 |
|---|---|---|
| 알림(`schedule_survey_requested`) | ✅ | ✅ |
| 공지사항 | ✅ (대상 지정 가능) | ❌ 역할 RLS가 막는다 |

설문 만들기에서 `[공지사항으로도 알리기]` 를 켜면 부서 공지가 함께 등록되고, 본문에
`[[survey:uuid|제목]]` 토큰이 들어가며 **공지의 열람 대상도 설문 대상자로 맞춰진다**.
대상자에 학생이 섞이면 화면이 "학생에게는 알림으로만 전달된다"고 말한다 — 안 그러면 주최자가
공지를 올려 두고 학생이 봤을 거라고 오해한다.

`department_notice` 의 대상 지정은 설문 전용이 아니라 **공지 전반 기능**이다(사용자 결정) —
공지 작성 모달의 `[열람 대상]` 스위치. 기본값은 기존과 같은 전체 공개라 기존 공지는 영향이 없다.

## 조용히 틀리는 자리

### 1. 남에게 보내는 알림에 `.select()` 를 붙이면 전부 롤백된다
`notification_events` 의 INSERT 정책은 `with check (true)` 라 누구에게든 넣을 수 있지만,
SELECT 정책은 `owns_notification_resource(resource_id)` 라 **내 것만** 읽힌다.
PostgreSQL 은 `INSERT ... RETURNING` 에 SELECT 정책을 추가로 적용하므로
`.insert(rows).select('id')` 는 행이 멀쩡히 들어가고도 `42501` 로 **전체가 롤백된다**.

실측(2026-09-17): RETURNING 없음 = 성공 / RETURNING 있음 = `42501 new row violates row-level security policy`.
그래서 `scheduleSurveyNotify.ts` 는 반환을 요구하지 않는다 — 한 문장이라 오류가 없으면 전부 들어간 것이다.
(같은 이유로 기존 `NotificationService.createNotification` 도 `.select()` 를 쓰지 않는다)

### 2. 반대로, 자기 행을 만드는 표는 SELECT 정책이 `insert ... returning` 을 통과해야 한다
`schedule_survey` 의 SELECT 정책이 `can_view_schedule_survey(id)` 같은 **STABLE 함수로 그 표를 되읽으면**,
문장 스냅샷에 새 행이 없어 설문 생성이 **항상** 실패한다(2026-09-12 학생 협업보드 생성 실패와 같은 함정).
그래서 이 표의 SELECT 정책은 `created_by`·`target_resource_ids` 처럼 **새 행의 컬럼으로만** 판정한다.
`schedule_survey_response` 는 본인 판정이 컬럼 기반이고, 주최자 판정은 **이미 커밋된 다른 표**(`schedule_survey`)를
읽으므로 함수를 써도 안전하다.

### 3. `related_meeting_id` 에 설문 id 를 넣으면 FK 위반이다
그 컬럼은 `meeting` FK다. 설문 id 는 `meta.survey_id` 에 담고 이동은 `notificationNavigation.ts` 가 맡는다
(앱 안 목록과 브라우저 알림이 같은 판정을 쓰게 하려면 그 파일이 단일 출처여야 한다).

### 4. 대상자 이름을 `useResources()` 로 읽지 말 것
그 훅은 `resource` 전체를 **상한 없이** 읽는데 PostgREST가 1000행에서 조용히 자른다
(2026-09-17 실측 965행 — 졸업 처리 한 번이면 넘는다. 넘는 순간 이름순 뒷부분이 사라져
"일부 대상자 이름만 안 보이는" 증상이 된다). `useSurveyPeople(ids)` 가 필요한 id만 `.in()` 으로 집어 온다.

### 5. 새 함수의 EXECUTE 는 `anon` 이 아니라 **PUBLIC** 에 붙는다
`revoke execute ... from anon` 을 써 두고도 보안 자문이 "anon 이 실행할 수 있다"고 표시했다.
실측 ACL 이 `{=X/postgres, ...}` — 주체가 PUBLIC 이고 anon 은 그걸 상속하므로
anon 대상 revoke 는 **아무 일도 하지 않았다**. 둘 다 회수해야 한다.

그런데 **전부 회수하면 기존 동작이 바뀐다**: 정책식 안의 함수는 호출자 권한으로 실행되고 SQL 은 OR 의
단축 평가를 보장하지 않아, `current_actor_resource_ids()` 를 쓰는 `department_notice` 의 익명 조회가
"0행"에서 "42501"로 바뀌었다. 데이터가 새는 것은 아니지만 기존 동작 변경이라 되돌렸다.

최종 상태와 근거:
- `current_actor_resource_ids()` — anon **허용**. 두 갈래 모두 `auth.uid() is not null` 을 요구하므로
  익명에게는 항상 빈 집합이다(권한이 아니라 함수 정의가 막는다)
- `is_schedule_survey_target(uuid,uuid)` / `can_manage_schedule_survey(uuid)` — anon **차단**.
  인자로 uuid 를 받는 오라클이라 익명에게 열 이유가 없다

실측(2026-09-17, 최종): anon `department_notice` 0행 · `schedule_survey` 0행 · 오라클 호출 42501 차단 /
로그인 학생 협업보드 1 · 교사 6 · 직원 공지 5 · 교사 공지 5 (전부 변경 전과 동일).

### 6. 신원 해석을 `user_resource` 로 하면 학생이 조용히 빠진다
학생은 그 표를 쓰지 않는다(이메일 prefix ↔ `resource.meta->>'id'`). 새 정책은 반드시
`current_actor_resource_ids()` 를 쓸 것 — 이 저장소는 같은 함정으로 알림(618명)과 협업보드에서 이미 사고를 냈다.

## 회귀

`npx tsx scripts/schedule-survey-test/run.mts` (49건)
— 집계·정규화·정렬·권한·D-day + **정적 검사 7종**(알림 `.select()` 금지, `related_meeting_id` 미사용,
딥링크 경로 일치, `useResources()` 미사용 …). 위 «조용히 틀리는 자리»는 전부 오류를 내지 않으므로
정적 검사가 유일한 방어선이다.

⚠ 테스트는 소스에서 **주석을 걷어내고** 검사한다 — 이 파일들의 경고 주석은 금지 패턴을 그대로 적어서
설명하므로, 원문을 검사하면 경고 주석 자체가 위반으로 잡혀 늘 빨간불이 된다.

## 파일

```
src/features/schedule-survey/
├── types.ts
├── index.ts                      # 바깥에는 호스트 + 순수 유틸만 노출
├── utils/surveyAggregate.ts      # 집계·판정 단일 출처 (React 비의존, 회귀 대상)
├── hooks/useScheduleSurveys.ts   # CRUD + useSurveyPeople + usePendingSurveyCount
├── services/scheduleSurveyNotify.ts
└── components/
    ├── ScheduleSurveyHost.tsx    # 오케스트레이터 (Schedule.tsx 가 이것만 마운트)
    ├── ScheduleSurveyHubDialog.tsx
    ├── ScheduleSurveyCreateDialog.tsx
    ├── ScheduleSurveyRespondDialog.tsx
    └── ScheduleSurveyResultDialog.tsx
```

함께 손댄 곳: `ScheduleHeader`(진입점·배지) · `ScheduleCreateDialog`(`initialValues` 프롭, 가산적) ·
`useSchedule.createEvent`(`survey_id` → `meta`) · `noticeLinks`/`NoticeContentView`/`NoticeLinkPicker`(`survey` 토큰) ·
`NoticeFormDialog`(열람 대상) · `useNotices` 타입 · `notificationNavigation`.
